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

export const MOON_MIN_SAFE_ALTITUDE_M = 1.5;
export const MOON_MAX_SAFE_ALTITUDE_M = 2_000_000_000;

export interface MoonFlyOpts {
  /** Approach altitude above the target, in metres. */
  altitude?: number;
  /** Fly duration in seconds. */
  duration?: number;
  /** Heading in degrees (0 = north). */
  heading?: number;
  /** Pitch in degrees (negative = looking down). */
  pitch?: number;
  /** Override the target ellipsoid (defaults to the Moon). */
  ellipsoid?: Ellipsoid;
}

/** Fly the camera to a selenographic coordinate on the Moon. */
export function flyToMoonCoord(
  viewer: any,
  lon: number,
  lat: number,
  opts: MoonFlyOpts = {}
) {
  if (!viewer || viewer.isDestroyed?.()) return;
  const ellipsoid = opts.ellipsoid
    ?? (viewer as any).__atlasNonEarthEllipsoid
    ?? Ellipsoid.MOON;
  const altitude = Math.max(
    MOON_MIN_SAFE_ALTITUDE_M,
    Math.min(MOON_MAX_SAFE_ALTITUDE_M, opts.altitude ?? 180_000),
  );
  const duration = opts.duration ?? 1.6;

  // Put the camera directly above the target in the target planet's
  // coordinate frame and look nadir. Avoids Cesium's Earth-biased fly-to
  // offsets that end inside the planet or at a tangent angle.
  const target = Cartesian3.fromDegrees(lon, lat, 0, ellipsoid);
  const destination = Cartesian3.fromDegrees(lon, lat, altitude, ellipsoid);
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
  const ellipsoid = (viewer as any).__atlasNonEarthEllipsoid ?? Ellipsoid.MOON;
  let correcting = false;
  let lastCheck = 0;

  const correct = () => {
    if (correcting || viewer.isDestroyed?.()) return;
    if (typeof window !== "undefined" && (window as any).__atlasLevelPlaying) return;
    const now = performance.now();
    if (now - lastCheck < 150) return;
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

    if (!needsCorrection) return;

    correcting = true;
    try {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      const position = Cartesian3.fromRadians(carto.longitude, carto.latitude, safeHeight, ellipsoid);
      viewer.camera.setView({ destination: position });
      viewer.scene.requestRender?.();
    } finally {
      correcting = false;
    }
  };

  const removeMoveEnd = viewer.camera.moveEnd.addEventListener(correct);
  correct();

  return () => {
    try { removeMoveEnd?.(); } catch {}
  };
}

void CesiumMath;