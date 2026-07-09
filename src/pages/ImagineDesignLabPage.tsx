/**
 * ImagineDesignLabPage
 * --------------------
 * A design sandbox for the Imagine Engine. Each card renders a real UI
 * component snapshot at 20% scale so we can compare aesthetic variants
 * (glass, brutalist, editorial, neon…) applied to the same building
 * blocks (inspector panel, mesh list, toolbar, footer bar, wizard tile,
 * palette swatch, etc.) that the Mesh Editor established.
 *
 * Route: /imagine-lab
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Boxes, Paintbrush, Eye, EyeOff, Check, Undo2, Redo2, X, Grid3x3,
  Sparkles, Palette, Upload, Droplet, Search, Layers, Wand2, ChevronLeft,
  Rocket, AlertCircle, Zap, Ghost, MousePointer2, Command,
} from "lucide-react";
import { toast } from "sonner";
import { useImagineTheme, type ImagineThemeId } from "@/lib/imagineTheme";

/* ------------------------------------------------------------------ */
/*  Style variants — each one restyles the SAME sub-components below   */
/* ------------------------------------------------------------------ */

type VariantId = ImagineThemeId;

interface Variant {
  id: VariantId;
  name: string;
  tag: string;
  /** Root shell classes for a panel. */
  shell: string;
  /** Accent gradient bar (top of window). */
  accentBar: string;
  /** Header row. */
  header: string;
  /** Header title. */
  title: string;
  /** Secondary text. */
  subtitle: string;
  /** Section label. */
  sectionLabel: string;
  /** List row (default). */
  row: string;
  /** List row (selected). */
  rowActive: string;
  /** Small icon button. */
  iconBtn: string;
  /** Primary action. */
  primary: string;
  /** Ghost action. */
  ghost: string;
  /** Pill/chip. */
  chip: string;
  /** Sub-card (inspector nested block). */
  subCard: string;
  /** Input / select. */
  input: string;
  /** Font family override. */
  font: string;
  /** Background under the frame. */
  pageBg: string;
  /** Accent color used for swatch/pulse indicator. */
  accentHex: string;
}

