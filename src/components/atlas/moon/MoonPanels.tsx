/**
 * Moon Layers + Missions HUD.
 * Two pill buttons pinned to the top-right of the viewport (below the
 * central MoonPill) with glass-panel popovers that reuse the standard
 * Atlas glass aesthetic.
 */
import { useEffect, useMemo, useState } from "react";
import { Layers, Rocket, X, ExternalLink } from "lucide-react";
import {
  MOON_LAYERS,
  createMoonImageryProvider,
  type MoonLayerDef,
} from "@/lib/moon/trekProviders";
import {
  MOON_MISSIONS,
  MISSION_KIND_COLOR,
  MISSION_KIND_LABEL,
  type MoonMission,
  type MoonMissionKind,
} from "@/data/moon/missions";
import MoonMissionEntities from "./MoonMissionEntities";
import { ImageryLayer, Cartesian3, Ellipsoid, HeadingPitchRange, Math as CesiumMath } from "cesium";

interface Props {
  viewer: any;
}

const CATEGORY_ORDER: MoonLayerDef["category"][] = [
  "basemap",
  "elevation",
  "composition",
  "highres",
  "special",
];
const CATEGORY_LABEL: Record<MoonLayerDef["category"], string> = {
  basemap: "Basemaps",
  elevation: "Elevation & Topography",
  composition: "Composition & Geophysics",
  highres: "Landing-site High-Resolution",
  special: "Special Regions",
};

