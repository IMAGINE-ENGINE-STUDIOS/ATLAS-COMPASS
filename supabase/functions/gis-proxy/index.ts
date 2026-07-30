/**
 * gis-proxy — public CORS-friendly proxy for the curated Live GIS catalog.
 *
 * Many upstream GIS endpoints (USGS, NASA EONET/FIRMS, GDACS, OpenAQ, NWS…)
 * either block browser CORS or intermittently rate-limit anonymous browser
 * requests. Routing them through this edge function guarantees a stable,
 * CORS-enabled response so the Tile Intelligence heatmaps render reliably.
 *
 * Only the hosts explicitly listed in `ALLOW` can be proxied.
 */
import { corsHeaders } from "../_shared/cors.ts";

const ALLOW = [
  "earthquake.usgs.gov",
  "eonet.gsfc.nasa.gov",
  "www.gdacs.org",
  "firms.modaps.eosdis.nasa.gov",
  "api.openaq.org",
  "api.weather.gov",
  "api.wheretheiss.at",
  "services.marinetraffic.com",
  "raw.githubusercontent.com",
  "davidmegginson.github.io",
];

function isAllowed(host: string): boolean {
  return ALLOW.some((h) => host === h || host.endsWith("." + h));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const target = new URL(req.url).searchParams.get("url");
    if (!target) return new Response("missing url", { status: 400, headers: corsHeaders });
    const u = new URL(target);
    if (!isAllowed(u.host)) {
      return new Response(JSON.stringify({ error: "host not allowed", host: u.host }), {
        status: 403, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const upstream = await fetch(u.toString(), {
      headers: {
        Accept: "application/json, text/csv, application/geo+json, */*",
        "User-Agent": "Atlas-TileIntelligence/1.0 (+https://www.imagineengine.space)",
      },
    });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 502, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});