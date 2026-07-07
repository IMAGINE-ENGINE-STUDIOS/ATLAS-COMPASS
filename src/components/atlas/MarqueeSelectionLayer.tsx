/**
 * MarqueeSelectionLayer
 * ---------------------
 * Apple-Finder-style rubber band selection over the Cesium canvas.
 *
 * Enabled only while `active` is true. On mousedown starts a rectangle
 * anchored to the pointer; on mousemove updates the size; on mouseup
 * calls `onSelect` with the final screen-space rectangle plus modifier
 * state (shift = add, alt = subtract, plain = replace).
 *
 * The visual style mirrors macOS Finder: a 15%-opacity fill of the OS
 * accent (blue), a 1px accent border, and a subtle drop shadow. We use
 * an HTML overlay `div` so the interaction is instant, no Cesium
 * redraws required. Escape cancels the current drag.
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
  const startRef = useRef<{ x: number; y: number; mode: MarqueeMode } | null>(null);

  useEffect(() => {
    if (!active) { setRect(null); startRef.current = null; return; }

    const modeFromEvent = (e: MouseEvent): MarqueeMode =>
      e.altKey ? "subtract" : e.shiftKey ? "add" : "replace";

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY, mode: modeFromEvent(e) };
      setRect({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY, mode: startRef.current.mode });
      onDragStart?.();
      e.preventDefault();
      e.stopPropagation();
    };
    const onMove = (e: MouseEvent) => {
      if (!startRef.current) return;
      setRect({
        x1: startRef.current.x,
        y1: startRef.current.y,
        x2: e.clientX,
        y2: e.clientY,
        mode: modeFromEvent(e), // let user change mode mid-drag
      });
    };
    const onUp = (e: MouseEvent) => {
      if (!startRef.current) return;
      const finalRect: MarqueeRect = {
        x1: startRef.current.x,
        y1: startRef.current.y,
        x2: e.clientX,
        y2: e.clientY,
        mode: modeFromEvent(e),
      };
      const w = Math.abs(finalRect.x2 - finalRect.x1);
      const h = Math.abs(finalRect.y2 - finalRect.y1);
      startRef.current = null;
      setRect(null);
      onDragEnd?.();
      if (w >= 4 && h >= 4) onSelect(finalRect);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && startRef.current) {
        startRef.current = null;
        setRect(null);
        onDragEnd?.();
      }
    };

    // Capture-phase so the marquee wins over Cesium's default handlers.
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, onSelect, onDragStart, onDragEnd]);

  if (!active) return null;

  const left = rect ? Math.min(rect.x1, rect.x2) : 0;
  const top = rect ? Math.min(rect.y1, rect.y2) : 0;
  const width = rect ? Math.abs(rect.x2 - rect.x1) : 0;
  const height = rect ? Math.abs(rect.y2 - rect.y1) : 0;

  return (
    <>
      {/* Full-viewport crosshair cursor + pointer capture */}
      <div
        className="fixed inset-0 z-[60]"
        style={{ cursor: "crosshair", background: "transparent" }}
      />
      {rect && (
        <div
          className="fixed z-[61] pointer-events-none"
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