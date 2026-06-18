import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Mountain, Sparkles } from "lucide-react";
import {
  BUILT_IN_TERRAINS,
  TerrainPreset,
  loadSavedTerrains,
  deleteSavedTerrain,
  renameSavedTerrain,
  saveTerrain,
  previewColor,
} from "@/lib/terrainLibrary";
import type { SceneTerrain } from "@/lib/levelTypes";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Current terrain (used by the "Save current" form). */
  currentTerrain?: SceneTerrain;
  onLoad: (terrain: SceneTerrain) => void;
}

export default function TerrainGallery({ open, onOpenChange, currentTerrain, onLoad }: Props) {
  const [saved, setSaved] = useState<TerrainPreset[]>([]);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"builtin" | "saved">("builtin");

  const refresh = () => setSaved(loadSavedTerrains());
  useEffect(() => { if (open) refresh(); }, [open]);

  const list = useMemo(
    () => (tab === "builtin" ? BUILT_IN_TERRAINS : saved),
    [tab, saved],
  );

  const handleSave = () => {
    if (!currentTerrain) {
      toast.error("No terrain to save. Enable terrain first.");
      return;
    }
    const entry = saveTerrain(name, currentTerrain);
    setName("");
    refresh();
    setTab("saved");
    toast.success(`Saved "${entry.name}"`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mountain className="w-4 h-4" /> Terrain gallery
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border/40 pb-2">
          <Button
            size="sm"
            variant={tab === "builtin" ? "secondary" : "ghost"}
            onClick={() => setTab("builtin")}
            className="h-7 text-xs"
          >
            <Sparkles className="w-3 h-3 mr-1" /> Presets ({BUILT_IN_TERRAINS.length})
          </Button>
          <Button
            size="sm"
            variant={tab === "saved" ? "secondary" : "ghost"}
            onClick={() => setTab("saved")}
            className="h-7 text-xs"
          >
            Saved ({saved.length})
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
          {list.length === 0 && (
            <p className="col-span-3 text-xs text-muted-foreground italic py-8 text-center">
              No saved terrains yet. Use the form below to save the current terrain.
            </p>
          )}
          {list.map((p) => (
            <div
              key={p.id}
              className="group rounded-lg border border-border/40 bg-card/60 overflow-hidden hover:border-primary/60 transition-colors"
            >
              <button
                className="w-full aspect-[4/3] relative"
                style={{ background: `linear-gradient(135deg, ${previewColor(p)} 0%, rgba(0,0,0,0.4) 100%)` }}
                onClick={() => {
                  onLoad({ ...p.terrain, enabled: true });
                  onOpenChange(false);
                  toast.success(`Loaded "${p.name}"`);
                }}
                title="Load this terrain"
              >
                <span className="absolute bottom-1 right-1 text-[9px] uppercase tracking-wider bg-black/40 text-white/90 px-1.5 py-0.5 rounded">
                  {p.terrain.source === "model" ? "Model" : p.terrain.shape}
                </span>
              </button>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                {p.builtIn ? (
                  <span className="text-[11px] font-medium truncate">{p.name}</span>
                ) : (
                  <input
                    className="text-[11px] font-medium truncate bg-transparent outline-none flex-1 min-w-0 hover:bg-white/5 rounded px-1"
                    defaultValue={p.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== p.name) {
                        renameSavedTerrain(p.id, v);
                        refresh();
                      }
                    }}
                  />
                )}
                {!p.builtIn && (
                  <button
                    onClick={() => {
                      deleteSavedTerrain(p.id);
                      refresh();
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-1"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="border-t border-border/40 pt-3">
          <div className="flex items-end gap-2 w-full">
            <div className="flex-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Save current terrain as
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My terrain"
                className="h-8 text-xs"
                disabled={!currentTerrain}
              />
            </div>
            <Button size="sm" className="h-8" onClick={handleSave} disabled={!currentTerrain}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}