/**
 * Moon Layers + Missions HUD.
 * Two pill buttons pinned to the top-right of the viewport (below the
 * central MoonPill) with glass-panel popovers that reuse the standard
 * Atlas glass aesthetic.
 */
import { useEffect, useMemo, useState } from "react";
import { Layers, Rocket, X, ExternalLink, Search } from "lucide-react";
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
import LiveOrbits from "./LiveOrbits";
import EarthInMoonSky from "./EarthInMoonSky";
import { Ellipsoid, ImageryLayer } from "cesium";
import { flyToMoonCoord } from "@/lib/moon/moonNavigation";
import AtlasTagsOverlay, { type AtlasTag } from "@/components/atlas/AtlasTagsOverlay";
import { LUNAR_ORBITERS, inertialToLatLonAlt, propagate } from "@/lib/moon/liveOrbits";

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

  // Allow the Atlas HUD console (bottom pill area) to toggle the same
  // panels so the user has ONE console instead of duplicated top-right
  // pills. The pill layer top-right is hidden below when moonMode is on.
  useEffect(() => {
    const onToggle = (e: Event) => {
      const detail = (e as CustomEvent).detail as "layers" | "missions" | null;
      if (!detail) { setOpenPanel(null); return; }
      setOpenPanel((cur) => (cur === detail ? null : detail));
    };
    window.addEventListener("moon:toggle-panel", onToggle as EventListener);
    return () => window.removeEventListener("moon:toggle-panel", onToggle as EventListener);
  }, []);

  // Broadcast counts + open state so the HUD console can render matching
  // badges without duplicating filter/layer state.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("moon:panel-state", {
      detail: {
        openPanel,
        layerCount: Object.keys(layerState).length,
        missionCount: MOON_MISSIONS.length,
      },
    }));
  }, [openPanel, layerState]);

  const [filterKinds, setFilterKinds] = useState<Set<MoonMissionKind>>(new Set());
  const [filterAgencies, setFilterAgencies] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  // Time period sliders: [startYear, endYear]
  const yearBounds = useMemo<[number, number]>(() => {
    const years = MOON_MISSIONS.map((m) => Number(m.date.slice(0, 4)));
    return [Math.min(...years), Math.max(...years)];
  }, []);
  const [yearRange, setYearRange] = useState<[number, number]>(yearBounds);
  const [missionsVisible, setMissionsVisible] = useState(true);
  const [selectedMission, setSelectedMission] = useState<MoonMission | null>(null);
  const [moonLodSse, setMoonLodSse] = useState(6);
  const [liveOrbitTags, setLiveOrbitTags] = useState<AtlasTag[]>([]);

  const allAgencies = useMemo(() => {
    const s = new Set<string>();
    MOON_MISSIONS.forEach((m) => s.add(m.agency));
    return Array.from(s).sort();
  }, []);

  // Single source of truth for what missions are visible in both the list
  // and the on-globe pins.
  const filteredMissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return MOON_MISSIONS.filter((m) => {
      if (filterKinds.size && !filterKinds.has(m.kind)) return false;
      if (filterAgencies.size && !filterAgencies.has(m.agency)) return false;
      const y = Number(m.date.slice(0, 4));
      if (y < yearRange[0] || y > yearRange[1]) return false;
      if (q) {
        const hay = `${m.name} ${m.agency} ${m.description} ${m.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filterKinds, filterAgencies, searchQuery, yearRange]);

  const filteredIds = useMemo(
    () => new Set(filteredMissions.map((m) => m.id)),
    [filteredMissions]
  );

  const missionTags = useMemo<AtlasTag[]>(() => filteredMissions.map((m) => ({
    kind: "moon-mission",
    id: `moon-mission-${m.id}`,
    name: m.name,
    lat: m.lat,
    lng: m.lon,
    alt: 1200,
    categoryId: m.status === "active" ? "shop" : m.kind === "planned" ? "other" : "landmark",
    emoji: m.kind === "orbiter" ? "🛰️" : m.kind === "rover" ? "◈" : "☾",
  })), [filteredMissions]);

  useEffect(() => {
    let cancelled = false;
    const emit = () => {
      const now = Date.now();
      const tags = LUNAR_ORBITERS.map((o) => {
        const ll = inertialToLatLonAlt(propagate(o, now), now);
        return {
          kind: "moon-probe" as const,
          id: `moon-probe-${o.id}`,
          name: o.name,
          lat: ll.lat,
          lng: ll.lon,
          alt: ll.alt,
          categoryId: "other",
          emoji: "▲",
        };
      });
      if (!cancelled) setLiveOrbitTags(tags);
    };
    emit();
    const timer = window.setInterval(emit, 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;
    try {
      viewer.scene.globe.maximumScreenSpaceError = moonLodSse;
      viewer.scene.globe.preloadAncestors = true;
      viewer.scene.globe.preloadSiblings = moonLodSse <= 6;
      viewer.scene.globe.tileCacheSize = 1200;
      viewer.scene.requestRender?.();
    } catch {}
  }, [viewer, moonLodSse]);

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
  const toggleAgency = (a: string) => {
    setFilterAgencies((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  };
  const resetFilters = () => {
    setFilterKinds(new Set());
    setFilterAgencies(new Set());
    setSearchQuery("");
    setYearRange(yearBounds);
  };
  const activeFilterCount =
    filterKinds.size + filterAgencies.size + (searchQuery ? 1 : 0) +
    ((yearRange[0] !== yearBounds[0] || yearRange[1] !== yearBounds[1]) ? 1 : 0);

  const flyToMission = (m: MoonMission) => {
    if (!viewer) return;
    try { flyToMoonCoord(viewer, m.lon, m.lat, { altitude: 60_000, pitch: -45 }); } catch {}
    setSelectedMission(m);
  };

  return (
    <>
      {/* Live orbiter pins (LRO, Chandrayaan-2, KPLO, Queqiao-2) with
          continuously-propagated Keplerian positions and a LIVE readout. */}
      <LiveOrbits viewer={viewer} />

      {/* Real Earth in the Moon's sky at exact astronomical distance. */}
      <EarthInMoonSky viewer={viewer} />

      <MoonMissionEntities
        viewer={viewer}
        visible={missionsVisible}
        allowedIds={filteredIds}
        onSelect={setSelectedMission}
      />

      {missionsVisible && (
        <AtlasTagsOverlay
          viewer={viewer}
          tags={[...missionTags, ...liveOrbitTags]}
          clusterDistancePx={72}
          minMembers={1}
          ellipsoid={Ellipsoid.MOON}
          horizonRadius={Ellipsoid.MOON.maximumRadius}
          onSelect={(tag) => {
            if (tag.kind === "moon-mission") {
              const m = MOON_MISSIONS.find((x) => `moon-mission-${x.id}` === tag.id);
              if (m) flyToMission(m);
            } else if (tag.kind === "moon-probe") {
              window.dispatchEvent(new CustomEvent("moon:select-orbiter", { detail: { id: tag.id.replace("moon-probe-", "") } }));
            }
          }}
        />
      )}

      {/* Pills moved into the unified Atlas HUD console (bottom-right).
          The console dispatches `moon:toggle-panel` events, handled above. */}

      {/* Layers panel */}
      {openPanel === "layers" && (
        <div className="fixed top-16 right-3 z-[71] w-[340px] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/15 bg-black/85 backdrop-blur-2xl shadow-2xl text-white animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between p-3 border-b border-white/10">
            <div className="font-medium text-sm">NASA Moon Datasets</div>
            <button onClick={() => setOpenPanel(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
          <div className="p-3 space-y-4">
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-wider opacity-60">Moon LOD</div>
                <div className="text-[10px] tabular-nums text-white/80">SSE {moonLodSse}px</div>
              </div>
              <input
                type="range"
                min={2}
                max={16}
                step={1}
                value={moonLodSse}
                onChange={(e) => setMoonLodSse(parseInt(e.target.value, 10))}
                className="w-full accent-white"
              />
            </div>
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
            <div className="font-medium text-sm">Lunar Missions <span className="opacity-50 text-[10px] tabular-nums ml-1">{filteredMissions.length}/{MOON_MISSIONS.length}</span></div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] opacity-80 cursor-pointer">
                <input type="checkbox" checked={missionsVisible} onChange={(e) => setMissionsVisible(e.target.checked)} className="accent-white" />
                Show pins
              </label>
              <button onClick={() => setOpenPanel(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          </div>
          <div className="p-3">
            {/* Search */}
            <div className="relative mb-3">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search missions, agencies, sites…"
                className="w-full h-8 pl-7 pr-2 rounded-lg bg-white/[0.06] border border-white/10 focus:border-white/30 focus:outline-none text-[12px] placeholder:opacity-40"
              />
            </div>

            {/* Year range */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] opacity-60 mb-1">
                <span>Time period</span>
                <span className="tabular-nums">{yearRange[0]} – {yearRange[1]}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={yearBounds[0]} max={yearBounds[1]} value={yearRange[0]}
                  onChange={(e) => {
                    const v = Math.min(parseInt(e.target.value), yearRange[1]);
                    setYearRange([v, yearRange[1]]);
                  }}
                  className="flex-1 accent-white"
                />
                <input
                  type="range" min={yearBounds[0]} max={yearBounds[1]} value={yearRange[1]}
                  onChange={(e) => {
                    const v = Math.max(parseInt(e.target.value), yearRange[0]);
                    setYearRange([yearRange[0], v]);
                  }}
                  className="flex-1 accent-white"
                />
              </div>
            </div>

            {/* Mission type chips */}
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Mission type</div>
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

            {/* Agency chips */}
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Agency</div>
            <div className="flex flex-wrap gap-1 mb-3">
              {allAgencies.map((a) => {
                const on = filterAgencies.has(a);
                return (
                  <button
                    key={a}
                    onClick={() => toggleAgency(a)}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-all ${on ? "border-white/50 bg-white/10" : "border-white/15 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-[10px] opacity-70 hover:opacity-100 underline mb-2"
              >
                Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
              </button>
            )}

            <div className="space-y-1.5">
              {filteredMissions.length === 0 && (
                <div className="text-[11px] opacity-50 text-center py-4">No missions match these filters.</div>
              )}
              {filteredMissions.map((m) => (
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