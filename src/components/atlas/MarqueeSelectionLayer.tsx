/**
 * MarqueeSelectionLayer
 * ---------------------
 * Apple-Finder-style rubber band. Uses Pointer Events so it works
 * identically for mouse, pen, touch (iPad/phone). While `active` is
 * true a transparent full-viewport capture layer sits above the globe
 * with `cursor:crosshair` and `touch-action:none`, so the OS never
 * hijacks the gesture for panning/zooming. On pointerdown we anchor
 * a rectangle; pointermove sizes it; pointerup fires `onSelect` with
 * modifier state (shift=add, alt=subtract, plain=replace). Escape
 * cancels a live drag.
 */
import { useEffect, useRef, useState } from "react";

export type MarqueeMode = "replace" | "add" | "subtract";

export interface MarqueeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mode: MarqueeMode;
}

interface Props {
  /** When true, capture pointer events over the whole viewport. */
  active: boolean;
  /** Fired on mouseup with the final rectangle. Not fired for tiny (<4px) drags. */
  onSelect: (rect: MarqueeRect) => void;
  /** Fired on mousedown so parent can suspend other pickers. */
  onDragStart?: () => void;
  /** Fired on mouseup regardless of whether a valid rect was produced. */
  onDragEnd?: () => void;
}

export default function MarqueeSelectionLayer({
  active,
  onSelect,
  onDragStart,
  onDragEnd,
}: Props) {
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const startRef = useRef<{ x: number; y: number; mode: MarqueeMode; pointerId: number } | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) { setRect(null); startRef.current = null; }
  }, [active]);

  // ESC cancels an in-flight drag.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && startRef.current) {
        startRef.current = null;
        setRect(null);
        onDragEnd?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onDragEnd]);

  const modeFromEvent = (e: PointerEvent | React.PointerEvent): MarqueeMode =>
    e.altKey ? "subtract" : e.shiftKey ? "add" : "replace";

  const handleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const mode = modeFromEvent(e);
    startRef.current = { x: e.clientX, y: e.clientY, mode, pointerId: e.pointerId };
    setRect({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY, mode });
    try { captureRef.current?.setPointerCapture(e.pointerId); } catch {}
    onDragStart?.();
    e.preventDefault();
    e.stopPropagation();
  };
  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || e.pointerId !== startRef.current.pointerId) return;
    setRect({
      x1: startRef.current.x,
      y1: startRef.current.y,
      x2: e.clientX,
      y2: e.clientY,
      mode: modeFromEvent(e),
    });
    e.preventDefault();
  };
  const handleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || e.pointerId !== startRef.current.pointerId) return;
    const finalRect: MarqueeRect = {
      x1: startRef.current.x,
      y1: startRef.current.y,
      x2: e.clientX,
      y2: e.clientY,
      mode: modeFromEvent(e),
    };
    const w = Math.abs(finalRect.x2 - finalRect.x1);
    const h = Math.abs(finalRect.y2 - finalRect.y1);
    try { captureRef.current?.releasePointerCapture(e.pointerId); } catch {}
    startRef.current = null;
    setRect(null);
    onDragEnd?.();
    if (w >= 4 && h >= 4) onSelect(finalRect);
  };

  if (!active) return null;

  const left = rect ? Math.min(rect.x1, rect.x2) : 0;
  const top = rect ? Math.min(rect.y1, rect.y2) : 0;
  const width = rect ? Math.abs(rect.x2 - rect.x1) : 0;
  const height = rect ? Math.abs(rect.y2 - rect.y1) : 0;

  return (
    <>
      {/* Map-level pointer capture — below Atlas UI controls so buttons remain clickable. */}
      <div
        ref={captureRef}
        className="fixed inset-0 z-[5] select-none"
        style={{ cursor: "crosshair", background: "transparent", touchAction: "none" }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      />
      {rect && (
        <div
          className="fixed z-[50] pointer-events-none"
          style={{
            left,
            top,
            width,
            height,
            background: "hsl(210 100% 50% / 0.15)",
            border: "1px solid hsl(210 100% 55%)",
            boxShadow: "0 0 0 0.5px hsl(210 100% 90% / 0.4) inset",
            borderRadius: 1,
          }}
        >
          {(width > 40 || height > 20) && (
            <div
              className="absolute -top-6 left-0 px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums"
              style={{
                background: "hsl(210 100% 55%)",
                color: "white",
                letterSpacing: 0.2,
              }}
            >
              {Math.round(width)} × {Math.round(height)}
              {rect.mode !== "replace" && (
                <span className="ml-1 opacity-80">
                  {rect.mode === "add" ? "＋" : "－"}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}