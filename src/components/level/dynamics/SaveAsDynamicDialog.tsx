import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Save, Globe2, HardDrive } from "lucide-react";
import { toast } from "sonner";
import type { SceneObject, ScenePath, SceneGroup } from "@/lib/levelTypes";
import {
  packPayload,
  saveDynamicLocal,
  saveDynamicCloud,
  type DynamicObjectScope,
} from "@/lib/dynamicObjects";

/**
 * "Save as Dynamic Object" dialog.
 *
 * The dialog auto-detects whether the user can save a single object, a whole
 * group, or either — and lets them pick when both are possible.
 */
export default function SaveAsDynamicDialog({
  open, onOpenChange,
  selectedObject,
  selectedGroup,
  groupMembers,
  allPaths,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Currently focused single object (drives the "single" option). */
  selectedObject: SceneObject | null;
  /** Group the selection belongs to, if any. */
  selectedGroup: SceneGroup | null;
  /** Resolved member objects for `selectedGroup`. */
  groupMembers: SceneObject[];
  allPaths: ScenePath[];
}) {
  const canSingle = !!selectedObject;
  const canGroup = !!selectedGroup && groupMembers.length > 1;
  const [scope, setScope] = useState<DynamicObjectScope>(canGroup ? "group" : "single");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tags, setTags] = useState("");
  const [saveLocal, setSaveLocal] = useState(true);
  const [saveCloud, setSaveCloud] = useState(false);
  const [makePublic, setMakePublic] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope(canGroup ? "group" : "single");
    setName(
      canGroup
        ? (selectedGroup?.name ?? "Group preset")
        : (selectedObject?.name ?? "Object preset"),
    );
    setDesc("");
    setTags("");
  }, [open, canGroup, selectedGroup, selectedObject]);

  const handleSave = async () => {
    if (!saveLocal && !saveCloud) {
      toast.error("Pick at least one destination.");
      return;
    }
    const useGroup = scope === "group" && canGroup;
    const objects = useGroup ? groupMembers : selectedObject ? [selectedObject] : [];
    if (objects.length === 0) { toast.error("Nothing selected."); return; }
    setBusy(true);
    try {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const payload = packPayload(
        useGroup ? "group" : "single",
        objects,
        allPaths,
        useGroup ? selectedGroup?.name : undefined,
      );
      const cleanName = name.trim() || "Untitled dynamic";
      if (saveLocal) {
        saveDynamicLocal({ name: cleanName, description: desc, tags: tagList, payload });
      }
      if (saveCloud) {
        await saveDynamicCloud({
          name: cleanName, description: desc, tags: tagList,
          isPublic: makePublic, payload,
        });
      }
      toast.success(`Saved "${cleanName}"`);
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-4 h-4" /> Save as Dynamic Object
          </DialogTitle>
        </DialogHeader>

        {canSingle && canGroup && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setScope("single")}
              className={`text-left px-3 py-2 rounded-md border text-xs ${scope === "single" ? "border-primary bg-primary/10" : "border-border/40 bg-card/60"}`}
            >
              <p className="font-medium">Single object</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{selectedObject?.name}</p>
            </button>
            <button
              onClick={() => setScope("group")}
              className={`text-left px-3 py-2 rounded-md border text-xs ${scope === "group" ? "border-primary bg-primary/10" : "border-border/40 bg-card/60"}`}
            >
              <p className="font-medium">Whole group</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{groupMembers.length} members</p>
            </button>
          </div>
        )}

        <div className="space-y-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="text-xs" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tags (comma separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. props, sci-fi, interactive" className="h-8 text-xs" />
          </div>
        </div>

        <div className="border-t border-border/40 pt-3 space-y-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Destinations</Label>
          <label className="flex items-center justify-between px-2 py-1.5 rounded border border-border/40">
            <span className="flex items-center gap-2 text-xs"><HardDrive className="w-3.5 h-3.5" /> Save to this browser</span>
            <Switch checked={saveLocal} onCheckedChange={setSaveLocal} />
          </label>
          <label className="flex items-center justify-between px-2 py-1.5 rounded border border-border/40">
            <span className="flex items-center gap-2 text-xs"><Globe2 className="w-3.5 h-3.5" /> Save to my cloud library</span>
            <Switch checked={saveCloud} onCheckedChange={setSaveCloud} />
          </label>
          {saveCloud && (
            <label className="flex items-center justify-between px-2 py-1.5 rounded border border-primary/30 bg-primary/5">
              <span className="text-xs">Share publicly</span>
              <Switch checked={makePublic} onCheckedChange={setMakePublic} />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            <Save className="w-3.5 h-3.5 mr-1" /> {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}