const VARIANTS: Variant[] = [
  {
    id: "glass-fuchsia",
    name: "Glass Fuchsia",
    tag: "Current · Mesh Editor",
    shell: "rounded-2xl border border-white/[0.08] bg-black/85 backdrop-blur-2xl shadow-[0_30px_80px_rgba(0,0,0,0.75)] text-white",
    accentBar: "h-[2px] bg-gradient-to-r from-fuchsia-500/70 via-cyan-400/60 to-fuchsia-500/70",
    header: "border-b border-white/[0.06] px-4 py-2.5",
    title: "text-sm font-semibold text-white",
    subtitle: "text-[10px] uppercase tracking-widest text-white/60",
    sectionLabel: "text-[9px] uppercase tracking-widest text-white/50",
    row: "text-white/75 hover:bg-white/[0.06] rounded-md px-1.5 py-1 text-[11px]",
    rowActive: "bg-blue-500/20 text-blue-200 border border-blue-500/40 shadow-[0_0_18px_-6px_rgba(59,130,246,0.7)] rounded-md px-1.5 py-1 text-[11px]",
    iconBtn: "w-7 h-7 rounded-md bg-black/70 border border-white/[0.08] text-white/80 hover:bg-white/[0.12]",
    primary: "bg-fuchsia-500/25 border border-fuchsia-500/40 text-fuchsia-100 hover:bg-fuchsia-500/35",
    ghost: "bg-black/70 border border-white/[0.08] text-white/80 hover:bg-black/80",
    chip: "bg-blue-500/15 border border-blue-500/40 text-blue-200",
    subCard: "rounded-lg border border-white/[0.06] bg-black/40",
    input: "bg-black/60 border border-white/[0.08] text-white/85",
    font: "font-sans",
    pageBg: "bg-[radial-gradient(circle_at_30%_20%,#3b0764_0%,#020617_60%)]",
    accentHex: "#d946ef",
  },
  {
    id: "editorial-mono",
    name: "Editorial Mono",
    tag: "Swiss · Restraint",
    shell: "rounded-none border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-[0_20px_60px_rgba(0,0,0,0.6)]",
    accentBar: "h-px bg-neutral-700",
    header: "border-b border-neutral-800 px-4 py-3",
    title: "text-[13px] font-medium tracking-tight",
    subtitle: "text-[9px] uppercase tracking-[0.25em] text-neutral-500",
    sectionLabel: "text-[9px] uppercase tracking-[0.25em] text-neutral-500",
    row: "text-neutral-300 hover:bg-neutral-900 px-2 py-1.5 text-[11px] border-l-2 border-transparent",
    rowActive: "text-white bg-neutral-900 px-2 py-1.5 text-[11px] border-l-2 border-white",
    iconBtn: "w-7 h-7 rounded-none border border-neutral-800 text-neutral-300 hover:bg-neutral-900",
    primary: "bg-white text-black border border-white hover:bg-neutral-200",
    ghost: "bg-transparent border border-neutral-800 text-neutral-300 hover:bg-neutral-900",
    chip: "bg-neutral-900 border border-neutral-700 text-neutral-300",
    subCard: "rounded-none border border-neutral-800 bg-neutral-950",
    input: "bg-neutral-950 border border-neutral-800 text-neutral-200",
    font: "font-mono",
    pageBg: "bg-neutral-100",
    accentHex: "#ffffff",
  },
  {
    id: "brutalist-block",
    name: "Brutalist Block",
    tag: "Neo-brutalist",
    shell: "rounded-none border-2 border-black bg-yellow-300 text-black shadow-[8px_8px_0_0_rgba(0,0,0,1)]",
    accentBar: "h-2 bg-black",
    header: "border-b-2 border-black px-4 py-3",
    title: "text-sm font-black uppercase tracking-tight",
    subtitle: "text-[10px] font-bold uppercase",
    sectionLabel: "text-[10px] font-black uppercase",
    row: "border-2 border-black bg-white text-black px-2 py-1.5 text-[11px] font-bold hover:bg-yellow-100",
    rowActive: "border-2 border-black bg-black text-yellow-300 px-2 py-1.5 text-[11px] font-black uppercase",
    iconBtn: "w-7 h-7 rounded-none border-2 border-black bg-white text-black hover:bg-yellow-200",
    primary: "bg-black text-yellow-300 border-2 border-black font-black uppercase hover:bg-neutral-800",
    ghost: "bg-white text-black border-2 border-black font-bold hover:bg-yellow-200",
    chip: "bg-red-500 border-2 border-black text-white font-black uppercase",
    subCard: "rounded-none border-2 border-black bg-white",
    input: "bg-white border-2 border-black text-black font-bold",
    font: "font-sans",
    pageBg: "bg-[repeating-linear-gradient(45deg,#fef3c7_0_20px,#fde68a_20px_40px)]",
    accentHex: "#000000",
  },
  {
    id: "neon-cyber",
    name: "Neon Cyber",
    tag: "Cyberpunk HUD",
    shell: "rounded-md border border-cyan-400/40 bg-[#050914] text-cyan-100 shadow-[0_0_40px_rgba(34,211,238,0.25),inset_0_0_20px_rgba(34,211,238,0.05)]",
    accentBar: "h-[3px] bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-cyan-400",
    header: "border-b border-cyan-400/30 px-4 py-2.5",
    title: "text-sm font-bold text-cyan-200 tracking-wider uppercase",
    subtitle: "text-[10px] uppercase tracking-[0.3em] text-cyan-500/80",
    sectionLabel: "text-[9px] uppercase tracking-[0.3em] text-fuchsia-400",
    row: "text-cyan-200/80 hover:bg-cyan-500/10 px-1.5 py-1 text-[11px] border-l border-transparent",
    rowActive: "bg-fuchsia-500/15 text-fuchsia-200 border-l-2 border-fuchsia-400 px-1.5 py-1 text-[11px] shadow-[inset_0_0_20px_rgba(217,70,239,0.15)]",
    iconBtn: "w-7 h-7 rounded-sm border border-cyan-400/30 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15",
    primary: "bg-fuchsia-500/20 border border-fuchsia-400 text-fuchsia-100 uppercase tracking-wider hover:bg-fuchsia-500/30 shadow-[0_0_20px_rgba(217,70,239,0.4)]",
    ghost: "bg-transparent border border-cyan-400/30 text-cyan-200 uppercase tracking-wider hover:bg-cyan-500/10",
    chip: "bg-fuchsia-500/10 border border-fuchsia-400/40 text-fuchsia-200",
    subCard: "rounded-sm border border-cyan-400/20 bg-cyan-500/[0.03]",
    input: "bg-black border border-cyan-400/30 text-cyan-200",
    font: "font-mono",
    pageBg: "bg-[#020617]",
    accentHex: "#22d3ee",
  },
  {
    id: "aurora-glow",
    name: "Aurora Glow",
    tag: "Ethereal · Ambient",
    shell: "rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/80 via-slate-900/70 to-emerald-950/70 backdrop-blur-xl text-white shadow-[0_30px_80px_rgba(16,185,129,0.15)]",
    accentBar: "h-[3px] bg-gradient-to-r from-emerald-400/70 via-sky-400/70 to-violet-400/70",
    header: "border-b border-white/[0.06] px-4 py-3",
    title: "text-sm font-medium text-white",
    subtitle: "text-[10px] tracking-wide text-emerald-200/70",
    sectionLabel: "text-[10px] tracking-wide text-emerald-300/70",
    row: "text-white/75 hover:bg-white/[0.05] rounded-xl px-2 py-1.5 text-[11px]",
    rowActive: "bg-gradient-to-r from-emerald-400/20 to-sky-400/20 text-white rounded-xl px-2 py-1.5 text-[11px] border border-emerald-300/30",
    iconBtn: "w-7 h-7 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 hover:bg-white/[0.12]",
    primary: "bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-900 hover:brightness-110 border border-white/20",
    ghost: "bg-white/[0.06] border border-white/10 text-white/80 hover:bg-white/[0.10]",
    chip: "bg-emerald-400/15 border border-emerald-300/30 text-emerald-100",
    subCard: "rounded-2xl border border-white/[0.06] bg-black/30",
    input: "bg-white/[0.05] border border-white/10 text-white/85",
    font: "font-sans",
    pageBg: "bg-[radial-gradient(circle_at_70%_30%,#064e3b_0%,#0f172a_65%)]",
    accentHex: "#34d399",
  },
  {
    id: "paper-serif",
    name: "Paper & Serif",
    tag: "Editorial · Warm",
    shell: "rounded-lg border border-stone-300 bg-stone-50 text-stone-900 shadow-[0_20px_50px_rgba(0,0,0,0.15)]",
    accentBar: "h-px bg-stone-300",
    header: "border-b border-stone-200 px-4 py-3",
    title: "text-[15px] font-normal tracking-tight",
    subtitle: "text-[10px] italic text-stone-500",
    sectionLabel: "text-[10px] uppercase tracking-widest text-stone-500",
    row: "text-stone-700 hover:bg-stone-100 rounded px-2 py-1.5 text-[11px]",
    rowActive: "bg-stone-900 text-stone-50 rounded px-2 py-1.5 text-[11px]",
    iconBtn: "w-7 h-7 rounded-full border border-stone-300 bg-white text-stone-700 hover:bg-stone-100",
    primary: "bg-stone-900 text-stone-50 border border-stone-900 hover:bg-stone-800 rounded",
    ghost: "bg-transparent border border-stone-300 text-stone-700 hover:bg-stone-100 rounded",
    chip: "bg-stone-100 border border-stone-300 text-stone-700",
    subCard: "rounded border border-stone-200 bg-white",
    input: "bg-white border border-stone-300 text-stone-800",
    font: "font-serif",
    pageBg: "bg-stone-200",
    accentHex: "#57534e",
  },
  {
    id: "obsidian-gold",
    name: "Obsidian & Gold",
    tag: "Luxury · Editorial",
    shell: "rounded-xl border border-amber-500/25 bg-neutral-950 text-amber-50 shadow-[0_30px_80px_rgba(0,0,0,0.7)]",
    accentBar: "h-[2px] bg-gradient-to-r from-amber-300/70 via-amber-500/80 to-amber-300/70",
    header: "border-b border-amber-500/15 px-4 py-3",
    title: "text-sm tracking-wide text-amber-100",
    subtitle: "text-[10px] uppercase tracking-[0.3em] text-amber-500/70",
    sectionLabel: "text-[9px] uppercase tracking-[0.3em] text-amber-500/70",
    row: "text-amber-50/75 hover:bg-amber-500/[0.06] px-2 py-1.5 text-[11px] rounded-md",
    rowActive: "bg-amber-500/15 text-amber-100 border border-amber-500/40 px-2 py-1.5 text-[11px] rounded-md",
    iconBtn: "w-7 h-7 rounded-md border border-amber-500/25 bg-black text-amber-100 hover:bg-amber-500/10",
    primary: "bg-amber-500 text-neutral-950 border border-amber-400 hover:bg-amber-400 font-semibold",
    ghost: "bg-transparent border border-amber-500/25 text-amber-100 hover:bg-amber-500/10",
    chip: "bg-amber-500/10 border border-amber-500/40 text-amber-200",
    subCard: "rounded-lg border border-amber-500/15 bg-neutral-900/60",
    input: "bg-neutral-900 border border-amber-500/25 text-amber-100",
    font: "font-serif",
    pageBg: "bg-[radial-gradient(circle_at_50%_10%,#3a2a09_0%,#0a0a0a_60%)]",
    accentHex: "#f59e0b",
  },
  {
    id: "candy-pop",
    name: "Candy Pop",
    tag: "Playful · Rounded",
    shell: "rounded-[28px] border border-pink-200 bg-white text-pink-950 shadow-[0_25px_60px_rgba(236,72,153,0.25)]",
    accentBar: "h-[4px] bg-gradient-to-r from-pink-400 via-orange-300 to-purple-400",
    header: "border-b border-pink-100 px-4 py-3",
    title: "text-sm font-bold text-pink-900",
    subtitle: "text-[10px] font-semibold text-pink-400",
    sectionLabel: "text-[10px] font-bold uppercase tracking-wide text-pink-500",
    row: "text-pink-900/80 hover:bg-pink-50 rounded-full px-3 py-1.5 text-[11px] font-medium",
    rowActive: "bg-gradient-to-r from-pink-400 to-purple-400 text-white rounded-full px-3 py-1.5 text-[11px] font-bold shadow-md",
    iconBtn: "w-7 h-7 rounded-full bg-pink-50 border border-pink-100 text-pink-500 hover:bg-pink-100",
    primary: "bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full font-bold hover:brightness-110",
    ghost: "bg-white border border-pink-200 text-pink-500 rounded-full font-semibold hover:bg-pink-50",
    chip: "bg-purple-100 border border-purple-200 text-purple-700 rounded-full font-semibold",
    subCard: "rounded-2xl border border-pink-100 bg-pink-50/40",
    input: "bg-white border border-pink-200 text-pink-900 rounded-full",
    font: "font-sans",
    pageBg: "bg-[radial-gradient(circle_at_20%_20%,#fce7f3_0%,#f3e8ff_60%)]",
    accentHex: "#ec4899",
  },
];

