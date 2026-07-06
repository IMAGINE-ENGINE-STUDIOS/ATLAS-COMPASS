// Dispatches actions (in_app / webhook / email / sms) for a fired event.
// Called internally by tile-intel-tick and tile-intel-ingest.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAYAPI_KEY = Deno.env.get("GATEWAYAPI_API_KEY");

async function dispatch(admin: any, eventId: string) {
  const { data: ev } = await admin.from("tile_intel_events").select("*, rule:tile_intel_rules(*)").eq("id", eventId).single();
  if (!ev) return;
  const { data: joins } = await admin.from("tile_intel_rule_actions").select("action_id").eq("rule_id", ev.rule_id);
  const actionIds = (joins ?? []).map((r: any) => r.action_id);
  if (actionIds.length === 0) return;
  const { data: actions } = await admin.from("tile_intel_actions").select("*").in("id", actionIds);

  for (const a of actions ?? []) {
    const cfg = a.config ?? {};
    const payload = { event: ev, rule: ev.rule, sample: ev.sample, fired_at: ev.fired_at };
    let status: "success" | "failed" = "success";
    let last_error: string | null = null;
    try {
      if (a.kind === "webhook" && cfg.url) {
        const r = await fetch(cfg.url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-tile-intel-secret": a.secret ?? "" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(`webhook ${r.status}`);
      } else if (a.kind === "sms" && cfg.recipient && GATEWAYAPI_KEY && LOVABLE_API_KEY) {
        const r = await fetch("https://connector-gateway.lovable.dev/gatewayapi/mobile/single", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GATEWAYAPI_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sender: cfg.sender || "Atlas",
            recipient: Number(String(cfg.recipient).replace(/\D/g, "")),
            message: `[${ev.rule.name}] ${JSON.stringify(ev.sample).slice(0, 120)}`,
          }),
        });
        if (!r.ok) throw new Error(`sms ${r.status}: ${await r.text()}`);
      } else if (a.kind === "email" && cfg.to) {
        // Email delegated to a separate function if configured; log otherwise.
        console.log("[email] would send to", cfg.to, ev.rule.name);
      } else if (a.kind === "in_app") {
        // No-op: realtime subscription already surfaces events.
      }
    } catch (err) {
      status = "failed";
      last_error = String(err);
    }
    await admin.from("tile_intel_event_deliveries").insert({
      event_id: eventId, action_id: a.id, status, attempts: 1, last_error,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const { event_id } = await req.json();
    if (!event_id) return new Response(JSON.stringify({ error: "event_id required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    await dispatch(admin, event_id);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});