import { useEffect, useRef, useState } from "react";
import { ChevronUp, Globe, Satellite, Building2, Sun } from "lucide-react";
import modeGoogle from "@/assets/mode-google.jpg";
import modeRealistic from "@/assets/mode-realistic.jpg";
import modeOsm from "@/assets/mode-osm.jpg";
import modeMapbox from "@/assets/mode-mapbox.jpg";

export type ViewMode = "google" | "realistic" | "osm" | "mapbox";

interface ModeMeta {
  id: ViewMode;
  label: string;
  short: string;
  thumb: string;
  Icon: typeof Globe;
  tone: string;     // active text
  toneBg: string;   // active bg + ring
  glow: string;     // hex for glow shadow
}

const MODES: ModeMeta[] = [
  { id: "google",    label: "Google 3D",  short: "G3D", thumb: modeGoogle,    Icon: Globe,      tone: "text-emerald-300", toneBg: "bg-emerald-500/20 ring-emerald-400/50", glow: "#34d399" },
  { id: "realistic", label: "Realistic",  short: "3D",  thumb: modeRealistic, Icon: Satellite,  tone: "text-cyan-300",    toneBg: "bg-cyan-500/20 ring-cyan-400/50",       glow: "#22d3ee" },
  { id: "osm",       label: "OSM",        short: "OSM", thumb: modeOsm,       Icon: Building2,  tone: "text-orange-300",  toneBg: "bg-orange-500/20 ring-orange-400/50",   glow: "#fb923c" },
  { id: "mapbox",    label: "Satellite",  short: "Sat", thumb: modeMapbox,    Icon: Sun,        tone: "text-amber-300",   toneBg: "bg-amber-400/20 ring-amber-400/50",     glow: "#fbbf24" },
];

interface Props {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

export default function ModeCarousel({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = MODES.find((m) => m.id === value) ?? MODES[0];
  const others = MODES.filter((m) => m.id !== value);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative select-none">
      {/* Deployed vertical carousel — dropup */}
      {open && (
        <div
          className="absolute bottom-full mb-2 right-0 flex flex-col items-end gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          {others.map((m, i) => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className="group flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full bg-black/85 backdrop-blur-xl border border-white/10 hover:border-white/25 hover:bg-black/95 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
              style={{ animationDelay: `${i * 40}ms` }}
              title={m.label}
            >
              <span
                className="relative w-6 h-6 rounded-full overflow-hidden ring-1 ring-white/15 shrink-0"
                style={{ boxShadow: `0 0 12px ${m.glow}55` }}
              >
                <img src={m.thumb} alt={m.label} width={48} height={48} loading="lazy" className="w-full h-full object-cover" />
              </span>
              <span className="flex items-center gap-1 text-[10px] font-medium tracking-wide text-white/85 group-hover:text-white">
                <m.Icon className="w-2.5 h-2.5" />
                {m.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Trigger pill — shows only the selected mode + dropup chevron */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`Mode: ${active.label}`}
        className={`flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-full ring-1 transition-all ${active.toneBg} ${open ? "shadow-[0_0_20px_rgba(255,255,255,0.08)]" : ""}`}
      >
        <span
          className="relative w-6 h-6 rounded-full overflow-hidden ring-1 ring-white/20 shrink-0"
          style={{ boxShadow: `0 0 10px ${active.glow}66` }}
        >
          <img src={active.thumb} alt={active.label} width={48} height={48} className="w-full h-full object-cover" />
        </span>
        <span className={`flex items-center gap-1 text-[10px] font-semibold tracking-wide ${active.tone}`}>
          <active.Icon className="w-2.5 h-2.5" />
          <span className="hidden sm:inline">{active.label}</span>
          <span className="sm:hidden">{active.short}</span>
        </span>
        <ChevronUp className={`w-3 h-3 ${active.tone} transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}