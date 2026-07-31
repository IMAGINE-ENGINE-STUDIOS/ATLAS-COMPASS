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
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user?.email) return json({ error: "unauthorized" }, 401);

    const { data: account } = await admin
      .from("signal_accounts")
      .select("id, stripe_customer_id")
      .eq("owner_id", user.id)
      .maybeSingle();

    const stripe = stripeClient();
    const customerId = await ensureCustomer(stripe, user.email, account?.stripe_customer_id);
    if (account && customerId !== account.stripe_customer_id) {
      await admin.from("signal_accounts").update({ stripe_customer_id: customerId }).eq("id", account.id);
    }

    const origin = req.headers.get("origin") ?? "";
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/developers`,
    });
    return json({ url: portal.url });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});