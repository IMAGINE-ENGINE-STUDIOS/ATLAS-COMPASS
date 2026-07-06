/**
 * Live GIS catalog — curated public feeds that can be dropped straight onto
 * the globe as a heatmap without any user upload. Every entry ships a
 * `fetchPoints` function that returns `{ lng, lat, weight }[]` (weight
 * normalized to a sensible unit, e.g. magnitude, confidence, count).
 *
 * All feeds selected here return CORS-friendly JSON and do not require an
 * API key. The catalog is intentionally broad — hazards, weather, transport,
 * environment, human activity — so users can build heatmaps with one click.
 */
export type HeatCategory =
  | "hazards"
  | "weather"
  | "environment"
  | "transport"
  | "human"
  | "space";

export interface HeatPoint {
  lng: number;
  lat: number;
  /** Normalized 0..1 weight (0 = min, 1 = max intensity for the ramp). */
  weight: number;
  label?: string;
}

export interface LiveGisSource {
  id: string;
  label: string;
  provider: string;
  category: HeatCategory;
  description: string;
  /** Suggested pixel radius for the heatmap point. */
  radius: number;
  /** Suggested color ramp id (see `HEAT_RAMPS`). */
  ramp: string;
  /** How often we should refresh (ms). */
  refreshMs: number;
  fetchPoints: () => Promise<HeatPoint[]>;
}

/* ─────────── helpers ─────────── */

async function j<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T;
}

function norm(values: number[]): (v: number) => number {
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min || 1;
  return (v) => Math.max(0, Math.min(1, (v - min) / range));
}

/* ─────────── sources ─────────── */

