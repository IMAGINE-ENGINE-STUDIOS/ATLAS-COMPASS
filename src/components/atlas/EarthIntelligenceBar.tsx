/**
 * EarthIntelligenceBar
 * --------------------
 * Secondary toolbar activated by the Brain button in the Atlas top bar.
 * Lists every dataset from `EARTH_LAYERS` (NASA GIBS, NOAA GOES,
 * Himawari-9, EOX, Mapzen, OSM US) grouped by category and lets the user
 * toggle each as a Cesium `ImageryLayer` overlay on the active viewer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Viewer } from "cesium";
import { UrlTemplateImageryProvider, ImageryLayer } from "cesium";
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

const CATEGORY_ORDER: EarthLayerCategory[] = [
  "imagery", "weather", "temperature", "vegetation",
  "atmosphere", "hazards", "cryosphere", "nightlights", "elevation",
];

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

export default function EarthIntelligenceBar({ viewerRef, onClose }: Props) {
  const [active, setActive] = useState<Record<string, boolean>>({});
  const layerRefs = useRef<Record<string, ImageryLayer>>({});

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
    const url = buildEarthLayerUrl(def);
    const provider = new UrlTemplateImageryProvider({
      url,
      maximumLevel: def.maxZoom ?? 9,
      credit: def.attribution,
    });
    const layer = viewer.scene.imageryLayers.addImageryProvider(provider);
    layer.alpha = 0.85;
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

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: EARTH_LAYERS.filter((l) => l.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="absolute top-[62px] left-1/2 -translate-x-1/2 z-20 w-[min(96vw,1100px)] pointer-events-auto">
      <div className="rounded-2xl border border-white/15 bg-black/70 backdrop-blur-xl shadow-2xl text-white overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-widest uppercase text-cyan-200">Earth Intelligence</span>
            <span className="text-[10px] text-white/50">{EARTH_LAYERS.length} datasets · toggle to overlay</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-white/60">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2 space-y-2">
          {grouped.map(({ cat, items }) => (
            <div key={cat}>
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-1 px-1"
                style={{ color: CATEGORY_COLOR[cat] }}
              >
                {CATEGORY_LABEL[cat]}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((def) => {
                  const isOn = !!active[def.id];
                  return (
                    <button
                      key={def.id}
                      onClick={() => toggle(def)}
                      title={`${def.provider} · ${def.cadence}`}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                        isOn
                          ? "bg-cyan-500/25 border-cyan-300/70 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                          : "bg-white/[0.04] border-white/15 text-white/70 hover:text-white hover:bg-white/[0.08]"
                      }`}
                    >
                      {def.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}