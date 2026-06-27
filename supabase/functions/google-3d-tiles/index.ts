// Proxies Google Map Tiles API (Photorealistic 3D Tiles)
const GOOGLE_BASE = "https://tile.googleapis.com/v1/3dtiles";
const FN_PREFIX_RE = /^(?:\/functions\/v1)?\/google-3d-tiles\/?/;
const DATASET_FILES_RE = /^datasets\/([^/]+)\/files\//;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range, if-modified-since, if-none-match",
  "Access-Control-Expose-Headers": "content-length, content-range, etag, last-modified",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function rewriteUris(json: any, proxyRoot: string): any {
  if (json == null) return json;
  if (Array.isArray(json)) return json.map((x) => rewriteUris(x, proxyRoot));
  if (typeof json === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(json)) {
      if (k === "uri" && typeof v === "string") {
        let u = v;
        // Skip non-http assets and already proxied URLs. Do not skip
        // tile.googleapis.com absolute URLs — those must be rewritten so the
        // browser never requests Google tiles without our server-side key.
        if (u.includes("/functions/v1/google-3d-tiles/")) {
          out[k] = u;
          continue;
        }
        if (u.startsWith("blob:") || u.startsWith("data:")) {
          out[k] = u;
          continue;
        }

        // If it starts with /v1/3dtiles/, it's a root-relative path to Google's API.
        // We rewrite it to our proxy root.
        if (u.startsWith("/v1/3dtiles/")) {
          u = u.slice("/v1/3dtiles/".length);
          out[k] = proxyRoot + u.replace(/^\//, "");
        } else if (u.startsWith("v1/3dtiles/")) {
          u = u.slice("v1/3dtiles/".length);
          out[k] = proxyRoot + u.replace(/^\//, "");
        } else if (u.startsWith("https://tile.googleapis.com/v1/3dtiles/")) {
          u = u.slice("https://tile.googleapis.com/v1/3dtiles/".length);
          out[k] = proxyRoot + u.replace(/^\//, "");
        } else if (u === "root.json" || u.startsWith("datasets/")) {
          // Google sometimes emits API-root-relative paths without a leading
          // slash. Make them absolute proxy URLs; otherwise Cesium resolves
          // them relative to the parent JSON and duplicates the path.
          out[k] = proxyRoot + u.replace(/^\//, "");
        } else if (u.includes("://")) {
          out[k] = u;
        } else {
          // It's a truly relative path (e.g. "tiles/1.glb"). 
          // Leave it alone so Cesium resolves it relative to the current JSON's proxy URL.
          out[k] = u;
        }
      } else {
        out[k] = rewriteUris(v, proxyRoot);
      }
    }
    return out;
  }
  return json;
}

function normalizeGoogle3DTilePath(path: string): string {
  let normalized = path.replace(/^\/+/, "");
  // Repair URLs produced by previously cached/re-resolved manifests, e.g.
  // datasets/A/files/datasets/A/files/tile.glb -> datasets/A/files/tile.glb
  // Google rejects the duplicated form with 400, which makes Cesium stall.
  for (let i = 0; i < 4; i += 1) {
    const match = normalized.match(DATASET_FILES_RE);
    if (!match) break;
    const prefix = match[0];
    const duplicate = `datasets/${match[1]}/files/`;
    const rest = normalized.slice(prefix.length);
    if (!rest.startsWith(duplicate)) break;
    normalized = prefix + rest.slice(duplicate.length);
  }
  return normalized;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "GET only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey =
    Deno.env.get("GOOGLE_MAP_TILES_API_KEY") ||
    Deno.env.get("GOOGLE_MAPS_BROWSER_KEY") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY");
    
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GOOGLE_MAP_TILES_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const sub = url.pathname.replace(FN_PREFIX_RE, "");
  const upstreamPath = sub.length === 0 ? "root.json" : normalizeGoogle3DTilePath(sub);

  const upstream = new URL(`${GOOGLE_BASE}/${upstreamPath}`);
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "key" || k === "atlas_cache_bust") continue;
    upstream.searchParams.set(k, v);
  }
  upstream.searchParams.set("key", apiKey);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream.toString(), {
      headers: {
        ...(req.headers.get("range") ? { Range: req.headers.get("range")! } : {}),
        Accept: "*/*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "upstream fetch failed", detail: String(e) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ct = upstreamRes.headers.get("content-type") || "application/octet-stream";
  const isJsonTile = ct.includes("application/json") || upstreamPath.endsWith(".json");
  const okCacheControl = isJsonTile
    ? "public, max-age=30, stale-while-revalidate=300"
    : "public, max-age=86400, immutable";
  const passHeaders: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": ct,
    // Cache successful tiles only. Never pin 4xx/5xx because Cesium will keep
    // retrying stale broken manifests/GLBs and the map appears frozen.
    "Cache-Control": upstreamRes.ok ? okCacheControl : "no-store, max-age=0",
  };
  const etag = upstreamRes.headers.get("etag");
  if (etag) passHeaders["ETag"] = etag;
  const cr = upstreamRes.headers.get("content-range");
  if (cr) passHeaders["Content-Range"] = cr;

  if (!upstreamRes.ok) {
    const body = await upstreamRes.text().catch(() => "");
    return new Response(body || JSON.stringify({ error: "Google 3D tile fetch failed" }), {
      status: upstreamRes.status,
      headers: passHeaders,
    });
  }

  if (isJsonTile) {
    const json = await upstreamRes.json().catch(() => null);
    if (json) {
      // Proxy root for rewriting absolute-ish paths
      const proxyRoot = `https://${url.host}/functions/v1/google-3d-tiles/`;
      const rewritten = rewriteUris(json, proxyRoot);
      return new Response(JSON.stringify(rewritten), {
        status: upstreamRes.status,
        headers: passHeaders,
      });
    }
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: passHeaders,
  });
});