export const LIVE_GIS_SOURCES: LiveGisSource[] = [
  {
    id: "usgs-quakes-day",
    label: "Earthquakes (24h)",
    provider: "USGS",
    category: "hazards",
    description: "All earthquakes worldwide in the last 24 hours, weighted by magnitude.",
    radius: 26, ramp: "inferno", refreshMs: 5 * 60_000,
    fetchPoints: async () => {
      const g = await j<any>("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson");
      const feats: any[] = g.features ?? [];
      const mags = feats.map((f) => Number(f.properties?.mag ?? 0));
      const to01 = norm(mags);
      return feats.map((f) => ({
        lng: f.geometry?.coordinates?.[0],
        lat: f.geometry?.coordinates?.[1],
        weight: to01(Number(f.properties?.mag ?? 0)),
        label: f.properties?.place,
      })).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    },
  },
  {
    id: "usgs-quakes-week",
    label: "Earthquakes (7d)",
    provider: "USGS",
    category: "hazards",
    description: "All earthquakes worldwide in the last 7 days, weighted by magnitude.",
    radius: 22, ramp: "inferno", refreshMs: 15 * 60_000,
    fetchPoints: async () => {
      const g = await j<any>("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson");
      const feats: any[] = g.features ?? [];
      const mags = feats.map((f) => Number(f.properties?.mag ?? 0));
      const to01 = norm(mags);
      return feats.map((f) => ({
        lng: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1],
        weight: to01(Number(f.properties?.mag ?? 0)), label: f.properties?.place,
      })).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    },
  },
  {
    id: "eonet-events",
    label: "Natural Events (EONET)",
    provider: "NASA EONET",
    category: "hazards",
    description: "Open, current natural events: wildfires, storms, volcanoes, floods.",
    radius: 32, ramp: "magma", refreshMs: 10 * 60_000,
    fetchPoints: async () => {
      const g = await j<any>("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500");
      const events: any[] = g.events ?? [];
      const pts: HeatPoint[] = [];
      for (const e of events) {
        const geoms: any[] = e.geometry ?? [];
        const last = geoms[geoms.length - 1];
        if (!last) continue;
        const coords = last.coordinates;
        if (last.type === "Point" && Array.isArray(coords) && coords.length >= 2) {
          pts.push({ lng: coords[0], lat: coords[1], weight: 1, label: e.title });
        }
      }
      return pts;
    },
  },
  {
    id: "gdacs-alerts",
    label: "Global Disaster Alerts (GDACS)",
    provider: "GDACS",
    category: "hazards",
    description: "Live disaster alerts (cyclones, floods, quakes, volcanoes) with severity.",
    radius: 34, ramp: "spectral", refreshMs: 15 * 60_000,
    fetchPoints: async () => {
      const g = await j<any>("https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP");
      const feats: any[] = g.features ?? [];
      const scores = feats.map((f) => Number(f.properties?.severitydata?.severity ?? 1));
      const to01 = norm(scores);
      return feats.map((f) => ({
        lng: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1],
        weight: to01(Number(f.properties?.severitydata?.severity ?? 1)),
        label: f.properties?.name,
      })).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    },
  },
  {
    id: "firms-viirs-24h",
    label: "Active Wildfires (VIIRS 24h)",
    provider: "NASA FIRMS",
    category: "hazards",
    description: "Active fire detections in the last 24 hours from VIIRS S-NPP.",
    radius: 14, ramp: "inferno", refreshMs: 30 * 60_000,
    fetchPoints: async () => {
      const csv = await (await fetch(
        "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv"
      )).text();
      const lines = csv.split("\n").slice(1).filter(Boolean);
      const pts: HeatPoint[] = [];
      for (const l of lines) {
        const cells = l.split(",");
        const lat = Number(cells[0]); const lng = Number(cells[1]); const bright = Number(cells[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          pts.push({ lng, lat, weight: Math.max(0, Math.min(1, (bright - 290) / 200)) });
        }
      }
      return pts;
    },
  },
  {
    id: "openaq-pm25",
    label: "Air Quality (PM2.5)",
    provider: "OpenAQ",
    category: "environment",
    description: "Latest PM2.5 sensor readings worldwide.",
    radius: 20, ramp: "warm", refreshMs: 15 * 60_000,
    fetchPoints: async () => {
      const g = await j<any>("https://api.openaq.org/v2/latest?parameter=pm25&limit=1000&has_geo=true");
      const results: any[] = g.results ?? [];
      const vals: number[] = [];
      const raw: { lng: number; lat: number; v: number; label: string }[] = [];
      for (const r of results) {
        const coords = r.coordinates; if (!coords) continue;
        const m = (r.measurements ?? []).find((x: any) => x.parameter === "pm25");
        if (!m) continue;
        raw.push({ lng: coords.longitude, lat: coords.latitude, v: Number(m.value), label: r.location });
        vals.push(Number(m.value));
      }
      const to01 = norm(vals);
      return raw.map((r) => ({ lng: r.lng, lat: r.lat, weight: to01(r.v), label: r.label }));
    },
  },
  {
    id: "power-outages-us",
    label: "US Weather Alerts",
    provider: "NWS",
    category: "weather",
    description: "Active National Weather Service alerts (US).",
    radius: 40, ramp: "spectral", refreshMs: 10 * 60_000,
    fetchPoints: async () => {
      const g = await j<any>("https://api.weather.gov/alerts/active?limit=500", {
        headers: { Accept: "application/geo+json" },
      });
      const feats: any[] = g.features ?? [];
      const pts: HeatPoint[] = [];
      for (const f of feats) {
        const c = f.geometry?.coordinates;
        const sev = { Extreme: 1, Severe: 0.75, Moderate: 0.5, Minor: 0.25 }[String(f.properties?.severity)] ?? 0.5;
        if (Array.isArray(c) && c.length && Array.isArray(c[0])) {
          // Polygon centroid
          const ring = c[0]; let x = 0, y = 0;
          for (const p of ring) { x += p[0]; y += p[1]; }
          pts.push({ lng: x / ring.length, lat: y / ring.length, weight: sev, label: f.properties?.event });
        }
      }
      return pts;
    },
  },
  {
    id: "iss-position",
    label: "ISS Live Position",
    provider: "wheretheiss.at",
    category: "space",
    description: "Live International Space Station ground track.",
    radius: 60, ramp: "cool", refreshMs: 15_000,
    fetchPoints: async () => {
      const d = await j<any>("https://api.wheretheiss.at/v1/satellites/25544");
      return [{ lng: Number(d.longitude), lat: Number(d.latitude), weight: 1, label: "ISS" }];
    },
  },
  {
    id: "aisstream-vessels",
    label: "Vessels (AIS)",
    provider: "AISHub sample",
    category: "transport",
    description: "Global vessel positions (sample AIS feed).",
    radius: 12, ramp: "viridis", refreshMs: 60_000,
    fetchPoints: async () => {
      // Free CORS-open sample from Datalastic public demo tiles fallback.
      const g = await j<any>("https://services.marinetraffic.com/api/exportvessels/v:5/publicvessels.json").catch(() => ({}));
      const arr: any[] = Array.isArray(g) ? g : g?.data ?? [];
      return arr.map((v: any) => ({ lng: Number(v.LON ?? v.lon), lat: Number(v.LAT ?? v.lat), weight: 0.6, label: v.SHIPNAME ?? v.name }))
        .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    },
  },
  {
    id: "world-population-cities",
    label: "World Cities (population)",
    provider: "SimpleMaps CC-BY",
    category: "human",
    description: "Top ~4,000 world cities weighted by population.",
    radius: 18, ramp: "viridis", refreshMs: 24 * 3600 * 1000,
    fetchPoints: async () => {
      const g = await j<any[]>(
        "https://raw.githubusercontent.com/lutangar/cities.json/master/cities.json"
      );
      const pops = g.map((c: any) => Number(c.population ?? 0));
      const to01 = norm(pops.map((p) => Math.log10(1 + p)));
      return g.map((c: any) => ({
        lng: Number(c.lng), lat: Number(c.lat),
        weight: to01(Math.log10(1 + Number(c.population ?? 0))),
        label: `${c.name}, ${c.country}`,
      })).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat)).slice(0, 4000);
    },
  },
  {
    id: "airports-major",
    label: "Airports (major)",
    provider: "OurAirports",
    category: "transport",
    description: "Large & medium airports worldwide.",
    radius: 14, ramp: "cool", refreshMs: 24 * 3600 * 1000,
    fetchPoints: async () => {
      const csv = await (await fetch("https://davidmegginson.github.io/ourairports-data/airports.csv")).text();
      const lines = csv.split("\n"); const header = lines[0].split(",");
      const iLat = header.indexOf("latitude_deg"), iLon = header.indexOf("longitude_deg"), iT = header.indexOf("type"), iN = header.indexOf("name");
      const pts: HeatPoint[] = [];
      for (const l of lines.slice(1)) {
        const cells = l.split(",");
        const t = cells[iT]; if (t !== "large_airport" && t !== "medium_airport") continue;
        const lat = Number(cells[iLat]); const lng = Number(cells[iLon]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lng, lat, weight: t === "large_airport" ? 1 : 0.5, label: cells[iN] });
      }
      return pts.slice(0, 5000);
    },
  },
  {
    id: "volcanoes-holocene",
    label: "Holocene Volcanoes",
    provider: "Smithsonian GVP",
    category: "hazards",
    description: "All Holocene-active volcanoes on Earth.",
    radius: 20, ramp: "magma", refreshMs: 24 * 3600 * 1000,
    fetchPoints: async () => {
      const g = await j<any>("https://raw.githubusercontent.com/GeoscienceAustralia/hazards/master/volcanoes/holocene.geojson").catch(() => null as any);
      const feats: any[] = g?.features ?? [];
      return feats.map((f: any) => ({
        lng: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1], weight: 1,
        label: f.properties?.name,
      })).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    },
  },
];

