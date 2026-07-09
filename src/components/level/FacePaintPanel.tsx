import { useEffect, useMemo, useState } from "react";
import { Upload, Trash2, X, Paintbrush2, Droplet, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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

/** Preset colour chips — mirror the Mesh Editor palette for continuity. */
const SWATCHES = ["#ff5577", "#3b82f6", "#22d3ee", "#f5f5f5", "#0f172a", "#facc15", "#84cc16", "#a855f7"];

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
  const [textureTab, setTextureTab] = useState<"gallery" | "saved">("gallery");
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
    <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-gradient-to-br from-black/60 to-black/30 backdrop-blur-md p-2.5 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold flex items-center gap-1.5 uppercase tracking-wider text-white/80">
          <Paintbrush2 className="w-3 h-3 text-fuchsia-300" /> Face painter
        </Label>
        <button
          disabled={disabled}
          onClick={onToggleActive}
          className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${
            active
              ? "bg-gradient-to-r from-fuchsia-500/40 to-cyan-500/30 text-white border border-fuchsia-400/60 shadow-[0_0_18px_-4px_rgba(217,70,239,0.6)]"
              : "bg-black/60 border border-white/[0.10] text-white/80 hover:bg-white/[0.08]"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {active ? "Painting" : "Enable"}
        </button>
      </div>

      {active && (
        <>
          <p className="text-[10px] text-white/50 leading-snug">
            Click any face to select. Shift+click to add. {isModel ? "Each click picks the mesh under the cursor." : ""}
          </p>

          <div className="flex items-center justify-between text-[10px] text-white/75">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {selectionCount} face{selectionCount === 1 ? "" : "s"} selected
            </span>
            <div className="flex gap-1">
              <button
                disabled={selectionCount === 0}
                onClick={onClearSelection}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/70 hover:bg-white/[0.08] disabled:opacity-30"
              ><X className="w-2.5 h-2.5" /> Clear</button>
              <button
                disabled={disabled || selectionCount === 0}
                onClick={resetSelected}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/70 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-30"
                title="Remove overrides on selected faces"
              ><Trash2 className="w-2.5 h-2.5" /> Reset</button>
            </div>
          </div>

          {/* Swatch strip */}
          <div className="flex items-center gap-1.5">
            {SWATCHES.map((sw) => {
              const isActive = rgbaToHex(color).toLowerCase() === sw.toLowerCase();
              return (
                <button
                  key={sw}
                  onClick={() => {
                    const next = hexToRgba(sw, opacity);
                    setColor(next);
                    applyOverride({ color: next, opacity });
                  }}
                  className={`w-5 h-5 rounded-full border transition-transform ${isActive ? "border-white scale-110 ring-2 ring-white/40" : "border-white/20 hover:scale-110"}`}
                  style={{ background: sw }}
                  title={sw}
                />
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-[10px] text-white/75">
            <Droplet className="w-3 h-3 text-white/50" />
            <Input
              type="color"
              value={rgbaToHex(color)}
              disabled={disabled}
              onChange={(e) => {
                const next = hexToRgba(e.target.value, opacity);
                setColor(next);
                applyOverride({ color: next, opacity });
              }}
              className="h-7 w-9 p-0.5 bg-black/60 border-white/[0.10]"
            />
            <span className="flex-1 font-mono text-white/70 text-[10px] px-1.5 py-1 rounded bg-black/60 border border-white/[0.08]">
              {rgbaToHex(color)}
            </span>
          </label>

          <div>
            <div className="flex items-center justify-between text-[10px] text-white/75">
              <span>Opacity</span>
              <span className="font-mono text-white/60">{opacity.toFixed(2)}</span>
            </div>
            <Slider value={[opacity]} min={0} max={1} step={0.05}
              onValueChange={([v]) => { setOpacity(v); applyOverride({ opacity: v }); }} />
          </div>

          {/* Texture card */}
          <div className="rounded-lg border border-white/[0.06] bg-black/40 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-white/50 flex items-center gap-1">
                <ImageIcon className="w-2.5 h-2.5" /> Texture
              </span>
              <div className="flex gap-0.5">
                {(["gallery", "saved"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTextureTab(t)}
                    className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider ${textureTab === t ? "bg-white/[0.12] text-white" : "text-white/50 hover:text-white/80"}`}
                  >{t}</button>
                ))}
              </div>
            </div>
            <TextureGrid
              items={textureTab === "gallery" ? builtins : saved}
              activeUrl={textureUrl}
              onPick={(t) => {
                setTextureUrl(t.url);
                applyOverride({ textureUrl: t.url, repeat: [repeatX, repeatY], rotation });
              }}
              onRemove={textureTab === "saved" ? (t) => {
                removeSavedTexture(projectId, t.id);
                setSaved(getSavedTextures(projectId));
              } : undefined}
              emptyLabel={textureTab === "saved" ? "Upload a texture to save it here." : undefined}
            />
            <label className="block">
              <div className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-black/60 border border-white/[0.08] text-white/80 text-[10px] cursor-pointer hover:bg-white/[0.08]">
                <Upload className="w-3 h-3" /> Upload JPG/PNG
              </div>
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
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <div className="flex justify-between text-white/70"><span>Repeat X</span><span className="font-mono">{repeatX.toFixed(2)}</span></div>
              <Slider value={[repeatX]} min={0.1} max={10} step={0.1}
                onValueChange={([v]) => { setRepeatX(v); applyOverride({ repeat: [v, repeatY] }); }} />
            </div>
            <div>
              <div className="flex justify-between text-white/70"><span>Repeat Y</span><span className="font-mono">{repeatY.toFixed(2)}</span></div>
              <Slider value={[repeatY]} min={0.1} max={10} step={0.1}
                onValueChange={([v]) => { setRepeatY(v); applyOverride({ repeat: [repeatX, v] }); }} />
            </div>
          </div>
          <div className="text-[10px]">
            <div className="flex justify-between text-white/70"><span>Rotation</span><span className="font-mono">{rotation.toFixed(2)}</span></div>
            <Slider value={[rotation]} min={-Math.PI} max={Math.PI} step={0.05}
              onValueChange={([v]) => { setRotation(v); applyOverride({ rotation: v }); }} />
          </div>

          {!isModel && allKeys.length > 1 && (
            <details className="text-[10px]">
              <summary className="cursor-pointer text-white/50 hover:text-white/80">All faces ({allKeys.length})</summary>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {allKeys.map((k) => (
                  <span
                    key={k}
                    className={`px-1.5 py-0.5 rounded border text-[10px] ${
                      selectedFaces.has(k) ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-100" : "border-white/[0.10] text-white/60"
                    }`}
                  >{faceKeyLabel(k)}</span>
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
  items, activeUrl, onPick, onRemove, emptyLabel,
}: {
  items: LibraryTexture[];
  activeUrl: string | null;
  onPick: (t: LibraryTexture) => void;
  onRemove?: (t: LibraryTexture) => void;
  emptyLabel?: string;
}) {
  if (items.length === 0 && emptyLabel) {
    return <p className="text-[10px] text-white/40 italic py-1">{emptyLabel}</p>;
  }
  return (
    <div className="grid grid-cols-4 gap-1">
      {items.map((t) => (
        <div key={t.id} className="relative group">
          <button
            onClick={() => onPick(t)}
            className={`w-full aspect-square rounded overflow-hidden border transition-all ${
              activeUrl === t.url ? "ring-2 ring-fuchsia-400 border-fuchsia-400" : "border-white/[0.10] hover:border-white/30"
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