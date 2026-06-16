import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Store } from "lucide-react";
import type { ReactNode } from "react";

export type StoreFilterOption = {
  key: string;
  label: string;
  icon: ReactNode;
};

interface Props {
  options: StoreFilterOption[];
  value: string;
  onChange: (key: string) => void;
  /** Fired when the user taps the main button — use to force-load stores instantly. */
  onActivate?: () => void;
}

export default function QuickStoreFilter({ options, value, onChange, onActivate }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<number | null>(null);

  const idx = Math.max(0, options.findIndex(o => o.key === value));
  const current = options[idx] ?? options[0];

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const startHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setOpen(true), 280);
  };
  const cancelHold = () => {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  };

  const step = (delta: number) => {
    const next = options[(idx + delta + options.length) % options.length];
    if (next) onChange(next.key);
  };

  return (
    <div
      ref={rootRef}
      className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5"
    >
      {/* Up arrow + category list (expanded) */}
      {open && (
        <>
          <button
            onClick={() => step(-1)}
            aria-label="Previous filter"
            className="w-9 h-9 rounded-full bg-black/70 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-white/85 hover:text-white hover:bg-black/85 transition-all animate-fade-in"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <div className="flex flex-col gap-1 p-1.5 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/[0.08] animate-fade-in max-h-[60vh] overflow-y-auto no-scrollbar">
            {options.map(opt => {
              const active = opt.key === value;
              return (
                <button
                  key={opt.key}
                  onClick={() => { onChange(opt.key); onActivate?.(); }}
                  title={opt.label}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    active
                      ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                      : "text-white/70 hover:text-white hover:bg-white/[0.08] border border-transparent"
                  }`}
                >
                  {opt.icon}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Main circular store button */}
      <button
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onClick={() => { setOpen(o => !o); onActivate?.(); }}
        title={open ? `Filter: ${current?.label}` : "Hold to choose store filter"}
        aria-label="Quick store filter"
        className={`relative w-12 h-12 rounded-full backdrop-blur-xl border flex items-center justify-center transition-all select-none touch-none ${
          open
            ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.4)]"
            : "bg-black/70 border-white/[0.08] text-white/85 hover:text-white hover:bg-black/85"
        }`}
      >
        {current?.icon ?? <Store className="w-5 h-5" />}
        {/* Active dot indicator */}
        {value && value !== "all" && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-black/70" />
        )}
      </button>

      {/* Down arrow (expanded) */}
      {open && (
        <button
          onClick={() => step(1)}
          aria-label="Next filter"
          className="w-9 h-9 rounded-full bg-black/70 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-white/85 hover:text-white hover:bg-black/85 transition-all animate-fade-in"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {/* Label chip */}
      {open && current && (
        <div className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-xl border border-white/[0.08] text-[10px] font-mono text-white/85 animate-fade-in whitespace-nowrap">
          {current.label}
        </div>
      )}
    </div>
  );
}