// Pay-as-you-go billing helpers for WAVE. Uses the same Stripe account and
// invoice-based charging workflow as the Startup Factory memberships.
import Stripe from "https://esm.sh/stripe@18.5.0";

export const STRIPE_API_VERSION = "2025-08-27.basil" as const;

export const CREDIT_PACKS: Record<string, { usd: number; credits: number; label: string }> = {
  starter: { usd: 25, credits: 2_500, label: "Starter" },
  growth: { usd: 100, credits: 10_300, label: "Growth" },
  scale: { usd: 500, credits: 53_500, label: "Scale" },
  enterprise: { usd: 2_000, credits: 224_000, label: "Enterprise" },
};

export function stripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Billing is not configured (missing STRIPE_SECRET_KEY).");
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

/** Find or create the billing customer for a developer account. */
export async function ensureCustomer(
  stripe: Stripe,
  email: string | null | undefined,
  existingId?: string | null,
): Promise<string> {
  if (existingId) {
    try {
      const c = await stripe.customers.retrieve(existingId);
      if (c && !(c as { deleted?: boolean }).deleted) return existingId;
    } catch { /* fall through and re-resolve */ }
  }
  if (email) {
    const found = await stripe.customers.list({ email, limit: 1 });
    if (found.data.length > 0) return found.data[0].id;
  }
  // Anonymous / email-less accounts still get a customer; Stripe Checkout
  // collects the email during the session.
  const created = await stripe.customers.create(email ? { email } : {});
  return created.id;
}

export interface PaygAccount {
  id: string;
  owner_id: string;
  contact_email: string | null;
  stripe_customer_id: string | null;
  payg_enabled: boolean;
  monthly_spend_cap_usd: number;
  per_broadcast_cap_usd: number;
  month_spend_usd: number;
  month_period_start: string;
}

/** Month-to-date spend, resetting the counter when the billing month rolls. */
export function monthToDate(account: PaygAccount): { spend: number; periodStart: string } {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const periodStart = start.toISOString().slice(0, 10);
  const spend = account.month_period_start === periodStart ? Number(account.month_spend_usd) : 0;
  return { spend, periodStart };
}

export interface TopUpResult {
  charged: boolean;
  reason?: string;
  usd?: number;
  credits?: number;
  invoiceId?: string;
}

/**
 * Charge the card on file for `neededUsd` (rounded up to whole dollars) and
 * credit the account. Enforces the developer's own per-charge and monthly caps.
 */
export async function paygTopUp(
  admin: { from: (t: string) => any; rpc: (n: string, a: unknown) => Promise<{ error: unknown }> },
  account: PaygAccount,
  neededUsd: number,
  creditUsdValue: number,
  note: string,
): Promise<TopUpResult> {
  if (!account.payg_enabled) return { charged: false, reason: "payg_disabled" };
  if (!account.stripe_customer_id) return { charged: false, reason: "no_card_on_file" };

  const amountUsd = Math.max(1, Math.ceil(neededUsd));
  if (amountUsd > Number(account.per_broadcast_cap_usd)) {
    return { charged: false, reason: "per_charge_cap_exceeded" };
  }

  const { spend, periodStart } = monthToDate(account);
  if (spend + amountUsd > Number(account.monthly_spend_cap_usd)) {
    return { charged: false, reason: "monthly_cap_exceeded" };
  }

  const stripe = stripeClient();
  await stripe.invoiceItems.create({
    customer: account.stripe_customer_id,
    amount: amountUsd * 100,
    currency: "usd",
    description: `WAVE usage — ${note}`,
  });
  const invoice = await stripe.invoices.create({
    customer: account.stripe_customer_id,
    auto_advance: true,
    collection_method: "charge_automatically",
  });
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  const paid = await stripe.invoices.pay(finalized.id).catch(() => null);
  if (!paid || (paid.status !== "paid" && paid.status !== "open")) {
    return { charged: false, reason: "payment_failed" };
  }

  const credits = Math.floor(amountUsd / creditUsdValue);
  await admin.rpc("signal_reserve_credits", {
    _account_id: account.id,
    _credits: -credits,
    _kind: "purchase",
    _reference: `invoice:${finalized.id}`,
    _message_id: null,
    _note: `Pay-as-you-go charge · ${note}`,
  });

  await admin.from("signal_accounts").update({
    month_spend_usd: spend + amountUsd,
    month_period_start: periodStart,
  }).eq("id", account.id);

  await admin.from("wave_orders").insert({
    account_id: account.id,
    owner_id: account.owner_id,
    kind: "usage_charge",
    credits,
    usd_amount: amountUsd,
    stripe_invoice_id: finalized.id,
    status: "paid",
    note,
  });

  return { charged: true, usd: amountUsd, credits, invoiceId: finalized.id };
}