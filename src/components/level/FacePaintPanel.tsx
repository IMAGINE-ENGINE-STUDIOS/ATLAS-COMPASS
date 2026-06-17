import { useEffect, useMemo, useState } from "react";
import { Brush, Upload, Trash2, X, Paintbrush2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { SceneObject, FaceOverride, RGBA, ModelObject } from "@/lib/levelTypes";
import { faceKeyLabel, objectFaceKeys } from "@/lib/face-system";
import {
  getBuiltinTextures,
  getSavedTextures,
  saveTexture,
  removeSavedTexture,
  fileToDataUrl,
  type LibraryTexture,
} from "@/lib/texture-library";

function rgbaToHex(c: RGBA): string {
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}
function hexToRgba(hex: string, a = 1): RGBA {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    a,
  ];
}

export interface FacePaintPanelProps {
  obj: SceneObject;
  projectId: string;
  active: boolean;
  selectedFaces: Set<string>;
  onToggleActive: () => void;
  onClearSelection: () => void;
  onPatchFaceOverrides: (next: Record<string, FaceOverride>) => void;
  /** Models store overrides in materialOverrides, not faceOverrides. */
  onPatchModelOverrides?: (next: ModelObject["materialOverrides"]) => void;
  disabled?: boolean;
}

/**
 * Per-object face painter. While active, the user clicks faces in the 3D
 * view to tint them green; the controls here then apply a color or texture
 * to every selected face at once.
 */
