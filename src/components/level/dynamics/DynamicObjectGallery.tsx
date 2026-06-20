import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Boxes, Globe2, HardDrive, User, Loader2, Plus, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { SceneObject, ScenePath } from "@/lib/levelTypes";
import FileContextMenu from "@/components/shared/FileContextMenu";
import ShareDialog from "@/components/sharing/ShareDialog";
import type { FileLike } from "@/components/shared/FileContextMenu";
import {
  loadSavedDynamics,
  deleteDynamicLocal,
  renameDynamicLocal,
  listMyCloudDynamics,
  listPublicDynamics,
  deleteDynamicCloud,
  renameDynamicCloud,
  setDynamicCloudPublic,
  instantiatePayload,
  type DynamicObjectEntry,
} from "@/lib/dynamicObjects";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** World position to anchor the spawned objects. */
  spawnAnchor: [number, number, number];
  /** Spawn handler from the editor. Receives the freshly-id'd objects. */
  onSpawn: (objs: SceneObject[], paths: ScenePath[], groupId?: string, groupName?: string) => void;
}

type Tab = "local" | "mine" | "public";

export default function DynamicObjectGallery({ open, onOpenChange, spawnAnchor, onSpawn }: Props) {
  const [tab, setTab] = useState<Tab>("local");
  const [local, setLocal] = useState<DynamicObjectEntry[]>([]);
  const [mine, setMine] = useState<DynamicObjectEntry[]>([]);
  const [pub, setPub] = useState<DynamicObjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [shareTarget, setShareTarget] = useState<FileLike | null>(null);

  const refreshLocal = () => setLocal(loadSavedDynamics());
  const refreshCloud = async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([listMyCloudDynamics(), listPublicDynamics()]);
      setMine(m);
      setPub(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    refreshLocal();
    refreshCloud();
  }, [open]);

  const list = useMemo(() => {
    const src = tab === "local" ? local : tab === "mine" ? mine : pub;
    const q = query.trim().toLowerCase();
    if (!q) return src;
    return src.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      (e.description ?? "").toLowerCase().includes(q) ||
      (e.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [tab, local, mine, pub, query]);

  const handleSpawn = (entry: DynamicObjectEntry) => {
    const { objects, paths, groupId } = instantiatePayload(entry.payload, spawnAnchor);
    onSpawn(objects, paths, groupId, entry.payload.groupName ?? entry.name);
    toast.success(`Added "${entry.name}" — ${objects.length} object${objects.length === 1 ? "" : "s"}`);
    onOpenChange(false);
  };

  const handleDelete = async (entry: DynamicObjectEntry) => {
    try {
      if (entry.source === "local") {
        deleteDynamicLocal(entry.id);
        refreshLocal();
      } else {
        await deleteDynamicCloud(entry.id);
        refreshCloud();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };

  const handleRename = async (entry: DynamicObjectEntry, name: string) => {
    if (!name.trim() || name === entry.name) return;
    try {
      if (entry.source === "local") {
        renameDynamicLocal(entry.id, name);
        refreshLocal();
      } else {
        await renameDynamicCloud(entry.id, name);
        refreshCloud();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Rename failed");
    }
  };

  const handleTogglePublic = async (entry: DynamicObjectEntry) => {
    try {
      await setDynamicCloudPublic(entry.id, !entry.isPublic);
      refreshCloud();
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-4 h-4" /> Dynamic Objects
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border/40 pb-2">
          <Button size="sm" variant={tab === "local" ? "secondary" : "ghost"} onClick={() => setTab("local")} className="h-7 text-xs">
            <HardDrive className="w-3 h-3 mr-1" /> Local ({local.length})
          </Button>
          <Button size="sm" variant={tab === "mine" ? "secondary" : "ghost"} onClick={() => setTab("mine")} className="h-7 text-xs">
            <User className="w-3 h-3 mr-1" /> My cloud ({mine.length})
          </Button>
          <Button size="sm" variant={tab === "public" ? "secondary" : "ghost"} onClick={() => setTab("public")} className="h-7 text-xs">
            <Globe2 className="w-3 h-3 mr-1" /> Public ({pub.length})
          </Button>
          <div className="flex-1" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="h-7 text-xs max-w-[200px]" />
        </div>

        <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {loading && tab !== "local" && (
            <p className="col-span-3 text-xs text-muted-foreground italic py-8 text-center flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </p>
          )}
          {!loading && list.length === 0 && (
            <p className="col-span-3 text-xs text-muted-foreground italic py-8 text-center">
              {tab === "local"
                ? "No saved Dynamic Objects yet. Select an object or group and use \"Save as Dynamic\"."
                : tab === "mine"
                  ? "Your cloud library is empty. Save one with the \"Cloud\" destination checked."
                  : "No public Dynamic Objects yet."}
            </p>
          )}
          {list.map((entry) => {
            const count = entry.payload.objects.length;
            const isGroup = entry.payload.kind === "group";
            const canEdit = entry.source === "local" || tab === "mine";
            const fileLike: FileLike = {
              kind: "dynamic-object",
              name: entry.name,
              payload: entry,
              sourceId: entry.id,
              sourceTable: entry.source === "cloud" ? "dynamic_objects" : "local",
              thumbnailUrl: entry.thumbnailUrl,
            };
            return (
              <FileContextMenu
                key={`${entry.source}-${entry.id}`}
                file={fileLike}
                onShare={(f) => setShareTarget(f)}
                onDelete={canEdit ? () => handleDelete(entry) : undefined}
                onOpen={() => handleSpawn(entry)}
              >
              <div
                className="group rounded-lg border border-border/40 bg-card/60 overflow-hidden hover:border-primary/60 transition-colors flex flex-col"
              >
                <button
                  className="w-full aspect-[4/3] relative bg-gradient-to-br from-primary/20 via-card to-card flex items-center justify-center"
                  onClick={() => handleSpawn(entry)}
                  title="Add to scene"
                  style={entry.thumbnailUrl ? { backgroundImage: `url(${entry.thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                >
                  {!entry.thumbnailUrl && <Boxes className="w-8 h-8 text-primary/40" />}
                  <span className="absolute bottom-1 right-1 text-[9px] uppercase tracking-wider bg-black/50 text-white/90 px-1.5 py-0.5 rounded">
                    {isGroup ? `group · ${count}` : entry.payload.objects[0]?.kind ?? "obj"}
                  </span>
                  {entry.isPublic && (
                    <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wider bg-emerald-500/80 text-white px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Globe2 className="w-2.5 h-2.5" /> Public
                    </span>
                  )}
                </button>
                <div className="px-2 py-1.5 flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-1">
                    {canEdit ? (
                      <input
                        defaultValue={entry.name}
                        onBlur={(e) => handleRename(entry, e.target.value)}
                        className="text-[11px] font-medium truncate bg-transparent outline-none flex-1 min-w-0 hover:bg-white/5 rounded px-1"
                      />
                    ) : (
                      <span className="text-[11px] font-medium truncate flex-1">{entry.name}</span>
                    )}
                    {tab === "mine" && (
                      <button
                        onClick={() => handleTogglePublic(entry)}
                        title={entry.isPublic ? "Unpublish" : "Publish to public catalog"}
                        className="opacity-60 hover:opacity-100"
                      >
                        {entry.isPublic ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(entry)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {entry.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] mt-auto" onClick={() => handleSpawn(entry)}>
                    <Plus className="w-3 h-3 mr-1" /> Add to scene
                  </Button>
                </div>
              </div>
              </FileContextMenu>
            );
          })}
        </div>
        <ShareDialog open={!!shareTarget} onOpenChange={(v) => !v && setShareTarget(null)} file={shareTarget} />
      </DialogContent>
    </Dialog>
  );
}