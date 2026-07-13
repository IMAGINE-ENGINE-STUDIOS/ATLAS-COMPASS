// HOT news broadcast aggregator — free, keyless feeds from respected agencies.
// Sources: USGS earthquakes, NASA EONET, GDACS RSS, ReliefWeb, NOAA/NWS alerts.
// Returns a unified list of "broadcast" items to render as agency-verified posts.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Broadcast = {
  id: string;
  agency: string;
  agency_handle: string;
  agency_verified: boolean;
  kind: "warning" | "news";
  title: string;
  body: string | null;
  hazard_type: string | null;
  severity: number | null;
  region: string | null;
  source_url: string;
  event_time: string; // ISO
  lat: number | null;
  lon: number | null;
};

const AGENCIES = {
  usgs:      { name: "U.S. Geological Survey",         handle: "usgs" },
  eonet:     { name: "NASA Earth Observatory",         handle: "nasa_eonet" },
  gdacs:     { name: "GDACS · Global Disaster Alert",  handle: "gdacs" },
  reliefweb: { name: "ReliefWeb · OCHA",               handle: "reliefweb" },
  noaa:      { name: "NOAA · National Weather Service", handle: "noaa_nws" },
};

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { "User-Agent": "hot-portal/1.0 (atlasmapping.org)", Accept: "application/json,*/*;q=0.8", ...(init?.headers ?? {}) },
    });
    if (!r.ok) return null;
    return r;
  } catch { return null; }
}

async function fetchUSGS(): Promise<Broadcast[]> {
  const r = await safeFetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson");
  if (!r) return [];
  const j = await r.json();
  return (j.features ?? []).slice(0, 20).map((f: any): Broadcast => {
    const mag = f.properties?.mag ?? 0;
    return {
      id: `usgs:${f.id}`,
      agency: AGENCIES.usgs.name,
      agency_handle: AGENCIES.usgs.handle,
      agency_verified: true,
      kind: mag >= 6 ? "warning" : "news",
      title: `M ${mag?.toFixed(1)} — ${f.properties?.place ?? "Seismic event"}`,
      body: f.properties?.title ?? null,
      hazard_type: "earthquake",
      severity: mag >= 7 ? 5 : mag >= 6 ? 4 : mag >= 5 ? 3 : 2,
      region: f.properties?.place ?? null,
      source_url: f.properties?.url ?? "https://earthquake.usgs.gov",
      event_time: new Date(f.properties?.time ?? Date.now()).toISOString(),
      lat: f.geometry?.coordinates?.[1] ?? null,
      lon: f.geometry?.coordinates?.[0] ?? null,
    };
  });
}

async function fetchEONET(): Promise<Broadcast[]> {
  const r = await safeFetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=25&days=7");
  if (!r) return [];
  const j = await r.json();
  const CAT: Record<string, string> = {
    wildfires: "wildfire", severeStorms: "storm", volcanoes: "volcano",
    floods: "flood", drought: "drought", earthquakes: "earthquake",
    landslides: "landslide", seaLakeIce: "ice", snow: "snow",
    manmade: "manmade", waterColor: "water", dustHaze: "dust", tempExtremes: "heat",
  };
  return (j.events ?? []).slice(0, 20).map((e: any): Broadcast => {
    const geom = e.geometry?.[e.geometry.length - 1];
    const cat = e.categories?.[0]?.id ?? "";
    const hazard = CAT[cat] ?? "event";
    return {
      id: `eonet:${e.id}`,
      agency: AGENCIES.eonet.name,
      agency_handle: AGENCIES.eonet.handle,
      agency_verified: true,
      kind: "news",
      title: e.title,
      body: e.description ?? null,
      hazard_type: hazard,
      severity: null,
      region: e.categories?.[0]?.title ?? null,
      source_url: e.sources?.[0]?.url ?? e.link ?? "https://eonet.gsfc.nasa.gov",
      event_time: new Date(geom?.date ?? Date.now()).toISOString(),
      lat: Array.isArray(geom?.coordinates) ? geom.coordinates[1] : null,
      lon: Array.isArray(geom?.coordinates) ? geom.coordinates[0] : null,
    };
  });
}

