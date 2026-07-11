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
  {
    id: "messenger_mla_topo",
    title: "MLA Topography",
    category: "elevation",
    wmtsLayer: "Mercury_Messenger_USGS_DEM_Global_665m_v2",
    urlTemplate: trekUrl(
      "Mercury",
      "Mercury_Messenger_USGS_DEM_Global_665m_v2",
      "jpg",
    ),
    ext: "jpg",
    maximumLevel: 5,
    credit: "NASA / JHUAPL · MLA global DEM",
    description:
      "Color-shaded elevation from the Mercury Laser Altimeter (MLA) global DEM.",
  },
];

// ─── Venus (NASA / USGS · Magellan radar) ──────────────────────
const VENUS_LAYERS: PlanetLayerDef[] = [
  {
    id: "magellan_c3_mdir",
    title: "Magellan C3-MDIR Radar Mosaic (75 m)",
    category: "basemap",
    wmtsLayer: "Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m",
    urlTemplate: trekUrl(
      "Venus",
      "Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m",
      "jpg",
    ),
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / JPL · Magellan C3-MDIR colorized radar mosaic",
    description:
      "Global colorized SAR radar mosaic from the Magellan mission — the only high-resolution view of the Venusian surface, hidden beneath permanent clouds.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
  {
    id: "magellan_topography",
    title: "Magellan Topography",
    category: "elevation",
    wmtsLayer: "Venus_Magellan_Topography_Global_4641m",
    urlTemplate: trekUrl(
      "Venus",
      "Venus_Magellan_Topography_Global_4641m",
      "jpg",
    ),
    ext: "jpg",
    maximumLevel: 5,
    credit: "NASA / JPL · Magellan global topography",
    description:
      "Color-coded elevation derived from Magellan altimetry, revealing tesserae, coronae, and volcanic plains.",
  },
];

// ─── Vesta (NASA / USGS · Dawn Framing Camera HAMO) ────────────
const VESTA_LAYERS: PlanetLayerDef[] = [
  {
    id: "dawn_fc_hamo",
    title: "Dawn FC HAMO Mosaic",
    category: "basemap",
    wmtsLayer: "Vesta_Dawn_FC_HAMO_Mosaic_Global_74m",
    urlTemplate: trekUrl(
      "Vesta",
      "Vesta_Dawn_FC_HAMO_Mosaic_Global_74m",
      "jpg",
    ),
    ext: "jpg",
    maximumLevel: 7,
    credit: "NASA / JPL / DLR · Dawn Framing Camera HAMO",
    description:
      "Global clear-filter mosaic of the asteroid 4 Vesta from Dawn's HAMO orbit (~74 m/px).",
    defaultVisible: true,
    defaultAlpha: 1,
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
  venus: VENUS_LAYERS,
  vesta: VESTA_LAYERS,
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