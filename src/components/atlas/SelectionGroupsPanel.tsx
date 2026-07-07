/**
 * SelectionGroupsPanel
 * --------------------
 * Stacked list of saved OSM building selection groups. Each group has:
 *   - a color swatch (drag-to-recolor via the picker) that doubles as
 *     the "apply this color to every building in the group" action
 *   - a name (click to rename inline)
 *   - a count and a "make active" chip
 *   - a menu: Publish / Unpublish, Export GeoJSON, Delete
 *
 * The active group is the target of the marquee + click-toggle in the
 * overlay. Only one group is active at a time.
 */
import { useState } from "react";
import { Plus, Palette, Trash2, Download, Eye, EyeOff, Check, MapPin } from "lucide-react";
import type { BuildingSelectionGroup } from "@/types/BuildingSelectionGroup";
import type { BuildingCardRecord } from "@/types/BuildingCardRecord";
import { exportGroupAsGeoJson, downloadGeoJson } from "@/lib/buildingsGeoJson";
import { toast } from "sonner";

interface Props {
  groups: BuildingSelectionGroup[];
  activeId: string | null;
  records: Record<string, BuildingCardRecord>;
  onSetActive: (id: string | null) => void;
  onCreate: (name?: string) => Promise<BuildingSelectionGroup | null>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onTogglePublic: (id: string, isPublic: boolean) => void;
  onDelete: (id: string) => void;
  /** Push the group's color onto every one of its buildings on the globe. */
  onApplyColorToGroup: (id: string) => void;
  onFlyToGroup: (id: string) => void;
}

export default function SelectionGroupsPanel({
  groups,
  activeId,
  records,
  onSetActive,
  onCreate,
  onRename,
  onRecolor,
  onTogglePublic,
  onDelete,
  onApplyColorToGroup,
  onFlyToGroup,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startRename = (g: BuildingSelectionGroup) => {
    setRenamingId(g.id);
    setDraftName(g.name);
  };

  const commitRename = (id: string) => {
    const n = draftName.trim();
    if (n) onRename(id, n);
    setRenamingId(null);
  };

  const exportGroup = async (g: BuildingSelectionGroup) => {
    toast.info(`Exporting ${g.osm_ids.length} building${g.osm_ids.length === 1 ? "" : "s"}…`);
    try {
      const fc = await exportGroupAsGeoJson(g.osm_ids, records);
      downloadGeoJson(fc, `${g.name.replace(/[^\w-]+/g, "_")}.geojson`);
      toast.success(`Exported ${fc.features.length} feature${fc.features.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/60">
          <MapPin className="w-3.5 h-3.5" />
          Selection Groups
        </div>
        <button
          onClick={() => onCreate()}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] text-white"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="px-3 py-6 text-center text-[11px] text-white/50 space-y-1">
          <div>No groups yet.</div>
          <div className="text-white/40">
            Drag a marquee over buildings — a group is auto-created and the drag adds to it.
          </div>
        </div>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-white/5">
          {groups.map((g) => {
            const isActive = g.id === activeId;
            return (
              <li
                key={g.id}
                className={`px-2 py-2 flex items-center gap-2 text-white text-xs ${
                  isActive ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                {/* Color swatch = doubles as a color picker. */}
                <label
                  className="relative w-6 h-6 rounded-md border border-white/30 shrink-0 cursor-pointer"
                  style={{ background: g.color }}
                  title="Change group color"
                >
                  <input
                    type="color"
                    value={g.color}
                    onChange={(e) => onRecolor(g.id, e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>

                <div className="flex-1 min-w-0">
                  {renamingId === g.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(g.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(g.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full bg-black/60 border border-white/20 rounded px-1.5 py-0.5 text-xs"
                    />
                  ) : (
                    <button
                      onClick={() => startRename(g)}
                      className="text-left w-full truncate hover:text-cyan-200"
                      title="Rename"
                    >
                      {g.name}
                    </button>
                  )}
                  <div className="text-[10px] text-white/50 tabular-nums">
                    {g.osm_ids.length} building{g.osm_ids.length === 1 ? "" : "s"}
                    {g.is_public && <span className="ml-1.5 text-emerald-300">· public</span>}
                  </div>
                </div>

                {/* Make-active */}
                <button
                  onClick={() => onSetActive(isActive ? null : g.id)}
                  className={`w-6 h-6 rounded-md flex items-center justify-center border ${
                    isActive
                      ? "bg-cyan-500/40 border-cyan-300 text-cyan-100"
                      : "border-white/20 text-white/60 hover:text-white"
                  }`}
                  title={isActive ? "Active — selections add here" : "Make active"}
                >
                  <Check className="w-3 h-3" />
                </button>

                {/* Actions cluster */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => onApplyColorToGroup(g.id)}
                    disabled={g.osm_ids.length === 0}
                    className="w-6 h-6 rounded-md hover:bg-white/10 disabled:opacity-40 flex items-center justify-center"
                    title="Paint every building in this group"
                  >
                    <Palette className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onFlyToGroup(g.id)}
                    disabled={g.osm_ids.length === 0}
                    className="w-6 h-6 rounded-md hover:bg-white/10 disabled:opacity-40 flex items-center justify-center"
                    title="Fly to group"
                  >
                    <MapPin className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => exportGroup(g)}
                    disabled={g.osm_ids.length === 0}
                    className="w-6 h-6 rounded-md hover:bg-white/10 disabled:opacity-40 flex items-center justify-center"
                    title="Export as GeoJSON"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onTogglePublic(g.id, !g.is_public)}
                    className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center"
                    title={g.is_public ? "Make private" : "Publish"}
                  >
                    {g.is_public ? (
                      <Eye className="w-3 h-3 text-emerald-300" />
                    ) : (
                      <EyeOff className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${g.name}"? Buildings themselves stay untouched.`)) {
                        onDelete(g.id);
                      }
                    }}
                    className="w-6 h-6 rounded-md hover:bg-rose-500/30 text-rose-300 flex items-center justify-center"
                    title="Delete group"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-white/40 leading-relaxed">
        Marquee = ⌘/Shift-drag. Hold Shift to add, Alt to subtract.
      </div>
    </div>
  );
}