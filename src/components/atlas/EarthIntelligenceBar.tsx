/**
 * EarthIntelligenceBar
 * --------------------
 * Secondary toolbar activated by the Brain button in the Atlas top bar.
 * Lists every dataset from `EARTH_LAYERS` (NASA GIBS, NOAA GOES,
 * Himawari-9, EOX, Mapzen, OSM US) grouped by category and lets the user
 * toggle each as a Cesium `ImageryLayer` overlay on the active viewer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import type { Viewer } from "cesium";
import {
  UrlTemplateImageryProvider,
  SingleTileImageryProvider,
  GeographicTilingScheme,
  ImageryLayer,
  ImageryLayerCollection,
  Cartographic,
  Rectangle,
  type ImageryProvider,
} from "cesium";
import {
  EARTH_LAYERS,
  buildEarthLayerUrl,
  type EarthLayerCategory,
  type EarthLayerDef,
} from "@/hooks/useEarthIntelligence";

/**
 * Return the ImageryLayerCollection the overlay should be added to.
 * When a photoreal 3D Tileset is active (Google 3D / Realistic / OSM
 * Buildings) we drape imagery directly on that tileset instead of the
 * globe — avoids the "two earths stacked" look the user reported.
 * Falls back to the globe's imagery layers otherwise.
 */
function targetLayers(viewer: any): { collection: ImageryLayerCollection; onTileset: boolean } {
  const v = viewer as any;
  // Photoreal modes hide the Cesium globe, so imagery must be draped on the
  // photoreal tileset. OSM mode keeps the globe visible under OSM buildings,
  // so use the normal scene imagery collection there.
  const tileset = [v._googleDirectTileset, v._realisticTileset]
    .find((ts) => ts?.imageryLayers && ts.show !== false);
  if (tileset && tileset.imageryLayers) {
    return { collection: tileset.imageryLayers as ImageryLayerCollection, onTileset: true };
  }
  return { collection: viewer.scene.imageryLayers as ImageryLayerCollection, onTileset: false };
}

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<EarthLayerCategory, string> = {
  imagery: "Imagery",
  weather: "Weather",
  temperature: "Temperature",
  vegetation: "Vegetation",
  atmosphere: "Atmosphere",
  hazards: "Hazards",
  cryosphere: "Cryosphere",
  nightlights: "Night lights",
  elevation: "Elevation",
};

const CATEGORY_COLOR: Record<EarthLayerCategory, string> = {
  imagery: "#38bdf8",
  weather: "#60a5fa",
  temperature: "#f97316",
  vegetation: "#22c55e",
  atmosphere: "#a78bfa",
  hazards: "#ef4444",
  cryosphere: "#e0f2fe",
  nightlights: "#fbbf24",
  elevation: "#94a3b8",
};

/**
 * Build a "global view" thumbnail URL for a layer.
 *
 * For GIBS layers we bypass the WMTS z=0 256x256 tile (which is what made
 * thumbnails look pixelated) and hit the GIBS WMS endpoint at 512x256, which
 * returns a full-earth image at ~2x the effective resolution. Other providers
 * fall back to substituting z/x/y = 0 in their tile template.
 */
function thumbUrl(def: EarthLayerDef): string {
  const raw = buildEarthLayerUrl(def);
  const wms = gibsWmsUrl(def, 1024, 512);
  if (wms) return wms;
  if (def.id === "hillshade") {
    // OSM US hillshade starts at z=1; z=0 returns 404.
    return raw.replace("{z}", "1").replace("{y}", "0").replace("{x}", "0");
  }
  return raw.replace("{z}", "0").replace("{y}", "0").replace("{x}", "0");
}

function parseGibsLayer(def: EarthLayerDef): { layerId: string; time: string; format: string } | null {
  const raw = buildEarthLayerUrl(def);
  const marker = "/wmts/epsg3857/best/";
  const markerIndex = raw.indexOf(marker);
  if (markerIndex < 0) return null;

  const parts = raw.slice(markerIndex + marker.length).split("/");
  const layerId = parts[0];
  if (!layerId || parts[1] !== "default") return null;

  // GIBS WMTS paths are either:
  //   layer/default/{date-or-default}/GoogleMapsCompatible.../{z}/{y}/{x}.png
  // or for non-temporal layers:
  //   layer/default/GoogleMapsCompatible.../{z}/{y}/{x}.png
  // The previous regex treated the tile matrix set as TIME for non-temporal
  // layers (e.g. Black Marble), causing WMS failures. Detect it explicitly.
  const maybeTime = parts[2];
  const time = maybeTime && !maybeTime.startsWith("GoogleMapsCompatible") ? maybeTime : "default";
  const format = def.format === "jpg" || def.format === "jpeg" ? "image/jpeg" : "image/png";
  return { layerId, time, format };
}

