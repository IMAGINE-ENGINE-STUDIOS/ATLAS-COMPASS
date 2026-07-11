/**
 * Moon camera navigation helper.
 *
 * Cesium's `flyToBoundingSphere` computes the approach offset in an ENU
 * frame built from WGS84 (Earth) by default, which produces a wildly
 * wrong final camera pose when the scene is centred on the Moon. We
 * therefore build the destination + orientation ourselves in a Moon-ENU
 * frame and use `camera.flyTo`.
 */
import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
  Math as CesiumMath,
  Matrix4,
} from "cesium";

export const MOON_MIN_SAFE_ALTITUDE_M = 20;
export const MOON_MAX_SAFE_ALTITUDE_M = 450_000_000;

export interface MoonFlyOpts {
  /** Approach altitude above the target, in metres. */
  altitude?: number;
  /** Fly duration in seconds. */
  duration?: number;
  /** Heading in degrees (0 = north). */
  heading?: number;
  /** Pitch in degrees (negative = looking down). */
  pitch?: number;
}

/** Fly the camera to a selenographic coordinate on the Moon. */
export function flyToMoonCoord(
  viewer: any,
  lon: number,
  lat: number,
  opts: MoonFlyOpts = {}
) {
  if (!viewer || viewer.isDestroyed?.()) return;
  const altitude = Math.max(opts.altitude ?? 180_000, 120_000);
  const duration = opts.duration ?? 1.6;

  // Put the camera directly above the target in Moon coordinates and look
  // nadir. This avoids Cesium's Earth-biased fly-to offsets and prevents POI
  // arrivals from ending inside the Moon or at a tangent angle facing space.
  const target = Cartesian3.fromDegrees(lon, lat, 0, Ellipsoid.MOON);
  const destination = Cartesian3.fromDegrees(lon, lat, altitude, Ellipsoid.MOON);
  const normal = Cartesian3.normalize(target, new Cartesian3());
  const direction = Cartesian3.negate(normal, new Cartesian3());
  const pole = Math.abs(normal.z) > 0.96 ? Cartesian3.UNIT_Y : Cartesian3.UNIT_Z;
  const east = Cartesian3.normalize(Cartesian3.cross(pole, normal, new Cartesian3()), new Cartesian3());
  const north = Cartesian3.normalize(Cartesian3.cross(normal, east, new Cartesian3()), new Cartesian3());

  viewer.trackedEntity = undefined;
  viewer.selectedEntity = undefined;
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.camera.flyTo({
    destination,
    orientation: { direction, up: north },
    duration,
    complete: () => {
      if (viewer.isDestroyed?.()) return;
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      viewer.camera.setView({ destination, orientation: { direction, up: north } });
      viewer.scene.requestRender?.();
    },
  });
  void opts.heading;
  void opts.pitch;
}

/**
 * Keep the Moon camera in a Cesium-safe orbit: never below the lunar terrain,
 * never infinitely far away, and never stuck looking into empty space after a
 * tilt/right-drag gesture.
 */
