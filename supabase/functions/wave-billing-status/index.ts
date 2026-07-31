import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureCustomer, stripeClient } from "../_shared/wave-payg.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user?.email) return json({ error: "unauthorized" }, 401);

    const { data: account } = await admin
      .from("signal_accounts")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!account) return json({ payg_enabled: false, card: null, membership_tier: "free" });

    let card: { brand: string; last4: string } | null =
      account.payg_card_last4
        ? { brand: account.payg_card_brand ?? "card", last4: account.payg_card_last4 }
        : null;

    // Refresh the default payment method from the billing provider when we
    // have a customer but no cached card details.
    if (account.stripe_customer_id && !card) {
      try {
        const stripe = stripeClient();
        const customerId = await ensureCustomer(stripe, user.email, account.stripe_customer_id);
        const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
        const pm = methods.data[0];
        if (pm?.card) {
          card = { brand: pm.card.brand, last4: pm.card.last4 };
          await admin.from("signal_accounts").update({
            payg_card_brand: pm.card.brand,
            payg_card_last4: pm.card.last4,
          }).eq("id", account.id);
        }
      } catch (_e) { /* billing provider unavailable — report cached state */ }
    }

    return json({
      account_id: account.id,
      membership_tier: account.membership_tier,
      membership_status: account.membership_status,
      payg_enabled: account.payg_enabled,
      card,
      monthly_spend_cap_usd: Number(account.monthly_spend_cap_usd),
      per_broadcast_cap_usd: Number(account.per_broadcast_cap_usd),
      month_spend_usd: Number(account.month_spend_usd),
      month_period_start: account.month_period_start,
      balance_credits: Number(account.balance_credits),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});