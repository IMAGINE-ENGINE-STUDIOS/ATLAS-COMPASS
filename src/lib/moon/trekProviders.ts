/**
 * NASA Moon Trek WMTS imagery providers.
 *
 * All endpoints are keyless, public NASA data served by the Solar System
 * Treks project (https://trek.nasa.gov). No Cesium ion involvement.
 *
 * Trek layers use an equirectangular (Geographic) tiling scheme with a 2×1
 * root tile grid — the Cesium `WebMapTileServiceImageryProvider` needs to
 * be told this via `tilingScheme: new GeographicTilingScheme()`.
 */

import {
  WebMapTileServiceImageryProvider,
  GeographicTilingScheme,
  Credit,
  Rectangle,
  Math as CesiumMath,
} from "cesium";

export type MoonLayerCategory =
  | "basemap"
  | "elevation"
  | "composition"
  | "special"
  | "highres";

export interface MoonLayerDef {
  id: string;
  title: string;
  category: MoonLayerCategory;
  /** WMTS layer identifier as it appears in the Trek URL after `/EQ/`. */
  wmtsLayer: string;
  /** File extension of the tile — jpg or png. */
  ext: "jpg" | "png";
  maximumLevel: number;
  credit: string;
  description: string;
  /** Optional bounding rectangle in degrees [west, south, east, north]. */
  bbox?: [number, number, number, number];
  /** Default visible on first paint. */
  defaultVisible?: boolean;
  /** Default opacity 0..1. */
  defaultAlpha?: number;
}

/**
 * NASA Moon Trek base imagery + overlays.
 * Endpoint template:
 *   https://trek.nasa.gov/tiles/Moon/EQ/{layer}/1.0.0/default/default028mm/{z}/{y}/{x}.{ext}
 */
