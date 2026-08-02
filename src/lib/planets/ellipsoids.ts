/**
 * Non-Earth ellipsoids used by Atlas worlds (Moon, Mars, ...).
 * Cesium ships Ellipsoid.WGS84 and Ellipsoid.MOON; Mars is not built in.
 * Radii source: IAU 2015 mean equatorial/polar radii.
 */
import { Ellipsoid } from "cesium";
import { findPlanet, type PlanetId } from "@/lib/planets/config";

// Mars: equatorial radius 3396.2 km, polar radius 3376.2 km.
export const MARS_ELLIPSOID = Object.freeze(
  new Ellipsoid(3_396_200, 3_396_200, 3_376_200),
);

export type WorldId = PlanetId | (string & {});

export function ellipsoidForWorld(world: WorldId): Ellipsoid {
  if (world === "earth") return Ellipsoid.WGS84;
  if (world === "moon") return Ellipsoid.MOON;
  if (world === "mars") return MARS_ELLIPSOID;
  const p = findPlanet(world);
  const rm = (p?.radiusKm ?? 1000) * 1000;
  return Object.freeze(new Ellipsoid(rm, rm, rm));
}

/** Build a spherical Cesium Ellipsoid from a planet's equatorial radius (km). */
export function ellipsoidForPlanet(id: PlanetId): Ellipsoid {
  if (id === "earth") return Ellipsoid.WGS84;
  if (id === "moon") return Ellipsoid.MOON;
  if (id === "mars") return MARS_ELLIPSOID;
  const p = findPlanet(id);
  const rm = (p?.radiusKm ?? 1000) * 1000;
  return Object.freeze(new Ellipsoid(rm, rm, rm));
}