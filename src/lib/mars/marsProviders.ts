/**
 * NASA Mars Trek WMTS imagery providers.
 *
 * All endpoints are keyless, public NASA data served by the Solar System
 * Treks project (https://trek.nasa.gov). Uses a Geographic (equirectangular)
 * tiling scheme with 2×1 root tiles.
 */
import {
  WebMapTileServiceImageryProvider,
  GeographicTilingScheme,
  Credit,
  ImageryLayer,
  Rectangle,
} from "cesium";

export type MarsLayerCategory = "basemap" | "elevation" | "composition";

export interface MarsLayerDef {
  id: string;
  title: string;
  category: MarsLayerCategory;
  wmtsLayer: string;
  ext: "jpg" | "png";
  maximumLevel: number;
  credit: string;
  description: string;
  defaultVisible?: boolean;
  defaultAlpha?: number;
}

/** NASA Mars Trek base imagery + overlays. */
export const MARS_LAYERS: MarsLayerDef[] = [
  {
    id: "viking_mdim21_color",
    title: "Viking MDIM 2.1 Color Mosaic",
    category: "basemap",
    wmtsLayer: "Mars_Viking_MDIM21_ClrMosaic_global_232m",
    ext: "jpg",
    maximumLevel: 8,
    credit: "NASA / USGS · Viking MDIM 2.1 color mosaic (232 m/px)",
    description:
      "Global color mosaic of Mars from the Viking Orbiter, corrected and mosaicked by USGS.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
  {
    id: "mola_color_shade",
    title: "MOLA Color Shaded Relief",
    category: "elevation",
    wmtsLayer: "Mars_MGS_MOLA_ClrShade_merge_global_463m",
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / MGS / MOLA · Color shaded relief",
    description:
      "Color-coded elevation shaded relief from Mars Global Surveyor's laser altimeter.",
  },
  {
    id: "mola_gray_shade",
    title: "MOLA Grey Shaded Relief",
    category: "elevation",
    wmtsLayer: "Mars_MGS_MOLA_Shade_global_463m",
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / MGS / MOLA · Grey shaded relief",
    description: "Grey shaded relief from MOLA global topography.",
  },
  {
    id: "themis_day_ir",
    title: "THEMIS Day IR Global",
    category: "basemap",
    wmtsLayer: "Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12",
    ext: "jpg",
    maximumLevel: 9,
    credit: "NASA / ASU · THEMIS Day IR global mosaic (100 m/px)",
    description:
      "Daytime thermal infrared global mosaic from Mars Odyssey's THEMIS instrument.",
  },
  {
    id: "ctx_mosaic",
    title: "CTX Global Mosaic (5 m)",
    category: "basemap",
    wmtsLayer: "Mars_MRO_CTX_mosaic_beta01",
    ext: "jpg",
    maximumLevel: 10,
    credit: "Caltech / MSSS · MRO CTX beta mosaic",
    description:
      "High-resolution grayscale mosaic from MRO's Context Camera (~5 m/px).",
  },
];

const TREK_BASE = "https://trek.nasa.gov/tiles/Mars/EQ";

export function createMarsImageryProvider(
  def: MarsLayerDef,
): WebMapTileServiceImageryProvider {
  const url = `${TREK_BASE}/${def.wmtsLayer}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.${def.ext}`;
  return new WebMapTileServiceImageryProvider({
    url,
    layer: def.wmtsLayer,
    style: "default",
    format: def.ext === "jpg" ? "image/jpeg" : "image/png",
    tileMatrixSetID: "default028mm",
    maximumLevel: def.maximumLevel,
    tilingScheme: new GeographicTilingScheme(),
    credit: new Credit(def.credit, true),
  } as any);
}

/** Punch up NASA raw imagery for a cinematic Atlas readout. */
export function tuneMarsImageryLayer(layer: ImageryLayer, def: MarsLayerDef) {
  layer.brightness = def.category === "elevation" ? 1.15 : 1.05;
  layer.contrast = 1.06;
  layer.gamma = 0.9;
  layer.saturation = def.category === "basemap" ? 1.2 : 1.0;
}

export const MARS_FULL_RECTANGLE = Rectangle.fromDegrees(-180, -90, 180, 90);