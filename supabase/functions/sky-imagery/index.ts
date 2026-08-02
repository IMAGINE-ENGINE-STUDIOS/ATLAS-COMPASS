/**
 * sky-imagery — CORS-enabled passthrough for NASA all-sky survey mosaics.
 *
 * The browser needs the raw pixels of the NASA/SVS Tycho Skymap II panorama to
 * convert the equirectangular mosaic into the six cube-map faces of the Milky
 * Way skybox. svs.gsfc.nasa.gov does not send a wildcard
 * `Access-Control-Allow-Origin`, so a canvas read of the decoded image would
 * taint and fail. Proxying here guarantees CORS plus a long edge cache for the
 * large (4–70 MB) mosaics.
 */
import { corsHeaders } from "../_shared/cors.ts";

const BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a003500/a003572/";

/** NASA SVS #3572 — Tycho Skymap II (Brightness/colour "t5" variant). */
const MOSAICS: Record<string, string> = {
  "4k": "TychoSkymapII.t5_04096x02048.jpg",
  "8k": "TychoSkymapII.t5_08192x04096.jpg",
  "16k": "TychoSkymapII.t5_16384x08192.jpg",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const res = new URL(req.url).searchParams.get("res") ?? "4k";
    const file = MOSAICS[res];
    if (!file) {
      return new Response(JSON.stringify({ error: "unknown res", allowed: Object.keys(MOSAICS) }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const upstream = await fetch(BASE + file, {
      headers: {
        Accept: "image/jpeg,image/*",
        "User-Agent": "Atlas-SkyBox/1.0 (+https://www.imagineengine.space)",
      },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: "upstream failed", status: upstream.status }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
        // Immutable mission archive — cache hard.
        "cache-control": "public, max-age=31536000, immutable",
        "x-sky-source": "NASA/SVS Tycho Skymap II",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 502,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
