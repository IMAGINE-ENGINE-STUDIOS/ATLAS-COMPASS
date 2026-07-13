// HOT feed health probe — pings each upstream agency source in parallel
// with a short timeout, records latency, and reports OK / Delayed / Down.
// Cached 10s in-isolate so the dashboard can poll every few seconds without
// hammering the origin APIs.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SourceHealth = {
  id: string;
  name: string;
  handle: string;
  url: string;
  status: "ok" | "delayed" | "down";
  latency_ms: number | null;
  http_status: number | null;
  item_count: number | null;
  last_success_iso: string | null;
  error: string | null;
};

const SOURCES = [
  { id: "usgs",      name: "U.S. Geological Survey",       handle: "usgs",       url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson", kind: "geojson" as const },
  { id: "eonet",     name: "NASA Earth Observatory",       handle: "nasa_eonet", url: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=1",                     kind: "eonet"   as const },
  { id: "gdacs",     name: "GDACS · Global Disaster Alert", handle: "gdacs",      url: "https://www.gdacs.org/xml/rss.xml",                                                 kind: "rss"     as const },
  { id: "reliefweb", name: "ReliefWeb · OCHA",             handle: "reliefweb",  url: "https://api.reliefweb.int/v1/reports?appname=hot-portal&limit=1&sort[]=date:desc",  kind: "reliefweb" as const },
  { id: "noaa",      name: "NOAA · National Weather Service", handle: "noaa_nws", url: "https://api.weather.gov/alerts/active?limit=1",                                    kind: "noaa"    as const },
];

const OK_MS = 5_000;

// Persist last-success timestamps across probes so a transient failure still
// shows the operator when the source was last known-good.
const LAST_OK: Record<string, string> = {};

async function probe(src: typeof SOURCES[number]): Promise<SourceHealth> {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4_000);
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "hot-portal/1.0 (atlasmapping.org)", Accept: "application/json,*/*;q=0.8" },
    });
    clearTimeout(timer);
    const latency = Math.round(performance.now() - started);
    if (!res.ok) {
      // Drain body to free the connection.
      try { await res.text(); } catch { /* noop */ }
      return {
        id: src.id, name: src.name, handle: src.handle, url: src.url,
        status: "down", latency_ms: latency, http_status: res.status,
        item_count: null, last_success_iso: LAST_OK[src.id] ?? null,
        error: `HTTP ${res.status}`,
      };
    }
    // Count items cheaply based on payload kind.
    let itemCount: number | null = null;
    try {
      if (src.kind === "rss") {
        const txt = await res.text();
        itemCount = (txt.match(/<item[\s>]/g) ?? []).length;
      } else {
        const j = await res.json();
        if (src.kind === "geojson")     itemCount = Array.isArray(j.features) ? j.features.length : null;
        else if (src.kind === "eonet")  itemCount = Array.isArray(j.events)   ? j.events.length   : null;
        else if (src.kind === "reliefweb") itemCount = typeof j?.totalCount === "number" ? j.totalCount : (j.data?.length ?? null);
        else if (src.kind === "noaa")   itemCount = Array.isArray(j.features) ? j.features.length : null;
      }
    } catch { /* body parse failed; still counts as ok */ }

    const nowIso = new Date().toISOString();
    LAST_OK[src.id] = nowIso;
    return {
      id: src.id, name: src.name, handle: src.handle, url: src.url,
      status: latency > OK_MS ? "delayed" : "ok",
      latency_ms: latency, http_status: res.status,
      item_count: itemCount, last_success_iso: nowIso, error: null,
    };
  } catch (err) {
    clearTimeout(timer);
    const latency = Math.round(performance.now() - started);
    const msg = (err instanceof Error) ? err.message : String(err);
    return {
      id: src.id, name: src.name, handle: src.handle, url: src.url,
      status: "down", latency_ms: latency, http_status: null,
      item_count: null, last_success_iso: LAST_OK[src.id] ?? null,
      error: /abort/i.test(msg) ? "timeout" : msg,
    };
  }
}

let CACHE: { at: number; body: unknown } | null = null;
const CACHE_TTL_MS = 10_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (CACHE && Date.now() - CACHE.at < CACHE_TTL_MS) {
      return new Response(JSON.stringify(CACHE.body), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=10" },
      });
    }
    const results = await Promise.all(SOURCES.map(probe));
    const body = { generated_at: new Date().toISOString(), sources: results };
    CACHE = { at: Date.now(), body };
    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=10" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), sources: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});