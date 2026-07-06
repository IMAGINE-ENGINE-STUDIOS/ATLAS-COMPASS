// Streaming ingest endpoint. External systems POST rows to:
//   /functions/v1/tile-intel-ingest?token=<per-dataset ingest_token>
// Body: single JSON object, an array of objects, or NDJSON. Each row is
// evaluated against every enabled rule whose source is that dataset;
// matching rules fire an event and dispatch actions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function evaluate(rule: any, row: any): boolean {
  const field = (rule.threshold?.field as string) || "value";
  const v = Number(row[field]);
  if (!Number.isFinite(v)) return false;
  const t = rule.threshold ?? {};
  switch (rule.condition) {
    case "gt": return v > Number(t.value);
    case "lt": return v < Number(t.value);
    case "between": return v >= Number(t.min) && v <= Number(t.max);
    default: return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-ingest-token");
  if (!token) return new Response("token required", { status: 401, headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: ds } = await admin.from("user_datasets").select("*").eq("ingest_token", token).maybeSingle();
  if (!ds) return new Response("invalid token", { status: 401, headers: corsHeaders });

  const text = await req.text();
  let rows: any[] = [];
  try {
    const j = JSON.parse(text);
    rows = Array.isArray(j) ? j : [j];
  } catch {
    rows = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  await admin.from("user_datasets").update({ sample_count: (ds.sample_count ?? 0) + rows.length, updated_at: new Date().toISOString() }).eq("id", ds.id);

  const { data: rules } = await admin.from("tile_intel_rules")
    .select("*").eq("enabled", true).eq("source_kind", "dataset").eq("owner_id", ds.owner_id);

  let fired = 0;
  for (const rule of rules ?? []) {
    if ((rule.source_ref as any)?.dataset_id !== ds.id) continue;
    const now = Date.now();
    const last = rule.last_fired_at ? new Date(rule.last_fired_at).getTime() : 0;
    if (now - last < (rule.cooldown_s ?? 300) * 1000) continue;
    const hit = rows.find((r) => evaluate(rule, r));
    if (!hit) continue;
    const { data: ev } = await admin.from("tile_intel_events").insert({
      owner_id: rule.owner_id, rule_id: rule.id, sample: hit,
    }).select().single();
    await admin.from("tile_intel_rules").update({ last_fired_at: new Date().toISOString() }).eq("id", rule.id);
    if (ev) {
      await admin.functions.invoke("tile-intel-dispatch", { body: { event_id: ev.id } }).catch(() => {});
      fired++;
    }
  }

  return new Response(JSON.stringify({ received: rows.length, fired }), { headers: { ...corsHeaders, "content-type": "application/json" } });
});