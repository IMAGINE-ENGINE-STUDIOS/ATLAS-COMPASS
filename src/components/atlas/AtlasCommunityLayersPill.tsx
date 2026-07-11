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
import { AlertCircle, Check, ChevronUp, Eye, EyeOff, Key, Layers, Loader2, Locate, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type Viewer } from "cesium";
import {
  addCustomIonLayer,
  flyToIonLayer,
  ensureIonLayer,
  getAssetIdOverride,
  getIonLayerValidation,
  getIonLayerEnabled,
  ION_LAYER_CATALOG,
  type IonAssetValidation,
  listCustomIonLayers,
  onIonValidationChange,
  removeCustomIonLayer,
  removeIonLayerPrimitive,
  resolveAssetId,
  setAssetIdOverride,
  setIonLayerEnabled,
  validateEnabledIonLayers,
  validateIonLayer,
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
  const [tab, setTab] = useState<"japan" | "vexcel" | "custom">("japan");
  const [search, setSearch] = useState("");
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

  // Re-render whenever any layer validation status changes (so the row dots
  // update while an async check is running).
  useEffect(() => onIonValidationChange(() => setTick((t) => t + 1)), []);

  const entries: IonLayerEntry[] = useMemo(
    () => [...ION_LAYER_CATALOG, ...listCustomIonLayers()],
    [tick],
  );
  const enabledCount = entries.filter((e) => getIonLayerEnabled(e.id)).length;

  const toggle = async (e: IonLayerEntry) => {
    const v = viewerRef.current; if (!v) return;
    const next = !getIonLayerEnabled(e.id);
    // Placeholder Vexcel entries: prompt for an ion asset ID before enabling.
    if (next && e.needsAssetId && !getAssetIdOverride(e.id)) {
      const raw = window.prompt(
        `Enter your Cesium ion asset ID for ${e.name}.\n\n` +
        `Vexcel 3D Cities is per-account: add the asset from Cesium ion → ` +
        `Asset Depot, then paste its numeric ID here (saved for future sessions).`,
      );
      const id = Number(raw?.trim());
      if (!Number.isFinite(id) || id <= 0) return;
      setAssetIdOverride(e.id, id);
    }
    setIonLayerEnabled(e.id, next);
    if (next) {
      // Validate + stream in parallel. If validation fails the row shows red
      // and streaming will also fail — user sees the reason inline.
      void validateIonLayer(e, { force: true });
      await ensureIonLayer(v, e, true);
    } else {
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
    if (v) {
      void validateIonLayer(entry, { force: true });
      await ensureIonLayer(v, entry, true);
    }
    setNewId(""); setNewName("");
    setTick((t) => t + 1);
  };

  if (!isLoaded) return null;

  const q = search.trim().toLowerCase();
  const matches = (e: IonLayerEntry) =>
    !q || e.name.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q);
  const japan = entries.filter((e) => e.group === "japan" && matches(e));
  const vexcel = entries.filter((e) => e.group === "vexcel" && matches(e));
  const custom = entries.filter((e) => e.id.startsWith("custom-") && matches(e));
  const shownList = tab === "japan" ? japan : tab === "vexcel" ? vexcel : custom;

  const enabledEntries = entries.filter((e) => getIonLayerEnabled(e.id));
  const enabledIssues = enabledEntries.filter((e) => getIonLayerValidation(e.id).status !== "ok");

  const revalidateAll = async () => {
    await validateEnabledIonLayers();
    setTick((t) => t + 1);
  };

  return (
    <div ref={wrapRef} className="relative select-none">
      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-[340px] rounded-2xl bg-black/90 backdrop-blur-xl border border-white/15 shadow-2xl text-white overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-fuchsia-300" />
              <span className="text-[11px] uppercase tracking-wider font-semibold">Ion 3D Layers</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={revalidateAll}
                title="Re-validate all enabled layers"
                className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-fuchsia-300"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10 text-white/60">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {enabledEntries.length > 0 && (
            <div className={`px-3 py-1.5 text-[10px] flex items-center gap-1.5 border-b border-white/10 ${
              enabledIssues.length === 0
                ? "bg-emerald-500/10 text-emerald-200"
                : "bg-amber-500/10 text-amber-200"
            }`}>
              {enabledIssues.length === 0 ? (
                <><Check className="w-3 h-3" /> All {enabledEntries.length} enabled layer{enabledEntries.length > 1 ? "s" : ""} validated · safe to place models</>
              ) : (
                <><AlertCircle className="w-3 h-3" /> {enabledIssues.length} of {enabledEntries.length} layer{enabledEntries.length > 1 ? "s" : ""} not usable — check red rows before placing</>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 px-2 pt-2">
            {(["japan", "vexcel", "custom"] as const).map((t) => {
              const count = t === "japan" ? japan.length : t === "vexcel" ? vexcel.length : custom.length;
              const label = t === "japan" ? "Japan" : t === "vexcel" ? "Vexcel" : "Custom";
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-colors ${
                    tab === t
                      ? "bg-fuchsia-500/25 text-fuchsia-100 border border-fuchsia-400/40"
                      : "bg-white/[0.04] text-white/60 border border-transparent hover:text-white"
                  }`}
                >
                  {label} · {count}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="px-2 pt-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/50 border border-white/10">
              <Search className="w-3 h-3 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "vexcel" ? "Search 60 metros…" : "Search…"}
                className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-white/30"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-white/40 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[55vh] overflow-y-auto p-2 space-y-1.5">
            {shownList.length === 0 && (
              <p className="text-center text-[10px] text-white/40 py-4">
                {tab === "custom" ? "No custom layers yet." : "No matches."}
              </p>
            )}
            {shownList.map((e) => (
              <Row
                key={e.id}
                entry={e}
                enabled={getIonLayerEnabled(e.id)}
                assetIdOverride={getAssetIdOverride(e.id)}
                validation={getIonLayerValidation(e.id)}
                onToggle={() => toggle(e)}
                onFly={() => fly(e)}
                onValidate={() => { void validateIonLayer(e, { force: true }); }}
                onSetAssetId={() => {
                  const raw = window.prompt(
                    `Set ion asset ID for ${e.name}`,
                    String(resolveAssetId(e) || ""),
                  );
                  const id = Number(raw?.trim());
                  if (Number.isFinite(id) && id > 0) {
                    setAssetIdOverride(e.id, id);
                    void validateIonLayer(e, { force: true });
                    setTick((t) => t + 1);
                  }
                }}
                onRemove={e.id.startsWith("custom-") ? () => remove(e) : undefined}
              />
            ))}

            {tab === "custom" && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5 mt-2">
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
                Paste any Cesium ion 3D Tileset asset ID. Layer streams instantly on top of the current map mode.
              </p>
              </div>
            )}
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

function Row({
  entry, enabled, assetIdOverride, validation, onToggle, onFly, onRemove, onSetAssetId, onValidate,
}: {
  entry: IonLayerEntry;
  enabled: boolean;
  assetIdOverride?: number;
  validation: IonAssetValidation;
  onToggle: () => void;
  onFly: () => void;
  onRemove?: () => void;
  onSetAssetId?: () => void;
  onValidate?: () => void;
}) {
  const effectiveAssetId = assetIdOverride ?? entry.assetId;
  const unconfigured = entry.needsAssetId && !assetIdOverride;
  const status = validation.status;
  const statusMeta = {
    ok:        { color: "bg-emerald-400",  label: "Validated" },
    error:     { color: "bg-red-500",      label: validation.error || "Failed" },
    checking:  { color: "bg-amber-400 animate-pulse", label: "Checking…" },
    unchecked: { color: "bg-white/25",     label: "Not yet validated" },
  }[status];
  return (
    <div className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-colors ${
      enabled && status === "error" ? "bg-red-500/10 border-red-400/40" :
      enabled ? "bg-fuchsia-500/10 border-fuchsia-400/30" :
      unconfigured ? "bg-amber-500/[0.04] border-amber-400/15 hover:bg-amber-500/[0.08]"
      : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]"
    }`}>
      {/* Status dot */}
      <span
        title={statusMeta.label}
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusMeta.color}`}
      />
      <button
        onClick={onToggle}
        title={unconfigured ? "Click to set ion asset ID + enable" : enabled ? "Hide layer" : "Show layer"}
        className={`p-1 rounded ${enabled ? "text-fuchsia-200" : "text-white/50 hover:text-white"}`}
      >
        {enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium truncate">{entry.name}</div>
        <div className={`text-[9px] truncate ${status === "error" && enabled ? "text-red-300" : "text-white/45"}`}>
          {unconfigured
            ? "Needs your ion asset ID · click key"
            : status === "error" && enabled
              ? validation.error
              : (entry.description ?? `ion asset ${effectiveAssetId}`)}
        </div>
      </div>
      {onValidate && !unconfigured && (
        <button
          onClick={onValidate}
          title={status === "ok" ? "Re-validate asset ID" : "Validate asset ID against Cesium ion"}
          className="p-1 rounded text-white/40 hover:text-emerald-300 hover:bg-white/5"
        >
          {status === "checking" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : status === "ok" ? (
            <Check className="w-3.5 h-3.5 text-emerald-300" />
          ) : status === "error" ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-300" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      )}
      {onSetAssetId && (
        <button
          onClick={onSetAssetId}
          title={assetIdOverride ? `ion asset ${assetIdOverride} · edit` : "Set ion asset ID"}
          className={`p-1 rounded hover:bg-white/5 ${
            unconfigured ? "text-amber-300 animate-pulse" : "text-white/40 hover:text-fuchsia-300"
          }`}
        >
          <Key className="w-3.5 h-3.5" />
        </button>
      )}
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