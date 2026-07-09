/**
 * ModelGizmoOverlay
 * -----------------
 * 3D on-globe transform gizmo pinned to a model's geometric center.
 * Handles are HTML overlay nodes projected to screen each frame via
 * `SceneTransforms.worldToWindowCoordinates` (same technique used by the
 * Measure tool markers).
 *
 *  • Position mode  — colored axis arrows (E/N/Up) + center free-move.
 *      - Drag an arrow: model slides along that world axis.
 *      - Drag the center puck: raycast the mesh under the cursor and drop
 *        the model there (lat/lng follow the pointer directly).
 *  • Rotation mode  — heading ring (yaw around Up). Drag around center.
 *  • Scale mode     — uniform scale puck: drag radially from center.
 *
 * All updates flow through `onChange(partial)` — the parent widget owns
 * the transform state and persists it.
 */
import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Matrix4,
  Transforms,
  SceneTransforms,
  defined,
} from "cesium";
import type { TransformData } from "@/components/ModelTransformWidget";

type Mode = "position" | "rotation" | "scale";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  transform: TransformData;
  mode: Mode;
  onChange: (partial: Partial<TransformData>) => void;
  /** Fired when a gizmo drag begins. Parents snapshot pre-drag state
   *  here so undo can restore it. */
  onDragStart?: () => void;
  /** Fired on pointerup / pointercancel — the drag settled. */
  onDragEnd?: () => void;
}

const AXES = [
  { key: "east", color: "#ef4444", label: "E" },   // +Lng (Red / X)
  { key: "north", color: "#22c55e", label: "N" },  // +Lat (Green / Y)
  { key: "up", color: "#3b82f6", label: "U" },     // +Alt (Blue / Z)
] as const;

