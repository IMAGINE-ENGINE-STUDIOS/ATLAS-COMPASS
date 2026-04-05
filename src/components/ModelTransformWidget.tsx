import { useState, useCallback } from "react";
import {
  Move, RotateCcw, Scale, X, Check, ArrowDown,
  Plus, Minus,
} from "lucide-react";

export interface TransformData {
  lat: number;
  lng: number;
  alt: number;
  heading: number;
  pitch: number;
  roll: number;
  scale: number;
}

interface Props {
  modelName: string;
  initial: TransformData;
  onUpdate: (data: TransformData) => void;
  onApply: (data: TransformData) => void;
  onClose: () => void;
  onSnapToGround: (callback: (snapped: TransformData) => void) => void;
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
      <span className="text-[9px] text-white/40 uppercase tracking-wider w-8 shrink-0">{label}</span>
      <button
        onClick={() => onChange(clamp(value - step))}
        className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.12] transition-colors"
      >
        <Minus className="w-3 h-3 text-white/50" />
      </button>
      <input
        type="number"
        value={fmt(value)}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(clamp(v));
        }}
        className="w-20 bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-xs font-mono text-white text-center focus:outline-none focus:border-cyan-500/40"
      />
      <button
        onClick={() => onChange(clamp(value + step))}
        className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.12] transition-colors"
      >
        <Plus className="w-3 h-3 text-white/50" />
      </button>
    </div>
  );
}

function RotationSlider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-white/40 uppercase tracking-wider w-12 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 appearance-none rounded-full bg-white/[0.08] cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-cyan-600 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(0,200,255,0.4)]"
      />
      <span className="text-[10px] font-mono text-white/60 w-10 text-right">{value}°</span>
    </div>
  );
}

export default function ModelTransformWidget({ modelName, initial, onUpdate, onApply, onClose, onSnapToGround }: Props) {
  const [data, setData] = useState<TransformData>(initial);
  const [tab, setTab] = useState<"position" | "rotation" | "scale">("position");

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
    { key: "position" as const, label: "Position", icon: <Move className="w-3.5 h-3.5" /> },
    { key: "rotation" as const, label: "Rotation", icon: <RotateCcw className="w-3.5 h-3.5" /> },
    { key: "scale" as const, label: "Scale", icon: <Scale className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-[340px] max-w-[calc(100vw-2rem)]">
      <div className="bg-black/60 backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.06)] overflow-hidden">
        {/* Gradient top accent */}
        <div className="h-[2px] bg-gradient-to-r from-cyan-500/60 via-purple-500/40 to-cyan-500/60" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <span className="text-xs">🏗️</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{modelName}</p>
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Transform Editor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/30 transition-all"
          >
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-3 py-2 border-b border-white/[0.04]">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                tab === t.key
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : "text-white/40 hover:text-white/60 border border-transparent hover:bg-white/[0.04]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-2.5">
          {tab === "position" && (
            <>
              <StepInput label="Lat" value={data.lat} step={0.0001} decimals={6} onChange={v => update({ lat: v })} />
              <StepInput label="Lng" value={data.lng} step={0.0001} decimals={6} onChange={v => update({ lng: v })} />
              <StepInput label="Alt" value={data.alt} step={1} min={0} decimals={1} onChange={v => update({ alt: v })} />
              <button
                onClick={onSnapToGround}
                className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/25 transition-all"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                Snap to Ground
              </button>
            </>
          )}

          {tab === "rotation" && (
            <>
              <RotationSlider label="Heading" value={data.heading} min={0} max={360} onChange={v => update({ heading: v })} />
              <RotationSlider label="Pitch" value={data.pitch} min={-90} max={90} onChange={v => update({ pitch: v })} />
              <RotationSlider label="Roll" value={data.roll} min={-180} max={180} onChange={v => update({ roll: v })} />
              <button
                onClick={() => update({ heading: 0, pitch: 0, roll: 0 })}
                className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/40 text-[11px] font-medium hover:bg-white/[0.08] transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Rotation
              </button>
            </>
          )}

          {tab === "scale" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/40 uppercase tracking-wider w-12 shrink-0">Scale</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={scaleToSlider(data.scale)}
                  onChange={e => update({ scale: Math.round(sliderToScale(Number(e.target.value)) * 100) / 100 })}
                  className="flex-1 h-1.5 appearance-none rounded-full bg-white/[0.08] cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:border-2
                    [&::-webkit-slider-thumb]:border-cyan-600 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(0,200,255,0.4)]"
                />
                <span className="text-[10px] font-mono text-white/60 w-12 text-right">{data.scale}x</span>
              </div>
              {/* Quick presets */}
              <div className="flex gap-1.5 mt-1">
                {[0.1, 0.5, 1, 5, 10, 50].map(s => (
                  <button
                    key={s}
                    onClick={() => update({ scale: s })}
                    className={`flex-1 px-1 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                      data.scale === s
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.08]"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/50 text-xs font-medium hover:bg-white/[0.08] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(data)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
