/**
 * MOLA-derived Mars terrain provider.
 *
 * Mirrors `LolaTerrainProvider` for Moon — samples luminance from the
 * public NASA Mars Trek MOLA color-shaded relief hillshade at 463 m/px
 * and turns it into a `CustomHeightmapTerrainProvider` so Olympus Mons,
 * Valles Marineris, and the crater rims read as real 3D relief instead
 * of a smooth ellipsoid.
 *
 * Not a scientifically calibrated DEM (that would require raw MOLA GeoTIFF
 * tiles, which Trek does not publish as WMTS). But it is real NASA MOLA
 * data and produces convincing relief. Amplitude is clamped so the
 * screen-space camera controller's collision detection can still zoom
 * smoothly down to the surface.
 */
import {
  CustomHeightmapTerrainProvider,
  GeographicTilingScheme,
  Credit,
} from "cesium";
import { MARS_ELLIPSOID } from "@/lib/planets/ellipsoids";

const TREK_MOLA_SHADE =
  "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm";

// Real MOLA range is ~ -8 km to +21 km. We compress to ±3 km so terrain
// collision does not park the camera at high altitudes on approach.
const MARS_ELEV_MIN = -3000;
const MARS_ELEV_MAX = 3000;
const MARS_ELEV_RANGE = MARS_ELEV_MAX - MARS_ELEV_MIN;

const TILE_W = 32;
const TILE_H = 32;

const cache = new Map<string, Float32Array>();
const CACHE_LIMIT = 512;

function cacheGet(k: string) {
  const v = cache.get(k);
  if (v) { cache.delete(k); cache.set(k, v); }
  return v;
}
function cachePut(k: string, v: Float32Array) {
  cache.set(k, v);
  if (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
}

async function fetchTile(level: number, x: number, y: number): Promise<Float32Array> {
  const key = `${level}/${x}/${y}`;
  const hit = cacheGet(key); if (hit) return hit;
  // Trek MOLA shade tops out at level 6.
  const trekLevel = Math.min(level, 6);
  const scale = Math.pow(2, level - trekLevel);
  const trekX = Math.floor(x / scale);
  const trekY = Math.floor(y / scale);
  const url = `${TREK_MOLA_SHADE}/${trekLevel}/${trekY}/${trekX}.jpg`;
  const heights = new Float32Array(TILE_W * TILE_H);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(String(resp.status));
    const bitmap = await createImageBitmap(await resp.blob());
    const canvas = document.createElement("canvas");
    canvas.width = TILE_W; canvas.height = TILE_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d ctx");
    if (scale > 1) {
      const sw = bitmap.width / scale;
      const sh = bitmap.height / scale;
      const sx = (x - trekX * scale) * sw;
      const sy = (y - trekY * scale) * sh;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, TILE_W, TILE_H);
    } else {
      ctx.drawImage(bitmap, 0, 0, TILE_W, TILE_H);
    }
    bitmap.close?.();
    const pixels = ctx.getImageData(0, 0, TILE_W, TILE_H).data;
    for (let i = 0; i < heights.length; i++) {
      // MOLA color-shade — luminance from R+G+B correlates with elevation
      // (blue = low basins, red = high volcanoes).
      const r = pixels[i * 4] / 255;
      const g = pixels[i * 4 + 1] / 255;
      const b = pixels[i * 4 + 2] / 255;
      // Emphasise the red channel since MOLA color ramp puts highs in red.
      const t = 0.5 * r + 0.3 * (1 - b) + 0.2 * g;
      heights[i] = MARS_ELEV_MIN + t * MARS_ELEV_RANGE;
    }
  } catch {
    heights.fill(0);
  }
  cachePut(key, heights);
  return heights;
}

export function createMolaMarsTerrainProvider() {
  return new CustomHeightmapTerrainProvider({
    width: TILE_W,
    height: TILE_H,
    tilingScheme: new GeographicTilingScheme({ ellipsoid: MARS_ELLIPSOID }),
    ellipsoid: MARS_ELLIPSOID,
    credit: new Credit("NASA / MGS / MOLA · Mars Orbiter Laser Altimeter", false),
    callback: (x, y, level) => fetchTile(Math.max(0, level), x, y),
  });
}