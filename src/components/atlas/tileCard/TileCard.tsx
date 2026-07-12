import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Save, Loader2, Globe2, Lock, Tag as TagIcon, Link2, ExternalLink } from "lucide-react";
import {
  INDICATOR_PRESETS,
  TOMOGRAPHY_MODELS,
  fetchTileCard,
  upsertTileCard,
  type TileCardRecord,
  type TileIndicator,
  type TileIndicatorKind,
  type TomographyModel,
} from "@/lib/tileCards";
import { toast } from "sonner";

export interface TileCardTarget {
  z: number;
  x: number;
  y: number;
  center: { lat: number; lng: number };
  bounds: { north: number; south: number; east: number; west: number };
}

/**
 * TileCard — per-tile widget. User can attach indicator chips
 * (topography, tomography, geology, seismic, hypocenters, custom
 * datasets, …) that persist to `tile_cards` scoped by (z,x,y,owner).
 */
export default function TileCard({
  target,
  onClose,
}: {
  target: TileCardTarget;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<TileCardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [indicators, setIndicators] = useState<TileIndicator[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetchTileCard(target.z, target.x, target.y)
      .then((r) => {
        if (cancel) return;
        setRecord(r);
        setTitle(r?.title ?? "");
        setNotes(r?.notes ?? "");
        setIndicators(r?.indicators ?? []);
        setTags(r?.tags ?? []);
        setIsPublic(r?.is_public ?? false);
      })
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [target.z, target.x, target.y]);

  const areaKm2 = useMemo(() => {
    const { north, south, east, west } = target.bounds;
    const R = 6371;
    const dLat = ((north - south) * Math.PI) / 180;
    const dLng = ((east - west) * Math.PI) / 180;
    const midLat = ((north + south) / 2 * Math.PI) / 180;
    const h = R * dLat;
    const w = R * dLng * Math.cos(midLat);
    return Math.abs(h * w);
  }, [target.bounds]);

  function addIndicator(preset: (typeof INDICATOR_PRESETS)[number]) {
    const id = `${preset.kind}-${Date.now().toString(36)}`;
    setIndicators((cur) => [
      ...cur,
      { id, kind: preset.kind, label: preset.label, color: preset.color, source: preset.source, unit: preset.unit },
    ]);
    setPickerOpen(false);
  }

  function addTomographyModel(model: TomographyModel) {
    const id = `tomography-${model.id}-${Date.now().toString(36)}`;
    setIndicators((cur) => [
      ...cur,
      {
        id,
        kind: "tomography",
        label: `${model.name} · ${model.hub}`,
        color: model.color,
        source: `${model.authors} (${model.year}) — ${model.reference}`,
        url: model.landingUrl,
        unit: "δVs %",
        meta: {
          hub: model.hub,
          modelId: model.id,
          parameter: model.parameter,
          depthRangeKm: model.depthRangeKm,
          parameterization: model.parameterization,
          thumbUrl: model.thumbUrl,
        },
      },
    ]);
    setPickerOpen(false);
  }

  function removeIndicator(id: string) {
    setIndicators((cur) => cur.filter((i) => i.id !== id));
  }

  function updateIndicatorValue(id: string, value: string) {
    setIndicators((cur) =>
      cur.map((i) => (i.id === id ? { ...i, value } : i)),
    );
  }

  function addTag() {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await upsertTileCard({
        z: target.z, x: target.x, y: target.y,
        title: title || null,
        notes: notes || null,
        center_lat: target.center.lat,
        center_lng: target.center.lng,
        indicators,
        tags,
        is_public: isPublic,
      });
      setRecord(saved);
      toast.success("Tile card saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save tile card");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pointer-events-auto w-[320px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/10 bg-black/80 backdrop-blur-2xl text-white">
      {/* header */}
      <div className="flex items-start justify-between gap-2 border-b border-white/10 bg-gradient-to-br from-violet-500/20 via-transparent to-cyan-500/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-[0.32em] text-violet-200/80">
            Tile card · z{target.z}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-sm tabular-nums text-white">
            <span className="text-white/50">x</span>{target.x}
            <span className="text-white/30">/</span>
            <span className="text-white/50">y</span>{target.y}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled tile"
            className="mt-1.5 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none"
          />
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-white/10 bg-white/5 p-1 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close tile card"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-6 text-[11px] text-white/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tile card…
        </div>
      ) : (
        <div className="max-h-[65vh] overflow-y-auto">
          {/* quick stats */}
          <div className="grid grid-cols-3 gap-1 px-3 py-2">
            <Stat label="Lat" value={target.center.lat.toFixed(3)} />
            <Stat label="Lng" value={target.center.lng.toFixed(3)} />
            <Stat label="Area" value={`${areaKm2.toFixed(2)} km²`} />
          </div>

          {/* indicators */}
          <div className="px-3 pb-2">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.28em] text-white/45">
                Attached indicators
              </div>
              <button
                onClick={() => setPickerOpen((p) => !p)}
                className="flex items-center gap-1 rounded-md border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-violet-100 hover:bg-violet-500/25"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>

            {pickerOpen && (
              <div className="mb-2 grid grid-cols-1 gap-1 rounded-lg border border-white/10 bg-black/60 p-1.5">
                {INDICATOR_PRESETS.map((p, i) => (
                  <button
                    key={`${p.kind}-${i}`}
                    onClick={() => addIndicator(p)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-white/85 hover:bg-white/5"
                  >
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }}
                    />
                    <span className="flex-1 truncate">{p.label}</span>
                    {p.unit && (
                      <span className="text-[9px] uppercase tracking-widest text-white/40">
                        {p.unit}
                      </span>
                    )}
                  </button>
                ))}

                {/* Real tomography model catalog with thumbnails + metadata */}
                <div className="mt-1.5 border-t border-white/10 pt-1.5">
                  <div className="px-1.5 pb-1 text-[9px] uppercase tracking-[0.28em] text-white/40">
                    Tomography models · real data
                  </div>
                  <div className="flex flex-col gap-1">
                    {TOMOGRAPHY_MODELS.map((m) => (
                      <TomographyModelRow
                        key={m.id}
                        model={m}
                        onAdd={() => addTomographyModel(m)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {indicators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-3 text-center text-[10px] text-white/40">
                No indicators attached. Add topography, tomography, geology, seismic
                overlays, or custom datasets.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {indicators.map((ind) => (
                  <div
                    key={ind.id}
                    className="group rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5"
                    style={{ borderLeftColor: ind.color, borderLeftWidth: 3 }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-[11px] font-semibold text-white/90">
                        {ind.label}
                      </span>
                      <span className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-white/50">
                        {ind.kind}
                      </span>
                      <button
                        onClick={() => removeIndicator(ind.id)}
                        className="opacity-40 hover:text-red-400 hover:opacity-100"
                        aria-label="Remove indicator"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={String(ind.value ?? "")}
                        onChange={(e) => updateIndicatorValue(ind.id, e.target.value)}
                        placeholder={ind.unit ? `value (${ind.unit})` : "value / reading"}
                        className="flex-1 rounded border border-white/5 bg-black/40 px-1.5 py-0.5 text-[10px] text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
                      />
                      {ind.source && (
                        <span className="truncate text-[9px] text-white/40">{ind.source}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* notes */}
          <div className="px-3 pb-2">
            <div className="mb-1 text-[9px] uppercase tracking-[0.28em] text-white/45">Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observations, hazard notes, references…"
              className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/90 placeholder:text-white/30 focus:border-white/25 focus:outline-none"
            />
          </div>

          {/* tags */}
          <div className="px-3 pb-2">
            <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.28em] text-white/45">
              <TagIcon className="h-2.5 w-2.5" /> Tags
            </div>
            <div className="mb-1 flex flex-wrap gap-1">
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100 hover:border-red-400/40 hover:text-red-100"
                >
                  #{t}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="add tag…"
                className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
              />
              <button
                onClick={addTag}
                className="rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-white/70 hover:bg-white/10"
              >
                +
              </button>
            </div>
          </div>

          {/* footer / actions */}
          <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/50 px-3 py-2">
            <button
              onClick={() => setIsPublic((p) => !p)}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] uppercase tracking-widest transition ${
                isPublic
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/5 text-white/60"
              }`}
              title={isPublic ? "Public — anyone can view" : "Private — only you"}
            >
              {isPublic ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {isPublic ? "Public" : "Private"}
            </button>
            <div className="flex items-center gap-1.5">
              {record && isPublic && (
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/tile/${record.id}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success("Public link copied");
                    } catch {
                      toast.message(url);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-[10px] uppercase tracking-widest text-cyan-100 hover:bg-cyan-500/25"
                  title="Copy public link"
                >
                  <Link2 className="h-3 w-3" /> Copy link
                </button>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md border border-violet-400/40 bg-violet-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-violet-100 hover:bg-violet-500/30 disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {record ? "Update" : "Save"}
              </button>
            </div>
          </div>
          {record && (
            <div className="border-t border-white/5 px-3 py-1 text-center text-[9px] text-white/30">
              Last saved {new Date(record.updated_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
      <div className="text-[8px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="font-mono text-[11px] tabular-nums text-white/90">{value}</div>
    </div>
  );
}