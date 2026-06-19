import { useMemo, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Upload, Check } from "lucide-react";
import { GLTFLoader, FBXLoader } from "three-stdlib";
import type { AnimationClip } from "three";
import { toast } from "sonner";
import {
  CHARACTER_ANIMATION_LIBRARY,
  CLIP_CATEGORIES,
  inferUploadedCategory,
  type CharacterClipEntry,
  type ClipCategory,
} from "@/lib/characterAnimationLibrary";
import ClipPreviewTile from "./ClipPreviewTile";

/**
 * Full-screen modal grid for picking a character animation clip.
 *
 * - Search + category filters.
 * - Live preview per tile (cheap, intersection-gated).
 * - Upload .glb to fill matching slots with user-supplied clips.
 * - "Apply" emits the resolved clip name + optional source url back to the
 *   editor, which writes them onto the selected character.
 */
export default function CharacterAnimationGallery({
  open,
  onOpenChange,
  currentClip,
  extraEntries,
  onApply,
  onUserClipsParsed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentClip?: string;
  /** User-uploaded clips that came in via previous uploads (persisted by parent). */
  extraEntries?: CharacterClipEntry[];
  /** Called with the resolved entry the user picked. */
  onApply: (entry: CharacterClipEntry) => void;
  /** Called with NEW entries parsed out of an uploaded .glb (slot fills + new user clips). */
  onUserClipsParsed?: (entries: CharacterClipEntry[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ClipCategory | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const allEntries = useMemo(
    () => [...(extraEntries ?? []), ...CHARACTER_ANIMATION_LIBRARY],
    [extraEntries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEntries.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [allEntries, category, query]);

  const apply = (entry: CharacterClipEntry) => {
    onApply(entry);
    onOpenChange(false);
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newEntries: CharacterClipEntry[] = [];
    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();
    try {
      for (const file of Array.from(files)) {
        const isGltf = /\.(glb|gltf)$/i.test(file.name);
        const isFbx  = /\.fbx$/i.test(file.name);
        if (!isGltf && !isFbx) {
          toast.warning(`Skipped ${file.name} — unsupported format`);
          continue;
        }
        const url = URL.createObjectURL(file);
        let clips: AnimationClip[] = [];
        try {
          if (isGltf) {
            const gltf = await gltfLoader.loadAsync(url);
            clips = gltf.animations ?? [];
          } else {
            // FBX loader returns a Group with `.animations` populated. We
            // keep the same blob URL so the runtime can re-parse the file
            // to pull the skinned mesh + clip together.
            const group = await fbxLoader.loadAsync(url);
            clips = (group as any).animations ?? [];
          }
        } catch (e) {
          console.error("[clip-upload] parse failed for", file.name, e);
          toast.error(`Could not parse ${file.name}`);
          continue;
        }
        for (const clip of clips) {
          const category = inferUploadedCategory(clip.name);
          newEntries.push({
            id: `user-${Math.random().toString(36).slice(2, 9)}`,
            name: clip.name || file.name,
            category,
            tags: [category, "user", isFbx ? "fbx" : "glb"],
            source: "user",
            url,
            clipName: clip.name,
            loop: true,
          });
        }
      }
      if (newEntries.length === 0) {
        toast.warning("No animation clips found in uploaded file(s)");
      } else {
        toast.success(`Added ${newEntries.length} clip${newEntries.length === 1 ? "" : "s"}`);
        onUserClipsParsed?.(newEntries);
      }
    } catch (err) {
      console.error("[clip-upload]", err);
      toast.error("Failed to read upload — see console");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border/40">
          <DialogTitle className="text-base">Character animation library</DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {allEntries.length} clips · search, filter, or upload your own .glb
          </p>
        </DialogHeader>

        <div className="flex items-center gap-2 px-5 py-2 border-b border-border/40">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clips, tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".glb,.gltf,.fbx"
            multiple
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px]"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 mr-1" />
            {uploading ? "Reading…" : "Upload .glb / .fbx"}
          </Button>
        </div>

        <div className="flex items-center gap-1 px-5 py-2 border-b border-border/40 overflow-x-auto">
          <CategoryPill active={category === "all"} onClick={() => setCategory("all")}>
            All
          </CategoryPill>
          {CLIP_CATEGORIES.map((c) => (
            <CategoryPill
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </CategoryPill>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-12">
              No clips match your filters.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {filtered.map((e) => {
                const isSelected = selected === e.id || (!selected && currentClip === e.clipName);
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e.id)}
                    onDoubleClick={() => apply(e)}
                    className={`group text-left flex flex-col gap-1 rounded-lg p-1.5 transition-all ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/10"
                        : "ring-1 ring-border/30 hover:ring-border bg-card/40"
                    }`}
                  >
                    <ClipPreviewTile entry={e} />
                    <div className="flex items-center gap-1 px-1 pt-0.5">
                      <p className="text-[11px] font-medium flex-1 truncate">{e.name}</p>
                      {e.source === "user" && (
                        <span className="text-[8px] text-emerald-400 uppercase">user</span>
                      )}
                      {e.source === "builtin" && (
                        <span className="text-[8px] text-sky-400 uppercase">built-in</span>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground px-1 truncate">
                      {e.tags.slice(0, 3).join(" · ")}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border/40">
          <p className="text-[10px] text-muted-foreground">
            Double-click a tile to apply, or pick + Apply.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selected}
              onClick={() => {
                const e = allEntries.find((x) => x.id === selected);
                if (e) apply(e);
              }}
            >
              <Check className="w-3.5 h-3.5 mr-1" /> Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 rounded-full text-[11px] whitespace-nowrap transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-card"
      }`}
    >
      {children}
    </button>
  );
}