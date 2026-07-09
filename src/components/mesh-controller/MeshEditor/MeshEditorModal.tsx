/**
 * MeshEditorModal
 * ---------------
 * Full 3D mesh editor that opens on top of the Mesh Controller. Loads
 * the placed model's GLB, lets the user override materials, paint faces,
 * hide sub-meshes, then re-bakes the model and hands the fresh GLB
 * bytes back to the parent (`onApply`) so the on-Earth placement can be
 * refreshed in-place.
 *
 * The window is draggable by its header (matches Mesh Controller UX).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Eye, EyeOff, Palette, Paintbrush, Check, Boxes, Sparkles, Grid3x3, Undo2, Redo2, Upload, Image as ImageIcon, Droplet, Search } from "lucide-react";
import type * as THREE from "three";
import MeshEditorCanvas, { type MaterialOverride } from "./MeshEditorCanvas";
import { exportGlb } from "./exportGlb";
import {
  getBuiltinTextures,
  getSavedTextures,
  saveTexture,
  fileToDataUrl,
  type LibraryTexture,
} from "@/lib/texture-library";

interface Props {
  modelName: string;
  source: Blob | ArrayBuffer | string;
  onClose: () => void;
  onApply: (glb: Blob) => void | Promise<void>;
}

type MeshInfo = { name: string; uuid: string };

type HistorySnap = {
  hidden: string[];
  overrides: Record<string, MaterialOverride>;
};

const ENV_PRESETS = ["studio", "sunset", "warehouse", "city", "dawn", "night"] as const;

export default function MeshEditorModal({ modelName, source, onClose, onApply }: Props) {
  const [meshes, setMeshes] = useState<MeshInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, MaterialOverride>>({});
  const [paintActive, setPaintActive] = useState(false);
  const [paintColor, setPaintColor] = useState("#ff5577");
  const [paintOpacity, setPaintOpacity] = useState(1);
  const [envPreset, setEnvPreset] = useState<typeof ENV_PRESETS[number]>("studio");
  const [showGrid, setShowGrid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [meshQuery, setMeshQuery] = useState("");
  const [builtinTex] = useState<LibraryTexture[]>(() => getBuiltinTextures());
  const [savedTex, setSavedTex] = useState<LibraryTexture[]>(() => getSavedTextures("mesh-editor"));
  const [textureTab, setTextureTab] = useState<"gallery" | "saved">("gallery");
  const rootRef = useRef<THREE.Object3D | null>(null);

  // ── Undo / redo — dedicated stack for mesh edits only.
  const undo = useRef<HistorySnap[]>([]);
  const redo = useRef<HistorySnap[]>([]);
  const [, force] = useState(0);
  const snapshot = (): HistorySnap => ({ hidden: [...hidden], overrides: { ...overrides } });
  const pushHistory = () => {
    undo.current.push(snapshot());
    if (undo.current.length > 60) undo.current.shift();
    redo.current = [];
    force(x => x + 1);
  };
  const restore = (s: HistorySnap) => {
    setHidden(new Set(s.hidden));
    setOverrides({ ...s.overrides });
  };
  const handleUndo = () => {
    if (undo.current.length === 0) return;
    const prev = undo.current.pop()!;
    redo.current.push(snapshot());
    restore(prev);
    force(x => x + 1);
  };
  const handleRedo = () => {
    if (redo.current.length === 0) return;
    const next = redo.current.pop()!;
    undo.current.push(snapshot());
    restore(next);
    force(x => x + 1);
  };

  const onSceneReady = useCallback((root: THREE.Object3D, ms: MeshInfo[]) => {
    rootRef.current = root;
    setMeshes(ms);
    setSelected(ms[0]?.uuid ?? null);
  }, []);

  const toggleHidden = (uuid: string) => {
    pushHistory();
    setHidden(prev => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });
  };

  const setOverride = (uuid: string, partial: Partial<MaterialOverride>) => {
    setOverrides(prev => ({ ...prev, [uuid]: { ...prev[uuid], ...partial } }));
  };
  const commitOverride = () => pushHistory();

  const applyTextureToSelected = (url: string | null) => {
    if (!selected) return;
    pushHistory();
    setOverride(selected, {
      map: url ?? "",
      repeat: overrides[selected]?.repeat ?? [1, 1],
      rotation: overrides[selected]?.rotation ?? 0,
    });
  };

  const handleTextureUpload = async (file: File) => {
    try {
      const url = await fileToDataUrl(file);
      const t: LibraryTexture = {
        id: `up_${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, ""),
        url,
        thumbnail: url,
      };
      try { saveTexture("mesh-editor", t); } catch { /* quota — skip persist */ }
      setSavedTex(getSavedTextures("mesh-editor"));
      setTextureTab("saved");
      applyTextureToSelected(url);
    } catch (e) {
      console.warn("[MeshEditor] texture upload failed", e);
    }
  };

  // Keep pulse alive when the user narrows via search: auto-select the
  // top match so the highlight follows what they're looking at.
  const filteredMeshes = meshQuery
    ? meshes.filter(m => m.name.toLowerCase().includes(meshQuery.toLowerCase()))
    : meshes;
  useEffect(() => {
    if (meshQuery && filteredMeshes.length && !filteredMeshes.some(m => m.uuid === selected)) {
      setSelected(filteredMeshes[0].uuid);
    }
  }, [meshQuery, filteredMeshes, selected]);

  // ── Draggable window
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input,select")) return;
    const parent = (e.currentTarget as HTMLElement).parentElement?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    dragging.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    if (!pos) setPos({ x: rect.left, y: rect.top });
    const move = (ev: PointerEvent) => {
      const s = dragging.current; if (!s) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 200, s.origX + (ev.clientX - s.startX))),
        y: Math.max(8, Math.min(window.innerHeight - 100, s.origY + (ev.clientY - s.startY))),
      });
    };
    const up = () => {
      dragging.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handleApply = async () => {
    if (!rootRef.current) return;
    setBusy(true);
    try {
      const glb = await exportGlb(rootRef.current);
      await onApply(glb);
    } catch (e) {
      console.warn("[MeshEditorModal] export failed", e);
      alert("Failed to bake mesh edits. See console for details.");
    } finally {
      setBusy(false);
    }
  };

  const sel = selected ? overrides[selected] ?? {} : {};

  return (
    <div
      className={pos ? "fixed z-[70]" : "fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <div
        className="pointer-events-auto w-[min(1100px,calc(100vw-2rem))] h-[min(720px,calc(100vh-4rem))] rounded-2xl overflow-hidden border border-white/[0.08] bg-black/85 backdrop-blur-2xl shadow-[0_30px_80px_rgba(0,0,0,0.75)]"
      >
        {/* Gradient accent */}
        <div className="h-[2px] bg-gradient-to-r from-fuchsia-500/70 via-cyan-400/60 to-fuchsia-500/70" />
        {/* Header (drag handle) */}
        <div
          onPointerDown={startDrag}
          className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] cursor-move select-none"
          title="Drag to move"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 flex items-center justify-center">
              <Boxes className="w-3.5 h-3.5 text-fuchsia-300" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">Mesh Editor — {modelName}</p>
              <p className="text-[10px] uppercase tracking-widest text-white/60">In-earth authoring</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleUndo}
              disabled={undo.current.length === 0}
              title="Undo (Ctrl+Z)"
              className="w-7 h-7 rounded-md bg-black/70 border border-white/[0.08] flex items-center justify-center text-white/80 hover:bg-white/[0.12] disabled:opacity-30"
            ><Undo2 className="w-3.5 h-3.5" /></button>
            <button
              onClick={handleRedo}
              disabled={redo.current.length === 0}
              title="Redo"
              className="w-7 h-7 rounded-md bg-black/70 border border-white/[0.08] flex items-center justify-center text-white/80 hover:bg-white/[0.12] disabled:opacity-30"
            ><Redo2 className="w-3.5 h-3.5" /></button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md bg-black/70 border border-white/[0.08] flex items-center justify-center text-white/80 hover:bg-red-500/25 hover:border-red-500/40"
            ><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex h-[calc(100%-42px-52px)]">
          {/* Mesh list */}
          <aside className="w-56 shrink-0 border-r border-white/[0.06] p-2 overflow-y-auto">
            <p className="text-[9px] uppercase tracking-widest text-white/50 px-1 pb-1">Components</p>
            <div className="relative mb-1.5">
              <Search className="w-3 h-3 text-white/40 absolute left-1.5 top-1/2 -translate-y-1/2" />
              <input
                value={meshQuery}
                onChange={(e) => setMeshQuery(e.target.value)}
                placeholder="Search…"
                className="w-full bg-black/60 border border-white/[0.08] rounded-md pl-6 pr-2 py-1 text-[10px] text-white/85 focus:outline-none focus:border-cyan-500/40"
              />
            </div>
            {meshes.length === 0 ? (
              <p className="text-[10px] text-white/40 p-2">Loading…</p>
            ) : (
              <ul className="space-y-0.5">
                {filteredMeshes.map(m => (
                  <li
                    key={m.uuid}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer text-[11px] ${
                      selected === m.uuid ? "bg-blue-500/20 text-blue-200 border border-blue-500/40 shadow-[0_0_18px_-6px_rgba(59,130,246,0.7)]" : "text-white/75 hover:bg-white/[0.06]"
                    }`}
                    onClick={() => setSelected(m.uuid)}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleHidden(m.uuid); }}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/[0.08]"
                      title={hidden.has(m.uuid) ? "Show" : "Hide"}
                    >
                      {hidden.has(m.uuid) ? <EyeOff className="w-3 h-3 text-white/40" /> : <Eye className="w-3 h-3 text-white/80" />}
                    </button>
                    <span className="truncate">{m.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Canvas */}
          <div className="flex-1 relative">
            <MeshEditorCanvas
              source={source}
              hiddenMeshes={hidden}
              overrides={overrides}
              paintActive={paintActive}
              paintColor={paintColor}
              paintOpacity={paintOpacity}
              selectedUuid={selected}
              environmentPreset={envPreset}
              showGrid={showGrid}
              onSceneReady={onSceneReady}
              onPickMesh={(uuid) => setSelected(uuid)}
            />
            {/* Viewport toolbar */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/[0.08] rounded-lg px-1.5 py-1">
              <button
                onClick={() => setShowGrid(v => !v)}
                className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] ${showGrid ? "bg-cyan-500/20 text-cyan-300" : "text-white/70 hover:bg-white/[0.06]"}`}
                title="Toggle grid"
              ><Grid3x3 className="w-3.5 h-3.5" /></button>
              <select
                value={envPreset}
                onChange={(e) => setEnvPreset(e.target.value as any)}
                className="bg-black/70 border border-white/[0.08] rounded-md px-2 py-1 text-[10px] text-white/85 focus:outline-none"
                title="Environment preset"
              >
                {ENV_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="absolute bottom-2 left-2 text-[9px] text-white/50 uppercase tracking-widest bg-black/60 px-2 py-1 rounded">
              {paintActive ? "Face paint · drag on mesh" : "Click a component to inspect · drag to orbit"}
            </div>
            {selected && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/40 rounded-md px-2 py-1 text-[10px] text-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Pulsing selection · 5s on / 5s off
              </div>
            )}
          </div>

          {/* Inspector */}
          <aside className="w-72 shrink-0 border-l border-white/[0.06] p-3 overflow-y-auto space-y-3">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/50 pb-1 flex items-center gap-1">
                <Palette className="w-2.5 h-2.5" /> Material override
              </p>
              {!selected ? (
                <p className="text-[10px] text-white/40">Select a mesh from the left panel.</p>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] text-white/75">
                    <span className="w-16">Base color</span>
                    <input
                      type="color"
                      value={sel.color ?? "#ffffff"}
                      onChange={(e) => setOverride(selected, { color: e.target.value })}
                      onBlur={commitOverride}
                      className="w-8 h-6 rounded bg-black/60 border border-white/[0.08]"
                    />
                    <input
                      type="text"
                      value={sel.color ?? "#ffffff"}
                      onChange={(e) => setOverride(selected, { color: e.target.value })}
                      onBlur={commitOverride}
                      className="flex-1 bg-black/60 border border-white/[0.08] rounded px-1.5 py-1 text-[10px] font-mono text-white/85 focus:outline-none focus:border-cyan-500/40"
                    />
                  </label>
                  {(["metalness", "roughness", "opacity"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-2 text-[10px] text-white/75">
                      <span className="w-16 capitalize">{k}</span>
                      <input
                        type="range" min={0} max={1} step={0.01}
                        value={(sel as any)[k] ?? (k === "opacity" ? 1 : 0.5)}
                        onChange={(e) => setOverride(selected, { [k]: Number(e.target.value) } as any)}
                        onPointerUp={commitOverride}
                        className="flex-1"
                      />
                      <span className="w-8 text-right font-mono text-white/70">{(((sel as any)[k] ?? (k === "opacity" ? 1 : 0.5)) as number).toFixed(2)}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-[10px] text-white/75">
                    <span className="w-16">Emissive</span>
                    <input
                      type="color"
                      value={sel.emissive ?? "#000000"}
                      onChange={(e) => setOverride(selected, { emissive: e.target.value })}
                      onBlur={commitOverride}
                      className="w-8 h-6 rounded bg-black/60 border border-white/[0.08]"
                    />
                    <input
                      type="range" min={0} max={5} step={0.05}
                      value={sel.emissiveIntensity ?? 0}
                      onChange={(e) => setOverride(selected, { emissiveIntensity: Number(e.target.value) })}
                      onPointerUp={commitOverride}
                      className="flex-1"
                    />
                    <span className="w-8 text-right font-mono text-white/70">{(sel.emissiveIntensity ?? 0).toFixed(2)}</span>
                  </label>
                </div>
              )}
            </div>

            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/50 pb-1 flex items-center gap-1">
                <Paintbrush className="w-2.5 h-2.5" /> Face painter
              </p>
              <div className="space-y-2.5">
                <button
                  onClick={() => setPaintActive(v => !v)}
                  className={`w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all ${
                    paintActive
                      ? "bg-gradient-to-r from-fuchsia-500/30 to-cyan-500/25 text-white border border-fuchsia-400/50 shadow-[0_0_24px_-6px_rgba(217,70,239,0.55)]"
                      : "bg-black/60 border border-white/[0.08] text-white/80 hover:bg-white/[0.06]"
                  }`}
                >
                  <Paintbrush className="w-3 h-3" />
                  {paintActive ? "Painting active" : "Enable paint mode"}
                </button>

                {/* Swatch row + hex */}
                <div className="flex items-center gap-1.5">
                  {["#ff5577", "#3b82f6", "#22d3ee", "#f5f5f5", "#0f172a", "#facc15", "#84cc16", "#a855f7"].map(sw => (
                    <button
                      key={sw}
                      onClick={() => setPaintColor(sw)}
                      className={`w-5 h-5 rounded-full border transition-transform ${paintColor.toLowerCase() === sw ? "border-white scale-110 ring-2 ring-white/40" : "border-white/20 hover:scale-110"}`}
                      style={{ background: sw }}
                      title={sw}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[10px] text-white/75">
                  <Droplet className="w-3 h-3 text-white/50" />
                  <input
                    type="color"
                    value={paintColor}
                    onChange={(e) => setPaintColor(e.target.value)}
                    className="w-7 h-6 rounded bg-black/60 border border-white/[0.08]"
                  />
                  <input
                    type="text"
                    value={paintColor}
                    onChange={(e) => setPaintColor(e.target.value)}
                    className="flex-1 bg-black/60 border border-white/[0.08] rounded px-1.5 py-1 text-[10px] font-mono text-white/85 focus:outline-none focus:border-fuchsia-400/50"
                  />
                </label>

                {/* Brush opacity */}
                <label className="flex items-center gap-2 text-[10px] text-white/75">
                  <span className="w-14">Opacity</span>
                  <input
                    type="range" min={0.05} max={1} step={0.05}
                    value={paintOpacity}
                    onChange={(e) => setPaintOpacity(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right font-mono text-white/70">{paintOpacity.toFixed(2)}</span>
                </label>

                {/* Texture library */}
                <div className="rounded-lg border border-white/[0.06] bg-black/40 p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-widest text-white/50 flex items-center gap-1">
                      <ImageIcon className="w-2.5 h-2.5" /> Texture
                    </span>
                    <div className="flex gap-0.5">
                      {(["gallery", "saved"] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setTextureTab(t)}
                          className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider ${textureTab === t ? "bg-white/[0.12] text-white" : "text-white/50 hover:text-white/80"}`}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(textureTab === "gallery" ? builtinTex : savedTex).map(t => {
                      const active = selected && overrides[selected]?.map === t.url;
                      return (
                        <button
                          key={t.id}
                          disabled={!selected}
                          onClick={() => applyTextureToSelected(t.url)}
                          className={`aspect-square rounded overflow-hidden border transition-all ${active ? "border-fuchsia-400 ring-2 ring-fuchsia-400/40" : "border-white/[0.08] hover:border-white/30"} disabled:opacity-40`}
                          title={t.name}
                        >
                          <img src={t.thumbnail} alt={t.name} className="w-full h-full object-cover" />
                        </button>
                      );
                    })}
                    {textureTab === "saved" && savedTex.length === 0 && (
                      <p className="col-span-4 text-[10px] text-white/40 italic py-1">Upload one below.</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <label className="flex-1">
                      <div className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-black/60 border border-white/[0.08] text-white/80 text-[10px] cursor-pointer hover:bg-white/[0.06]">
                        <Upload className="w-3 h-3" /> Upload
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleTextureUpload(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      disabled={!selected || !overrides[selected]?.map}
                      onClick={() => applyTextureToSelected(null)}
                      className="px-2 py-1 rounded bg-black/60 border border-white/[0.08] text-white/70 text-[10px] hover:bg-red-500/20 hover:text-red-200 disabled:opacity-30"
                    >Clear</button>
                  </div>

                  {/* Repeat / rotation */}
                  {selected && overrides[selected]?.map && (
                    <div className="pt-1 space-y-1.5">
                      {(["repeatX", "repeatY", "rotation"] as const).map((k) => {
                        const ov = overrides[selected!] || {};
                        const [rx, ry] = ov.repeat ?? [1, 1];
                        const rot = ov.rotation ?? 0;
                        const value = k === "repeatX" ? rx : k === "repeatY" ? ry : rot;
                        const [min, max, step] = k === "rotation" ? [-Math.PI, Math.PI, 0.05] : [0.1, 10, 0.1];
                        return (
                          <label key={k} className="flex items-center gap-2 text-[10px] text-white/75">
                            <span className="w-14 capitalize">{k === "repeatX" ? "Repeat X" : k === "repeatY" ? "Repeat Y" : "Rotation"}</span>
                            <input
                              type="range" min={min} max={max} step={step} value={value}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (k === "rotation") setOverride(selected!, { rotation: v });
                                else if (k === "repeatX") setOverride(selected!, { repeat: [v, ry] });
                                else setOverride(selected!, { repeat: [rx, v] });
                              }}
                              onPointerUp={commitOverride}
                              className="flex-1"
                            />
                            <span className="w-8 text-right font-mono text-white/70">{value.toFixed(2)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!selected && (
                  <p className="text-[10px] text-white/40 italic">Select a component to paint or apply a texture.</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/50 pb-1 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> Notes
              </p>
              <p className="text-[10px] text-white/50 leading-snug">
                On Apply, edits are baked into a fresh GLB and reloaded on the earth. Vertex colors and material overrides are exported.
              </p>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-1.5 px-4 py-2.5 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-black/70 border border-white/[0.08] text-white/80 text-xs font-medium hover:bg-black/80"
          >Cancel</button>
          <button
            onClick={handleApply}
            disabled={busy || !rootRef.current}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fuchsia-500/25 border border-fuchsia-500/40 text-fuchsia-100 text-xs font-semibold hover:bg-fuchsia-500/35 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3 h-3" />
            {busy ? "Baking…" : "Apply to Earth"}
          </button>
        </div>
      </div>
    </div>
  );
}