export default function ModelGizmoOverlay({ viewerRef, transform, mode, onChange, onDragStart, onDragEnd }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<Record<string, HTMLDivElement | null>>({});
  const stateRef = useRef({ transform, mode });
  useEffect(() => { stateRef.current = { transform, mode }; }, [transform, mode]);

  // Reposition all handles each frame.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const scene = viewer.scene;

    const sync = () => {
      if (!viewer || viewer.isDestroyed()) return;
      const t = stateRef.current.transform;
      const anchor = Cartesian3.fromDegrees(t.lng, t.lat, (t.alt ?? 0));
      const enu = Transforms.eastNorthUpToFixedFrame(anchor);

      const camDist = Cartesian3.distance(scene.camera.positionWC, anchor);
      // Adaptive world length so the gizmo stays ~90 px on screen.
      const axisLen = Math.max(0.5, Math.min(2000, camDist * 0.06));

      const eastTip = Matrix4.multiplyByPoint(enu, new Cartesian3(axisLen, 0, 0), new Cartesian3());
      const northTip = Matrix4.multiplyByPoint(enu, new Cartesian3(0, axisLen, 0), new Cartesian3());
      const upTip = Matrix4.multiplyByPoint(enu, new Cartesian3(0, 0, axisLen), new Cartesian3());
      // Rotation ring reference point (used for angle math).
      const ringPt = Matrix4.multiplyByPoint(enu, new Cartesian3(axisLen * 0.7, 0, 0), new Cartesian3());

      const project = (w: Cartesian3) => {
        try { return SceneTransforms.worldToWindowCoordinates(scene, w); } catch { return undefined; }
      };
      const center = project(anchor);
      const eScreen = project(eastTip);
      const nScreen = project(northTip);
      const uScreen = project(upTip);
      const rScreen = project(ringPt);

      // Store screen positions for drag math.
      const meta: any = {
        center, east: eScreen, north: nScreen, up: uScreen, ring: rScreen,
        axisLen, anchor: anchor.clone(),
      };
      (rootRef.current as any).__gizmoMeta = meta;

      const place = (key: string, pt: any) => {
        const node = nodesRef.current[key];
        if (!node) return;
        if (!pt || !center) { node.style.opacity = "0"; return; }
        // Cull if behind camera.
        const toPt = Cartesian3.subtract(anchor, scene.camera.positionWC, new Cartesian3());
        if (Cartesian3.dot(toPt, scene.camera.directionWC) <= 0) { node.style.opacity = "0"; return; }
        node.style.opacity = "1";
        node.style.transform = `translate3d(${Math.round(pt.x)}px, ${Math.round(pt.y)}px, 0) translate(-50%, -50%)`;
      };

      place("center", center);
      place("east", eScreen);
      place("north", nScreen);
      place("up", uScreen);
      // Rotation ring — 4 handles around the anchor at fixed screen radius.
      const cur = stateRef.current.mode;
      if (cur === "rotation" && center) {
        const R = 70; // px
        const headingRad = CesiumMath.toRadians(t.heading || 0);
        for (let i = 0; i < 4; i++) {
          const a = headingRad + (i * Math.PI) / 2;
          const px = { x: center.x + Math.sin(a) * R, y: center.y - Math.cos(a) * R };
          place(`ring-${i}`, px);
        }
      }
      if (cur === "scale" && center) {
        const R = 60;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          const px = { x: center.x + Math.sin(a) * R, y: center.y - Math.cos(a) * R };
          place(`scale-${i}`, px);
        }
      }
    };
    sync();
    const remove = scene.postRender.addEventListener(sync);
    return () => { remove(); };
  }, [viewerRef]);

  // ── Drag helpers
  const beginDrag = (handler: (ev: PointerEvent) => void, onEnd?: () => void) =>
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const ctrl = viewer.scene.screenSpaceCameraController;
      const prevEnabled = ctrl.enableInputs;
      ctrl.enableInputs = false;
      try { onDragStart?.(); } catch {}
      const move = (ev: PointerEvent) => handler(ev);
      const up = () => {
        ctrl.enableInputs = prevEnabled;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        onEnd?.();
        try { onDragEnd?.(); } catch {}
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };

  const canvasRect = () => viewerRef.current?.scene.canvas.getBoundingClientRect();

  // Convert meters along an ENU axis into transform deltas.
  const applyAxisMeters = (axis: "east" | "north" | "up", meters: number) => {
    const t = stateRef.current.transform;
    if (axis === "up") {
      onChange({ alt: (t.alt || 0) + meters });
      return;
    }
    // Meters → degrees using local scale (spherical earth approximation).
    const R = 6371008.8;
    if (axis === "north") {
      const dLat = (meters / R) * (180 / Math.PI);
      onChange({ lat: t.lat + dLat });
    } else {
      const dLng = (meters / (R * Math.cos(CesiumMath.toRadians(t.lat)))) * (180 / Math.PI);
      onChange({ lng: t.lng + dLng });
    }
  };

  // Axis drag: project mouse motion onto the axis' screen direction.
  const dragAxis = (axis: "east" | "north" | "up") => beginDrag((ev) => {
    const meta = (rootRef.current as any)?.__gizmoMeta;
    if (!meta?.center || !meta[axis]) return;
    const rect = canvasRect(); if (!rect) return;
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const cx = meta.center.x, cy = meta.center.y;
    const tipX = meta[axis].x, tipY = meta[axis].y;
    const dx = tipX - cx, dy = tipY - cy;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;
    // Movement along axis in screen pixels this frame.
    const dmx = ev.movementX;
    const dmy = ev.movementY;
    const pxAlong = dmx * ux + dmy * uy;
    const metersPerPx = meta.axisLen / len;
    applyAxisMeters(axis, pxAlong * metersPerPx);
  });

  // Center free-move: raycast the mesh/globe under the cursor.
  const dragCenter = beginDrag((ev) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const rect = canvasRect(); if (!rect) return;
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const scene = viewer.scene;
    let cart: Cartesian3 | undefined;
    try { cart = scene.pickPosition({ x, y } as any); } catch {}
    if (!defined(cart)) {
      cart = scene.camera.pickEllipsoid({ x, y } as any, scene.globe.ellipsoid);
    }
    if (!defined(cart)) return;
    const c = Cartographic.fromCartesian(cart!);
    onChange({
      lat: CesiumMath.toDegrees(c.latitude),
      lng: CesiumMath.toDegrees(c.longitude),
      // Keep the same altitude offset from the ground so it stays "seated".
      alt: stateRef.current.transform.alt,
    });
  });

  // Heading ring drag: angle of pointer relative to center.
  const dragHeading = beginDrag((ev) => {
    const meta = (rootRef.current as any)?.__gizmoMeta;
    if (!meta?.center) return;
    const rect = canvasRect(); if (!rect) return;
    const mx = ev.clientX - rect.left - meta.center.x;
    const my = ev.clientY - rect.top - meta.center.y;
    // Screen +Y is down. Bearing 0 = up.
    const angleDeg = (Math.atan2(mx, -my) * 180) / Math.PI;
    onChange({ heading: ((angleDeg + 540) % 360) - 180 });
  });

  // Uniform scale drag: radial distance ratio from a reference set on down.
  const scaleRef = useRef<{ startR: number; startScale: number } | null>(null);
  const dragScale = (e: React.PointerEvent) => {
    const meta = (rootRef.current as any)?.__gizmoMeta;
    if (!meta?.center) return;
    const rect = canvasRect(); if (!rect) return;
    const dx = e.clientX - rect.left - meta.center.x;
    const dy = e.clientY - rect.top - meta.center.y;
    scaleRef.current = {
      startR: Math.max(8, Math.hypot(dx, dy)),
      startScale: stateRef.current.transform.scale || 1,
    };
    beginDrag((ev) => {
      const meta2 = (rootRef.current as any)?.__gizmoMeta;
      if (!meta2?.center || !scaleRef.current) return;
      const rect2 = canvasRect(); if (!rect2) return;
      const rx = ev.clientX - rect2.left - meta2.center.x;
      const ry = ev.clientY - rect2.top - meta2.center.y;
      const r = Math.hypot(rx, ry);
      const factor = r / scaleRef.current.startR;
      onChange({ scale: Math.max(0.01, scaleRef.current.startScale * factor) });
    }, () => { scaleRef.current = null; })(e);
  };

  return (
    <div ref={rootRef} className="absolute inset-0 z-40 pointer-events-none">
      {/* Center handle */}
      <div
        ref={(el) => { nodesRef.current["center"] = el; }}
        onPointerDown={mode === "position" ? dragCenter : undefined}
        className="absolute left-0 top-0 pointer-events-auto"
        title={mode === "position" ? "Drag to move on the earth" : "Model origin"}
        style={{
          transform: "translate3d(-9999px,-9999px,0)",
          opacity: 0,
          cursor: mode === "position" ? "grab" : "default",
          touchAction: "none",
        }}
      >
        <div
          className="w-4 h-4 rounded-full backdrop-blur-md border-2 shadow-lg"
          style={{
            background: "rgba(255,255,255,0.35)",
            borderColor: "#fff",
            boxShadow: "0 0 0 3px rgba(255,255,255,0.15), 0 4px 14px rgba(0,0,0,0.55)",
          }}
        />
      </div>

      {/* Position axes */}
      {mode === "position" && AXES.map((a) => (
        <div
          key={a.key}
          ref={(el) => { nodesRef.current[a.key] = el; }}
          onPointerDown={dragAxis(a.key as any)}
          className="absolute left-0 top-0 pointer-events-auto"
          title={`Drag along ${a.label} axis`}
          style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0, cursor: "grab", touchAction: "none" }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <div
              className="w-4 h-4 rounded-sm border-2 shadow-lg"
              style={{
                background: a.color,
                borderColor: "#fff",
                boxShadow: `0 0 0 2px ${a.color}55, 0 4px 12px ${a.color}aa`,
                clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
              }}
            />
            <span
              className="text-[9px] font-bold tabular-nums px-1 rounded"
              style={{
                background: "rgba(0,0,0,0.6)",
                color: a.color,
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              }}
            >{a.label}</span>
          </div>
        </div>
      ))}

      {/* Rotation ring handles */}
      {mode === "rotation" && [0, 1, 2, 3].map((i) => (
        <div
          key={`ring-${i}`}
          ref={(el) => { nodesRef.current[`ring-${i}`] = el; }}
          onPointerDown={dragHeading}
          className="absolute left-0 top-0 pointer-events-auto"
          title="Drag to rotate (heading)"
          style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0, cursor: "grab", touchAction: "none" }}
        >
          <div
            className="w-3 h-3 rounded-full border-2 shadow-lg"
            style={{
              background: i === 0 ? "#22c55e" : "rgba(34,197,94,0.6)",
              borderColor: "#fff",
              boxShadow: "0 0 0 2px rgba(34,197,94,0.35), 0 3px 10px rgba(0,0,0,0.55)",
            }}
          />
        </div>
      ))}

      {/* Scale corner handles (uniform) */}
      {mode === "scale" && [0, 1, 2, 3].map((i) => (
        <div
          key={`scale-${i}`}
          ref={(el) => { nodesRef.current[`scale-${i}`] = el; }}
          onPointerDown={dragScale}
          className="absolute left-0 top-0 pointer-events-auto"
          title="Drag to scale uniformly"
          style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0, cursor: "nwse-resize", touchAction: "none" }}
        >
          <div
            className="w-3 h-3 border-2 shadow-lg"
            style={{
              background: "#a855f7",
              borderColor: "#fff",
              boxShadow: "0 0 0 2px rgba(168,85,247,0.35), 0 3px 10px rgba(0,0,0,0.55)",
            }}
          />
        </div>
      ))}
    </div>
  );
}