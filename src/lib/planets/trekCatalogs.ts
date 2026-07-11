/**
 * Public NASA / USGS Astrogeology WMTS layer catalogs for rocky bodies
 * beyond Earth and the Moon. All endpoints are keyless, CORS-enabled,
 * and served by NASA's Solar System Treks project.
 *
 * Each entry follows the same shape as `MoonLayerDef` / `MarsLayerDef`
 * so `SpaceshipPage` and the layer picker can treat every world the
 * same way.
 */
import {
  WebMapTileServiceImageryProvider,
  GeographicTilingScheme,
  Credit,
  ImageryLayer,
  Rectangle,
} from "cesium";

export type PlanetLayerCategory =
  | "basemap"
  | "elevation"
  | "composition"
  | "highres"
  | "special";

export interface PlanetLayerDef {
  id: string;
  title: string;
  category: PlanetLayerCategory;
  /** Full URL template with `{TileMatrix}/{TileRow}/{TileCol}` placeholders. */
  urlTemplate: string;
  /** WMTS layer identifier (used as `layer` param). */
  wmtsLayer: string;
  ext: "jpg" | "png";
  maximumLevel: number;
  credit: string;
  description: string;
  bbox?: [number, number, number, number];
  defaultVisible?: boolean;
  defaultAlpha?: number;
}

function trekUrl(body: string, layer: string, ext: string): string {
  return `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.${ext}`;
}

// ─── Mercury (NASA / USGS · MESSENGER MDIS) ────────────────────
const MERCURY_LAYERS: PlanetLayerDef[] = [
  {
    id: "messenger_mdis_basemap",
    title: "MESSENGER MDIS Basemap (166 m)",
    category: "basemap",
    wmtsLayer: "Mercury_MESSENGER_MDIS_Basemap_LOI_Mosaic_Global_166m",
    urlTemplate: trekUrl(
      "Mercury",
      "Mercury_MESSENGER_MDIS_Basemap_LOI_Mosaic_Global_166m",
      "jpg",
    ),
    ext: "jpg",
    maximumLevel: 7,
    credit: "NASA / JHUAPL / CIW · MESSENGER MDIS 166 m/px mosaic",
    description:
      "Global monochrome mosaic of Mercury from the MESSENGER Mercury Dual Imaging System.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
  {
    id: "messenger_mdis_color",
    title: "MESSENGER MDIS Color (665 m)",
    category: "composition",
    wmtsLayer: "Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m",
    urlTemplate: trekUrl(
      "Mercury",
      "Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m",
      "jpg",
    ),
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / JHUAPL · MESSENGER MDIS enhanced color",
    description:
      "Enhanced-color composite from MDIS revealing compositional variations across Mercury.",
  },
];

// ─── Ceres (NASA / USGS · Dawn Framing Camera HAMO) ────────────
const CERES_LAYERS: PlanetLayerDef[] = [
  {
    id: "dawn_fc_hamo_ceres",
    title: "Dawn FC HAMO Mosaic",
    category: "basemap",
    wmtsLayer: "Ceres_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016",
    urlTemplate: trekUrl(
      "Ceres",
      "Ceres_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016",
      "jpg",
    ),
    ext: "jpg",
    maximumLevel: 7,
    credit: "NASA / JPL / DLR · Dawn Framing Camera HAMO",
    description:
      "Global color-shaded HAMO mosaic of the dwarf planet Ceres.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

/**
 * Which planet IDs have a real WMTS tile catalog we can drape on the
 * ellipsoid. Anything not listed here has no public surface pyramid
 * (gas giants, Sun) and falls back to a single-tile reference skin.
 */
const CATALOGS: Record<string, PlanetLayerDef[]> = {
  mercury: MERCURY_LAYERS,
  ceres: CERES_LAYERS,
};

export function getPlanetLayerCatalog(worldId: string): PlanetLayerDef[] | null {
  return CATALOGS[worldId] ?? null;
}

export function hasPlanetLayerCatalog(worldId: string): boolean {
  return worldId in CATALOGS;
}

export function createPlanetImageryProvider(
  def: PlanetLayerDef,
): WebMapTileServiceImageryProvider {
  const opts: any = {
    url: def.urlTemplate,
    layer: def.wmtsLayer,
    style: "default",
    format: def.ext === "jpg" ? "image/jpeg" : "image/png",
    tileMatrixSetID: "default028mm",
    maximumLevel: def.maximumLevel,
    tilingScheme: new GeographicTilingScheme(),
    credit: new Credit(def.credit, true),
  };
  if (def.bbox) opts.rectangle = Rectangle.fromDegrees(...def.bbox);
  return new WebMapTileServiceImageryProvider(opts);
}

/** Cinematic tuning so raw NASA tiles pop in a dark Atlas UI. */
export function tunePlanetImageryLayer(
  layer: ImageryLayer,
  def: PlanetLayerDef,
) {
  const isElev = def.category === "elevation";
  layer.brightness = isElev ? 1.15 : 1.1;
  layer.contrast = 1.06;
  layer.gamma = 0.88;
  layer.saturation = def.category === "composition" ? 1.2 : 1.05;
}