export default function MoonPanels({ viewer }: Props) {
  // Which layers are currently mounted as ImageryLayer instances.
  const [layerState, setLayerState] = useState<Record<string, { alpha: number }>>(() => {
    const init: Record<string, { alpha: number }> = {};
    MOON_LAYERS.forEach((l) => {
      if (l.defaultVisible) init[l.id] = { alpha: l.defaultAlpha ?? 1 };
    });
    return init;
  });
  const [openPanel, setOpenPanel] = useState<null | "layers" | "missions">(null);

  const [filterKinds, setFilterKinds] = useState<Set<MoonMissionKind>>(new Set());
  const [missionsVisible, setMissionsVisible] = useState(true);
  const [selectedMission, setSelectedMission] = useState<MoonMission | null>(null);

  // Sync ImageryLayer instances with layerState.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;
    const bag: Record<string, ImageryLayer> = ((viewer as any).__moonImagery ||= {});

    // Remove layers no longer wanted.
    Object.keys(bag).forEach((id) => {
      if (!layerState[id]) {
        try { viewer.imageryLayers.remove(bag[id], true); } catch {}
        delete bag[id];
      }
    });
    // Add/update layers.
    MOON_LAYERS.forEach((def) => {
      const wanted = layerState[def.id];
      if (!wanted) return;
      let layer = bag[def.id];
      if (!layer) {
        try {
          const provider = createMoonImageryProvider(def);
          layer = new ImageryLayer(provider, {});
          viewer.imageryLayers.add(layer);
          bag[def.id] = layer;
        } catch (err) {
          console.warn("[moon-layers] failed to add", def.id, err);
          return;
        }
      }
      layer.alpha = wanted.alpha;
    });
    try { viewer.scene.requestRender(); } catch {}
  }, [viewer, layerState]);

  const grouped = useMemo(() => {
    const g: Record<string, MoonLayerDef[]> = {};
    MOON_LAYERS.forEach((l) => { (g[l.category] ||= []).push(l); });
    return g;
  }, []);

  const toggleLayer = (id: string) => {
    setLayerState((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { alpha: MOON_LAYERS.find((l) => l.id === id)?.defaultAlpha ?? 1 };
      return next;
    });
  };
  const setAlpha = (id: string, alpha: number) => {
    setLayerState((prev) => (prev[id] ? { ...prev, [id]: { alpha } } : prev));
  };

  const toggleKind = (k: MoonMissionKind) => {
    setFilterKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const flyToMission = (m: MoonMission) => {
    if (!viewer) return;
    try {
      viewer.camera.flyToBoundingSphere(
        { center: Cartesian3.fromDegrees(m.lon, m.lat, 0, Ellipsoid.MOON), radius: 20000 } as any,
        { duration: 1.6, offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), 60000) }
      );
    } catch {}
    setSelectedMission(m);
  };

  return (
    <>
      <MoonMissionEntities
        viewer={viewer}
        visible={missionsVisible}
        filterKinds={filterKinds.size ? (filterKinds as unknown as Set<string>) : null}
        onSelect={setSelectedMission}
      />

      {/* Pills — top right, stacked */}
      <div className="fixed top-3 right-3 z-[70] flex flex-col gap-2 items-end">
        <button
          onClick={() => setOpenPanel(openPanel === "layers" ? null : "layers")}
          className="group flex items-center gap-2 px-3 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 hover:border-white/30 hover:bg-black/85 transition-all shadow-2xl text-white text-xs font-medium"
          title="NASA Moon datasets"
        >
          <Layers size={14} /> Layers
          <span className="opacity-60 text-[10px] tabular-nums">
            {Object.keys(layerState).length}
          </span>
        </button>
        <button
          onClick={() => setOpenPanel(openPanel === "missions" ? null : "missions")}
          className="group flex items-center gap-2 px-3 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 hover:border-white/30 hover:bg-black/85 transition-all shadow-2xl text-white text-xs font-medium"
          title="Missions, landers, rovers, orbiters"
        >
          <Rocket size={14} /> Missions
          <span className="opacity-60 text-[10px] tabular-nums">{MOON_MISSIONS.length}</span>
        </button>
      </div>

      {/* Layers panel */}
      {openPanel === "layers" && (
        <div className="fixed top-16 right-3 z-[71] w-[340px] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/15 bg-black/85 backdrop-blur-2xl shadow-2xl text-white animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between p-3 border-b border-white/10">
            <div className="font-medium text-sm">NASA Moon Datasets</div>
            <button onClick={() => setOpenPanel(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
          <div className="p-3 space-y-4">
            {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((cat) => (
              <div key={cat}>
                <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">{CATEGORY_LABEL[cat]}</div>
                <div className="space-y-1.5">
                  {grouped[cat].map((l) => {
                    const on = !!layerState[l.id];
                    return (
                      <div key={l.id} className="rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] p-2">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input type="checkbox" className="mt-0.5 accent-white" checked={on} onChange={() => toggleLayer(l.id)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium leading-tight">{l.title}</div>
                            <div className="text-[10px] opacity-60 mt-0.5 leading-snug">{l.description}</div>
                            <div className="text-[9px] opacity-40 mt-0.5">{l.credit}</div>
                          </div>
                        </label>
                        {on && (
                          <input
                            type="range" min={0} max={1} step={0.05}
                            value={layerState[l.id].alpha}
                            onChange={(e) => setAlpha(l.id, parseFloat(e.target.value))}
                            className="w-full mt-2 accent-white"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="text-[10px] opacity-50 pt-2 border-t border-white/10">
              All layers stream from NASA Solar System Treks (trek.nasa.gov). No Cesium ion, no API key required.
            </div>
          </div>
        </div>
      )}

      {/* Missions panel */}
      {openPanel === "missions" && (
        <div className="fixed top-16 right-3 z-[71] w-[380px] max-h-[75vh] overflow-y-auto rounded-2xl border border-white/15 bg-black/85 backdrop-blur-2xl shadow-2xl text-white animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between p-3 border-b border-white/10">
            <div className="font-medium text-sm">Lunar Missions</div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] opacity-80 cursor-pointer">
                <input type="checkbox" checked={missionsVisible} onChange={(e) => setMissionsVisible(e.target.checked)} className="accent-white" />
                Show pins
              </label>
              <button onClick={() => setOpenPanel(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          </div>
          <div className="p-3">
            <div className="flex flex-wrap gap-1 mb-3">
              {(Object.keys(MISSION_KIND_LABEL) as MoonMissionKind[]).map((k) => {
                const on = filterKinds.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggleKind(k)}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-all ${on ? "border-white/50 bg-white/10" : "border-white/15 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                    style={on ? { boxShadow: `0 0 0 1px ${MISSION_KIND_COLOR[k]}55` } : undefined}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: MISSION_KIND_COLOR[k] }} />
                    {MISSION_KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              {MOON_MISSIONS
                .filter((m) => filterKinds.size === 0 || filterKinds.has(m.kind))
                .map((m) => (
                <button
                  key={m.id}
                  onClick={() => flyToMission(m)}
                  className="w-full text-left p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: MISSION_KIND_COLOR[m.kind] }} />
                    <div className="text-[12px] font-medium truncate">{m.name}</div>
                    <div className="ml-auto text-[10px] opacity-60 tabular-nums">{m.date.slice(0, 4)}</div>
                  </div>
                  <div className="text-[10px] opacity-60 mt-0.5">{m.agency} · {MISSION_KIND_LABEL[m.kind]} · {m.lat.toFixed(2)}°, {m.lon.toFixed(2)}°</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selected mission card */}
      {selectedMission && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[72] w-[360px] max-w-[90vw] rounded-2xl border border-white/15 bg-black/85 backdrop-blur-2xl shadow-2xl text-white animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-start p-3 gap-3">
            {selectedMission.imageUrl && (
              <img src={selectedMission.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: MISSION_KIND_COLOR[selectedMission.kind] }} />
                <div className="text-sm font-medium">{selectedMission.name}</div>
                <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setSelectedMission(null)}><X size={14} /></button>
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">
                {selectedMission.agency} · {MISSION_KIND_LABEL[selectedMission.kind]} · {selectedMission.date}
              </div>
              <div className="text-[11px] opacity-90 mt-1.5 leading-snug">{selectedMission.description}</div>
              <div className="text-[10px] opacity-60 mt-1 tabular-nums">{selectedMission.lat.toFixed(4)}° N, {selectedMission.lon.toFixed(4)}° E</div>
              <a
                href={selectedMission.reference}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100 mt-1.5"
              >
                <ExternalLink size={10} /> NASA reference
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}