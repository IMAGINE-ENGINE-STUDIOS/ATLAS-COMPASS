import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import {
  Move, RotateCcw, Scale, X, Check, ArrowDown,
  Plus, Minus, Scissors, Grid3x3, Square as SquareIcon, Circle as CircleIcon,
  Pencil, RotateCw, ArrowUp, Waves, Layers, Trash2, Undo2, Redo2, Boxes,
} from "lucide-react";
import type { Viewer } from "cesium";
import ModelGizmoOverlay from "./MeshControllerGizmo";

// Heavy R3F editor — loaded on demand only when the Mesh tab is opened.
const MeshEditorModal = lazy(() => import("./MeshEditor/MeshEditorModal"));

export interface TransformData {
  lat: number;
  lng: number;
  alt: number;
  heading: number;
  pitch: number;
  roll: number;
  scale: number;
}

export interface CropBaseUI {
  shape: "circle" | "square";
  wireframe: boolean;
  tool: "raise" | "lower" | "smooth" | "flatten";
  brushRadius: number;
  brushStrength: number;
  flattenHeight: number;
}

interface Props {
  modelName: string;
  initial: TransformData;
  onUpdate: (data: TransformData) => void;
  onApply: (data: TransformData) => void;
  onClose: () => void;
  onSnapToGround: (data: TransformData, callback: (snapped: TransformData) => void) => void;
  cropRadius?: number;
  onCropTile?: (radius: number) => void;
  onUncropTile?: () => void;
  cropBase?: CropBaseUI;
  onCropBaseChange?: (partial: Partial<CropBaseUI>) => void;
  onResetTerrain?: () => void;
  terrainEditing?: boolean;
  onToggleTerrainEditing?: () => void;
  /** Optional Cesium viewer ref — when provided, a 3D gizmo is drawn on the
   *  model's geometric center and follows the active tab (position/rotation/scale). */
  viewerRef?: React.MutableRefObject<Viewer | null>;
  /** Delete the model. Rendered only when provided — permission (author or
   *  admin) is enforced by the parent (RLS on the server, ownership check
   *  on local models). */
  onDelete?: () => void | Promise<void>;
  /** Optional GLB source for the Mesh Editor tab. Accepts a `Blob`, an
   *  `ArrayBuffer`, or a fetchable URL. When provided the "Mesh" tab is
   *  enabled; when omitted the tab renders a placeholder note. */
  meshSource?: Blob | ArrayBuffer | string | null;
  /** Called with the re-baked GLB after the user hits "Apply" in the mesh
   *  editor. Parents persist the new bytes (SpaceshipPage → blob store,
   *  AtlasBuildingsOverlay → upload + patch record) and refresh the
   *  Cesium entity. */
  onMeshApply?: (glb: Blob) => void | Promise<void>;
}

function StepInput({ label, value, step, min, max, decimals, onChange }: {
  label: string; value: number; step: number; min?: number; max?: number; decimals?: number;
  onChange: (v: number) => void;
}) {
  const fmt = (v: number) => decimals !== undefined ? v.toFixed(decimals) : String(v);
  const clamp = (v: number) => {
    if (min !== undefined && v < min) return min;
    if (max !== undefined && v > max) return max;
    return v;
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-white/75 uppercase tracking-wider w-7 shrink-0">{label}</span>
      <button
        onClick={() => onChange(clamp(value - step))}
        className="w-5 h-5 rounded-sm bg-black/75 border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.12] transition-colors"
      >
        <Minus className="w-2.5 h-2.5 text-white/80" />
      </button>
      <input
        type="number"
        value={fmt(value)}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(clamp(v));
        }}
        className="w-16 bg-black/70 border border-white/[0.08] rounded-sm px-1.5 py-1 text-xs font-mono text-white text-center focus:outline-none focus:border-cyan-500/40"
      />
      <button
        onClick={() => onChange(clamp(value + step))}
        className="w-5 h-5 rounded-sm bg-black/75 border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.12] transition-colors"
      >
        <Plus className="w-2.5 h-2.5 text-white/80" />
      </button>
    </div>
  );
}

function RotationSlider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-white/75 uppercase tracking-wider w-10 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 appearance-none rounded-full bg-black/80 cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-cyan-600 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(0,200,255,0.4)]"
      />
      <span className="text-[10px] font-mono text-white/85 w-9 text-right">{value}°</span>
    </div>
  );
}