async function fetchGDACS(): Promise<Broadcast[]> {
  const r = await safeFetch("https://www.gdacs.org/xml/rss.xml");
  if (!r) return [];
  const xml = await r.text();
  const items: Broadcast[] = [];
  const rx = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(xml)) && items.length < 20) {
    const chunk = m[1];
    const get = (tag: string) => {
      const t = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(chunk);
      if (!t) return null;
      return t[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    };
    const title = get("title") ?? "GDACS alert";
    const link = get("link") ?? "https://www.gdacs.org";
    const desc = get("description");
    const pub = get("pubDate");
    const lat = Number(get("geo:lat") ?? get("geo:Point") ?? NaN);
    const lon = Number(get("geo:long") ?? NaN);
    const alertLevel = /Green/i.test(title) ? 1 : /Orange/i.test(title) ? 3 : /Red/i.test(title) ? 5 : 2;
    const hazard = /earthquake/i.test(title) ? "earthquake"
      : /flood/i.test(title) ? "flood"
      : /cyclone|hurricane|typhoon/i.test(title) ? "hurricane"
      : /volcano/i.test(title) ? "volcano"
      : /wildfire|fire/i.test(title) ? "wildfire"
      : /drought/i.test(title) ? "drought"
      : "event";
    items.push({
      id: `gdacs:${link}`,
      agency: AGENCIES.gdacs.name,
      agency_handle: AGENCIES.gdacs.handle,
      agency_verified: true,
      kind: alertLevel >= 3 ? "warning" : "news",
      title,
      body: desc,
      hazard_type: hazard,
      severity: alertLevel,
      region: null,
      source_url: link,
      event_time: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
    });
  }
  return items;
}

async function fetchReliefWeb(): Promise<Broadcast[]> {
  const r = await safeFetch(
    "https://api.reliefweb.int/v1/reports?appname=hot-portal&limit=15&sort[]=date:desc&filter[field]=disaster_type&fields[include][]=title&fields[include][]=body&fields[include][]=date&fields[include][]=source&fields[include][]=url&fields[include][]=country",
  );
  if (!r) return [];
  const j = await r.json();
  return (j.data ?? []).slice(0, 15).map((row: any): Broadcast => {
    const f = row.fields ?? {};
    return {
      id: `reliefweb:${row.id}`,
      agency: f.source?.[0]?.name ? `${AGENCIES.reliefweb.name} · ${f.source[0].name}` : AGENCIES.reliefweb.name,
      agency_handle: AGENCIES.reliefweb.handle,
      agency_verified: true,
      kind: "news",
      title: f.title ?? "Situation report",
      body: typeof f.body === "string" ? f.body.slice(0, 400) : null,
      hazard_type: null,
      severity: null,
      region: f.country?.[0]?.name ?? null,
      source_url: f.url ?? "https://reliefweb.int",
      event_time: new Date(f.date?.created ?? Date.now()).toISOString(),
      lat: null,
      lon: null,
    };
  });
}

async function fetchNOAA(): Promise<Broadcast[]> {
  const r = await safeFetch("https://api.weather.gov/alerts/active?limit=25");
  if (!r) return [];
  const j = await r.json();
  return (j.features ?? []).slice(0, 25).map((f: any): Broadcast => {
    const p = f.properties ?? {};
    const sev = String(p.severity ?? "").toLowerCase();
    const level = sev === "extreme" ? 5 : sev === "severe" ? 4 : sev === "moderate" ? 3 : sev === "minor" ? 2 : 1;
    const isWarn = /warning/i.test(p.event ?? "") || level >= 4;
    const evt = String(p.event ?? "").toLowerCase();
    const hazard =
      /tornado/.test(evt) ? "tornado"
      : /flood/.test(evt) ? "flood"
      : /hurricane|tropical/.test(evt) ? "hurricane"
      : /fire/.test(evt) ? "wildfire"
      : /thunder|storm/.test(evt) ? "storm"
      : /wind/.test(evt) ? "wind"
      : /heat/.test(evt) ? "heat"
      : /cold|freeze|winter/.test(evt) ? "cold"
      : "weather";
    return {
      id: `noaa:${f.id}`,
      agency: AGENCIES.noaa.name,
      agency_handle: AGENCIES.noaa.handle,
      agency_verified: true,
      kind: isWarn ? "warning" : "news",
      title: `${p.event ?? "Weather alert"} — ${p.areaDesc ?? ""}`.trim(),
      body: p.headline ?? p.description ?? null,
      hazard_type: hazard,
      severity: level,
      region: p.areaDesc ?? null,
      source_url: p.uri ?? "https://www.weather.gov",
      event_time: new Date(p.sent ?? Date.now()).toISOString(),
      lat: null,
      lon: null,
    };
  });
}

// Very small in-memory cache per isolate — reduces upstream load if the same
// isolate handles multiple requests inside the freshness window.
let CACHE: { at: number; items: Broadcast[] } | null = null;
const CACHE_TTL_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (CACHE && Date.now() - CACHE.at < CACHE_TTL_MS) {
      return new Response(JSON.stringify({ items: CACHE.items, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      });
    }
    const [a, b, c, d, e] = await Promise.all([
      fetchUSGS(), fetchEONET(), fetchGDACS(), fetchReliefWeb(), fetchNOAA(),
    ]);
    const all = [...a, ...b, ...c, ...d, ...e]
      .filter((x) => x && x.title)
      .sort((x, y) => +new Date(y.event_time) - +new Date(x.event_time))
      .slice(0, 80);
    CACHE = { at: Date.now(), items: all };
    return new Response(JSON.stringify({ items: all, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});