export const MOON_LAYERS: MoonLayerDef[] = [
  {
    id: "lro_wac_303ppd",
    title: "LRO WAC Global Mosaic (photo)",
    category: "basemap",
    wmtsLayer: "LRO_WAC_Mosaic_Global_303ppd_v02",
    ext: "jpg",
    maximumLevel: 7,
    credit: "NASA / GSFC / LROC / ASU · LRO WAC Global Mosaic",
    description:
      "Grayscale photographic mosaic of the entire Moon at 100 m/px, from the Lunar Reconnaissance Orbiter Camera Wide Angle Camera.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
  {
    id: "lro_wac_color_shade",
    title: "LRO WAC Color Shaded Relief",
    category: "basemap",
    wmtsLayer: "LRO_WAC_ClrShade_Global_128ppd_v04",
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / LOLA / LROC · Color shaded relief",
    description:
      "Colorized shaded relief blending LOLA elevation with LRO WAC imagery — the closest thing to a photographic Moon.",
    defaultAlpha: 1,
  },
  {
    id: "lola_color_hillshade",
    title: "LOLA Color Hillshade (elevation)",
    category: "elevation",
    wmtsLayer: "LRO_LOLA_ClrShade_Global_128ppd_v04",
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / GSFC / LOLA · Color hillshade",
    description:
      "LOLA-derived color-coded elevation from the Lunar Orbiter Laser Altimeter. Purple = low, red = high.",
    defaultAlpha: 1,
  },
  {
    id: "lola_gray_hillshade",
    title: "LOLA Grey Hillshade",
    category: "elevation",
    wmtsLayer: "LRO_LOLA_Shade_Global_128ppd_v04",
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / GSFC / LOLA",
    description: "Grey shaded relief from the LOLA global elevation model.",
    defaultAlpha: 1,
  },
  {
    id: "lola_slope",
    title: "LOLA Slope",
    category: "elevation",
    wmtsLayer: "LRO_LOLA_Slope_Global_128ppd_v04",
    ext: "jpg",
    maximumLevel: 5,
    credit: "NASA / GSFC / LOLA · Slope",
    description: "Local slope in degrees derived from LOLA topography.",
  },
  {
    id: "clementine_uvvis",
    title: "Clementine UVVIS Warped Color",
    category: "composition",
    wmtsLayer: "Clementine_UVVIS_WarpMosaic_ClrRatio_Global_32ppd",
    ext: "jpg",
    maximumLevel: 5,
    credit: "NRL / USGS · Clementine UVVIS color ratio",
    description:
      "False-color ratio composite from Clementine UVVIS highlighting mineral variations across the lunar surface.",
  },
  {
    id: "kaguya_tc_ortho",
    title: "Kaguya TC Ortho Mosaic",
    category: "basemap",
    wmtsLayer: "Kaguya_TC_Ortho_Global_4096ppd_v02",
    ext: "jpg",
    maximumLevel: 8,
    credit: "JAXA / SELENE (Kaguya) · Terrain Camera",
    description:
      "High-resolution monochrome ortho mosaic from JAXA's Kaguya Terrain Camera at ~10 m/px.",
  },
  {
    id: "diviner_rock_abundance",
    title: "Diviner Rock Abundance",
    category: "composition",
    wmtsLayer: "LRO_Diviner_RockAbundance_Global_128ppd",
    ext: "jpg",
    maximumLevel: 5,
    credit: "NASA / UCLA · Diviner rock abundance",
    description:
      "Fraction of the surface covered by exposed rocks larger than ~1 m, from the Diviner Lunar Radiometer.",
  },
  {
    id: "lola_gravity",
    title: "GRAIL Free-Air Gravity",
    category: "composition",
    wmtsLayer: "GRAIL_LGRS_FreeAirGravity_Global_16ppd",
    ext: "jpg",
    maximumLevel: 4,
    credit: "NASA / MIT · GRAIL free-air gravity",
    description:
      "Free-air gravity anomaly map derived by the GRAIL mission — reveals subsurface mass distribution.",
  },
  // Landing-site high-resolution NAC ROI mosaics
  {
    id: "nac_apollo11",
    title: "Apollo 11 LROC NAC (0.5 m)",
    category: "highres",
    wmtsLayer: "Apollo11_LROC_NAC_Mosaic_0.5m",
    ext: "png",
    maximumLevel: 12,
    credit: "NASA / LROC / ASU",
    description: "Ultra-high-resolution NAC mosaic of the Apollo 11 landing site.",
    bbox: [23.42, 0.6, 23.5, 0.72],
  },
  {
    id: "nac_apollo17",
    title: "Apollo 17 LROC NAC (0.5 m)",
    category: "highres",
    wmtsLayer: "Apollo17_LROC_NAC_Mosaic_0.5m",
    ext: "png",
    maximumLevel: 12,
    credit: "NASA / LROC / ASU",
    description: "Taurus–Littrow valley — Apollo 17 landing site NAC mosaic.",
    bbox: [30.7, 20.1, 30.85, 20.25],
  },
];

const TREK_BASE = "https://trek.nasa.gov/tiles/Moon/EQ";

export function createMoonImageryProvider(
  def: MoonLayerDef
): WebMapTileServiceImageryProvider {
  const url = `${TREK_BASE}/${def.wmtsLayer}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.${def.ext}`;
  const opts: any = {
    url,
    layer: def.wmtsLayer,
    style: "default",
    format: def.ext === "jpg" ? "image/jpeg" : "image/png",
    tileMatrixSetID: "default028mm",
    maximumLevel: def.maximumLevel,
    tilingScheme: new GeographicTilingScheme(),
    credit: new Credit(def.credit, true),
  };
  if (def.bbox) {
    opts.rectangle = Rectangle.fromDegrees(...def.bbox);
  }
  return new WebMapTileServiceImageryProvider(opts);
}

export function findMoonLayer(id: string): MoonLayerDef | undefined {
  return MOON_LAYERS.find((l) => l.id === id);
}

// Explicitly bounded to the entire Moon in radians — convenience for callers
// that need to clamp to the lunar extent.
export const MOON_FULL_RECTANGLE = Rectangle.fromDegrees(-180, -90, 180, 90);
// silence unused import warning for CesiumMath when tree-shaken tests strip
void CesiumMath;