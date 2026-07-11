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
  Ellipsoid,
  Transforms,
  Matrix4,
  Math as CesiumMath,
  HeadingPitchRoll,
  Quaternion,
  Matrix3,
} from "cesium";

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
  const altitude = opts.altitude ?? 60_000;
  const duration = opts.duration ?? 1.6;
  const headingDeg = opts.heading ?? 0;
  const pitchDeg = opts.pitch ?? -45;

  // Target point on the Moon surface, in world coordinates.
  const target = Cartesian3.fromDegrees(lon, lat, 0, Ellipsoid.MOON);

  // Build an ENU frame *at the target* using Moon parameters so up/east/north
  // are correct for a lunar observer.
  const enu = Transforms.eastNorthUpToFixedFrame(target, Ellipsoid.MOON);

  // In that frame: heading rotates about local up (Z), pitch tilts down.
  const hpr = new HeadingPitchRoll(
    CesiumMath.toRadians(headingDeg),
    CesiumMath.toRadians(pitchDeg),
    0
  );
  // Camera sits behind the target along the -look direction, at `altitude`
  // away from the target point in local ENU.
  const localOffset = new Cartesian3(
    -altitude * Math.sin(hpr.heading) * Math.cos(hpr.pitch),
    -altitude * Math.cos(hpr.heading) * Math.cos(hpr.pitch),
    -altitude * Math.sin(hpr.pitch)
  );
  const destination = Matrix4.multiplyByPoint(enu, localOffset, new Cartesian3());

  // Orientation: face the target from the destination.
  const dirLocal = Cartesian3.normalize(
    Cartesian3.negate(localOffset, new Cartesian3()),
    new Cartesian3()
  );
  // Convert local dir to world by using the ENU rotation part.
  const rot = Matrix4.getMatrix3(enu, new Matrix3());
  const dirWorld = Matrix3.multiplyByVector(rot, dirLocal, new Cartesian3());
  const upWorld = Matrix3.multiplyByVector(rot, Cartesian3.UNIT_Z, new Cartesian3());

  viewer.camera.flyTo({
    destination,
    orientation: {
      direction: dirWorld,
      up: upWorld,
    },
    duration,
  });
  // Silence unused warning for Quaternion (kept for future orientation modes).
  void Quaternion;
}