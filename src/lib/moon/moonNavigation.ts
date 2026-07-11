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
  Math as CesiumMath,
  HeadingPitchRange,
  BoundingSphere,
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
  const pitchDeg = opts.pitch ?? -35;

  // Target on the Moon surface. Use a bounding sphere + HeadingPitchRange so
  // Cesium computes the destination in a Moon-ENU frame (scene.ellipsoid on
  // a Moon viewer is Ellipsoid.MOON), which reliably keeps the camera OUTSIDE
  // the lunar body regardless of pitch/heading.
  const target = Cartesian3.fromDegrees(lon, lat, 0, Ellipsoid.MOON);
  const sphere = new BoundingSphere(target, 1);
  viewer.camera.flyToBoundingSphere(sphere, {
    duration,
    offset: new HeadingPitchRange(
      CesiumMath.toRadians(headingDeg),
      CesiumMath.toRadians(pitchDeg),
      Math.max(altitude, 5_000),
    ),
  });
}