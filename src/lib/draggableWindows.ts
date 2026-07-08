// Global draggable-window system.
// Any element with `data-draggable-window` becomes draggable via a child
// element carrying `data-drag-handle`. Position is stored as a translate3d
// transform on the window element, preserving its original CSS anchor.

let installed = false;

type DragState = {
  el: HTMLElement;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  pointerId: number;
};

export function installDraggableWindows() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  let drag: DragState | null = null;

  const onDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // Ignore drags starting on interactive controls inside the handle.
    if (target.closest("button, a, input, textarea, select, [role='slider'], [data-no-drag]")) return;
    const handle = target.closest<HTMLElement>("[data-drag-handle]");
    if (!handle) return;
    const el = handle.closest<HTMLElement>("[data-draggable-window]");
    if (!el) return;
    const baseX = parseFloat(el.dataset.dragX || "0");
    const baseY = parseFloat(el.dataset.dragY || "0");
    drag = { el, startX: e.clientX, startY: e.clientY, baseX, baseY, pointerId: e.pointerId };
    el.style.willChange = "transform";
    document.body.style.userSelect = "none";
  };

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const x = drag.baseX + dx;
    const y = drag.baseY + dy;
    drag.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    drag.el.dataset.dragX = String(x);
    drag.el.dataset.dragY = String(y);
  };

  const onUp = () => {
    if (!drag) return;
    drag.el.style.willChange = "";
    document.body.style.userSelect = "";
    drag = null;
  };

  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}