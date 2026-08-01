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
  WebMapServiceImageryProvider,
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
  /**
   * Source protocol. `wmts` = NASA Trek tile pyramid (Moon / Mars / Mercury
   * only — NASA publishes no other bodies), `wms` = USGS Astrogeology
   * MapServer (Venus Magellan), `texture` = single global equirectangular
   * image draped over the whole ellipsoid.
   */
  kind?: "wmts" | "wms" | "texture";
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

/** USGS Astrogeology MapServer endpoint for a body's simple-cylindrical map. */
function usgsWmsUrl(body: string): string {
  return `https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/${body}/${body}_simp_cyl.map`;
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

// ─── Venus (NASA / USGS · Magellan C3-MDIR) ────────────────────
const VENUS_LAYERS: PlanetLayerDef[] = [
  {
    id: "magellan_c3_mdir",
    title: "Magellan C3-MDIR Global Mosaic (4641 m)",
    category: "basemap",
    wmtsLayer: "Venus_Magellan_C3-MDIR_Global_Mosaic_4641m",
    urlTemplate: trekUrl("Venus", "Venus_Magellan_C3-MDIR_Global_Mosaic_4641m", "jpg"),
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / JPL · Magellan C3-MDIR radar mosaic",
    description: "Global synthetic-aperture radar mosaic of Venus from the Magellan mission.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

// ─── Vesta (NASA / DLR · Dawn Framing Camera HAMO) ─────────────
const VESTA_LAYERS: PlanetLayerDef[] = [
  {
    id: "dawn_fc_hamo_vesta",
    title: "Dawn FC HAMO Color Shade (60 ppd)",
    category: "basemap",
    wmtsLayer: "Vesta_Dawn_HAMO_ClrShade_DLR_Global_74ppd_Oct2016",
    urlTemplate: trekUrl("Vesta", "Vesta_Dawn_HAMO_ClrShade_DLR_Global_74ppd_Oct2016", "jpg"),
    ext: "jpg",
    maximumLevel: 7,
    credit: "NASA / JPL / DLR · Dawn Framing Camera HAMO",
    description: "Color-shaded HAMO mosaic of the asteroid Vesta.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

// ─── Galilean moons (Voyager + Galileo SSI global mosaics) ─────
const IO_LAYERS: PlanetLayerDef[] = [
  {
    id: "io_voyager_galileo",
    title: "Voyager–Galileo SSI Mosaic (1 km)",
    category: "basemap",
    wmtsLayer: "Io_GalileoSSI-Voyager_Global_Mosaic_1km",
    urlTemplate: trekUrl("Io", "Io_GalileoSSI-Voyager_Global_Mosaic_1km", "jpg"),
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / JPL / USGS · Voyager + Galileo SSI",
    description: "Global color mosaic of Io from Voyager and Galileo imaging.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

const EUROPA_LAYERS: PlanetLayerDef[] = [
  {
    id: "europa_voyager_galileo",
    title: "Voyager–Galileo SSI Mosaic (500 m)",
    category: "basemap",
    wmtsLayer: "Europa_Voyager_GalileoSSI_global_mosaic_500m",
    urlTemplate: trekUrl("Europa", "Europa_Voyager_GalileoSSI_global_mosaic_500m", "jpg"),
    ext: "jpg",
    maximumLevel: 7,
    credit: "NASA / JPL / USGS · Voyager + Galileo SSI",
    description: "Global color mosaic of Europa's icy surface.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

const GANYMEDE_LAYERS: PlanetLayerDef[] = [
  {
    id: "ganymede_voyager_galileo",
    title: "Voyager–Galileo SSI Mosaic (1 km)",
    category: "basemap",
    wmtsLayer: "Ganymede_Voyager_GalileoSSI_global_mosaic_1km",
    urlTemplate: trekUrl("Ganymede", "Ganymede_Voyager_GalileoSSI_global_mosaic_1km", "jpg"),
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / JPL / USGS · Voyager + Galileo SSI",
    description: "Global mosaic of Ganymede, the solar system's largest moon.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

const CALLISTO_LAYERS: PlanetLayerDef[] = [
  {
    id: "callisto_voyager_galileo",
    title: "Voyager–Galileo SSI Mosaic (1 km)",
    category: "basemap",
    wmtsLayer: "Callisto_Voyager_GalileoSSI_global_mosaic_1km",
    urlTemplate: trekUrl("Callisto", "Callisto_Voyager_GalileoSSI_global_mosaic_1km", "jpg"),
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / JPL / USGS · Voyager + Galileo SSI",
    description: "Global mosaic of Callisto, the most heavily cratered body in the solar system.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

const TITAN_LAYERS: PlanetLayerDef[] = [
  {
    id: "titan_iss",
    title: "Cassini ISS Global Mosaic",
    category: "basemap",
    wmtsLayer: "Titan_ISS_Global_Mosaic_4ppd",
    urlTemplate: trekUrl("Titan", "Titan_ISS_Global_Mosaic_4ppd", "jpg"),
    ext: "jpg",
    maximumLevel: 5,
    credit: "NASA / JPL / SSI · Cassini ISS",
    description: "Cassini ISS infrared mosaic of Titan's surface through its haze.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

const ENCELADUS_LAYERS: PlanetLayerDef[] = [
  {
    id: "enceladus_cassini",
    title: "Cassini ISS Global Mosaic (100 m)",
    category: "basemap",
    wmtsLayer: "Enceladus_Cassini_ISS_Global_Mosaic_100m",
    urlTemplate: trekUrl("Enceladus", "Enceladus_Cassini_ISS_Global_Mosaic_100m", "jpg"),
    ext: "jpg",
    maximumLevel: 7,
    credit: "NASA / JPL / SSI · Cassini ISS",
    description: "High-resolution Cassini ISS mosaic of Enceladus.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
];

const PHOBOS_LAYERS: PlanetLayerDef[] = [
  {
    id: "phobos_viking",
    title: "Viking Mosaic (40 m)",
    category: "basemap",
    wmtsLayer: "Phobos_Viking_Mosaic_40mp_Global",
    urlTemplate: trekUrl("Phobos", "Phobos_Viking_Mosaic_40mp_Global", "jpg"),
    ext: "jpg",
    maximumLevel: 6,
    credit: "NASA / JPL / USGS · Viking Orbiter",
    description: "Global Viking mosaic of Mars' inner moon Phobos.",
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
  venus: VENUS_LAYERS,
  vesta: VESTA_LAYERS,
  io: IO_LAYERS,
  europa: EUROPA_LAYERS,
  ganymede: GANYMEDE_LAYERS,
  callisto: CALLISTO_LAYERS,
  titan: TITAN_LAYERS,
  enceladus: ENCELADUS_LAYERS,
  phobos: PHOBOS_LAYERS,
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