export default function ModelTransformWidget({
  modelName, initial, onUpdate, onApply, onClose, onSnapToGround,
  cropRadius = 0, onCropTile, onUncropTile,
  cropBase, onCropBaseChange, onResetTerrain, terrainEditing, onToggleTerrainEditing,
  viewerRef, onDelete, meshSource, onMeshApply,
}: Props) {
  const [data, setData] = useState<TransformData>(initial);
  const [tab, setTab] = useState<"position" | "rotation" | "scale" | "mesh">("position");
  const [cropInput, setCropInput] = useState<number>(cropRadius > 0 ? cropRadius : 30);
  const [meshEditorOpen, setMeshEditorOpen] = useState(false);

  // ── Undo / redo for gizmo drag operations.
  // Each entry is a full TransformData snapshot captured on drag START.
  const undoStack = useRef<TransformData[]>([]);
  const redoStack = useRef<TransformData[]>([]);
  const dragSnapshot = useRef<TransformData | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const bumpHistory = () => setHistoryTick(v => v + 1);

  const applySnapshot = useCallback((snap: TransformData) => {
    setData(snap);
    onUpdate(snap);
  }, [onUpdate]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(data);
    applySnapshot(prev);
    bumpHistory();
  }, [data, applySnapshot]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(data);
    applySnapshot(next);
    bumpHistory();
  }, [data, applySnapshot]);

  const onGizmoDragStart = useCallback(() => {
    dragSnapshot.current = { ...data };
  }, [data]);

  const onGizmoDragEnd = useCallback(() => {
    const snap = dragSnapshot.current;
    dragSnapshot.current = null;
    if (!snap) return;
    // Only record if the transform actually changed during the drag.
    setData(cur => {
      const changed = (["lat","lng","alt","heading","pitch","roll","scale"] as const)
        .some(k => Math.abs((snap as any)[k] - (cur as any)[k]) > 1e-9);
      if (changed) {
        undoStack.current.push(snap);
        // Cap history length so we don't grow forever.
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
        bumpHistory();
      }
      return cur;
    });
  }, []);

  // Keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo]);

  // ── Draggable window: header is the drag handle. `pos` is null until the
  // user first drags — then we switch from the default centered layout to
  // absolute coordinates.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; el: HTMLElement | null } | null>(null);
  const startWindowDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore drags that start on interactive header controls.
    if ((e.target as HTMLElement).closest("button,input,select,textarea,a")) return;
    const parent = (e.currentTarget.closest("[data-transform-widget]") as HTMLElement) ?? null;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, el: parent };
    // Ensure we snap to absolute coords on first drag.
    if (!pos) setPos({ x: rect.left, y: rect.top });
    const move = (ev: PointerEvent) => {
      const s = dragState.current; if (!s) return;
      const nx = s.origX + (ev.clientX - s.startX);
      const ny = s.origY + (ev.clientY - s.startY);
      // Keep inside viewport.
      const w = s.el?.offsetWidth ?? 289;
      const h = s.el?.offsetHeight ?? 200;
      setPos({
        x: Math.max(4, Math.min(window.innerWidth - w - 4, nx)),
        y: Math.max(4, Math.min(window.innerHeight - h - 4, ny)),
      });
    };
    const up = () => {
      dragState.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  void historyTick;

  useEffect(() => {
    if (cropRadius > 0) setCropInput(cropRadius);
  }, [cropRadius]);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  const update = useCallback((partial: Partial<TransformData>) => {
    setData(prev => {
      const next = { ...prev, ...partial };
      onUpdate(next);
      return next;
    });
  }, [onUpdate]);

  // Scale slider: logarithmic mapping
  const scaleToSlider = (s: number) => Math.log10(Math.max(0.01, s)) * 50 + 100;
  const sliderToScale = (v: number) => Math.pow(10, (v - 100) / 50);

  const tabs = [
    { key: "position" as const, label: "Position", icon: <Move className="w-3 h-3" /> },
    { key: "rotation" as const, label: "Rotation", icon: <RotateCcw className="w-3 h-3" /> },
    { key: "scale" as const, label: "Scale", icon: <Scale className="w-3 h-3" /> },
    { key: "mesh" as const, label: "Mesh", icon: <Boxes className="w-3 h-3" /> },
  ];

  return (
    <>
    {viewerRef && (
      <ModelGizmoOverlay
        viewerRef={viewerRef}
        transform={data}
        mode={tab === "mesh" ? "position" : tab}
        onChange={(partial) => update(partial)}
        onDragStart={onGizmoDragStart}
        onDragEnd={onGizmoDragEnd}
      />
    )}
    <div
      data-transform-widget
      className={
        pos
          ? "fixed z-50 w-[289px] max-w-[calc(100vw-2rem)]"
          : "absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-[289px] max-w-[calc(100vw-2rem)]"
      }
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <div className="bg-black/80 backdrop-blur-2xl border border-white/[0.1] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.06)] overflow-hidden">
        {/* Gradient top accent */}
        <div className="h-[2px] bg-gradient-to-r from-cyan-500/60 via-purple-500/40 to-cyan-500/60" />

        {/* Header */}
        <div
          onPointerDown={startWindowDrag}
          className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] cursor-move select-none"
          title="Drag to move this window"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 rounded-md bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <span className="text-xs">🏗️</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{modelName}</p>
              <p className="text-[9px] text-white/70 uppercase tracking-wider">Mesh Controller</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo gizmo change (Ctrl+Z)"
              className="w-6 h-6 rounded-md bg-black/75 border border-white/[0.08] flex items-center justify-center text-white/80 hover:bg-white/[0.12] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Undo2 className="w-3 h-3" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo gizmo change (Ctrl+Shift+Z)"
              className="w-6 h-6 rounded-md bg-black/75 border border-white/[0.08] flex items-center justify-center text-white/80 hover:bg-white/[0.12] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Redo2 className="w-3 h-3" />
            </button>
            {onDelete && (
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${modelName}"? This cannot be undone.`)) return;
                  try { await onDelete(); } catch (e) { console.warn("[ModelTransformWidget] delete failed", e); }
                }}
                title="Delete 3D model (author or admin only)"
                className="w-6 h-6 rounded-md bg-black/75 border border-red-500/25 flex items-center justify-center text-red-300 hover:bg-red-500/25 hover:border-red-500/50 hover:text-red-200 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-md bg-black/75 border border-white/[0.08] flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/30 transition-all"
            >
              <X className="w-3 h-3 text-white/80" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-2.5 py-1.5 border-b border-white/[0.04]">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                tab === t.key
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : "text-white/75 hover:text-white/85 border border-transparent hover:bg-black/70"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-3 py-2.5 space-y-2">
          {tab === "position" && (
            <>
              <StepInput label="Lat" value={data.lat} step={0.0001} decimals={6} onChange={v => update({ lat: v })} />
              <StepInput label="Lng" value={data.lng} step={0.0001} decimals={6} onChange={v => update({ lng: v })} />
              <StepInput label="Alt" value={data.alt} step={1} decimals={1} onChange={v => update({ alt: v })} />
              <button
                onClick={() => onSnapToGround(data, (snapped) => {
                  setData(snapped);
                  onUpdate(snapped);
                })}
                className="w-full mt-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/25 transition-all"
              >
                <ArrowDown className="w-3 h-3" />
                Snap to Ground
              </button>
              {onCropTile && (
                <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/75 uppercase tracking-wider">Crop Tile</span>
                    <span className="text-[9px] text-white/55">radius m</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={cropInput}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) setCropInput(Math.max(1, v));
                      }}
                      className="w-16 bg-black/70 border border-white/[0.08] rounded-sm px-1.5 py-1 text-xs font-mono text-white text-center focus:outline-none focus:border-fuchsia-500/40"
                    />
                    <button
                      onClick={() => onCropTile(cropInput)}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/25 text-fuchsia-300 text-[11px] font-medium hover:bg-fuchsia-500/25 transition-all"
                      title="Clip a circular hole in surrounding 3D tiles so the model sits in place of buildings/terrain"
                    >
                      <Scissors className="w-3 h-3" />
                      {cropRadius > 0 ? "Update Crop" : "Crop Tile"}
                    </button>
                    {cropRadius > 0 && onUncropTile && (
                      <button
                        onClick={onUncropTile}
                        className="px-1.5 py-1.5 rounded-lg bg-black/70 border border-white/[0.08] text-white/70 text-[10px] hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30 transition-all"
                        title="Remove the tile crop"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {cropRadius > 0 && cropBase && onCropBaseChange && (
                    <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] space-y-1.5">
                      {/* Shape */}
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[9px] text-white/75 uppercase tracking-wider">Base shape</span>
                        <div className="flex rounded-md bg-black/70 border border-white/[0.08] overflow-hidden">
                          <button
                            onClick={() => onCropBaseChange({ shape: "circle" })}
                            className={`flex items-center gap-1 px-1.5 py-1 text-[10px] ${cropBase.shape === "circle" ? "bg-fuchsia-500/20 text-fuchsia-300" : "text-white/70 hover:text-white"}`}
                          ><CircleIcon className="w-2.5 h-2.5" />Circle</button>
                          <button
                            onClick={() => onCropBaseChange({ shape: "square" })}
                            className={`flex items-center gap-1 px-1.5 py-1 text-[10px] border-l border-white/[0.08] ${cropBase.shape === "square" ? "bg-fuchsia-500/20 text-fuchsia-300" : "text-white/70 hover:text-white"}`}
                          ><SquareIcon className="w-2.5 h-2.5" />Square</button>
                        </div>
                      </div>
                      {/* Wireframe toggle */}
                      <button
                        onClick={() => onCropBaseChange({ wireframe: !cropBase.wireframe })}
                        className={`w-full flex items-center justify-between px-2.5 py-1 rounded-md border text-[10px] transition-all ${cropBase.wireframe ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" : "bg-black/70 border-white/[0.08] text-white/75 hover:text-white"}`}
                      >
                        <span className="flex items-center gap-1"><Grid3x3 className="w-2.5 h-2.5" />Wireframe + Ruler</span>
                        <span className={`w-6 h-3 rounded-full relative transition-colors ${cropBase.wireframe ? "bg-cyan-500/70" : "bg-white/15"}`}>
                          <span className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${cropBase.wireframe ? "left-3.5" : "left-0.5"}`} />
                        </span>
                      </button>
                      {/* Terrain brush — pick an operation, drag on the globe to apply */}
                      <div className="space-y-1">
                        <span className="text-[9px] text-white/75 uppercase tracking-wider">Terrain</span>
                        <div className="grid grid-cols-4 gap-1">
                          {([
                            { k: "raise",   label: "Raise",   icon: <ArrowUp className="w-2.5 h-2.5" /> },
                            { k: "lower",   label: "Lower",   icon: <ArrowDown className="w-2.5 h-2.5" /> },
                            { k: "smooth",  label: "Smooth",  icon: <Waves className="w-2.5 h-2.5" /> },
                            { k: "flatten", label: "Flatten", icon: <Layers className="w-2.5 h-2.5" /> },
                          ] as const).map(t => (
                            <button
                              key={t.k}
                              onClick={() => onCropBaseChange({ tool: t.k })}
                              className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-md border text-[9px] font-medium transition-all ${
                                cropBase.tool === t.k
                                  ? "bg-amber-500/20 border-amber-400/40 text-amber-200"
                                  : "bg-black/70 border-white/[0.08] text-white/70 hover:text-white"
                              }`}
                            >
                              {t.icon}
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/70 w-12">Radius</span>
                        <input type="range" min={1} max={20} step={1} value={cropBase.brushRadius}
                          onChange={e => onCropBaseChange({ brushRadius: Number(e.target.value) })}
                          className="flex-1 h-1 appearance-none rounded-full bg-black/80 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400" />
                        <span className="text-[10px] font-mono text-white/80 w-7 text-right">{cropBase.brushRadius}m</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/70 w-12">Strength</span>
                        <input type="range" min={0.1} max={2} step={0.1} value={cropBase.brushStrength}
                          onChange={e => onCropBaseChange({ brushStrength: Number(e.target.value) })}
                          className="flex-1 h-1 appearance-none rounded-full bg-black/80 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400" />
                        <span className="text-[10px] font-mono text-white/80 w-7 text-right">{cropBase.brushStrength.toFixed(1)}</span>
                      </div>
                      {cropBase.tool === "flatten" && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-white/70 w-12">Target</span>
                          <input type="number" step={0.5} value={cropBase.flattenHeight ?? 0}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) onCropBaseChange({ flattenHeight: v });
                            }}
                            className="flex-1 bg-black/70 border border-white/[0.08] rounded-sm px-1.5 py-1 text-[10px] font-mono text-white text-center focus:outline-none focus:border-amber-500/40" />
                          <span className="text-[10px] font-mono text-white/60 w-7 text-right">m</span>
                        </div>
                      )}
                      {/* Edit toggle + reset */}
                      <div className="flex gap-1">
                        <button
                          onClick={onToggleTerrainEditing}
                          className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-md border text-[10px] font-medium transition-all ${terrainEditing ? "bg-amber-500/25 border-amber-400/40 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.35)]" : "bg-black/70 border-white/[0.08] text-white/75 hover:text-white"}`}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          {terrainEditing ? "Editing — click globe (Shift = invert)" : "Edit terrain"}
                        </button>
                        {onResetTerrain && (
                          <button onClick={onResetTerrain} title="Flatten the height field"
                            className="px-1.5 py-1 rounded-md bg-black/70 border border-white/[0.08] text-white/75 hover:bg-white/10 transition-all">
                            <RotateCw className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "rotation" && (
            <>
              <RotationSlider label="Heading" value={data.heading} min={0} max={360} onChange={v => update({ heading: v })} />
              <RotationSlider label="Pitch" value={data.pitch} min={-90} max={90} onChange={v => update({ pitch: v })} />
              <RotationSlider label="Roll" value={data.roll} min={-180} max={180} onChange={v => update({ roll: v })} />
              <button
                onClick={() => update({ heading: 0, pitch: 0, roll: 0 })}
                className="w-full mt-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/70 border border-white/[0.08] text-white/75 text-[11px] font-medium hover:bg-black/80 transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Rotation
              </button>
            </>
          )}

          {tab === "scale" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-white/75 uppercase tracking-wider w-10 shrink-0">Scale</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={scaleToSlider(data.scale)}
                  onChange={e => update({ scale: Math.round(sliderToScale(Number(e.target.value)) * 100) / 100 })}
                  className="flex-1 h-1 appearance-none rounded-full bg-black/80 cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:border-2
                    [&::-webkit-slider-thumb]:border-cyan-600 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(0,200,255,0.4)]"
                />
                <span className="text-[10px] font-mono text-white/85 w-10 text-right">{data.scale}x</span>
              </div>
              {/* Quick presets */}
              <div className="flex gap-1 mt-1">
                {[0.1, 0.5, 1, 5, 10, 50].map(s => (
                  <button
                    key={s}
                    onClick={() => update({ scale: s })}
                    className={`flex-1 px-1 py-1 rounded-md text-[10px] font-mono transition-all ${
                      data.scale === s
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : "bg-black/70 text-white/75 border border-white/[0.06] hover:bg-black/80"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "mesh" && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-black/60 border border-white/[0.06]">
                <div className="w-7 h-7 rounded-md bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center shrink-0">
                  <Boxes className="w-3.5 h-3.5 text-fuchsia-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-white leading-tight">Mesh Editor</p>
                  <p className="text-[9px] text-white/65 leading-snug mt-0.5">
                    Sculpt materials, paint faces, toggle sub-meshes and re-bake this model directly on Earth.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMeshEditorOpen(true)}
                disabled={!meshSource}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-200 text-[11px] font-semibold hover:bg-fuchsia-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title={meshSource ? "Open the full mesh editor" : "Mesh source not available for this model"}
              >
                <Boxes className="w-3 h-3" />
                Open Mesh Editor
              </button>
              {!meshSource && (
                <p className="text-[9px] text-white/50 leading-snug px-1">
                  This model doesn't expose its GLB bytes to the controller yet — reopen from a placement that stores the mesh locally.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-1.5 px-3 py-2.5 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/70 border border-white/[0.08] text-white/80 text-xs font-medium hover:bg-black/80 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(data)}
            className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-all"
          >
            <Check className="w-3 h-3" />
            Apply
          </button>
        </div>
      </div>
    </div>
    {meshEditorOpen && meshSource && (
      <Suspense fallback={null}>
        <MeshEditorModal
          modelName={modelName}
          source={meshSource}
          onClose={() => setMeshEditorOpen(false)}
          onApply={async (glb) => {
            try { await onMeshApply?.(glb); } finally { setMeshEditorOpen(false); }
          }}
        />
      </Suspense>
    )}
    </>
  );
}