/**
 * Build a GIBS WMS GetMap URL that returns a single equirectangular image
 * covering the *entire* globe (-90..90 lat, -180..180 lon). Returns null
 * for non-GIBS layers.
 *
 * We use this both for card thumbnails AND for the actual Cesium overlay,
 * because the WMTS tile pyramid (EPSG:3857 GoogleMapsCompatible) only covers
 * ±85° — anything applied through it leaves an empty polar cap and, for
 * partial-hemisphere sources like GOES/Himawari, misaligns with the sphere
 * so the user sees "circumference mismatch" gaps.
 */
function gibsWmsUrl(def: EarthLayerDef, width: number, height: number): string | null {
  const gibs = parseGibsLayer(def);
  if (!gibs) return null;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: gibs.layerId,
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: gibs.format,
    TRANSPARENT: gibs.format === "image/png" ? "true" : "false",
    TIME: gibs.time,
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
}

function gibsWmsTileTemplate(def: EarthLayerDef): string | null {
  const gibs = parseGibsLayer(def);
  if (!gibs) return null;
  // Use an explicit tiled WMS template instead of one huge SingleTile image.
  // The single-image path was wrapping over the 180° meridian on photoreal
  // tilesets, producing the jagged Pacific seam seen in the screenshot. These
  // geographic tiles never cross the dateline and Cesium can load the visible
  // viewport tiles immediately while the selected Atlas map remains visible.
  const qs = [
    "SERVICE=WMS",
    "REQUEST=GetMap",
    "VERSION=1.3.0",
    `LAYERS=${encodeURIComponent(gibs.layerId)}`,
    "CRS=EPSG%3A4326",
    // WMS 1.3.0 + EPSG:4326 uses latitude,longitude axis order.
    "BBOX={southDegrees},{westDegrees},{northDegrees},{eastDegrees}",
    "WIDTH=512",
    "HEIGHT=512",
    `FORMAT=${encodeURIComponent(gibs.format)}`,
    `TRANSPARENT=${gibs.format === "image/png" ? "true" : "false"}`,
    `TIME=${encodeURIComponent(gibs.time)}`,
  ];
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${qs.join("&")}`;
}

/**
 * Preload an image URL through the browser cache so Cesium paints it the very
 * first frame it renders. Resolves on load, rejects on error / timeout.
 */
function preloadImage(url: string, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    let done = false;
    const finish = (ok: boolean, err?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ok ? resolve() : reject(err ?? new Error("image load failed"));
    };
    const timer = window.setTimeout(() => finish(false, new Error("timeout")), timeoutMs);
    img.onload = () => finish(true);
    img.onerror = (e) => finish(false, e);
    img.src = url;
  });
}

/**
 * For tiled providers, prefetch every tile that intersects the current
 * viewport at an appropriate zoom level. Populates Cesium's internal loader
 * cache so the layer paints without a flicker once revealed.
 */
async function preloadViewportTiles(
  provider: ImageryProvider,
  viewer: Viewer,
  def: EarthLayerDef,
): Promise<void> {
  const tilingScheme: any = (provider as any).tilingScheme;
  const requestImage: any = (provider as any).requestImage;
  if (!tilingScheme?.positionToTileXY || typeof requestImage !== "function") return;
  const cam = Cartographic.fromCartesian(viewer.camera.positionWC);
  if (!cam) return;
  const height = Math.max(0, cam.height || 0);
  const maxLevel = def.maxZoom ?? 9;
  const minLevel = def.id === "hillshade" ? 1 : 0;
  const level = Math.max(minLevel, Math.min(maxLevel,
    height > 18_000_000 ? 2 : height > 7_000_000 ? 3 : height > 2_000_000 ? 4 : height > 600_000 ? 5 : 6,
  ));
  const center = tilingScheme.positionToTileXY(cam, level);
  if (!center) return;
  const xCount = tilingScheme.getNumberOfXTilesAtLevel(level);
  const yCount = tilingScheme.getNumberOfYTilesAtLevel(level);
  const radius = 2;
  const promises: Promise<unknown>[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = ((center.x + dx) % xCount + xCount) % xCount;
      const y = center.y + dy;
      if (y < 0 || y >= yCount) continue;
      try {
        const p = requestImage.call(provider, x, y, level);
        if (p?.then) promises.push(p.catch(() => null));
      } catch { /* noop */ }
    }
  }
  await Promise.all(promises);
}

async function createEarthImageryProvider(def: EarthLayerDef): Promise<ImageryProvider> {
  const gibs = parseGibsLayer(def);
  if (gibs) {
    // Use ONE full-world equirectangular image instead of a tile pyramid.
    // Prevents the Pacific/dateline seam that shows with WMTS or WMS-tiled
    // rendering, and lets us preload a single URL before attaching the layer
    // — so the overlay appears instantly when it's ready.
    const url = gibsWmsUrl(def, 4096, 2048);
    if (!url) throw new Error(`No GIBS WMS URL for ${def.label}`);
    await preloadImage(url);
    return await (SingleTileImageryProvider as any).fromUrl(url, {
      rectangle: Rectangle.fromDegrees(-180, -90, 180, 90),
      credit: def.attribution,
    });
  }

  return new UrlTemplateImageryProvider({
    url: buildEarthLayerUrl(def),
    maximumLevel: def.maxZoom ?? 9,
    minimumLevel: def.id === "hillshade" ? 1 : 0,
    credit: def.attribution,
  });
}

export default function EarthIntelligenceBar({ viewerRef, onClose }: Props) {
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const layerRefs = useRef<Record<string, ImageryLayer>>({});
  const activeDefs = useRef<Record<string, EarthLayerDef>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);
  const opSerial = useRef(0);
  const layerTokens = useRef<Record<string, number>>({});

  const syncOverlayFlag = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const anyActive = Object.keys(activeDefs.current).length > 0;
    (viewer as any)._earthIntelActive = anyActive;
    window.dispatchEvent(new CustomEvent("atlas:earth-intel-changed", { detail: { active: anyActive } }));
  }, [viewerRef]);

  const removeLayer = useCallback((id: string, forget = true) => {
    const viewer = viewerRef.current;
    const layer = layerRefs.current[id];
    if (viewer && layer && !viewer.isDestroyed()) {
      // Try both collections since the tileset may have been destroyed / swapped.
      try { viewer.scene.imageryLayers.remove(layer, true); } catch { /* noop */ }
      const v = viewer as any;
      [v._googleDirectTileset, v._realisticTileset, v._osmTileset].forEach((ts) => {
        try { ts?.imageryLayers?.remove(layer, true); } catch { /* noop */ }
      });
    }
    delete layerRefs.current[id];
    if (forget) {
      delete activeDefs.current[id];
      delete layerTokens.current[id];
      setLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setFailed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    syncOverlayFlag();
  }, [viewerRef, syncOverlayFlag]);

  const addLayer = useCallback(async (def: EarthLayerDef, replaceOthers = false) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const serial = ++opSerial.current;
    layerTokens.current[def.id] = serial;
    setLoading((prev) => ({ ...prev, [def.id]: true }));
    setFailed((prev) => ({ ...prev, [def.id]: false }));

    // If we are re-targeting after a map-mode change, remove the old layer
    // first but keep the dataset marked active.
    if (layerRefs.current[def.id]) removeLayer(def.id, false);

    try {
      const provider = await createEarthImageryProvider(def);
      if (layerTokens.current[def.id] !== serial) return;
      const latestViewer = viewerRef.current;
      if (!latestViewer || latestViewer.isDestroyed()) return;
      const latestTarget = targetLayers(latestViewer);
      const layer = latestTarget.collection.addImageryProvider(provider);
      // Start hidden. We reveal the new overlay only once its tiles have
      // finished loading in the current viewport — so the user sees the
      // previous view "frozen" and the new dataset appears at once instead
      // of streaming in tile by tile.
      layer.alpha = 0;
      layer.show = false;
      layerRefs.current[def.id] = layer;
      activeDefs.current[def.id] = def;
      if (parseGibsLayer(def)) {
        warmViewportCenter(provider, latestViewer, Math.min(Math.max(def.maxZoom ?? 7, 4), 8));
      }

      // Wait until Cesium reports all tiles loaded (or timeout) before
      // swapping the layer in. Requires two consecutive "loaded" frames to
      // avoid a false-positive during the initial request burst.
      await waitForTilesLoaded(latestViewer, 8000);
      if (layerTokens.current[def.id] !== serial) return;

      layer.show = true;
      layer.alpha = 0.92;
      if (replaceOthers) {
        Object.keys(activeDefs.current)
          .filter((id) => id !== def.id)
          .forEach((id) => removeLayer(id));
        setActive({ [def.id]: true });
      }
      latestViewer.scene.requestRender?.();
      syncOverlayFlag();
    } catch (err) {
      console.warn(`[Earth Intelligence] failed to load ${def.id}`, err);
      setActive((prev) => {
        const next = Object.fromEntries(Object.keys(activeDefs.current).map((id) => [id, true]));
        return next;
      });
      setFailed((prev) => ({ ...prev, [def.id]: true }));
      syncOverlayFlag();
    } finally {
      if (layerTokens.current[def.id] === serial) {
        setLoading((prev) => {
          const next = { ...prev };
          delete next[def.id];
          return next;
        });
      }
    }
  }, [viewerRef, removeLayer, syncOverlayFlag]);

  const toggle = useCallback((def: EarthLayerDef) => {
    if (active[def.id]) {
      removeLayer(def.id);
      setActive((prev) => {
        const next = { ...prev };
        delete next[def.id];
        return next;
      });
      return;
    }

    // Keep GPU/network pressure predictable: one raster dataset at a time,
    // but keep the previous overlay visible until the new one is ready.
    setActive((prev) => ({ ...prev, [def.id]: true }));
    void addLayer(def, true);
  }, [active, addLayer, removeLayer]);

  // Clear all on unmount
  useEffect(() => {
    return () => {
      Object.keys(layerRefs.current).forEach((id) => removeLayer(id));
    };
  }, [removeLayer]);

  // If Google/realistic/OSM finishes loading after the user toggled a dataset,
  // or the user switches map modes, re-add active overlays to the current
  // target collection. Otherwise they can remain attached to the hidden globe
  // and appear to be "not loading" in photoreal modes.
  useEffect(() => {
    const retarget = () => {
      const defs = Object.values(activeDefs.current);
      if (!defs.length) return;
      defs.forEach((def) => void addLayer(def));
    };
    window.addEventListener("cesium-tileset-ready", retarget);
    window.addEventListener("atlas:earth-intel-retarget", retarget);
    return () => {
      window.removeEventListener("cesium-tileset-ready", retarget);
      window.removeEventListener("atlas:earth-intel-retarget", retarget);
    };
  }, [addLayer]);

  const items = useMemo(() => EARTH_LAYERS.slice(), []);

  const scrollBy = (dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  };

  return (
    <div className="absolute top-[62px] left-1/2 -translate-x-1/2 z-20 w-[min(96vw,1180px)] pointer-events-auto">
      <div className="rounded-2xl border border-white/15 bg-black/70 backdrop-blur-xl shadow-2xl text-white overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-widest uppercase text-cyan-200">Earth Intelligence</span>
            <span className="text-[10px] text-white/50">{items.length} datasets · click a card to toggle overlay</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-white/60">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="relative">
          <button
            onClick={() => scrollBy(-480)}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/15 flex items-center justify-center"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollBy(480)}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/15 flex items-center justify-center"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div
            ref={scrollerRef}
            className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-10 py-3"
            style={{ scrollbarWidth: "none" }}
          >
            {items.map((def) => {
              const isOn = !!active[def.id];
              const isLoading = !!loading[def.id];
              const didFail = !!failed[def.id];
              const color = CATEGORY_COLOR[def.category];
              return (
                <button
                  key={def.id}
                  onClick={() => toggle(def)}
                  title={`${def.provider} · ${def.cadence}`}
                  className={`snap-start shrink-0 w-[168px] rounded-xl overflow-hidden border text-left transition-all group ${
                    isOn
                      ? "border-cyan-300/80 shadow-[0_0_16px_rgba(34,211,238,0.45)] bg-cyan-500/10"
                      : "border-white/10 hover:border-white/30 bg-white/[0.03]"
                  }`}
                >
                  <div className="relative w-[168px] h-[96px] bg-slate-900 overflow-hidden">
                    <img
                      src={thumbUrl(def)}
                      alt={def.label}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "0";
                      }}
                    />
                    <div
                      className="absolute top-1 left-1 px-1.5 py-[1px] rounded text-[9px] font-semibold uppercase tracking-wider"
                      style={{ background: `${color}33`, color, border: `1px solid ${color}66` }}
                    >
                      {CATEGORY_LABEL[def.category]}
                    </div>
                    {isOn && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-cyan-400 text-black flex items-center justify-center">
                        {isLoading ? (
                          <span className="w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" strokeWidth={3} />
                        )}
                      </div>
                    )}
                    {didFail && !isOn && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-[1px] rounded bg-red-500/80 text-[9px] font-semibold text-white">
                        Failed
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="text-[11px] font-medium leading-tight line-clamp-2">{def.label}</div>
                    <div className="text-[9px] text-white/50 mt-0.5">{def.provider} · {def.cadence}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}