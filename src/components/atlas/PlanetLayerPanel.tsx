/**
 * Generic planetary layer / info pill.
 *
 * Used for every non-Earth, non-Moon world:
 *   • Mars, Mercury, Venus, Vesta, Ceres — real NASA / USGS WMTS layers
 *     with a toggle + opacity slider.
 *   • Jupiter, Saturn, Uranus, Neptune, Sun — no public surface pyramid
 *     exists, so we render a small "reference sphere" pill that is
 *     honest about the data source.
 */
import { useEffect, useMemo, useState } from "react";
import { Layers, X } from "lucide-react";
import { ImageryLayer } from "cesium";
import {
  getPlanetLayerCatalog,
  createPlanetImageryProvider,
  tunePlanetImageryLayer,
  type PlanetLayerDef,
} from "@/lib/planets/trekCatalogs";
import {
  MARS_LAYERS,
  createMarsImageryProvider,
  tuneMarsImageryLayer,
  type MarsLayerDef,
} from "@/lib/mars/marsProviders";

type AnyLayerDef = PlanetLayerDef | MarsLayerDef;

interface Props {
  viewer: any;
  worldId: string;
  worldName: string;
  /** True when the world has no tile pyramid (gas giants / Sun). */
  isReferenceSphere?: boolean;
}

function catalogFor(worldId: string): AnyLayerDef[] | null {
  if (worldId === "mars") return MARS_LAYERS as AnyLayerDef[];
  return (getPlanetLayerCatalog(worldId) as AnyLayerDef[] | null) ?? null;
}

function createProvider(worldId: string, def: AnyLayerDef) {
  if (worldId === "mars") return createMarsImageryProvider(def as MarsLayerDef);
  return createPlanetImageryProvider(def as PlanetLayerDef);
}
function tuneProvider(worldId: string, layer: ImageryLayer, def: AnyLayerDef) {
  if (worldId === "mars") return tuneMarsImageryLayer(layer, def as MarsLayerDef);
  return tunePlanetImageryLayer(layer, def as PlanetLayerDef);
}

export default function PlanetLayerPanel({
  viewer,
  worldId,
  worldName,
  isReferenceSphere,
}: Props) {
  const catalog = useMemo(() => catalogFor(worldId), [worldId]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Record<string, { alpha: number }>>(() => {
    const init: Record<string, { alpha: number }> = {};
    catalog?.forEach((l) => {
      if (l.defaultVisible) init[l.id] = { alpha: l.defaultAlpha ?? 1 };
    });
    return init;
  });

  // Reset when world changes (e.g. planet switcher without full remount).
  useEffect(() => {
    const init: Record<string, { alpha: number }> = {};
    catalog?.forEach((l) => {
      if (l.defaultVisible) init[l.id] = { alpha: l.defaultAlpha ?? 1 };
    });
    setState(init);
    setOpen(false);
  }, [catalog, worldId]);

  const toggleLayer = (def: AnyLayerDef) => {
    if (!viewer || viewer.isDestroyed?.()) return;
    const bag: Record<string, ImageryLayer> =
      (viewer as any).__planetImagery = (viewer as any).__planetImagery ?? {};
    if (state[def.id]) {
      const layer = bag[def.id];
      if (layer) {
        try { viewer.imageryLayers.remove(layer, true); } catch {}
        delete bag[def.id];
      }
      setState((s) => { const n = { ...s }; delete n[def.id]; return n; });
    } else {
      try {
        const provider = createProvider(worldId, def);
        const layer = new ImageryLayer(provider, {});
        tuneProvider(worldId, layer, def);
        layer.alpha = def.defaultAlpha ?? 1;
        viewer.imageryLayers.add(layer);
        bag[def.id] = layer;
        setState((s) => ({ ...s, [def.id]: { alpha: layer.alpha } }));
      } catch (err) {
        console.warn(`[PlanetLayerPanel] failed to add ${def.id}`, err);
      }
    }
    viewer.scene?.requestRender?.();
  };

  const setAlpha = (def: AnyLayerDef, alpha: number) => {
    const bag: Record<string, ImageryLayer> | undefined = (viewer as any).__planetImagery;
    const layer = bag?.[def.id];
    if (layer) {
      layer.alpha = alpha;
      setState((s) => ({ ...s, [def.id]: { alpha } }));
      viewer.scene?.requestRender?.();
    }
  };

  if (isReferenceSphere || !catalog) {
    const wid = worldId.toLowerCase();
    const isGas = ["jupiter", "saturn", "uranus", "neptune"].includes(wid);
    const isSun = wid === "sun";
    const layerLabel = isSun
      ? "Photosphere · SDO composite"
      : isGas
        ? "Cloud-top mosaic · Cassini / Voyager"
        : "Global albedo mosaic";
    const note = isSun
      ? "Live photospheric skin draped on the solar ellipsoid. No sub-surface tile pyramid exists."
      : isGas
        ? "Full-resolution NASA cloud-top mosaic wrapped on the Atlas ellipsoid. Gas giants have no solid surface, so deeper tile pyramids do not exist."
        : "Full-resolution NASA global mosaic wrapped on the Atlas ellipsoid.";
    return (
      <div className="absolute top-20 right-4 z-30 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl px-3.5 py-2 max-w-[300px]
            backdrop-blur-xl bg-white/[0.06] border border-white/10
            shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-white/60">{worldName}</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-300/25 text-emerald-200">Live</span>
          </div>
          <div className="text-[12px] font-medium text-white mt-1">{layerLabel}</div>
          <p className="text-[11px] text-white/60 mt-1 leading-snug">{note}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-20 right-4 z-30 pointer-events-none">
      <button
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-2
          backdrop-blur-xl bg-white/8 border border-white/10 hover:bg-white/12
          shadow-[0_4px_24px_rgba(0,0,0,0.4)] text-xs text-white tabular-nums"
      >
        <Layers className="w-3.5 h-3.5" />
        {worldName} Layers
        <span className="text-white/50">
          {Object.keys(state).length}/{catalog.length}
        </span>
      </button>
      {open && (
        <div
          className="pointer-events-auto mt-2 w-[320px] max-h-[70vh] overflow-y-auto
            rounded-2xl p-3 backdrop-blur-xl bg-black/70 border border-white/10
            shadow-[0_10px_50px_rgba(0,0,0,0.6)]"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-widest text-white/60">
              NASA / USGS tile catalog
            </p>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-md hover:bg-white/10"
              aria-label="Close layers"
            >
              <X className="w-3.5 h-3.5 text-white/70" />
            </button>
          </div>
          <ul className="space-y-2">
            {catalog.map((def) => {
              const active = !!state[def.id];
              return (
                <li
                  key={def.id}
                  className="rounded-xl p-2 border border-white/8 bg-white/3"
                >
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleLayer(def)}
                      className="mt-0.5 accent-white"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{def.title}</p>
                      <p className="text-[10px] text-white/50 leading-tight mt-0.5 line-clamp-2">
                        {def.description}
                      </p>
                      {active && (
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={state[def.id]?.alpha ?? 1}
                          onChange={(e) => setAlpha(def, Number(e.target.value))}
                          className="w-full mt-1.5 accent-white"
                        />
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}