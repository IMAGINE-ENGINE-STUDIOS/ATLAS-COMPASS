/**
 * AtlasCommunityLayersPill
 * -------------------------
 * A dropdown pill (sibling of ModeCarousel) that manages Cesium ion 3D Tile
 * overlays layered on top of the active base map:
 *   • Japan 3D Buildings (MLIT PLATEAU)  — 23M countrywide buildings
 *   • Vexcel 3D Cities                   — curated Cesium ion metro assets
 *   • Custom                             — any ion asset ID pasted by user
 *
 * State (which layers are enabled + user-added asset IDs) persists via
 * localStorage — see `src/lib/atlasIonLayers.ts`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, Eye, EyeOff, Layers, Locate, Plus, Trash2, X } from "lucide-react";
import { type Viewer } from "cesium";
import {
  addCustomIonLayer,
  flyToIonLayer,
  ensureIonLayer,
  getIonLayerEnabled,
  ION_LAYER_CATALOG,
  listCustomIonLayers,
  removeCustomIonLayer,
  removeIonLayerPrimitive,
  setIonLayerEnabled,
  type IonLayerEntry,
} from "@/lib/atlasIonLayers";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  isLoaded: boolean;
}

export default function AtlasCommunityLayersPill({ viewerRef, isLoaded }: Props) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const entries: IonLayerEntry[] = useMemo(
    () => [...ION_LAYER_CATALOG, ...listCustomIonLayers()],
    [tick],
  );
  const enabledCount = entries.filter((e) => getIonLayerEnabled(e.id)).length;

  const toggle = async (e: IonLayerEntry) => {
    const v = viewerRef.current; if (!v) return;
    const next = !getIonLayerEnabled(e.id);
    setIonLayerEnabled(e.id, next);
    if (next) await ensureIonLayer(v, e, true);
    else {
      const map: Map<string, any> | undefined = (v as any).__ionCommunityTilesets;
      const ts = map?.get(e.id);
      if (ts) ts.show = false;
      v.scene.requestRender?.();
    }
    setTick((t) => t + 1);
  };

  const fly = async (e: IonLayerEntry) => {
    const v = viewerRef.current; if (!v) return;
    setIonLayerEnabled(e.id, true);
    await flyToIonLayer(v, e);
    setTick((t) => t + 1);
  };

  const remove = (e: IonLayerEntry) => {
    const v = viewerRef.current;
    if (v) removeIonLayerPrimitive(v, e.id);
    removeCustomIonLayer(e.id);
    setTick((t) => t + 1);
  };

  const addCustom = async () => {
    const assetId = Number(newId.trim());
    if (!Number.isFinite(assetId) || assetId <= 0) return;
    const entry = addCustomIonLayer(newName.trim(), assetId);
    setIonLayerEnabled(entry.id, true);
    const v = viewerRef.current;
    if (v) await ensureIonLayer(v, entry, true);
    setNewId(""); setNewName("");
    setTick((t) => t + 1);
  };

  if (!isLoaded) return null;

  const catalog = entries.filter((e) => !e.id.startsWith("custom-"));
  const custom = entries.filter((e) => e.id.startsWith("custom-"));

  return (
    <div ref={wrapRef} className="relative select-none">
      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-[300px] rounded-2xl bg-black/90 backdrop-blur-xl border border-white/15 shadow-2xl text-white overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-fuchsia-300" />
              <span className="text-[11px] uppercase tracking-wider font-semibold">Ion 3D Layers</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10 text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-[55vh] overflow-y-auto p-2 space-y-3">
            <Section title="Curated">
              {catalog.map((e) => (
                <Row
                  key={e.id}
                  entry={e}
                  enabled={getIonLayerEnabled(e.id)}
                  onToggle={() => toggle(e)}
                  onFly={() => fly(e)}
                />
              ))}
            </Section>

            {custom.length > 0 && (
              <Section title="Custom">
                {custom.map((e) => (
                  <Row
                    key={e.id}
                    entry={e}
                    enabled={getIonLayerEnabled(e.id)}
                    onToggle={() => toggle(e)}
                    onFly={() => fly(e)}
                    onRemove={() => remove(e)}
                  />
                ))}
              </Section>
            )}

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-white/60">Add ion asset ID</div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Layer name (e.g. Vexcel Vienna)"
                className="w-full px-2 py-1 text-[11px] rounded bg-black/50 border border-white/10 focus:border-fuchsia-400/50 outline-none"
              />
              <div className="flex gap-1.5">
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="ion asset ID"
                  inputMode="numeric"
                  className="flex-1 px-2 py-1 text-[11px] rounded bg-black/50 border border-white/10 focus:border-fuchsia-400/50 outline-none"
                />
                <button
                  onClick={addCustom}
                  className="px-2 py-1 rounded bg-fuchsia-500/25 border border-fuchsia-400/40 text-fuchsia-100 hover:bg-fuchsia-500/40 text-[10px] font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              <p className="text-[9px] text-white/50 leading-snug">
                Add a Vexcel 3D Cities asset to your Cesium ion account, then
                paste its asset ID here. Layer streams instantly on top of the
                current map mode.
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Ion 3D layers (Vexcel · Japan · custom)"
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ring-1 transition-all ${
          enabledCount > 0
            ? "bg-fuchsia-500/20 ring-fuchsia-400/50 text-fuchsia-200"
            : "bg-white/[0.06] ring-white/15 text-white/75 hover:text-white"
        }`}
      >
        <Layers className="w-3 h-3" />
        <span className="text-[10px] font-semibold tracking-wide">
          Layers{enabledCount > 0 ? ` · ${enabledCount}` : ""}
        </span>
        <ChevronUp className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase tracking-[0.15em] text-white/40 px-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  entry, enabled, onToggle, onFly, onRemove,
}: {
  entry: IonLayerEntry;
  enabled: boolean;
  onToggle: () => void;
  onFly: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-colors ${
      enabled ? "bg-fuchsia-500/10 border-fuchsia-400/30" : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]"
    }`}>
      <button
        onClick={onToggle}
        title={enabled ? "Hide layer" : "Show layer"}
        className={`p-1 rounded ${enabled ? "text-fuchsia-200" : "text-white/50 hover:text-white"}`}
      >
        {enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium truncate">{entry.name}</div>
        <div className="text-[9px] text-white/45 truncate">
          {entry.description ?? `ion asset ${entry.assetId}`}
        </div>
      </div>
      <button
        onClick={onFly}
        title="Fly to layer"
        className="p-1 rounded text-white/50 hover:text-cyan-300 hover:bg-white/5"
      >
        <Locate className="w-3.5 h-3.5" />
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove"
          className="p-1 rounded text-white/40 hover:text-red-300 hover:bg-white/5"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}