import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_PACKS, stripeClient } from "../_shared/wave-payg.ts";

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
    if (!user?.email) return json({ error: "unauthorized" }, 401);

    const { sessionId } = await req.json().catch(() => ({ sessionId: "" }));
    if (!sessionId || typeof sessionId !== "string") return json({ error: "invalid_request" }, 400);

    const { data: order } = await admin
      .from("wave_orders")
      .select("*")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (!order || order.owner_id !== user.id) return json({ error: "not_found" }, 404);
    if (order.status === "paid" || order.status === "active") {
      return json({ status: order.status, kind: order.kind, already: true });
    }

    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (order.kind === "payg_setup") {
      if (session.status !== "complete") return json({ status: "pending" });
      const setupIntentId = session.setup_intent as string | null;
      let brand: string | null = null;
      let last4: string | null = null;
      let paymentMethodId: string | null = null;
      if (setupIntentId) {
        const intent = await stripe.setupIntents.retrieve(setupIntentId);
        paymentMethodId = (intent.payment_method as string) ?? null;
        if (paymentMethodId) {
          const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
          brand = pm.card?.brand ?? null;
          last4 = pm.card?.last4 ?? null;
          if (session.customer) {
            await stripe.customers.update(session.customer as string, {
              invoice_settings: { default_payment_method: paymentMethodId },
            });
          }
        }
      }

      await admin.from("signal_accounts").update({
        payg_enabled: true,
        payg_card_brand: brand,
        payg_card_last4: last4,
        membership_tier: "payg",
        membership_status: "active",
        stripe_customer_id: (session.customer as string) ?? null,
      }).eq("id", order.account_id);

      await admin.from("wave_orders").update({ status: "active" }).eq("id", order.id);
      return json({ status: "active", kind: "payg_setup", card: brand && last4 ? { brand, last4 } : null });
    }

    if (session.payment_status !== "paid") return json({ status: "pending" });

    const pack = CREDIT_PACKS[order.pack_id ?? ""];
    const credits = Number(order.credits) || pack?.credits || 0;

    const { error: creditErr } = await admin.rpc("signal_reserve_credits", {
      _account_id: order.account_id,
      _credits: -credits,
      _kind: "purchase",
      _reference: `checkout:${sessionId}`,
      _message_id: null,
      _note: order.note ?? "Credit pack",
    });
    if (creditErr) return json({ error: "credit_failed" }, 500);

    await admin.from("signal_accounts").update({
      membership_status: "active",
      membership_tier: "prepaid",
    }).eq("id", order.account_id).eq("membership_tier", "free");

    await admin.from("wave_orders").update({ status: "paid" }).eq("id", order.id);
    return json({ status: "paid", kind: "credit_pack", credits });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});