/* ─────────── color ramps ─────────── */

export type HeatRamp = { id: string; label: string; stops: [number, string][] };

export const HEAT_RAMPS: HeatRamp[] = [
  { id: "viridis", label: "Viridis", stops: [[0, "#440154"], [0.5, "#21918c"], [1, "#fde725"]] },
  { id: "inferno", label: "Inferno", stops: [[0, "#000004"], [0.5, "#bb3754"], [1, "#fcffa4"]] },
  { id: "magma", label: "Magma", stops: [[0, "#000004"], [0.5, "#b73779"], [1, "#fcfdbf"]] },
  { id: "cool", label: "Cool", stops: [[0, "#0033ff"], [1, "#00ffff"]] },
  { id: "warm", label: "Warm", stops: [[0, "#fff33b"], [0.5, "#f3903f"], [1, "#e93e3a"]] },
  { id: "spectral", label: "Spectral", stops: [[0, "#3288bd"], [0.5, "#ffffbf"], [1, "#d53e4f"]] },
  { id: "cyan", label: "Cyan", stops: [[0, "rgba(34,211,238,0.05)"], [1, "#22d3ee"]] },
];

export function sampleRamp(ramp: HeatRamp, t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const s = ramp.stops;
  for (let i = 1; i < s.length; i++) {
    if (x <= s[i][0]) {
      const [t0, c0] = s[i - 1]; const [t1, c1] = s[i];
      const k = (x - t0) / (t1 - t0 || 1);
      return mixHex(c0, c1, k);
    }
  }
  return s[s.length - 1][1];
}

function toRgba(c: string): [number, number, number, number] {
  if (c.startsWith("rgba")) {
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 1];
    const parts = m[1].split(",").map((s) => Number(s.trim()));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  const h = c.replace("#", "");
  const v = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 1];
}
function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1, a1] = toRgba(a); const [r2, g2, b2, a2] = toRgba(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  const al = a1 + (a2 - a1) * t;
  return `rgba(${r},${g},${bl},${al.toFixed(3)})`;
}