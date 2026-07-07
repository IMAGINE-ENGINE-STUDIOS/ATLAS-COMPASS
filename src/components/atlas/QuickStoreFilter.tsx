import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Store, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export type StoreFilterOption = {
  key: string;
  label: string;
  icon: ReactNode;
  color?: string; // tailwind base color name fragment, e.g. "emerald"
  hex?: string;   // border/glow hex
};


interface Props {
  options: StoreFilterOption[];
  value: string;
  onChange: (key: string) => void;
  onInteract?: () => void;
  /** Fired when the user taps a filter — use to force-load stores instantly. */
  onActivate?: (key: string) => void;
  /** Fired when the expanded picker opens or closes, so the parent can
   *  dismiss competing panels (e.g. the search-results panel) that would
   *  otherwise sit on top of the filter menu. */
  onOpenChange?: (open: boolean) => void;
  /** True while the current filter is fetching results in the background
   *  (Overpass / Nominatim). Renders a small inline spinner on the pill,
   *  matching the Earth Intelligence loading affordance. */
  busy?: boolean;
}

export default function QuickStoreFilter({ options, value, onChange, onInteract, onActivate, onOpenChange, busy }: Props) {
  const [open, _setOpen] = useState(false);
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    _setOpen((prev) => {
      const next = typeof v === "function" ? (v as any)(prev) : v;
      if (next !== prev) onOpenChange?.(next);
      return next;
    });
  };
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
    onInteract?.();
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
      onPointerDownCapture={onInteract}
      onMouseDownCapture={onInteract}
      onTouchStartCapture={onInteract}
      className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-1"
    >
      {/* Up arrow + category list (expanded) */}
      {open && (
        <>
          <button
            onClick={() => step(-1)}
            aria-label="Previous filter"
            className="w-8 h-8 rounded-full bg-black/70 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-white/85 hover:text-white hover:bg-black/85 transition-all animate-fade-in"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <div className="flex flex-col gap-1 p-1.5 rounded-xl bg-black/70 backdrop-blur-xl border border-white/[0.08] animate-fade-in max-h-[51vh] overflow-y-auto no-scrollbar">
            {options.map(opt => {
              const active = opt.key === value;
              const hex = opt.hex || "#94a3b8";
              return (
                <button
                  key={opt.key}
                  onClick={(e) => { e.stopPropagation(); onInteract?.(); onChange(opt.key); }}
                  title={opt.label}
                  className="relative flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full transition-all backdrop-blur-xl border border-transparent hover:bg-white/[0.04]"
                >
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }}
                  >
                    {opt.icon}
                  </span>
                  <span
                    className="text-[11px] font-medium tracking-wide whitespace-nowrap"
                    style={{ color: "rgba(255,255,255,0.75)" }}
                  >
                    {opt.label}
                  </span>
                  {/* Selection mark — a single green dot, matching the
                      indicator on the collapsed pill so the currently
                      active filter isn't visually duplicated. */}
                  {active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" style={{ boxShadow: "0 0 6px rgba(52,211,153,0.85)" }} />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Main pill store button */}
      <button
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onClick={(e) => { e.stopPropagation(); onInteract?.(); setOpen(o => !o); onActivate?.(current?.key ?? value); }}
        title={open ? `Filter: ${current?.label}` : "Hold to choose store filter"}
        aria-label="Quick store filter"
        className="relative flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full backdrop-blur-xl border transition-all select-none touch-none"
        style={open ? {
          background: `${current?.hex || "#94a3b8"}22`,
          borderColor: `${current?.hex || "#94a3b8"}66`,
          boxShadow: `0 4px 20px ${current?.hex || "#94a3b8"}33`,
          color: current?.hex || "#94a3b8",
        } : {
          background: "rgba(0,0,0,0.7)",
          borderColor: "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.85)",
        }}
      >
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
          style={open ? { background: `${current?.hex || "#94a3b8"}33` } : { background: "rgba(255,255,255,0.06)" }}
        >
          {busy ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            current?.icon ?? <Store className="w-3 h-3" />
          )}
        </span>
        {!open && (
          <span className="text-[11px] font-medium tracking-wide whitespace-nowrap">
            {current?.label ?? "Stores"}
          </span>
        )}
        {/* Active dot indicator */}
        {value && value !== "all" && !busy && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-black/70" />
        )}
        {busy && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border-2 border-black/70 animate-pulse"
            title="Loading places…"
          />
        )}
      </button>

      {/* Down arrow (expanded) */}
      {open && (
        <button
          onClick={() => step(1)}
          aria-label="Next filter"
          className="w-8 h-8 rounded-full bg-black/70 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-white/85 hover:text-white hover:bg-black/85 transition-all animate-fade-in"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Label chip removed: the selection is already indicated by the
          green dot next to the active row in the picker above, so this
          chip was a third visual copy of the same information. */}
    </div>
  );
}