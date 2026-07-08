/**
 * BuildingCard
 * ------------
 * Glassmorphic detail widget for a selected OSM building. Follows the
 * project's POICardWidget aesthetic (dark panel, 001 tabular-nums, small
 * pill controls). Handles:
 *   - Address / coordinates / name / kind / floors / footprint / population
 *   - Live color swatches + hex input (writes through to Cesium tileset)
 *   - Tag + notes
 *   - Publish toggle (per-record public flag)
 *   - GLB upload to replace the OSM geometry with the user's own 3D model
 *   - Compact ledger history
 *
 * The card operates on either a picked-but-unsaved building (PickedBuilding)
 * or a fully saved BuildingCardRecord, depending on which is available.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Palette,
  Tag as TagIcon,
  StickyNote,
  Upload,
  Globe as GlobeIcon,
  Lock,
  X,
  Users,
  Ruler,
  Layers as LayersIcon,
  Trash2,
  MapPin,
  History,
  CheckSquare,
  Square,
  Move3D,
} from "lucide-react";
import type {
  BuildingCardRecord,
  BuildingLedgerEntry,
  PickedBuilding,
} from "@/types/BuildingCardRecord";
import { estimatePopulation } from "@/types/BuildingCardRecord";

const SWATCHES = [
  "#22d3ee",
  "#34d399",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#6366f1",
  "#ffffff",
  "#111827",
];

export interface BuildingCardProps {
  picked: PickedBuilding;
  record: BuildingCardRecord | null;
  multiSelectCount: number;
  onClose: () => void;
  onColor: (osmId: string, hex: string | null) => Promise<void> | void;
  onTag: (osmId: string, tag: string) => Promise<void> | void;
  onNotes: (osmId: string, notes: string) => Promise<void> | void;
  onTogglePublish: (osmId: string, isPublic: boolean) => Promise<void> | void;
  onUploadModel: (osmId: string, file: File) => Promise<void> | void;
  onClearModel: (osmId: string) => Promise<void> | void;
  onApplyColorToSelection?: (hex: string | null) => Promise<void> | void;
  onOpenModelControls?: (osmId: string) => void;
  loadLedger: (recordId: string) => Promise<BuildingLedgerEntry[]>;
}

export default function BuildingCard({
  picked,
  record,
  multiSelectCount,
  onClose,
  onColor,
  onTag,
  onNotes,
  onTogglePublish,
  onUploadModel,
  onClearModel,
  onApplyColorToSelection,
  onOpenModelControls,
  loadLedger,
}: BuildingCardProps) {
  const [tagDraft, setTagDraft] = useState(record?.tag ?? "");
  const [notesDraft, setNotesDraft] = useState(record?.notes ?? "");
  const [colorDraft, setColorDraft] = useState(record?.color ?? "");
  const [uploading, setUploading] = useState(false);
  const [ledger, setLedger] = useState<BuildingLedgerEntry[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reload drafts when record identity changes (i.e. user picked another building)
  useEffect(() => {
    setTagDraft(record?.tag ?? "");
    setNotesDraft(record?.notes ?? "");
    setColorDraft(record?.color ?? "");
    setLedger([]);
    setShowLedger(false);
  }, [record?.id]);

  useEffect(() => {
    if (!showLedger || !record?.id) return;
    let cancelled = false;
    loadLedger(record.id).then((rows) => {
      if (!cancelled) setLedger(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [showLedger, record?.id, loadLedger]);

  const population = useMemo(() => {
    if (record?.est_population != null) return record.est_population;
    return estimatePopulation({
      levels: picked.levels,
      footprint_m2: picked.footprint_m2,
      building_kind: picked.building_kind,
    });
  }, [record, picked]);

  const displayName =
    record?.name ?? picked.name ?? (picked.building_kind ? capitalize(picked.building_kind) : "Building");
  const address = record?.address ?? picked.address ?? "Address unknown";
  const kind = record?.building_kind ?? picked.building_kind ?? "building";
  const levels = record?.levels ?? picked.levels ?? null;
  const footprint = record?.footprint_m2 ?? picked.footprint_m2 ?? null;

  const applyColor = async (hex: string | null) => {
    setColorDraft(hex ?? "");
    await onColor(picked.osm_id, hex);
    if (multiSelectCount > 1 && onApplyColorToSelection) {
      await onApplyColorToSelection(hex);
    }
  };

  return (
    <div
      data-draggable-window
      className="pointer-events-auto fixed right-4 top-20 z-30 w-[340px] max-h-[calc(100vh-140px)] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/85 backdrop-blur-xl shadow-2xl text-white flex flex-col"
      style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <header data-drag-handle className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06] cursor-move select-none">
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: (record?.color ?? "#22d3ee") + "22", color: record?.color ?? "#22d3ee" }}
        >
          <Building2 className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{displayName}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/60 truncate">
            {kind} · {picked.osm_id}
          </div>
        </div>
        {multiSelectCount > 1 && (
          <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono">
            <CheckSquare className="w-3 h-3" /> {multiSelectCount}
          </div>
        )}
        <button onClick={onClose} className="ml-1 rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="overflow-y-auto flex-1 divide-y divide-white/[0.05]">
        {/* Address + coordinates */}
        <section className="px-3 py-2.5 space-y-1.5">
          <div className="flex items-start gap-2 text-xs text-white/85">
            <MapPin className="w-3.5 h-3.5 mt-0.5 text-white/60 shrink-0" />
            <span className="leading-snug">{address}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-white/70 font-mono tabular-nums">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-white/50">Lat</div>
              <div>{picked.lat.toFixed(6)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-white/50">Lng</div>
              <div>{picked.lng.toFixed(6)}</div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="px-3 py-2.5 grid grid-cols-3 gap-2 text-center">
          <StatCell icon={<LayersIcon className="w-3 h-3" />} label="Floors" value={levels != null ? String(levels) : "—"} />
          <StatCell
            icon={<Ruler className="w-3 h-3" />}
            label="Footprint"
            value={footprint != null ? `${Math.round(footprint)} m²` : "—"}
          />
          <StatCell
            icon={<Users className="w-3 h-3" />}
            label="Est. Residents"
            value={population > 0 ? String(population) : "—"}
            sub={
              picked.population_source === "us-census-2020"
                ? "US Census 2020"
                : picked.population_source === "worldpop-2020"
                ? "WorldPop 2020"
                : picked.population_source === "ghsl-2023"
                ? "GHSL 2023"
                : picked.population_source === "heuristic"
                ? "Heuristic"
                : picked.population_source === "unavailable"
                ? "No data"
                : undefined
            }
            title={picked.population_note ?? undefined}
          />
        </section>

        {/* Color */}
        <section className="px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/60">
            <Palette className="w-3 h-3" /> Color
            {multiSelectCount > 1 && (
              <span className="ml-auto text-[9px] text-cyan-300">Applies to {multiSelectCount} buildings</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                onClick={() => applyColor(hex)}
                className="h-6 w-6 rounded-md border border-white/10 hover:scale-110 transition-transform"
                style={{
                  background: hex,
                  boxShadow: colorDraft === hex ? "0 0 0 2px #22d3ee" : undefined,
                }}
                title={hex}
              />
            ))}
            <button
              onClick={() => applyColor(null)}
              className="h-6 w-6 rounded-md border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
              title="Reset color"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={colorDraft}
              onChange={(e) => setColorDraft(e.target.value)}
              onBlur={() => colorDraft && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorDraft) && applyColor(colorDraft)}
              placeholder="#22d3ee"
              className="flex-1 h-7 rounded-md bg-white/5 border border-white/10 px-2 text-xs font-mono placeholder:text-white/30 focus:outline-none focus:border-cyan-400/60"
            />
          </div>
        </section>

        {/* Tag */}
        <section className="px-3 py-2.5 space-y-1.5">
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/60">
            <TagIcon className="w-3 h-3" /> Tag
          </label>
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onBlur={() => tagDraft !== (record?.tag ?? "") && onTag(picked.osm_id, tagDraft)}
            placeholder="e.g. HQ, Warehouse, Client site"
            className="w-full h-7 rounded-md bg-white/5 border border-white/10 px-2 text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400/60"
          />
        </section>

        {/* Notes */}
        <section className="px-3 py-2.5 space-y-1.5">
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/60">
            <StickyNote className="w-3 h-3" /> Notes
          </label>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => notesDraft !== (record?.notes ?? "") && onNotes(picked.osm_id, notesDraft)}
            placeholder="Anything worth remembering about this building…"
            rows={3}
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400/60 resize-none"
          />
        </section>

        {/* Replacement 3D model */}
        <section className="px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/60">
            <Upload className="w-3 h-3" /> Replacement Model
          </div>
          {record?.replacement_glb_url ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-1.5 text-[11px] text-emerald-200">
                <div className="flex-1 truncate">Loaded — OSM geometry hidden</div>
                <button
                  onClick={() => onClearModel(picked.osm_id)}
                  className="rounded p-1 hover:bg-white/10 text-white/70 hover:text-white"
                  title="Remove replacement"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={() => onOpenModelControls?.(picked.osm_id)}
                className="w-full h-8 rounded-md bg-cyan-500/15 border border-cyan-400/40 text-[11px] text-cyan-100 hover:bg-cyan-500/25 flex items-center justify-center gap-1.5"
              >
                <Move3D className="w-3 h-3" /> Open 3D Controllers
              </button>
            </div>
          ) : (
            <button
              disabled={!record || uploading}
              onClick={() => fileRef.current?.click()}
              className="w-full h-8 rounded-md bg-white/5 border border-dashed border-white/20 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading…" : record ? "Upload .glb / .gltf" : "Select a building first"}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              try {
                await onUploadModel(picked.osm_id, file);
              } finally {
                setUploading(false);
              }
            }}
          />
        </section>

        {/* Publish */}
        <section className="px-3 py-2.5 flex items-center gap-2">
          <button
            disabled={!record}
            onClick={() => record && onTogglePublish(picked.osm_id, !record.is_public)}
            className="flex items-center gap-2 rounded-md bg-white/5 border border-white/10 px-2.5 py-1.5 text-[11px] text-white/85 hover:bg-white/10 disabled:opacity-40"
          >
            {record?.is_public ? <GlobeIcon className="w-3 h-3 text-cyan-300" /> : <Lock className="w-3 h-3" />}
            {record?.is_public ? "Public" : "Private"}
          </button>
          <button
            disabled={!record}
            onClick={() => setShowLedger((v) => !v)}
            className="ml-auto flex items-center gap-1.5 text-[10px] text-white/60 hover:text-white disabled:opacity-40"
          >
            <History className="w-3 h-3" /> {showLedger ? "Hide ledger" : "Show ledger"}
          </button>
        </section>

        {/* Ledger */}
        {showLedger && (
          <section className="px-3 py-2.5 space-y-1.5 max-h-48 overflow-y-auto">
            {ledger.length === 0 ? (
              <div className="text-[11px] text-white/50 italic">No history yet.</div>
            ) : (
              ledger.map((entry) => (
                <div key={entry.id} className="rounded-md bg-white/[0.03] border border-white/[0.05] px-2 py-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/60">
                    <span>{entry.kind}</span>
                    <span className="font-mono">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  {entry.message && <div className="text-[11px] text-white/85 mt-0.5">{entry.message}</div>}
                </div>
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  sub,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  title?: string;
}) {
  return (
    <div
      className="rounded-md bg-white/[0.03] border border-white/[0.05] px-2 py-1.5"
      title={title}
    >
      <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-white/60">
        {icon} {label}
      </div>
      <div className="text-xs text-white font-mono tabular-nums mt-0.5">{value}</div>
      {sub && (
        <div className="text-[8px] uppercase tracking-wider text-cyan-300/80 mt-0.5 truncate">
          {sub}
        </div>
      )}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Re-export for shorthand
export { Square };