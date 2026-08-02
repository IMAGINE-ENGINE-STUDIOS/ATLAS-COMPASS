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
  Ellipsoid,
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
  /**
   * Colour overrides applied when the layer is mounted. Used for seam-fill
   * base layers that must blend with the greyscale radar mosaic on top of
   * them rather than show their own colour ramp.
   */
  tone?: { brightness?: number; contrast?: number; gamma?: number; saturation?: number };
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

// ─── Venus (USGS Astrogeology · Magellan) ──────────────────────
// NASA Solar System Treks publishes tile pyramids for the Moon, Mars and
// Mercury ONLY — every `trek.nasa.gov/tiles/Venus/...` path 404s. The USGS
// Astrogeology MapServer serves the same Magellan products over WMS with
// `Access-Control-Allow-Origin: *`, so we render Venus from there.
const VENUS_WMS = usgsWmsUrl("venus");
const VENUS_LAYERS: PlanetLayerDef[] = [
  {
    // Bottom of the Venus stack: the altimetry product is the only Magellan
    // raster with true pole-to-pole coverage, so it fills the SAR mosaic's
    // orbit seams and polar cut-off with real mission data instead of an
    // artist texture (which was what produced the coloured streaks).
    id: "magellan_topography_base",
    title: "Magellan Altimetry (seam base)",
    category: "elevation",
    kind: "wms",
    wmtsLayer: "MAGELLAN_topography",
    urlTemplate: VENUS_WMS,
    ext: "png",
    maximumLevel: 7,
    credit: "NASA / JPL / USGS Astrogeology · Magellan altimetry",
    description:
      "Global Magellan radar-altimeter topography, used as the base fill under the SAR mosaics.",
    defaultVisible: true,
    defaultAlpha: 1,
    // Strip the altimetry colour ramp so the fill reads as grey radar-like
    // terrain instead of rainbow streaks inside the SAR seams.
    tone: { saturation: 0.05, brightness: 0.95, contrast: 1.0, gamma: 1 },
  },
  {
    // Mounted first (underneath the left-look mosaic) purely as gap fill:
    // Magellan's left-look and right-look passes have complementary coverage,
    // so most of the black orbit-seam streaks in the left-look mosaic are
    // real surface data in the right-look one.
    id: "magellan_sar_right",
    title: "Magellan Right-Look SAR (seam fill)",
    category: "basemap",
    kind: "wms",
    wmtsLayer: "MAGELLAN_RightLook",
    urlTemplate: VENUS_WMS,
    ext: "png",
    maximumLevel: 9,
    bbox: [-180, -80.01, 180, 84],
    credit: "NASA / JPL / USGS Astrogeology · Magellan right-look SAR mosaic",
    description:
      "Right-look Magellan radar mosaic, used to fill the data gaps in the left-look global mosaic.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
  {
    id: "magellan_sar",
    title: "Magellan Left-Look SAR Mosaic (75 m)",
    category: "basemap",
    kind: "wms",
    wmtsLayer: "MAGELLAN",
    urlTemplate: VENUS_WMS,
    // PNG + transparency: the MapServer mosaic has real Magellan data gaps
    // (orbit seams, polar cut-off at -80.01°/+84°). As JPEG those gaps come
    // back as hard black/white bands; as transparent PNG they drop out and
    // the global Venus skin underneath shows through instead.
    ext: "png",
    // Source is 75 m/px ≈ 7.1e-4°/px on Venus, which is geographic level 9.
    // Requesting past that only makes MapServer upsample (blurry tiles and
    // visible resampling seams), so cap it and let Cesium magnify.
    maximumLevel: 9,
    bbox: [-180, -80.01, 180, 84],
    credit: "NASA / JPL / USGS Astrogeology · Magellan SAR mosaic",
    description:
      "Global synthetic-aperture radar mosaic of the Venusian surface from the Magellan mission.",
    defaultVisible: true,
    defaultAlpha: 1,
  },
  {
    id: "magellan_color",
    title: "Magellan Colour Topography",
    category: "elevation",
    kind: "wms",
    wmtsLayer: "MAGELLAN_color",
    urlTemplate: VENUS_WMS,
    ext: "png",
    maximumLevel: 7,
    credit: "NASA / JPL / USGS Astrogeology · Magellan colourised relief",
    description:
      "Colourised Magellan radar relief — highlands in warm tones, lowland plains in cool tones.",
  },
  {
    id: "magellan_topography",
    title: "Magellan Topography (altimetry)",
    category: "elevation",
    kind: "wms",
    wmtsLayer: "MAGELLAN_topography",
    urlTemplate: VENUS_WMS,
    ext: "png",
    maximumLevel: 7,
    credit: "NASA / JPL / USGS Astrogeology · Magellan altimetry",
    description:
      "Magellan radar-altimeter topography of Venus, greyscale elevation across the whole globe.",
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
};

export function getPlanetLayerCatalog(worldId: string): PlanetLayerDef[] | null {
  return CATALOGS[worldId] ?? null;
}

export function hasPlanetLayerCatalog(worldId: string): boolean {
  return worldId in CATALOGS;
}

export function createPlanetImageryProvider(
  def: PlanetLayerDef,
  ellipsoid: Ellipsoid,
): WebMapTileServiceImageryProvider | WebMapServiceImageryProvider {
  if (def.kind === "wms") {
    const wmsOpts: any = {
      url: def.urlTemplate,
      layers: def.wmtsLayer,
      parameters: {
        format: def.ext === "jpg" ? "image/jpeg" : "image/png",
        transparent: def.ext === "png",
        styles: "",
      },
      tilingScheme: new GeographicTilingScheme({ ellipsoid }),
      maximumLevel: def.maximumLevel,
      tileWidth: 512,
      tileHeight: 512,
      // No GetFeatureInfo round-trips on hover — MapServer answers those with
      // an error page for these raster layers.
      enablePickFeatures: false,
      credit: new Credit(def.credit, true),
    };
    if (def.bbox) wmsOpts.rectangle = Rectangle.fromDegrees(...def.bbox);
    return new WebMapServiceImageryProvider(wmsOpts);
  }
  const opts: any = {
    url: def.urlTemplate,
    layer: def.wmtsLayer,
    style: "default",
    format: def.ext === "jpg" ? "image/jpeg" : "image/png",
    tileMatrixSetID: "default028mm",
    maximumLevel: def.maximumLevel,
    tilingScheme: new GeographicTilingScheme({ ellipsoid }),
    credit: new Credit(def.credit, true),
  };
  if (def.bbox) opts.rectangle = Rectangle.fromDegrees(...def.bbox);
  return new WebMapTileServiceImageryProvider(opts);
}

/**
 * Self-healing guard: if an upstream tile service starts failing (404 / 5xx)
 * we don't want the body to render as a flat coloured ball. After a few
 * consecutive tile errors we drop the layer and hand control back to the
 * caller, which re-mounts the body's single global texture skin.
 */
export function guardPlanetImageryLayer(
  provider: any,
  onDead: () => void,
  threshold = 3,
) {
  let failures = 0;
  let fired = false;
  try {
    provider.errorEvent?.addEventListener?.((err: any) => {
      failures += 1;
      if (failures < threshold || fired) return;
      fired = true;
      console.warn(
        "[Atlas planet] imagery source unavailable — falling back to global texture",
        err?.error ?? err,
      );
      try {
        onDead();
      } catch {}
    });
  } catch {}
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
  if (def.tone) {
    if (def.tone.brightness !== undefined) layer.brightness = def.tone.brightness;
    if (def.tone.contrast !== undefined) layer.contrast = def.tone.contrast;
    if (def.tone.gamma !== undefined) layer.gamma = def.tone.gamma;
    if (def.tone.saturation !== undefined) layer.saturation = def.tone.saturation;
  }
}