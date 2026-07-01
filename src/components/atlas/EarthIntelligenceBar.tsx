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
  Rectangle,
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
  const wms = gibsWmsUrl(def, 1024, 512);
  if (wms) return wms;
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
function gibsWmsUrl(def: EarthLayerDef, width: number, height: number): string | null {
  const raw = buildEarthLayerUrl(def);
  const m = raw.match(
    /gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/([^/]+)\/default\/([^/]+)\//,
  );
  if (!m) return null;
  const layerId = m[1];
  const time = m[2]; // "default" or YYYY-MM-DD
  const fmt = def.format === "jpg" || def.format === "jpeg" ? "image/jpeg" : "image/png";
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layerId,
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: fmt,
    TRANSPARENT: fmt === "image/png" ? "true" : "false",
    TIME: time,
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
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

    // Prefer GIBS WMS at high resolution — it covers the full sphere in
    // EPSG:4326, so we no longer get the ±85° polar caps or the
    // GoogleMapsCompatible sub-hemisphere gaps that made overlays look
    // "smaller than the globe".
    const wms = gibsWmsUrl(def, 4096, 2048);
    if (wms) {
      // SingleTileImageryProvider requires async construction (Cesium ≥ 1.104).
      SingleTileImageryProvider.fromUrl(wms, {
        rectangle: Rectangle.fromDegrees(-180, -90, 180, 90),
        credit: def.attribution,
      })
        .then((provider) => {
          if (!viewer || viewer.isDestroyed()) return;
          // Bail if the user toggled the layer off before the image resolved.
          if (layerRefs.current[def.id] !== PENDING) return;
          const real = viewer.scene.imageryLayers.addImageryProvider(provider);
          real.alpha = 0.92;
          layerRefs.current[def.id] = real;
        })
        .catch((e) => {
          console.warn("[earth-intel] GIBS WMS load failed", def.id, e);
          delete layerRefs.current[def.id];
        });
      // Marker so removeLayer/toggle can see the request is in flight.
      layerRefs.current[def.id] = PENDING as unknown as ImageryLayer;
    } else {
      const provider = new UrlTemplateImageryProvider({
        url: buildEarthLayerUrl(def),
        maximumLevel: def.maxZoom ?? 9,
        credit: def.attribution,
      });
      const layer = viewer.scene.imageryLayers.addImageryProvider(provider);
      layer.alpha = 0.92;
      layerRefs.current[def.id] = layer;
    }
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