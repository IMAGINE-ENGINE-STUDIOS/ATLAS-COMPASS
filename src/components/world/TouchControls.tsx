import type { MutableRefObject } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, RotateCw } from "lucide-react";

/**
 * On-screen action pad. The world model is driven by the same action vector
 * everywhere, so pointer input here is indistinguishable from the keyboard —
 * which is what makes the page usable on a phone (no keys available).
 *
 * action = [forward, strafe, turn, look]
 */
export default function TouchControls({
  actionRef,
  enabled,
}: {
  actionRef: MutableRefObject<Float32Array>;
  enabled: boolean;
}) {
  if (!enabled) return null;

  const hold = (index: number, value: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      actionRef.current[index] = value;
    },
    onPointerUp: () => {
      actionRef.current[index] = 0;
    },
    onPointerLeave: () => {
      actionRef.current[index] = 0;
    },
    onPointerCancel: () => {
      actionRef.current[index] = 0;
    },
  });

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/50 text-white/80 backdrop-blur active:bg-sky-400/30 active:text-sky-100 touch-none select-none";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
      <div className="pointer-events-auto grid grid-cols-3 gap-1.5">
        <span />
        <button aria-label="Forward" className={btn} {...hold(0, 1)}>
          <ArrowUp className="h-5 w-5" />
        </button>
        <span />
        <button aria-label="Strafe left" className={btn} {...hold(1, -1)}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button aria-label="Back" className={btn} {...hold(0, -1)}>
          <ArrowDown className="h-5 w-5" />
        </button>
        <button aria-label="Strafe right" className={btn} {...hold(1, 1)}>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
      <div className="pointer-events-auto flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <button aria-label="Turn left" className={btn} {...hold(2, -1)}>
            <RotateCcw className="h-5 w-5" />
          </button>
          <button aria-label="Turn right" className={btn} {...hold(2, 1)}>
            <RotateCw className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-1.5">
          <button aria-label="Look up" className={btn} {...hold(3, 1)}>
            <ArrowUp className="h-5 w-5" />
          </button>
          <button aria-label="Look down" className={btn} {...hold(3, -1)}>
            <ArrowDown className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