/* ------------------------------------------------------------------ */
/*  Shared preview subject — Mesh Editor–style panel, styled per variant */
/* ------------------------------------------------------------------ */

const SAMPLE_MESHES = ["Chassis", "Rotor blade A", "Rotor blade B", "Landing skid", "Cockpit glass", "Beacon"];

function VariantPreview({ v }: { v: Variant }) {
  const [selected, setSelected] = useState(1);
  return (
    <div className={`${v.shell} ${v.font} overflow-hidden`} style={{ width: 1100, height: 720 }}>
      <div className={v.accentBar} />
      {/* Header */}
      <div className={`flex items-center justify-between ${v.header}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${v.accentHex}22`, border: `1px solid ${v.accentHex}55` }}
          >
            <Boxes className="w-4 h-4" style={{ color: v.accentHex }} />
          </div>
          <div className="min-w-0">
            <p className={v.title}>Mesh Editor — Aerocab Mk III</p>
            <p className={v.subtitle}>In-earth authoring</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className={`${v.iconBtn} flex items-center justify-center`}><Undo2 className="w-3.5 h-3.5" /></button>
          <button className={`${v.iconBtn} flex items-center justify-center`}><Redo2 className="w-3.5 h-3.5" /></button>
          <button className={`${v.iconBtn} flex items-center justify-center`}><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Body */}
      <div className="flex h-[calc(100%-44px-56px)]">
        {/* Component list */}
        <aside className={`w-56 shrink-0 p-2 overflow-hidden ${v.id === "brutalist-block" ? "border-r-2 border-black" : "border-r border-white/[0.06]"}`}>
          <p className={`${v.sectionLabel} px-1 pb-1.5`}>Components</p>
          <div className="relative mb-2">
            <Search className="w-3 h-3 opacity-50 absolute left-1.5 top-1/2 -translate-y-1/2" />
            <input
              readOnly value="Search…"
              className={`w-full pl-6 pr-2 py-1.5 text-[10px] rounded-md focus:outline-none ${v.input}`}
            />
          </div>
          <ul className="space-y-1">
            {SAMPLE_MESHES.map((name, i) => (
              <li
                key={name}
                onClick={() => setSelected(i)}
                className={`flex items-center gap-1.5 cursor-pointer ${selected === i ? v.rowActive : v.row}`}
              >
                {i === 2 ? <EyeOff className="w-3 h-3 opacity-60" /> : <Eye className="w-3 h-3 opacity-80" />}
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Viewport */}
        <div className="flex-1 relative overflow-hidden" style={{
          background: v.id === "candy-pop"
            ? "radial-gradient(circle at 40% 40%, #fbcfe8 0%, #f5d0fe 100%)"
            : v.id === "paper-serif"
            ? "radial-gradient(circle at 40% 40%, #f5f5f4 0%, #e7e5e4 100%)"
            : "radial-gradient(circle at 40% 40%, rgba(59,130,246,0.15) 0%, #05070c 65%)",
        }}>
          {/* Fake 3D model silhouette */}
          <svg viewBox="0 0 200 200" className="absolute inset-0 m-auto w-1/2 h-1/2 opacity-90">
            <defs>
              <linearGradient id={`g-${v.id}`} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor={v.accentHex} stopOpacity="0.9" />
                <stop offset="1" stopColor={v.accentHex} stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <polygon points="100,20 170,70 170,150 100,180 30,150 30,70" fill={`url(#g-${v.id})`} stroke={v.accentHex} strokeWidth="1.2" opacity="0.85" />
            <polygon points="100,20 170,70 100,110 30,70" fill={v.accentHex} opacity="0.35" />
          </svg>
          {/* Viewport toolbar */}
          <div className={`absolute top-3 left-3 flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${v.id === "brutalist-block" ? "bg-white border-2 border-black" : "bg-black/70 border border-white/[0.08] backdrop-blur-md"}`}>
            <button className={`${v.iconBtn} flex items-center justify-center`}><Grid3x3 className="w-3.5 h-3.5" /></button>
            <select className={`px-2 py-1 text-[10px] rounded-md focus:outline-none ${v.input}`} defaultValue="studio">
              <option>studio</option><option>sunset</option><option>city</option>
            </select>
          </div>
          {/* Pulse chip */}
          <div className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] ${v.chip}`}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: v.accentHex }} />
            Pulsing selection · 5s on / 5s off
          </div>
          <div className={`absolute bottom-3 left-3 text-[9px] uppercase tracking-widest px-2 py-1 rounded ${v.id === "brutalist-block" ? "bg-white text-black border-2 border-black font-bold" : "bg-black/60 text-white/60"}`}>
            Click a component to inspect · drag to orbit
          </div>
        </div>

        {/* Inspector */}
        <aside className={`w-72 shrink-0 p-3 overflow-hidden space-y-3 ${v.id === "brutalist-block" ? "border-l-2 border-black" : "border-l border-white/[0.06]"}`}>
          <div>
            <p className={`${v.sectionLabel} pb-1.5 flex items-center gap-1`}><Palette className="w-3 h-3" /> Material override</p>
            <div className="space-y-1.5">
              {["Base color", "Metalness", "Roughness", "Opacity", "Emissive"].map((k, i) => (
                <div key={k} className="flex items-center gap-2 text-[10px]">
                  <span className="w-16 opacity-70">{k}</span>
                  {i === 0 || i === 4 ? (
                    <>
                      <div className="w-8 h-6 rounded border" style={{ background: v.accentHex, borderColor: `${v.accentHex}55` }} />
                      <div className={`flex-1 px-1.5 py-1 rounded font-mono text-[10px] ${v.input}`}>{i === 0 ? "#3b82f6" : "#000000"}</div>
                    </>
                  ) : (
                    <>
                      <div className={`flex-1 h-1.5 rounded-full relative ${v.id === "brutalist-block" ? "bg-black" : "bg-white/10"}`}>
                        <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ left: `${40 + i * 10}%`, background: v.accentHex, boxShadow: `0 0 10px ${v.accentHex}80` }} />
                      </div>
                      <span className="w-8 text-right font-mono opacity-70">0.{4 + i}0</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className={`${v.sectionLabel} pb-1.5 flex items-center gap-1`}><Paintbrush className="w-3 h-3" /> Face painter</p>
            <button className={`w-full flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider rounded-lg ${v.primary}`}>
              <Paintbrush className="w-3 h-3" /> Enable paint mode
            </button>
            <div className="flex items-center gap-1.5 pt-2">
              {["#ff5577", "#3b82f6", "#22d3ee", "#f5f5f5", "#facc15", "#84cc16", "#a855f7", v.accentHex].map((sw, i) => (
                <div key={i}
                  className={`w-5 h-5 rounded-full border ${i === 7 ? "ring-2 ring-offset-1 ring-offset-transparent scale-110" : ""}`}
                  style={{ background: sw, borderColor: i === 7 ? "#fff" : "rgba(255,255,255,0.2)" }}
                />
              ))}
            </div>
            <div className={`mt-2 flex items-center gap-2 text-[10px] px-1.5 py-1 rounded ${v.input}`}>
              <Droplet className="w-3 h-3 opacity-60" />
              <div className="flex-1 h-1.5 rounded-full relative bg-black/20">
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ left: `60%`, background: v.accentHex }} />
              </div>
              <span className="font-mono opacity-70">0.75</span>
            </div>

            <div className={`mt-2 p-2 space-y-1.5 ${v.subCard}`}>
              <div className="flex items-center justify-between">
                <span className={`${v.sectionLabel} flex items-center gap-1`}><Layers className="w-2.5 h-2.5" /> Texture</span>
                <div className="flex gap-0.5">
                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider opacity-70">gallery</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-white/[0.12] opacity-90">saved</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i}
                    className={`aspect-square rounded overflow-hidden border ${i === 3 ? "ring-2" : ""}`}
                    style={{
                      background: `linear-gradient(${i * 45}deg, ${v.accentHex}66, ${v.accentHex}22)`,
                      borderColor: i === 3 ? v.accentHex : "rgba(255,255,255,0.15)",
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-1 pt-1">
                <div className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] ${v.ghost}`}>
                  <Upload className="w-3 h-3" /> Upload
                </div>
                <div className={`px-2 py-1 rounded text-[10px] ${v.ghost}`}>Clear</div>
              </div>
            </div>
          </div>

          <div>
            <p className={`${v.sectionLabel} pb-1 flex items-center gap-1`}><Sparkles className="w-3 h-3" /> Notes</p>
            <p className="text-[10px] opacity-60 leading-snug">
              On Apply, edits are baked into a fresh GLB and reloaded on the earth.
            </p>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between gap-2 px-4 py-3 ${v.id === "brutalist-block" ? "border-t-2 border-black" : "border-t border-white/[0.06]"}`}>
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] px-2 py-1 rounded ${v.chip}`}>{v.tag}</span>
          <span className="text-[9px] opacity-50">Wand2 · Imagine Engine</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className={`px-3 py-1.5 rounded-lg text-xs font-medium ${v.ghost}`}>Cancel</button>
          <button className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${v.primary}`}>
            <Check className="w-3 h-3" /> Apply to Earth
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Additional themed previews                                         */
/* ------------------------------------------------------------------ */

/** Compact Face Painter card — the very component we just built. */
function FacePainterPreview({ v }: { v: Variant }) {
  const [color, setColor] = useState("#3b82f6");
  return (
    <div className={`${v.shell} ${v.font} p-3 space-y-2.5`} style={{ width: 320 }}>
      <div className="flex items-center justify-between">
        <span className={`${v.sectionLabel} flex items-center gap-1.5`}>
          <Paintbrush className="w-3 h-3" /> Face painter
        </span>
        <button className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ${v.primary}`}>Painting</button>
      </div>
      <p className="text-[10px] opacity-60 leading-snug">Click any face to select. Shift+click to add.</p>
      <div className="flex items-center justify-between text-[10px] opacity-80">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: v.accentHex }} />
          3 faces selected
        </span>
        <div className="flex gap-1">
          <span className="px-1.5 py-0.5 rounded text-[10px] opacity-70">Clear</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] opacity-70">Reset</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {["#ff5577", "#3b82f6", "#22d3ee", "#f5f5f5", "#0f172a", "#facc15", "#84cc16", "#a855f7"].map((sw) => (
          <button key={sw} onClick={() => setColor(sw)}
            className={`w-5 h-5 rounded-full border ${color === sw ? "scale-110 ring-2 ring-white/40" : ""}`}
            style={{ background: sw, borderColor: color === sw ? "#fff" : "rgba(255,255,255,0.2)" }} />
        ))}
      </div>
      <div className={`flex items-center gap-2 text-[10px] px-1.5 py-1 rounded ${v.input}`}>
        <Droplet className="w-3 h-3 opacity-60" />
        <div className="flex-1 h-1.5 rounded-full relative bg-black/20">
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ left: `70%`, background: v.accentHex }} />
        </div>
        <span className="font-mono opacity-70">0.70</span>
      </div>
      <div className={`${v.subCard} p-2 space-y-1.5`}>
        <div className="flex items-center justify-between">
          <span className={`${v.sectionLabel} flex items-center gap-1`}><Layers className="w-2.5 h-2.5" /> Texture</span>
          <div className="flex gap-0.5">
            <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider opacity-60">gallery</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-white/[0.12]">saved</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`aspect-square rounded overflow-hidden border ${i === 3 ? "ring-2" : ""}`}
              style={{
                background: `linear-gradient(${i * 45}deg, ${v.accentHex}66, ${v.accentHex}22)`,
                borderColor: i === 3 ? v.accentHex : "rgba(255,255,255,0.15)",
              }} />
          ))}
        </div>
        <div className={`flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] ${v.ghost}`}>
          <Upload className="w-3 h-3" /> Upload JPG/PNG
        </div>
      </div>
    </div>
  );
}

