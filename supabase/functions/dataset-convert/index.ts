// Best-effort normalization of an uploaded dataset. Reads the file from
// the user-datasets bucket, extracts a bbox/point count when trivially
// possible (GeoJSON, CSV with lat/lon), and updates the user_datasets row.
// Complex formats (shp, geotiff, netcdf) are recorded as-is; heavier
// conversion can plug in here later without changing the client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function bboxFromCoords(coords: number[][]): [number, number, number, number] | null {
  if (!coords.length) return null;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function walkGeoJson(node: any, out: number[][]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walkGeoJson(n, out); return; }
  if (node.type === "Point" && Array.isArray(node.coordinates)) out.push(node.coordinates as number[]);
  if (Array.isArray(node.features)) for (const f of node.features) walkGeoJson(f.geometry, out);
  if (Array.isArray(node.geometries)) for (const g of node.geometries) walkGeoJson(g, out);
  if (Array.isArray(node.coordinates)) walkGeoJson(node.coordinates, out);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const { dataset_id } = await req.json();
    const { data: ds } = await admin.from("user_datasets").select("*").eq("id", dataset_id).single();
    if (!ds?.storage_path) return new Response(JSON.stringify({ ok: false }), { headers: { ...corsHeaders, "content-type": "application/json" } });

    const { data: file } = await admin.storage.from("user-datasets").download(ds.storage_path);
    if (!file) return new Response(JSON.stringify({ ok: false }), { headers: { ...corsHeaders, "content-type": "application/json" } });

    let bbox: [number, number, number, number] | null = null;
    let sample_count = 0;
    const stats: Record<string, unknown> = { ...(ds.stats ?? {}) };

    if (ds.kind === "geojson" || ds.kind === "json") {
      try {
        const text = await file.text();
        const j = JSON.parse(text);
        const pts: number[][] = [];
        walkGeoJson(j, pts);
        bbox = bboxFromCoords(pts);
        sample_count = pts.length;
      } catch (e) { stats.parse_error = String(e); }
    } else if (ds.kind === "csv") {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length > 1) {
        const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
        const li = header.findIndex((h) => h === "lat" || h === "latitude");
        const oi = header.findIndex((h) => h === "lon" || h === "lng" || h === "longitude");
        const pts: number[][] = [];
        if (li >= 0 && oi >= 0) {
          for (let i = 1; i < lines.length; i++) {
            const c = lines[i].split(",");
            const x = Number(c[oi]); const y = Number(c[li]);
            if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
          }
          bbox = bboxFromCoords(pts);
          sample_count = pts.length;
          stats.headers = header;
        }
      }
    }

    await admin.from("user_datasets").update({
      bbox: bbox as any, sample_count, stats: stats as any, updated_at: new Date().toISOString(),
    }).eq("id", dataset_id);

    return new Response(JSON.stringify({ ok: true, bbox, sample_count }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});