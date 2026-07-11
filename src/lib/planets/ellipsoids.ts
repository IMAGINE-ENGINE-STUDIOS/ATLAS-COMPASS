/**
 * Non-Earth ellipsoids used by Atlas worlds (Moon, Mars, ...).
 * Cesium ships Ellipsoid.WGS84 and Ellipsoid.MOON; Mars is not built in.
 * Radii source: IAU 2015 mean equatorial/polar radii.
 */
import { Ellipsoid } from "cesium";

// Mars: equatorial radius 3396.2 km, polar radius 3376.2 km.
export const MARS_ELLIPSOID = Object.freeze(
  new Ellipsoid(3_396_200, 3_396_200, 3_376_200),
);

export type WorldId = "earth" | "moon" | "mars";

export function ellipsoidForWorld(world: WorldId): Ellipsoid {
  if (world === "mars") return MARS_ELLIPSOID;
  if (world === "moon") return Ellipsoid.MOON;
  return Ellipsoid.WGS84;
}