function EmptyStatePreview({ v }: { v: Variant }) {
  return (
    <div className={`${v.shell} ${v.font} p-8 flex flex-col items-center text-center gap-3`} style={{ width: 420, height: 320 }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${v.accentHex}25`, border: `1px solid ${v.accentHex}55` }}>
        <Ghost className="w-6 h-6" style={{ color: v.accentHex }} />
      </div>
      <p className={v.title}>No experiences yet</p>
      <p className="text-[11px] opacity-60 max-w-xs">Kick things off by creating a level or importing a package from the Imagine library.</p>
      <button className={`px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${v.primary}`}>
        <Rocket className="w-3.5 h-3.5" /> Create your first experience
      </button>
    </div>
  );
}

function ToolbarPreview({ v }: { v: Variant }) {
  return (
    <div className={`${v.shell} ${v.font} p-2 flex items-center gap-2`} style={{ width: 640 }}>
      <div className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] ${v.chip}`}>
        <Command className="w-3 h-3" /> Cmd
      </div>
      <div className="flex items-center gap-1">
        {[MousePointer2, Boxes, Paintbrush, Layers, Grid3x3].map((Ic, i) => (
          <button key={i} className={`w-8 h-8 rounded-md flex items-center justify-center ${i === 2 ? v.primary : v.ghost}`}>
            <Ic className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
      <div className={`flex-1 h-8 rounded-md flex items-center px-2 gap-2 text-[10px] ${v.input}`}>
        <Search className="w-3 h-3 opacity-50" />
        <span className="opacity-60">Search components, textures, animations…</span>
        <span className="ml-auto opacity-40">⌘K</span>
      </div>
      <button className={`px-3 py-1.5 rounded-md text-[10px] font-semibold flex items-center gap-1 ${v.primary}`}>
        <Zap className="w-3 h-3" /> Publish
      </button>
    </div>
  );
}

function DialogPreview({ v }: { v: Variant }) {
  return (
    <div className={`${v.shell} ${v.font}`} style={{ width: 460 }}>
      <div className={v.accentBar} />
      <div className={`px-5 py-4 flex items-center gap-3 ${v.header}`}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${v.accentHex}22`, border: `1px solid ${v.accentHex}55` }}>
          <AlertCircle className="w-4 h-4" style={{ color: v.accentHex }} />
        </div>
        <div>
          <p className={v.title}>Deploy this level to Atlas?</p>
          <p className={v.subtitle}>Signed placement · reversible</p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-2">
        <p className="text-[11px] opacity-70 leading-relaxed">
          Your experience will be rendered on the earth for anyone who lands within 500m of the target coordinates. You can un-deploy anytime.
        </p>
        <div className={`${v.subCard} p-2 flex items-center gap-2 text-[10px]`}>
          <span className="opacity-60">Placement</span>
          <span className="font-mono">37.7749 · -122.4194</span>
        </div>
      </div>
      <div className="px-5 py-3 flex items-center justify-end gap-2 border-t border-white/[0.06]">
        <button className={`px-3 py-1.5 rounded-lg text-xs font-medium ${v.ghost}`}>Cancel</button>
        <button className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${v.primary}`}>
          <Check className="w-3 h-3" /> Deploy
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component category registry                                         */
/* ------------------------------------------------------------------ */

type CategoryId = "panel" | "face-painter" | "empty" | "toolbar" | "dialog";

const CATEGORIES: {
  id: CategoryId;
  name: string;
  description: string;
  size: [number, number];
  render: (v: Variant) => JSX.Element;
}[] = [
  { id: "panel",        name: "Full Panel",   description: "Mesh Editor shell — list, viewport, inspector, footer",
    size: [1100, 720], render: (v) => <VariantPreview v={v} /> },
  { id: "face-painter", name: "Face Painter", description: "Compact painter inspector block",
    size: [320, 520],  render: (v) => <FacePainterPreview v={v} /> },
  { id: "empty",        name: "Empty State",  description: "First-run empty state for lists",
    size: [420, 320],  render: (v) => <EmptyStatePreview v={v} /> },
  { id: "toolbar",      name: "Toolbar",      description: "Top-level tool row with search + primary",
    size: [640, 56],   render: (v) => <ToolbarPreview v={v} /> },
  { id: "dialog",       name: "Dialog",       description: "Confirmation dialog with accent + subcard",
    size: [460, 320],  render: (v) => <DialogPreview v={v} /> },
];

export default function ImagineDesignLabPage() {
  const [zoom, setZoom] = useState(0.2);
  const [focus, setFocus] = useState<VariantId | null>(null);
  const [category, setCategory] = useState<CategoryId>("panel");
  const [activeTheme, setActiveTheme] = useImagineTheme();
  const focused = useMemo(() => VARIANTS.find(v => v.id === focus) ?? null, [focus]);
  const cat = CATEGORIES.find(c => c.id === category)!;
  const [w, h] = cat.size;

  const applyTheme = (id: VariantId) => {
    setActiveTheme(id);
    const name = VARIANTS.find(v => v.id === id)?.name ?? id;
    toast.success(`Theme applied — ${name}`, {
      description: "New components rendered with this theme will pick it up automatically.",
    });
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-black/70 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/atlas" className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/[0.12]">
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/25 border border-white/10 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">Imagine Engine — Design Lab</p>
              <p className="text-[10px] uppercase tracking-widest text-white/50">Snapshot gallery · {VARIANTS.length} directions</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.05] border border-white/10">
              <span className="text-[10px] uppercase tracking-widest text-white/50">Active</span>
              <span className="w-2 h-2 rounded-full" style={{ background: VARIANTS.find(v => v.id === activeTheme)?.accentHex }} />
              <span className="text-[11px] font-medium">{VARIANTS.find(v => v.id === activeTheme)?.name}</span>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-white/70">
              Zoom
              <input
                type="range" min={0.15} max={0.6} step={0.05}
                value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
                className="w-28"
              />
              <span className="font-mono text-white/85 w-10 text-right">{Math.round(zoom * 100)}%</span>
            </label>
          </div>
        </div>
      </header>

      {/* Intro */}
      <section className="max-w-[1600px] mx-auto px-6 pt-10 pb-4">
        <h1 className="text-4xl font-semibold tracking-tight bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-transparent">
          Design every surface of the Imagine Engine.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/60 leading-relaxed">
          Pick a component category, compare {VARIANTS.length} aesthetics side-by-side at {Math.round(zoom * 100)}% scale,
          then hit <span className="font-semibold text-white">Apply theme</span> to make it the engine-wide default.
          Click any card to inspect it full-size.
        </p>
      </section>

      {/* Category tabs */}
      <section className="max-w-[1600px] mx-auto px-6 pb-6">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                category === c.id
                  ? "bg-white text-black"
                  : "bg-white/[0.05] text-white/70 border border-white/10 hover:bg-white/[0.10]"
              }`}
            >
              {c.name}
            </button>
          ))}
          <span className="ml-3 text-[10px] text-white/40 hidden md:block">{cat.description}</span>
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-[1600px] mx-auto px-6 pb-24">
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(280, w * zoom + 48)}px, 1fr))` }}
        >
          {VARIANTS.map((v) => (
            <div
              key={v.id}
              className={`group relative rounded-2xl overflow-hidden border ${activeTheme === v.id ? "border-white/40 ring-1 ring-white/20" : "border-white/[0.06]"} ${v.pageBg} p-5 pb-4 transition-all hover:border-white/20 hover:-translate-y-1 hover:shadow-[0_30px_80px_rgba(0,0,0,0.5)]`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                    {v.name}
                    {activeTheme === v.id && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 uppercase tracking-widest">Active</span>}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-white/50">{v.tag}</p>
                </div>
                <div className="w-5 h-5 rounded-full border border-white/20" style={{ background: v.accentHex }} />
              </div>
              <button
                onClick={() => setFocus(v.id)}
                className="block w-full text-left"
                title="Click to inspect full-size"
              >
                <div
                  className="relative mx-auto"
                  style={{ width: w * zoom, height: h * zoom }}
                >
                  <div
                    className="absolute top-0 left-0 origin-top-left pointer-events-none"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    {cat.render(v)}
                  </div>
                </div>
              </button>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => setFocus(v.id)}
                  className="text-[10px] text-white/60 hover:text-white uppercase tracking-widest"
                >Inspect</button>
                <button
                  onClick={() => applyTheme(v.id)}
                  disabled={activeTheme === v.id}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${
                    activeTheme === v.id
                      ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 cursor-default"
                      : "bg-gradient-to-r from-fuchsia-500/30 to-cyan-500/25 text-white border border-fuchsia-400/50 hover:brightness-110"
                  }`}
                >
                  {activeTheme === v.id ? "Applied" : "Apply theme"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Focus modal */}
      {focused && (
        <div
          onClick={() => setFocus(null)}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 overflow-auto"
        >
          <div onClick={(e) => e.stopPropagation()} className="relative">
            <button
              onClick={() => setFocus(null)}
              className="absolute -top-12 right-0 w-9 h-9 rounded-lg bg-white/[0.08] border border-white/10 flex items-center justify-center hover:bg-white/[0.16]"
            ><X className="w-4 h-4" /></button>
            {cat.render(focused)}
            <div className="mt-4 text-center">
              <p className="text-sm font-semibold">{focused.name}</p>
              <p className="text-[10px] uppercase tracking-widest text-white/50">{focused.tag}</p>
              <button
                onClick={() => { applyTheme(focused.id); setFocus(null); }}
                className="mt-3 px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-fuchsia-500/30 to-cyan-500/25 text-white border border-fuchsia-400/50 hover:brightness-110"
              >Apply this theme engine-wide</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}