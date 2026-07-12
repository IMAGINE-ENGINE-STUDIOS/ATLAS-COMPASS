import { useEffect, useRef, useState } from "react";
import { Hand, ArrowUp } from "lucide-react";
import { mobileAxes, inputPulse } from "@/components/level/locomotion/locomotionState";

/**
 * On-screen touch controls for Play mode. Rendered only on touch-capable
 * viewports. Writes into the shared `mobileAxes` singleton and `inputPulse`
 * so it reuses the exact same code path as keyboard/gamepad input — no
 * changes required in the character controller beyond reading the axes.
 *
 * Layout:
 *   - Left: virtual thumbstick (drag to move).
 *   - Right: Jump (large), Run (toggle), Interact (E).
 */
export default function MobileTouchControls({ visible }: { visible: boolean }) {
  const [supported, setSupported] = useState(false);
  const [runOn, setRunOn] = useState(false);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);

  useEffect(() => {
    // Show whenever a touch device or coarse pointer is present.
    const mq = window.matchMedia?.("(pointer: coarse)");
    setSupported(!!mq?.matches || ("ontouchstart" in window));
  }, []);

  useEffect(() => {
    if (!visible) { mobileAxes.x = 0; mobileAxes.z = 0; mobileAxes.jump = false; mobileAxes.run = false; }
  }, [visible]);

  useEffect(() => { mobileAxes.run = runOn; }, [runOn]);

  const setKnob = (dx: number, dy: number, radius: number) => {
    const len = Math.hypot(dx, dy);
    const clamp = Math.min(len, radius);
    const nx = len ? (dx / len) * clamp : 0;
    const ny = len ? (dy / len) * clamp : 0;
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
    }
    // Normalize to -1..1, invert Y (up = forward = -z)
    const nrmX = -(nx / radius); // A/left → +x in controller
    const nrmZ = ny / radius;    // down → +z
    mobileAxes.x = nrmX;
    mobileAxes.z = nrmZ;
  };

  const onStickStart = (e: React.PointerEvent) => {
    if (activeId.current !== null) return;
    activeId.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = stickRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setKnob(e.clientX - cx, e.clientY - cy, rect.width / 2 - 12);
  };
  const onStickMove = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    const rect = stickRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setKnob(e.clientX - cx, e.clientY - cy, rect.width / 2 - 12);
  };
  const onStickEnd = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
    setKnob(0, 0, 1);
    mobileAxes.x = 0; mobileAxes.z = 0;
  };

  if (!visible || !supported) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 select-none" style={{ touchAction: "none" }}>
      {/* Left thumbstick */}
      <div
        ref={stickRef}
        onPointerDown={onStickStart}
        onPointerMove={onStickMove}
        onPointerUp={onStickEnd}
        onPointerCancel={onStickEnd}
        className="pointer-events-auto absolute bottom-6 left-6 w-32 h-32 rounded-full border border-white/25 bg-black/40 backdrop-blur-md shadow-2xl flex items-center justify-center"
      >
        <div
          ref={knobRef}
          className="w-14 h-14 rounded-full bg-white/85 border border-white/60 shadow-lg"
          style={{ transform: "translate(0,0)", transition: activeId.current === null ? "transform 120ms ease" : "none" }}
        />
      </div>

      {/* Right action cluster */}
      <div className="pointer-events-auto absolute bottom-6 right-6 flex flex-col items-end gap-3">
        <div className="flex items-center gap-3">
          <button
            onPointerDown={() => { inputPulse.interact = true; }}
            className="w-14 h-14 rounded-full border border-emerald-300/60 bg-emerald-500/25 backdrop-blur-md text-emerald-100 text-sm font-bold shadow-lg active:scale-95 flex items-center justify-center"
            aria-label="Interact"
          >
            <Hand className="w-6 h-6" />
          </button>
          <button
            onPointerDown={() => setRunOn((v) => !v)}
            className={`w-14 h-14 rounded-full border backdrop-blur-md text-[11px] font-bold uppercase tracking-wider shadow-lg active:scale-95 ${
              runOn
                ? "border-amber-300/70 bg-amber-400/30 text-amber-100"
                : "border-white/30 bg-black/40 text-white/85"
            }`}
          >
            Run
          </button>
        </div>
        <button
          onPointerDown={() => { mobileAxes.jump = true; }}
          onPointerUp={() => { mobileAxes.jump = false; }}
          onPointerCancel={() => { mobileAxes.jump = false; }}
          className="w-20 h-20 rounded-full border border-sky-300/60 bg-sky-500/30 backdrop-blur-md text-sky-50 shadow-2xl active:scale-95 flex items-center justify-center"
          aria-label="Jump"
        >
          <ArrowUp className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}