export function installMoonCameraGuard(viewer: any): () => void {
  if (!viewer || viewer.isDestroyed?.()) return () => {};
  const ellipsoid = Ellipsoid.MOON;
  let correcting = false;
  let lastCheck = 0;
  let rightDrag: {
    pointerId: number;
    x: number;
    y: number;
    lon: number;
    lat: number;
    height: number;
  } | null = null;

  const lookAtMoonCenter = (position: Cartesian3) => {
    const direction = Cartesian3.normalize(
      Cartesian3.negate(position, new Cartesian3()),
      new Cartesian3(),
    );
    const pole = Math.abs(direction.z) > 0.96
      ? Cartesian3.UNIT_Y
      : Cartesian3.UNIT_Z;
    const right = Cartesian3.normalize(
      Cartesian3.cross(direction, pole, new Cartesian3()),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      Cartesian3.cross(right, direction, new Cartesian3()),
      new Cartesian3(),
    );
    viewer.camera.setView({
      destination: position,
      orientation: { direction, up },
    });
  };

  const correct = (forceAimAtMoon = false) => {
    if (correcting || viewer.isDestroyed?.()) return;
    const now = performance.now();
    if (!forceAimAtMoon && now - lastCheck < 100) return;
    lastCheck = now;

    let carto: Cartographic;
    try {
      carto = Cartographic.fromCartesian(viewer.camera.position, ellipsoid);
    } catch {
      return;
    }

    let safeHeight = carto.height;
    let needsCorrection = false;
    if (!Number.isFinite(safeHeight) || safeHeight < MOON_MIN_SAFE_ALTITUDE_M) {
      safeHeight = MOON_MIN_SAFE_ALTITUDE_M;
      needsCorrection = true;
    } else if (safeHeight > MOON_MAX_SAFE_ALTITUDE_M) {
      safeHeight = MOON_MAX_SAFE_ALTITUDE_M;
      needsCorrection = true;
    }

    // In Moon mode the center of the viewport should stay oriented at the
    // lunar body. A free/tangent camera makes the surface read as black space.
    if (forceAimAtMoon && safeHeight < 50_000_000) needsCorrection = true;

    if (!needsCorrection) return;

    correcting = true;
    try {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      const position = Cartesian3.fromRadians(carto.longitude, carto.latitude, safeHeight, ellipsoid);
      lookAtMoonCenter(position);
      viewer.scene.requestRender?.();
    } finally {
      correcting = false;
    }
  };

  const removePostRender = viewer.scene.postRender.addEventListener(() => correct(false));
  const removeMoveEnd = viewer.camera.moveEnd.addEventListener(() => correct(true));
  const canvas: HTMLCanvasElement | undefined = viewer.scene?.canvas;
  const stopContextMenu = (e: MouseEvent) => e.preventDefault();
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 2 || viewer.isDestroyed?.()) return;
    const carto = Cartographic.fromCartesian(viewer.camera.position, ellipsoid);
    rightDrag = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lon: carto.longitude,
      lat: carto.latitude,
      height: Math.max(MOON_MIN_SAFE_ALTITUDE_M, Math.min(MOON_MAX_SAFE_ALTITUDE_M, carto.height)),
    };
    try { canvas?.setPointerCapture?.(e.pointerId); } catch {}
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!rightDrag || e.pointerId !== rightDrag.pointerId || viewer.isDestroyed?.()) return;
    const dx = e.clientX - rightDrag.x;
    const dy = e.clientY - rightDrag.y;
    const speed = rightDrag.height > 20_000_000 ? 0.0018 : 0.0032;
    const lon = rightDrag.lon - dx * speed;
    const lat = Math.max(
      CesiumMath.toRadians(-84),
      Math.min(CesiumMath.toRadians(84), rightDrag.lat + dy * speed),
    );
    const position = Cartesian3.fromRadians(lon, lat, rightDrag.height, ellipsoid);
    correcting = true;
    try {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      lookAtMoonCenter(position);
      viewer.scene.requestRender?.();
    } finally {
      correcting = false;
    }
    e.preventDefault();
  };
  const clearRightDrag = (e?: PointerEvent) => {
    if (rightDrag && e?.pointerId === rightDrag.pointerId) {
      try { canvas?.releasePointerCapture?.(e.pointerId); } catch {}
    }
    rightDrag = null;
    correct(true);
  };
  canvas?.addEventListener("contextmenu", stopContextMenu);
  canvas?.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas?.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas?.addEventListener("pointerup", clearRightDrag, { passive: false });
  canvas?.addEventListener("pointercancel", clearRightDrag, { passive: false });
  correct(true);

  return () => {
    try { removePostRender?.(); } catch {}
    try { removeMoveEnd?.(); } catch {}
    canvas?.removeEventListener("contextmenu", stopContextMenu);
    canvas?.removeEventListener("pointerdown", onPointerDown);
    canvas?.removeEventListener("pointermove", onPointerMove);
    canvas?.removeEventListener("pointerup", clearRightDrag);
    canvas?.removeEventListener("pointercancel", clearRightDrag);
  };
}