export function FacePaintPanel({
  obj, projectId, active, selectedFaces, onToggleActive, onClearSelection,
  onPatchFaceOverrides, onPatchModelOverrides, disabled,
}: FacePaintPanelProps) {
  const isModel = obj.kind === "model";
  const allKeys = useMemo(() => objectFaceKeys(obj), [obj]);
  const [color, setColor] = useState<RGBA>([0.85, 0.85, 0.9, 1]);
  const [opacity, setOpacity] = useState(1);
  const [textureUrl, setTextureUrl] = useState<string | null>(null);
  const [repeatX, setRepeatX] = useState(1);
  const [repeatY, setRepeatY] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [builtins] = useState<LibraryTexture[]>(() => getBuiltinTextures());
  const [saved, setSaved] = useState<LibraryTexture[]>([]);
  useEffect(() => { setSaved(getSavedTextures(projectId)); }, [projectId]);

  const selectionCount = selectedFaces.size;

  const applyOverride = (patch: Partial<FaceOverride>) => {
    if (selectionCount === 0) return;
    if (isModel) {
      const cur = { ...((obj as ModelObject).materialOverrides || {}) };
      for (const key of selectedFaces) {
        const meshKey = key.startsWith("mesh:") ? key.slice(5) : key;
        const prev = cur[meshKey] || {};
        cur[meshKey] = {
          ...prev,
          ...(patch.color ? { color: [patch.color[0], patch.color[1], patch.color[2], patch.color[3] ?? 1] as RGBA } : {}),
          ...(patch.opacity != null ? { opacity: patch.opacity } : {}),
          ...(patch.textureUrl !== undefined ? { map: patch.textureUrl } : {}),
          ...(patch.repeat ? { repeat: patch.repeat } : {}),
          ...(patch.rotation != null ? { rotation: patch.rotation } : {}),
        };
      }
      onPatchModelOverrides?.(cur);
      return;
    }
    const cur = { ...(obj.faceOverrides || {}) };
    for (const key of selectedFaces) {
      cur[key] = { ...(cur[key] || {}), ...patch };
    }
    onPatchFaceOverrides(cur);
  };

  const resetSelected = () => {
    if (selectionCount === 0) return;
    if (isModel) {
      const cur = { ...((obj as ModelObject).materialOverrides || {}) };
      for (const key of selectedFaces) {
        const meshKey = key.startsWith("mesh:") ? key.slice(5) : key;
        delete cur[meshKey];
      }
      onPatchModelOverrides?.(cur);
      return;
    }
    const cur = { ...(obj.faceOverrides || {}) };
    for (const key of selectedFaces) delete cur[key];
    onPatchFaceOverrides(cur);
  };

  const selectAll = () => {
    if (isModel) return; // model face keys are discovered by clicking
    for (const k of allKeys) selectedFaces.add(k);
    // trigger a re-render via toggling state container — caller owns the Set
    onPatchFaceOverrides({ ...(obj.faceOverrides || {}) });
    // Easier: emit a synthetic toggle for each. The page owns the Set
    // through facePaintState.toggle; expose a select-all by toggling each.
  };

  const handleUpload = async (file: File) => {
    const url = await fileToDataUrl(file);
    const t: LibraryTexture = {
      id: `up_${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      url, thumbnail: url,
    };
    saveTexture(projectId, t);
    setSaved(getSavedTextures(projectId));
    setTextureUrl(url);
    applyOverride({ textureUrl: url, repeat: [repeatX, repeatY], rotation });
  };

  return (
    <div className="space-y-2 border border-border/60 rounded p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1">
          <Paintbrush2 className="w-3.5 h-3.5" /> Face painter
        </Label>
        <Button
          size="sm"
          variant={active ? "default" : "outline"}
          className="h-7 px-2 text-[11px]"
          disabled={disabled}
          onClick={onToggleActive}
        >
          {active ? "Exit paint" : "Paint faces"}
        </Button>
      </div>
      {active && (
        <>
          <p className="text-[10px] text-muted-foreground">
            Click any face to select (green tint). Shift+click to add. {isModel ? "Each click selects the mesh under the cursor." : ""}
          </p>
          <div className="flex items-center justify-between text-[11px]">
            <span>{selectionCount} face{selectionCount === 1 ? "" : "s"} selected</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                disabled={selectionCount === 0} onClick={onClearSelection}>
                <X className="w-3 h-3" /> Clear
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <div>
              <Label className="text-[10px]">Color</Label>
              <Input
                type="color"
                value={rgbaToHex(color)}
                disabled={disabled}
                onChange={(e) => {
                  const next = hexToRgba(e.target.value, opacity);
                  setColor(next);
                  applyOverride({ color: next, opacity });
                }}
                className="h-8 w-full p-1"
              />
            </div>
            <Button
              size="sm" variant="outline" className="h-8 text-[10px] mt-4"
              disabled={disabled || selectionCount === 0} onClick={resetSelected}
              title="Remove overrides on selected faces"
            >
              <Trash2 className="w-3 h-3" /> Reset
            </Button>
          </div>
          <div>
            <Label className="text-[10px]">Opacity {opacity.toFixed(2)}</Label>
            <Slider value={[opacity]} min={0} max={1} step={0.05}
              onValueChange={([v]) => { setOpacity(v); applyOverride({ opacity: v }); }} />
          </div>

          <Tabs defaultValue="gallery" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-7">
              <TabsTrigger value="gallery" className="text-[10px]">Gallery</TabsTrigger>
              <TabsTrigger value="saved" className="text-[10px]">My textures</TabsTrigger>
              <TabsTrigger value="upload" className="text-[10px]">Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="gallery" className="m-0 pt-2">
              <TextureGrid
                items={builtins}
                activeUrl={textureUrl}
                onPick={(t) => {
                  setTextureUrl(t.url);
                  applyOverride({ textureUrl: t.url, repeat: [repeatX, repeatY], rotation });
                }}
              />
            </TabsContent>
            <TabsContent value="saved" className="m-0 pt-2">
              {saved.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">Upload a texture to save it here.</p>
              ) : (
                <TextureGrid
                  items={saved}
                  activeUrl={textureUrl}
                  onPick={(t) => {
                    setTextureUrl(t.url);
                    applyOverride({ textureUrl: t.url, repeat: [repeatX, repeatY], rotation });
                  }}
                  onRemove={(t) => {
                    removeSavedTexture(projectId, t.id);
                    setSaved(getSavedTextures(projectId));
                  }}
                />
              )}
            </TabsContent>
            <TabsContent value="upload" className="m-0 pt-2">
              <label className="block">
                <Button asChild size="sm" variant="outline" className="w-full h-8 text-[11px]" disabled={disabled}>
                  <span><Upload className="w-3 h-3 mr-1" /> Upload JPG/PNG</span>
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={disabled}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-[10px] text-muted-foreground mt-1">
                Uploads are saved to your project library.
              </p>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Repeat X {repeatX.toFixed(2)}</Label>
              <Slider value={[repeatX]} min={0.1} max={10} step={0.1}
                onValueChange={([v]) => { setRepeatX(v); applyOverride({ repeat: [v, repeatY] }); }} />
            </div>
            <div>
              <Label className="text-[10px]">Repeat Y {repeatY.toFixed(2)}</Label>
              <Slider value={[repeatY]} min={0.1} max={10} step={0.1}
                onValueChange={([v]) => { setRepeatY(v); applyOverride({ repeat: [repeatX, v] }); }} />
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Rotation {rotation.toFixed(2)}</Label>
            <Slider value={[rotation]} min={-Math.PI} max={Math.PI} step={0.05}
              onValueChange={([v]) => { setRotation(v); applyOverride({ rotation: v }); }} />
          </div>

          {!isModel && allKeys.length > 1 && (
            <details className="text-[10px]">
              <summary className="cursor-pointer text-muted-foreground">All faces ({allKeys.length})</summary>
              <div className="flex flex-wrap gap-1 mt-1">
                {allKeys.map((k) => (
                  <span
                    key={k}
                    className={`px-1.5 py-0.5 rounded border text-[10px] ${
                      selectedFaces.has(k) ? "bg-emerald-500/20 border-emerald-500/60" : "border-border/60"
                    }`}
                  >
                    {faceKeyLabel(k)}
                  </span>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function TextureGrid({
  items, activeUrl, onPick, onRemove,
}: {
  items: LibraryTexture[];
  activeUrl: string | null;
  onPick: (t: LibraryTexture) => void;
  onRemove?: (t: LibraryTexture) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {items.map((t) => (
        <div key={t.id} className="relative group">
          <button
            onClick={() => onPick(t)}
            className={`w-full aspect-square rounded overflow-hidden border ${
              activeUrl === t.url ? "ring-2 ring-emerald-500 border-emerald-500" : "border-border/60 hover:border-foreground/40"
            }`}
            title={t.name}
          >
            <img src={t.thumbnail} alt={t.name} className="w-full h-full object-cover" />
          </button>
          {onRemove && (
            <button
              onClick={() => onRemove(t)}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100"
              title="Remove from library"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}