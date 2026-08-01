import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_PACKS, ensureCustomer, stripeClient } from "../_shared/wave-payg.ts";

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
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const mode: "pack" | "payg" = body?.mode === "payg" ? "payg" : "pack";
    const packId = String(body?.packId ?? "");
    const pack = CREDIT_PACKS[packId];
    if (mode === "pack" && !pack) return json({ error: "invalid_pack" }, 400);

    const { data: account } = await admin
      .from("signal_accounts")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!account) return json({ error: "no_account" }, 400);

    const stripe = stripeClient();
    const bodyEmail = typeof body?.email === "string" && body.email.includes("@")
      ? body.email.trim().slice(0, 320)
      : null;
    const billingEmail = bodyEmail || user.email || account.contact_email || null;
    if (bodyEmail && bodyEmail !== account.contact_email) {
      await admin.from("signal_accounts").update({ contact_email: bodyEmail }).eq("id", account.id);
    }
    const customerId = await ensureCustomer(stripe, billingEmail, account.stripe_customer_id);
    if (customerId !== account.stripe_customer_id) {
      await admin.from("signal_accounts").update({ stripe_customer_id: customerId }).eq("id", account.id);
    }

    const origin = req.headers.get("origin")
      || req.headers.get("referer")?.replace(/(https?:\/\/[^/]+).*/, "$1")
      || "https://infinity-market-hub.lovable.app";

    if (mode === "payg") {
      const monthly = Number(body?.monthlySpendCapUsd);
      const perCharge = Number(body?.perChargeCapUsd);
      await admin.from("signal_accounts").update({
        ...(Number.isFinite(monthly) && monthly > 0 ? { monthly_spend_cap_usd: monthly } : {}),
        ...(Number.isFinite(perCharge) && perCharge > 0 ? { per_broadcast_cap_usd: perCharge } : {}),
      }).eq("id", account.id);

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "setup",
        payment_method_types: ["card"],
        success_url: `${origin}/developers?wave_billing=payg&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/developers?wave_billing=cancelled`,
        metadata: { account_id: account.id, owner_id: user.id, kind: "payg_setup" },
      });

      await admin.from("wave_orders").insert({
        account_id: account.id,
        owner_id: user.id,
        kind: "payg_setup",
        stripe_session_id: session.id,
        status: "pending",
        note: "Card on file for pay-as-you-go",
      });

      return json({ url: session.url });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.usd * 100,
          product_data: {
            name: `WAVE ${pack.label} pack`,
            description: `${pack.credits.toLocaleString("en-US")} WAVE credits`,
          },
        },
      }],
      allow_promotion_codes: true,
      success_url: `${origin}/developers?wave_billing=pack&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/developers?wave_billing=cancelled`,
      metadata: { account_id: account.id, owner_id: user.id, kind: "credit_pack", pack_id: packId },
    });

    await admin.from("wave_orders").insert({
      account_id: account.id,
      owner_id: user.id,
      kind: "credit_pack",
      pack_id: packId,
      credits: pack.credits,
      usd_amount: pack.usd,
      stripe_session_id: session.id,
      status: "pending",
      note: `${pack.label} pack`,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});