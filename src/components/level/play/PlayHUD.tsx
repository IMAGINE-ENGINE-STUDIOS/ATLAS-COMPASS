import { useEffect, useState } from "react";
import { X, Hand, Zap, Footprints } from "lucide-react";
import {
  subscribeHudCandidate,
  subscribeEventLog,
  type HudCandidate,
} from "@/components/level/locomotion/locomotionState";

/**
 * Play-mode HUD overlay. Renders only while `playing`. Fully outside the R3F
 * canvas — it's a fixed-position div over the viewport.
 *
 * Shows:
 *  - contextual prompt (centered, bottom) for the nearest in-range interactable
 *  - control legend + exit button (bottom-right)
 *  - recent event toasts (top-right) — last 3
 */
export default function PlayHUD({
  visible,
  onExit,
}: {
  visible: boolean;
  onExit: () => void;
}) {
  const [candidate, setCandidate] = useState<HudCandidate | null>(null);
  const [log, setLog] = useState<Array<{ id: string; at: number }>>([]);

  useEffect(() => {
    if (!visible) return;
    const u1 = subscribeHudCandidate(setCandidate);
    const u2 = subscribeEventLog((l) => setLog(l.slice(0, 3).map((e) => ({ id: e.id, at: e.at }))));
    return () => { u1(); u2(); };
  }, [visible]);

  if (!visible) return null;

  const iconForKind = (k: HudCandidate["kind"]) => {
    if (k === "grabbable") return <Hand className="w-3.5 h-3.5" />;
    if (k === "event") return <Zap className="w-3.5 h-3.5" />;
    return <Footprints className="w-3.5 h-3.5" />;
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Bottom-center prompt */}
      {candidate && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[14%] flex items-center gap-2 px-4 py-2 rounded-full border border-primary/40 bg-background/80 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.35)] animate-fade-in">
          <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-md border border-primary/60 bg-primary/10 text-primary font-mono text-[12px] uppercase tracking-wider">
            {candidate.key}
          </span>
          <span className="text-foreground/90">{iconForKind(candidate.kind)}</span>
          <span className="text-[13px] text-foreground">{candidate.label}</span>
        </div>
      )}

      {/* Top-right event log */}
      {log.length > 0 && (
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 max-w-[260px]">
          {log.map((e, i) => (
            <div
              key={`${e.id}-${e.at}`}
              className="px-3 py-1.5 rounded-md border border-primary/40 bg-background/80 backdrop-blur-md text-[11px] font-mono text-foreground/90 shadow animate-fade-in"
              style={{ opacity: 1 - i * 0.25 }}
            >
              <span className="text-primary mr-1">●</span> event:{e.id}
            </div>
          ))}
        </div>
      )}

      {/* Bottom-right legend + exit */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-2">
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/60 bg-background/70 backdrop-blur-md text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <kbd className="px-1 rounded bg-card/80 border border-border/60">WASD</kbd>
          <span>Move</span>
          <kbd className="px-1 rounded bg-card/80 border border-border/60 ml-1">Space</kbd>
          <span>Jump</span>
          <kbd className="px-1 rounded bg-card/80 border border-border/60 ml-1">Shift</kbd>
          <span>Run</span>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-destructive/50 bg-destructive/10 hover:bg-destructive/20 text-destructive text-[11px] uppercase tracking-wider font-medium transition-colors"
          title="Exit Play mode"
        >
          <X className="w-3.5 h-3.5" /> Exit
        </button>
      </div>
    </div>
  );
}