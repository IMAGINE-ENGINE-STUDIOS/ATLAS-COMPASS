/**
 * useAtlasKeyboardNav
 * --------------------
 * Keyboard movement for Atlas's Cesium camera.
 *  - W / ArrowUp     → forward
 *  - S / ArrowDown   → backward
 *  - A / ArrowLeft   → strafe left
 *  - D / ArrowRight  → strafe right
 *  - Q               → down
 *  - E               → up
 *  - Shift           → boost x4
 *
 * Movement speed scales with camera altitude so the controls feel right
 * both walking on the ground and orbiting from space. Ignored when focus
 * is inside an input/textarea/contenteditable so we don't fight typing.
 */
import { useEffect, useRef } from "react";
import { Cartographic, type Viewer } from "cesium";

const KEY_MAP: Record<string, string> = {
  KeyW: "fwd", ArrowUp: "fwd",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  KeyQ: "down",
  KeyE: "up",
};

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useAtlasKeyboardNav(
  viewerRef: React.MutableRefObject<Viewer | null>,
  options: { enabled: boolean; sensitivity?: number },
) {
  const { enabled, sensitivity = 1 } = options;
  const pressedRef = useRef<Set<string>>(new Set());
  const boostRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const pressed = pressedRef.current;

    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.shiftKey) boostRef.current = true;
      const action = KEY_MAP[e.code];
      if (!action) return;
      pressed.add(action);
      // Prevent the page from scrolling with arrow keys while flying.
      if (e.code.startsWith("Arrow")) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) boostRef.current = false;
      const action = KEY_MAP[e.code];
      if (action) pressed.delete(action);
    };
    const onBlur = () => {
      pressed.clear();
      boostRef.current = false;
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (pressed.size === 0) return;
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      // Speed: meters per second scaled by camera altitude so high-altitude
      // panning isn't molasses and low-altitude walking isn't a teleport.
      let alt = 100;
      try {
        const carto = Cartographic.fromCartesian(viewer.camera.positionWC);
        alt = Math.max(2, carto.height);
      } catch {}
      const base = Math.max(2, alt * 0.6) * sensitivity * (boostRef.current ? 4 : 1);
      const step = base * dt;
      const cam = viewer.camera;
      try {
        if (pressed.has("fwd")) cam.moveForward(step);
        if (pressed.has("back")) cam.moveBackward(step);
        if (pressed.has("left")) cam.moveLeft(step);
        if (pressed.has("right")) cam.moveRight(step);
        if (pressed.has("up")) cam.moveUp(step);
        if (pressed.has("down")) cam.moveDown(step);
        viewer.scene.requestRender?.();
      } catch {}
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      pressed.clear();
    };
  }, [enabled, sensitivity, viewerRef]);
}