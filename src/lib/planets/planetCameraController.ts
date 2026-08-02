/**
 * planetCameraController
 * ----------------------
 * Cesium's screen-space camera controller is tuned for Earth: its trackball /
 * picking / collision height thresholds are absolute metres (7 500 km,
 * 150 km …). On a smaller ellipsoid — Venus 6 051 km, Mercury 2 439 km,
 * Enceladus 252 km — wheel zoom stops refining long before the surface and
 * the camera parks hundreds of kilometres up, even with
 * `minimumZoomDistance = 1.5`. Measured on Venus: 60 wheel notches froze the
 * camera at ~320 km altitude.
 *
 * So on every non-Earth world we take zoom over ourselves: each wheel notch
 * (or pinch delta) moves a *fraction of the current altitude above the
 * ellipsoid* toward the point under the cursor. That is scale-free, so the
 * approach feels identical from 100 000 km down to metres, on any body.
 *
 * Rotate / tilt / pan stay on Cesium defaults so orbiting feels exactly like
 * Earth.
 */
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  CameraEventType,
  Ellipsoid,
  Math as CesiumMath,
  type Viewer,
} from "cesium";

export interface PlanetCameraOptions {
  /** Ellipsoid of the body currently rendered in the viewer. */
  ellipsoid: Ellipsoid;
  /** Fraction of the current altitude travelled per wheel notch. */
  zoomStep?: number;
}

/**
 * Closest allowed altitude above the surface. Zero — users can descend all
 * the way to ground level on any body.
 */
export function minAltitudeForRadius(_radiusMeters: number): number {
  return 0;
}

/** Farthest allowed altitude — keeps the whole body framable. */
function maxAltitudeForRadius(radiusMeters: number): number {
  return radiusMeters * 60;
}

function altitudeOf(pos: Cartesian3, ellipsoid: Ellipsoid): number {
  try {
    const carto = Cartographic.fromCartesian(pos, ellipsoid);
    return carto && Number.isFinite(carto.height) ? carto.height : NaN;
  } catch {
    return NaN;
  }
}

/**
 * Attach the altitude-proportional zoom controller. Returns a detach fn that
 * restores Cesium's native wheel/pinch zoom.
 */
