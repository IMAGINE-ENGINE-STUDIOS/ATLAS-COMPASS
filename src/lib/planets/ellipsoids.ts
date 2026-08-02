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

/** IAU reference equatorial/polar radii, metres. */
const IAU_RADII: Partial<Record<PlanetId, readonly [number, number]>> = {
  sun: [696_340_000, 696_340_000],
  mercury: [2_439_700, 2_439_700],
  venus: [6_051_800, 6_051_800],
  moon: [1_737_400, 1_737_400],
  mars: [3_396_200, 3_376_200],
  jupiter: [71_492_000, 66_854_000],
  saturn: [60_268_000, 54_364_000],
  uranus: [25_559_000, 24_973_000],
  neptune: [24_764_000, 24_341_000],
};

function iauEllipsoid(id: PlanetId): Ellipsoid | null {
  const radii = IAU_RADII[id];
  return radii ? Object.freeze(new Ellipsoid(radii[0], radii[0], radii[1])) : null;
}

export type WorldId = PlanetId | (string & {});

export function ellipsoidForWorld(world: WorldId): Ellipsoid {
  if (world === "earth") return Ellipsoid.WGS84;
  if (world === "mars") return MARS_ELLIPSOID;
  const iau = iauEllipsoid(world as PlanetId);
  if (iau) return iau;
  const p = findPlanet(world);
  const rm = (p?.radiusKm ?? 1000) * 1000;
  return Object.freeze(new Ellipsoid(rm, rm, rm));
}

/** Build a spherical Cesium Ellipsoid from a planet's equatorial radius (km). */
export function ellipsoidForPlanet(id: PlanetId): Ellipsoid {
  if (id === "earth") return Ellipsoid.WGS84;
  if (id === "mars") return MARS_ELLIPSOID;
  const iau = iauEllipsoid(id);
  if (iau) return iau;
  const p = findPlanet(id);
  const rm = (p?.radiusKm ?? 1000) * 1000;
  return Object.freeze(new Ellipsoid(rm, rm, rm));
}