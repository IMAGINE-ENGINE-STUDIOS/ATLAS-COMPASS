// Proxies Google Map Tiles API (Photorealistic 3D Tiles) so the browser
// never needs the connector API key. Cesium fetches tiles from this
// function; we inject ?key=GOOGLE_MAPS_API_KEY server-side and rewrite
// child URIs in JSON manifests so subsequent requests come back to us.

const GOOGLE_BASE = "https://tile.googleapis.com/v1/3dtiles";
// Match both the externally-visible path (/functions/v1/google-3d-tiles/...)
// and the path Supabase forwards to the function runtime (/google-3d-tiles/...).
const FN_PREFIX_RE = /^(?:\/functions\/v1)?\/google-3d-tiles\/?/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range, if-modified-since, if-none-match",
  "Access-Control-Expose-Headers": "content-length, content-range, etag, last-modified",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function rewriteUris(json: any): any {
  if (json == null) return json;
  if (Array.isArray(json)) return json.map(rewriteUris);
  if (typeof json === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(json)) {
      if (k === "uri" && typeof v === "string") {
        // Google returns absolute paths like "/v1/3dtiles/datasets/.../X.glb?session=..."
        // Rewrite to relative URI so Cesium resolves back through this function.
        let u = v;
        if (u.startsWith("/v1/3dtiles/")) u = u.slice("/v1/3dtiles/".length);
        else if (u.startsWith("https://tile.googleapis.com/v1/3dtiles/"))
          u = u.slice("https://tile.googleapis.com/v1/3dtiles/".length);
        out[k] = u;
      } else {
        out[k] = rewriteUris(v);
      }
    }
    return out;
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "GET only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  // Strip the function prefix to get the upstream subpath.
  const sub = url.pathname.replace(FN_PREFIX_RE, "");
  // Default to root.json so the tileset URL can be the bare function URL.
  const upstreamPath = sub.length === 0 ? "root.json" : sub;

  const upstream = new URL(`${GOOGLE_BASE}/${upstreamPath}`);
  // Forward the original query string (carries session=...).
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "key") continue;
    upstream.searchParams.set(k, v);
  }
  upstream.searchParams.set("key", apiKey);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream.toString(), {
      headers: {
        // Pass through Range for partial GLBs.
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
  const passHeaders: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": ct,
    // 24h browser cache; Cesium also keeps its own in-memory LRU.
    "Cache-Control": "public, max-age=86400, immutable",
  };
  const etag = upstreamRes.headers.get("etag");
  if (etag) passHeaders["ETag"] = etag;
  const cr = upstreamRes.headers.get("content-range");
  if (cr) passHeaders["Content-Range"] = cr;

  // Rewrite JSON manifests; stream everything else.
  if (ct.includes("application/json") && upstreamRes.ok) {
    const json = await upstreamRes.json().catch(() => null);
    if (json) {
      const rewritten = rewriteUris(json);
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