export function attachPlanetCameraController(
  viewer: Viewer,
  { ellipsoid, zoomStep = 0.14 }: PlanetCameraOptions,
): () => void {
  const scene = viewer.scene;
  const canvas = scene.canvas as HTMLCanvasElement;
  const ssec = scene.screenSpaceCameraController;
  const radius = ellipsoid.maximumRadius;
  const minAlt = minAltitudeForRadius(radius);
  const maxAlt = maxAltitudeForRadius(radius);

  // Re-scale Cesium's Earth-tuned thresholds to this body so its rotate /
  // tilt logic keeps working at low altitude instead of switching modes.
  const prev = {
    zoomEventTypes: ssec.zoomEventTypes,
    minimumZoomDistance: ssec.minimumZoomDistance,
    maximumZoomDistance: ssec.maximumZoomDistance,
    collision: (ssec as any).enableCollisionDetection,
    minCollisionTerrain: (ssec as any).minimumCollisionTerrainHeight,
    minPickingTerrain: (ssec as any).minimumPickingTerrainHeight,
    minTrackball: (ssec as any).minimumTrackBallHeight,
  };

  ssec.minimumZoomDistance = minAlt;
  ssec.maximumZoomDistance = maxAlt;
  // Public props only — Cesium re-derives the `_`-prefixed copies each frame.
  (ssec as any).minimumCollisionTerrainHeight = 0;
  (ssec as any).minimumPickingTerrainHeight = 0;
  (ssec as any).minimumTrackBallHeight = Math.max(50, radius * 5e-4);
  // Our own zoom replaces Cesium's — strip WHEEL/PINCH from its zoom inputs
  // but keep PINCH available for tilt (already configured by the caller).
  ssec.zoomEventTypes = [] as any;

  const scratchDir = new Cartesian3();
  const scratchTarget = new Cartesian3();
  const scratchNext = new Cartesian3();

  /** Zoom by `notches` (positive = closer) toward `screenPos`. */
  const zoomBy = (notches: number, screenPos: Cartesian2 | null) => {
    const camera = viewer.camera;
    const alt = altitudeOf(camera.position, ellipsoid);
    if (!Number.isFinite(alt)) return;

    const factor = Math.pow(1 - zoomStep, notches);
    let targetAlt = alt * factor;
    // Geometric zoom only asymptotes toward the surface — below 40 m switch to
    // a fixed metric step so the camera can actually reach 0 m ground level.
    if (alt < 40 && notches > 0) {
      targetAlt = alt - Math.min(alt, 2 * notches);
    }
    targetAlt = CesiumMath.clamp(targetAlt, minAlt, maxAlt);
    const delta = alt - targetAlt;
    if (Math.abs(delta) < 1e-3) return;

    // Prefer zooming toward whatever is under the cursor (Google-Earth feel);
    // fall back to the camera's own view direction over empty space.
    let dir: Cartesian3 | null = null;
    if (screenPos) {
      const picked =
        scene.pickPosition?.(screenPos) ??
        camera.pickEllipsoid(screenPos, ellipsoid, scratchTarget);
      if (picked) {
        Cartesian3.subtract(picked, camera.position, scratchDir);
        if (Cartesian3.magnitude(scratchDir) > 1) {
          dir = Cartesian3.normalize(scratchDir, scratchDir);
        }
      }
    }
    if (!dir) dir = Cartesian3.normalize(camera.direction, scratchDir);

    Cartesian3.add(
      camera.position,
      Cartesian3.multiplyByScalar(dir, delta, scratchNext),
      scratchNext,
    );
    const nextAlt = altitudeOf(scratchNext, ellipsoid);
    if (!Number.isFinite(nextAlt)) return;
    if (nextAlt < minAlt) {
      // Overshot the surface (oblique approach): fall back to a pure radial
      // move so we always land exactly at the floor instead of stalling.
      const carto = Cartographic.fromCartesian(camera.position, ellipsoid);
      const clamped = Cartesian3.fromRadians(
        carto.longitude,
        carto.latitude,
        Math.max(minAlt, targetAlt),
        ellipsoid,
      );
      camera.position = clamped;
    } else {
      camera.position = Cartesian3.clone(scratchNext, new Cartesian3());
    }
    scene.requestRender?.();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const pos = new Cartesian2(e.clientX - rect.left, e.clientY - rect.top);
    // Normalise across trackpads (small deltas) and mice (±100+).
    const raw = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const notches = CesiumMath.clamp(-raw / 100, -4, 4);
    if (!notches) return;
    zoomBy(notches, pos);
  };

  // Two-finger pinch zoom on touch devices.
  let pinchStart = 0;
  const touchDistance = (t: TouchList) =>
    Math.hypot(
      t[0].clientX - t[1].clientX,
      t[0].clientY - t[1].clientY,
    );
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) pinchStart = touchDistance(e.touches);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !pinchStart) return;
    const d = touchDistance(e.touches);
    if (!d) return;
    const ratio = d / pinchStart;
    if (Math.abs(ratio - 1) < 0.02) return;
    pinchStart = d;
    const rect = canvas.getBoundingClientRect();
    const cx =
      (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    const cy =
      (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    zoomBy(Math.log(ratio) / Math.log(1 / (1 - zoomStep)), new Cartesian2(cx, cy));
  };
  const onTouchEnd = () => {
    pinchStart = 0;
  };

  // Double-click a surface point → fly in to a low pass over it.
  const onDblClick = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const pos = new Cartesian2(e.clientX - rect.left, e.clientY - rect.top);
    const picked =
      scene.pickPosition?.(pos) ??
      viewer.camera.pickEllipsoid(pos, ellipsoid, scratchTarget);
    if (!picked) return;
    try {
      const carto = Cartographic.fromCartesian(picked, ellipsoid);
      const alt = altitudeOf(viewer.camera.position, ellipsoid);
      const target = Math.max(minAlt, Math.min(alt / 6, radius * 3e-4));
      viewer.camera.flyTo({
        destination: Cartesian3.fromRadians(
          carto.longitude,
          carto.latitude,
          target,
          ellipsoid,
        ),
        orientation: {
          heading: viewer.camera.heading,
          pitch: CesiumMath.toRadians(-60),
          roll: 0,
        },
        duration: 1.6,
      });
    } catch {}
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchmove", onTouchMove, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true });
  canvas.addEventListener("dblclick", onDblClick);

  return () => {
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("dblclick", onDblClick);
    try {
      ssec.zoomEventTypes = prev.zoomEventTypes ?? ([
        CameraEventType.WHEEL,
        CameraEventType.PINCH,
      ] as any);
      ssec.minimumZoomDistance = prev.minimumZoomDistance;
      ssec.maximumZoomDistance = prev.maximumZoomDistance;
      (ssec as any).enableCollisionDetection = prev.collision;
      (ssec as any).minimumCollisionTerrainHeight = prev.minCollisionTerrain;
      (ssec as any).minimumPickingTerrainHeight = prev.minPickingTerrain;
      (ssec as any).minimumTrackBallHeight = prev.minTrackball;
    } catch {}
  };
}