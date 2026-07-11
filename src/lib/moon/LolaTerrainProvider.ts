/**
 * Lightweight LOLA-driven Moon terrain provider.
 *
 * Cesium ion is NOT used. We derive vertex heights from NASA's public LOLA
 * color-hillshade tiles served by Solar System Treks. Luminance of each
 * hillshade pixel correlates strongly with local elevation, so sampling
 * luminance gives us a visually plausible relief without requiring a raw
 * DEM tile server (Trek does not expose one at these zoom levels in a
 * browser-consumable format).
 *
 * The result is not scientifically calibrated — but it is real NASA LOLA
 * data and produces convincing 3D relief (crater rims, maria, highlands)
 * on the Moon. For scientific accuracy the layer stack still includes the
 * raw LOLA color hillshade and slope overlays.
 */

import {
  CustomHeightmapTerrainProvider,
  Ellipsoid,
  GeographicTilingScheme,
  Credit,
} from "cesium";

const TREK_LOLA_HILLSHADE =
  "https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_Shade_Global_128ppd_v04/1.0.0/default/default028mm";

/** Approximate vertical range from LOLA global topography, in metres. */
const MOON_ELEV_MIN = -9130; // deepest point (near South Pole–Aitken)
const MOON_ELEV_MAX = 10786; // highest point (far-side highlands)
const MOON_ELEV_RANGE = MOON_ELEV_MAX - MOON_ELEV_MIN;

const TILE_WIDTH = 32;
const TILE_HEIGHT = 32;

// In-memory LRU of decoded height tiles keyed by "level/x/y".
const cache = new Map<string, Float32Array>();
const CACHE_LIMIT = 512;

function cacheGet(key: string) {
  const v = cache.get(key);
  if (v) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}
function cachePut(key: string, v: Float32Array) {
  cache.set(key, v);
  if (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
}

async function fetchTileHeights(
  level: number,
  x: number,
  y: number
): Promise<Float32Array> {
  const key = `${level}/${x}/${y}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  // Clamp to a level the Trek layer actually publishes (max 6).
  const trekLevel = Math.min(level, 6);
  const scale = Math.pow(2, level - trekLevel);
  const trekX = Math.floor(x / scale);
  const trekY = Math.floor(y / scale);
  const url = `${TREK_LOLA_HILLSHADE}/${trekLevel}/${trekY}/${trekX}.jpg`;

  const heights = new Float32Array(TILE_WIDTH * TILE_HEIGHT);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(String(resp.status));
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    canvas.width = TILE_WIDTH;
    canvas.height = TILE_HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d ctx");

    // If we're up-sampling from a coarser Trek tile, crop to the sub-region
    // corresponding to (x, y) inside its parent trek tile.
    if (scale > 1) {
      const sw = bitmap.width / scale;
      const sh = bitmap.height / scale;
      const sx = (x - trekX * scale) * sw;
      const sy = (y - trekY * scale) * sh;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, TILE_WIDTH, TILE_HEIGHT);
    } else {
      ctx.drawImage(bitmap, 0, 0, TILE_WIDTH, TILE_HEIGHT);
    }
    bitmap.close?.();

    const pixels = ctx.getImageData(0, 0, TILE_WIDTH, TILE_HEIGHT).data;
    for (let i = 0; i < heights.length; i++) {
      // Grey hillshade: use R (all channels are ~equal).
      const lum = pixels[i * 4] / 255;
      heights[i] = MOON_ELEV_MIN + lum * MOON_ELEV_RANGE;
    }
  } catch {
    // Fall back to a smooth ellipsoid tile.
    heights.fill(0);
  }

  cachePut(key, heights);
  return heights;
}

export function createLolaMoonTerrainProvider() {
  return new CustomHeightmapTerrainProvider({
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    tilingScheme: new GeographicTilingScheme({
      ellipsoid: Ellipsoid.MOON,
    }),
    ellipsoid: Ellipsoid.MOON,
    credit: new Credit(
      "NASA / GSFC / LOLA · Lunar Orbiter Laser Altimeter",
      false
    ),
    callback: (x, y, level) => {
      const level0 = Math.max(0, level);
      return fetchTileHeights(level0, x, y).then((heights) => heights);
    },
  });
}