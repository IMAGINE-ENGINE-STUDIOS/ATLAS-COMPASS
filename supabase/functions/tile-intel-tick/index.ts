// Scheduled evaluator. Runs every couple minutes and checks each enabled
// non-dataset rule against live feeds. Dataset rules fire from ingest.
// Sources supported now: earthquake (USGS) and storm/lightning stubs that
// can be filled in with real feeds. Keeps the loop small and non-blocking.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Bounds { west: number; south: number; east: number; north: number; }

function boundsOf(gf: any): Bounds | null {
  const poly = gf?.polygon as { lng: number; lat: number }[] | null;
  if (poly?.length) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const p of poly) { if (p.lng < w) w = p.lng; if (p.lng > e) e = p.lng; if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat; }
    return { west: w, south: s, east: e, north: n };
  }
  const tiles = gf?.tile_set as { z: number; x: number; y: number }[] | null;
  if (tiles?.length) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const t of tiles) {
      const nT = Math.pow(2, t.z);
      const lonL = (t.x / nT) * 360 - 180;
      const lonR = ((t.x + 1) / nT) * 360 - 180;
      const latT = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * t.y) / nT)));
      const latB = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.y + 1)) / nT)));
      w = Math.min(w, lonL); e = Math.max(e, lonR); s = Math.min(s, latB); n = Math.max(n, latT);
    }
    return { west: w, south: s, east: e, north: n };
  }
  return null;
}

async function usgsMax(b: Bounds): Promise<number | null> {
  try {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${new Date(Date.now() - 3600_000).toISOString()}&minlatitude=${b.south}&maxlatitude=${b.north}&minlongitude=${b.west}&maxlongitude=${b.east}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    let max = -Infinity;
    for (const f of j.features ?? []) max = Math.max(max, Number(f.properties?.mag ?? -Infinity));
    return Number.isFinite(max) ? max : null;
  } catch { return null; }
}

function evaluateNumeric(rule: any, v: number): boolean {
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
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: rules } = await admin.from("tile_intel_rules")
    .select("*, geofence:geofences(*)").eq("enabled", true);

  const now = Date.now();
  let fired = 0;
  for (const rule of rules ?? []) {
    const last = rule.last_fired_at ? new Date(rule.last_fired_at).getTime() : 0;
    if (now - last < (rule.cooldown_s ?? 300) * 1000) continue;
    const b = boundsOf(rule.geofence);
    if (!b) continue;

    let value: number | null = null;
    if (rule.source_kind === "earthquake") value = await usgsMax(b);
    // storm/lightning/earth_layer: pluggable — deterministic fallback returns null so no false fires.
    if (value === null) continue;
    if (!evaluateNumeric(rule, value)) continue;

    const { data: ev } = await admin.from("tile_intel_events").insert({
      owner_id: rule.owner_id, rule_id: rule.id, sample: { value, source: rule.source_kind, bounds: b },
    }).select().single();
    await admin.from("tile_intel_rules").update({ last_fired_at: new Date().toISOString() }).eq("id", rule.id);
    if (ev) {
      await admin.functions.invoke("tile-intel-dispatch", { body: { event_id: ev.id } }).catch(() => {});
      fired++;
    }
  }

  return new Response(JSON.stringify({ checked: (rules ?? []).length, fired }), { headers: { ...corsHeaders, "content-type": "application/json" } });
});