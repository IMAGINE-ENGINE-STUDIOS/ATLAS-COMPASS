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
  GeographicTilingScheme,
  ImageryLayer,
} from "cesium";
import {
  EARTH_LAYERS,
  buildEarthLayerUrl,
  type EarthLayerCategory,
  type EarthLayerDef,
} from "@/hooks/useEarthIntelligence";

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
  // GIBS thumbnails: hit the WMS endpoint at 1024x512 for a crisp full-globe
  // preview (bypasses the pixelated z=0 WMTS tile).
  const m = raw.match(
    /gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/([^/]+)\/default\/([^/]+)\//,
  );
  if (m) {
    const [, layerId, time] = m;
    const fmt = def.format === "jpg" || def.format === "jpeg" ? "image/jpeg" : "image/png";
    const params = new URLSearchParams({
      SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.3.0",
      LAYERS: layerId, CRS: "EPSG:4326", BBOX: "-90,-180,90,180",
      WIDTH: "1024", HEIGHT: "512", FORMAT: fmt,
      TRANSPARENT: fmt === "image/png" ? "true" : "false", TIME: time,
    });
    return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
  }
  return raw.replace("{z}", "0").replace("{y}", "0").replace("{x}", "0");
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
/**
 * Convert a GIBS EPSG:3857 WMTS URL into an EPSG:4326 (GeographicTilingScheme)
 * WMTS URL. EPSG:4326 uses 2 root tiles and covers the full ±90° sphere, so
 * we keep per-zoom LOD (unlike a single flat WMS image) while eliminating
 * the polar-cap gap that EPSG:3857 leaves at ±85°.
 *
 * Returns { url, matrix, maxLevel } or null when the URL isn't a GIBS layer.
 */
function gibsGeographic(def: EarthLayerDef): { url: string; maxLevel: number } | null {
  const raw = buildEarthLayerUrl(def);
  const m = raw.match(
    /gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/([^/]+)\/default\/([^/]+)\/GoogleMapsCompatible_Level(\d+)\/\{z\}\/\{y\}\/\{x\}\.(\w+)/,
  );
  if (!m) return null;
  const [, layerId, time, levelStr, ext] = m;
  const level3857 = Number(levelStr);
  // GoogleMapsCompatible_LevelN → EPSG:4326 TileMatrixSet mapping. EPSG:4326
  // pyramids have one fewer max-level than their 3857 counterparts because
  // the geographic pyramid starts with two root tiles instead of one.
  const matrixByLevel: Record<number, { matrix: string; maxLevel: number }> = {
    9: { matrix: "250m", maxLevel: 8 },
    8: { matrix: "500m", maxLevel: 7 },
    7: { matrix: "1km",  maxLevel: 6 },
    6: { matrix: "2km",  maxLevel: 5 },
  };
  const mapped = matrixByLevel[level3857] ?? { matrix: "2km", maxLevel: 5 };
  const url = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layerId}/default/${time}/${mapped.matrix}/{z}/{y}/{x}.${ext}`;
  return { url, maxLevel: mapped.maxLevel };
}

export default function EarthIntelligenceBar({ viewerRef, onClose }: Props) {
  const [active, setActive] = useState<Record<string, boolean>>({});
  const layerRefs = useRef<Record<string, ImageryLayer>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);

  const removeLayer = useCallback((id: string) => {
    const viewer = viewerRef.current;
    const layer = layerRefs.current[id];
    if (viewer && layer && !viewer.isDestroyed()) {
      try { viewer.scene.imageryLayers.remove(layer, true); } catch { /* noop */ }
    }
    delete layerRefs.current[id];
  }, [viewerRef]);

  const addLayer = useCallback((def: EarthLayerDef) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // GIBS layers: use EPSG:4326 tiled endpoint (full-sphere coverage AND
    // real per-zoom LOD). Non-GIBS layers keep their native URL template.
    const geo = gibsGeographic(def);
    const provider = geo
      ? new UrlTemplateImageryProvider({
          url: geo.url,
          maximumLevel: geo.maxLevel,
          tilingScheme: new GeographicTilingScheme(),
          tileWidth: 512,
          tileHeight: 512,
          credit: def.attribution,
        })
      : new UrlTemplateImageryProvider({
          url: buildEarthLayerUrl(def),
          maximumLevel: def.maxZoom ?? 9,
          credit: def.attribution,
        });
    const layer = viewer.scene.imageryLayers.addImageryProvider(provider);
    layer.alpha = 0.92;
    layerRefs.current[def.id] = layer;
  }, [viewerRef]);

  const toggle = useCallback((def: EarthLayerDef) => {
    setActive((prev) => {
      const next = { ...prev };
      if (next[def.id]) {
        removeLayer(def.id);
        delete next[def.id];
      } else {
        addLayer(def);
        next[def.id] = true;
      }
      return next;
    });
  }, [addLayer, removeLayer]);

  // Clear all on unmount
  useEffect(() => {
    return () => {
      Object.keys(layerRefs.current).forEach(removeLayer);
    };
  }, [removeLayer]);

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
                        <Check className="w-3 h-3" strokeWidth={3} />
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