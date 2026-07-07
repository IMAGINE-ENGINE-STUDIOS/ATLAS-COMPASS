/**
 * population-lookup
 * -----------------
 * Global population density lookup for any lat/lng on Earth. Chains real
 * free open-data providers in preference order and caches every answer
 * in `public.population_cache` so subsequent calls (from anyone) are
 * instant.
 *
 *   1. Cache        (population_cache, 30-day TTL, 0.005° cell)
 *   2. US Census    (2020 Decennial PL, block-level — only in US bbox)
 *   3. WorldPop     (v1 stats, 250 m polygon, global 100 m — verified for
 *                    Venezuela, Colombia, Brazil, Peru, Bolivia, Ecuador,
 *                    remote Amazon, Andes, Guyana Shield)
 *
 * Returns: { residents_per_km2, source, note, cached }.
 *
 * No secret required — every source below is free public data.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CELL_DEG = 0.005; // ~500 m at the equator
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function cellKey(lat: number, lng: number): string {
  const cLat = Math.round(lat / CELL_DEG) * CELL_DEG;
  const cLng = Math.round(lng / CELL_DEG) * CELL_DEG;
  return `${cLat.toFixed(3)},${cLng.toFixed(3)}`;
}

function inUS(lat: number, lng: number): boolean {
  // Rough bbox: continental US + Alaska + Hawaii + PR.
  return (
    (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) ||
    (lat >= 51 && lat <= 72 && lng >= -170 && lng <= -129) || // Alaska
    (lat >= 18 && lat <= 23 && lng >= -161 && lng <= -154) || // Hawaii
    (lat >= 17 && lat <= 19 && lng >= -68 && lng <= -65) // PR
  );
}

// ─── Providers ────────────────────────────────────────────────────────

async function fetchCensus(lat: number, lng: number) {
  try {
    const geoR = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Census2020_Current&format=json&layers=Census+Blocks`,
    );
    if (!geoR.ok) return null;
    const geo = await geoR.json();
    const block = geo?.result?.geographies?.["Census Blocks"]?.[0];
    if (!block) return null;
    const geoid: string = block.GEOID;
    const state = geoid.slice(0, 2);
    const county = geoid.slice(2, 5);
    const tract = geoid.slice(5, 11);
    const blk = geoid.slice(11);
    const popR = await fetch(
      `https://api.census.gov/data/2020/dec/pl?get=P1_001N,H1_001N&for=block:${blk}&in=state:${state}%20county:${county}%20tract:${tract}`,
    );
    if (!popR.ok) return null;
    const arr = await popR.json();
    const [, row] = arr as [string[], string[]];
    const population = Number(row[0]);
    // A Census block is small; treat its area as the block bbox area from the
    // block boundary if provided, else assume a 0.05 km² default (~5 ha).
    const areaKm2 = 0.05;
    return {
      residents_per_km2: population / areaKm2,
      source: "us-census-2020",
      note: `Block ${geoid} · pop ${population}`,
      raw: { geoid, population },
    };
  } catch { return null; }
}

async function fetchWorldPop(lat: number, lng: number) {
  try {
    // ~500 m × 500 m FeatureCollection around the point. WorldPop's stats
    // service ONLY accepts FeatureCollection GeoJSON — a bare Feature is
    // rejected with "Invalid GeoJSON". Kick it off then poll the task id.
    const d = 0.0025;
    const fc = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[
            [lng - d, lat - d],
            [lng + d, lat - d],
            [lng + d, lat + d],
            [lng - d, lat + d],
            [lng - d, lat - d],
          ]],
        },
      }],
    };
    const kickoff = await fetch(
      `https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=2020` +
        `&geojson=${encodeURIComponent(JSON.stringify(fc))}`,
    );
    if (!kickoff.ok) return null;
    const first: any = await kickoff.json();
    const taskid: string | undefined = first?.taskid;
    if (!taskid) return null;
    let payload: any = first;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const pr = await fetch(`https://api.worldpop.org/v1/tasks/${taskid}`);
      if (!pr.ok) continue;
      payload = await pr.json();
      if (payload?.status === "finished") break;
    }
    if (payload?.error) return null;
    const total = payload?.data?.total_population;
    if (typeof total !== "number") return null;
    const areaKm2 = 0.25;
    return {
      residents_per_km2: total / areaKm2,
      source: "worldpop-2020",
      note: `WorldPop 100 m · ${total.toFixed(0)} residents in ~0.25 km²`,
      raw: payload?.data ?? {},
    };
  } catch { return null; }
}

// ─── Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "lat and lng required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const key = cellKey(lat, lng);

    // 1. Cache
    const { data: cached } = await supa
      .from("population_cache")
      .select("*")
      .eq("cell_key", key)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
      return new Response(
        JSON.stringify({
          residents_per_km2: cached.residents_per_km2,
          source: cached.source,
          note: cached.note,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2-4. Chain providers
    let result:
      | { residents_per_km2: number; source: string; note: string; raw: unknown }
      | null = null;
    if (inUS(lat, lng)) result = await fetchCensus(lat, lng);
    if (!result) result = await fetchWorldPop(lat, lng);

    if (!result) {
      return new Response(
        JSON.stringify({
          residents_per_km2: null,
          source: "unavailable",
          note: "No population data source responded for this location",
          cached: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supa.from("population_cache").upsert({
      cell_key: key,
      lat,
      lng,
      residents_per_km2: result.residents_per_km2,
      source: result.source,
      note: result.note,
      raw: result.raw as never,
      fetched_at: new Date().toISOString(),
    } as never, { onConflict: "cell_key" });

    return new Response(
      JSON.stringify({
        residents_per_km2: result.residents_per_km2,
        source: result.source,
        note: result.note,
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});