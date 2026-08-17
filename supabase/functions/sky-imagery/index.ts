/**
 * sky-imagery — CORS-enabled source of all-sky survey panoramas.
 *
 * The browser needs raw pixels to re-project an equirectangular all-sky image
 * into the six cube-map faces of the Atlas skybox, and neither NASA/SVS nor CDS
 * sends a wildcard `Access-Control-Allow-Origin` (a canvas read would taint).
 *
 * Two families are served:
 *  - `survey=tycho` → NASA/SVS Tycho Skymap II JPEG panorama (4K/8K/16K).
 *  - every other id → a real telescope survey published as a HiPS at CDS,
 *    rendered on demand by `hips2fits` in equirectangular (CAR) projection so
 *    the client projection maths stays identical.
 */
import { corsHeaders } from "../_shared/cors.ts";

const SVS_BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a003500/a003572/";

/** NASA SVS #3572 — Tycho Skymap II (Brightness/colour "t5" variant). */
const MOSAICS: Record<string, string> = {
  "4k": "TychoSkymapII.t5_04096x02048.jpg",
  "8k": "TychoSkymapII.t5_08192x04096.jpg",
  "16k": "TychoSkymapII.t5_16384x08192.jpg",
};

/** Whitelisted HiPS surveys — keeps this from being an open image proxy. */
const HIPS: Record<string, string> = {
  dss2: "CDS/P/DSS2/color",
  twomass: "CDS/P/2MASS/color",
  wise: "CDS/P/allWISE/color",
  iris: "CDS/P/IRIS/color",
  rass: "CDS/P/RASS",
  fermi: "CDS/P/Fermi/color",
  hgps: "CDS/P/HGPS",
  haslam: "CDS/P/Haslam",
  "planck-hfi": "CDS/P/PLANCK/R2/HFI/color",
  "planck-cmb": "CDS/P/PLANCK/R2/CMB",
  wmap: "CDS/P/WMAP/W",
};

const HIPS_WIDTH: Record<string, number> = { "4k": 2048, "8k": 4096, "16k": 4096 };

const CACHE = "public, max-age=31536000, immutable";

/** Surveys without their own HiPS fall back to DSS2 for deep cutouts. */
const CUTOUT_FALLBACK = "CDS/P/DSS2/color";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const params = new URL(req.url).searchParams;
    const res = params.get("res") ?? "4k";
    const survey = params.get("survey") ?? "tycho";

    // ---- Deep-field cutout: gnomonic (TAN) render of a small patch of sky ----
    if (params.get("mode") === "cutout") {
      const hips = HIPS[survey] ?? CUTOUT_FALLBACK;
      const ra = Number(params.get("ra"));
      const dec = Number(params.get("dec"));
      const fov = Number(params.get("fov"));
      const width = Math.min(1600, Math.max(256, Math.round(Number(params.get("width")) || 1024)));
      if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(fov) || fov <= 0) {
        return new Response(JSON.stringify({ error: "ra, dec and fov are required" }), {
          status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      const url = new URL("https://alasky.cds.unistra.fr/hips-image-services/hips2fits");
      url.searchParams.set("hips", hips);
      url.searchParams.set("width", String(width));
      url.searchParams.set("height", String(width));
      url.searchParams.set("projection", "TAN");
      url.searchParams.set("coordsys", "icrs");
      url.searchParams.set("ra", String(ra));
      url.searchParams.set("dec", String(dec));
      url.searchParams.set("fov", String(Math.min(60, Math.max(0.01, fov))));
      url.searchParams.set("format", "jpg");
      const cut = await fetch(url.toString(), {
        headers: { Accept: "image/jpeg,image/*", "User-Agent": "Atlas-SkyBox/1.0 (+https://www.imagineengine.space)" },
      });
      if (!cut.ok || !cut.body) {
        return new Response(JSON.stringify({ error: "cutout failed", status: cut.status }), {
          status: 502, headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      return new Response(cut.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "content-type": cut.headers.get("content-type") ?? "image/jpeg",
          "cache-control": "public, max-age=86400",
          "x-sky-source": hips,
        },
      });
    }

    if (survey === "tycho") {
      const file = MOSAICS[res];
      if (!file) {
        return new Response(JSON.stringify({ error: "unknown res", allowed: Object.keys(MOSAICS) }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      const upstream = await fetch(SVS_BASE + file, {
        headers: { Accept: "image/jpeg,image/*", "User-Agent": "Atlas-SkyBox/1.0 (+https://www.imagineengine.space)" },
      });
      if (!upstream.ok || !upstream.body) {
        return new Response(JSON.stringify({ error: "upstream failed", status: upstream.status }), {
          status: 502, headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
          "cache-control": CACHE,
          "x-sky-source": "NASA/SVS Tycho Skymap II",
        },
      });
    }

    const hips = HIPS[survey];
    if (!hips) {
      return new Response(JSON.stringify({ error: "unknown survey", allowed: ["tycho", ...Object.keys(HIPS)] }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const width = HIPS_WIDTH[res] ?? 2048;
    const url = new URL("https://alasky.cds.unistra.fr/hips-image-services/hips2fits");
    url.searchParams.set("hips", hips);
    url.searchParams.set("width", String(width));
    url.searchParams.set("height", String(width / 2));
    url.searchParams.set("projection", "CAR");
    url.searchParams.set("coordsys", "icrs");
    url.searchParams.set("ra", "0");
    url.searchParams.set("dec", "0");
    url.searchParams.set("fov", "360");
    url.searchParams.set("format", "jpg");

    const upstream = await fetch(url.toString(), {
      headers: { Accept: "image/jpeg,image/*", "User-Agent": "Atlas-SkyBox/1.0 (+https://www.imagineengine.space)" },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: "hips2fits failed", status: upstream.status }), {
        status: 502, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
        "cache-control": CACHE,
        "x-sky-source": hips,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 502, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
