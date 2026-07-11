/**
 * IAU 2015 rotational elements for the planets and major moons.
 *
 * Given a Julian Date (TDB, TT — differences are sub-arc-second), returns
 * the body's pole direction (RA, Dec) and prime meridian angle W. These
 * define the body-fixed frame relative to ICRF, which is what we need to
 * spin planets/moons in real time in the R3F Solar System view.
 *
 * Values from:
 *   Archinal et al., "Report of the IAU Working Group on Cartographic
 *   Coordinates and Rotational Elements: 2015", Celest. Mech. Dyn. Astr.
 *   (2018) 130:22. https://doi.org/10.1007/s10569-017-9805-5
 *
 * Only the constant + linear-in-time terms are included — good to a few
 * arc-seconds for present-day rendering, and cheap enough that we can
 * evaluate every frame with zero allocations. Add periodic terms later
 * if the extra accuracy becomes visible.
 */

import type { SolarBodyId } from "@/lib/solarSystem";

/** J2000.0 epoch as a Julian Date. */
export const JD_J2000 = 2451545.0;

/**
 * Rotational element definition.
 *   α0 = a0 + a1 * T   (T = centuries from J2000, TDB)
 *   δ0 = d0 + d1 * T
 *   W  = w0 + w1 * d   (d = days from J2000, TDB)
 * All angles in degrees.
 */
export interface IauRotationConstants {
  a0: number; a1: number;
  d0: number; d1: number;
  w0: number; w1: number;
}

export const IAU_ROTATION: Partial<Record<SolarBodyId, IauRotationConstants>> = {
  sun:     { a0: 286.13,   a1: 0,        d0: 63.87,   d1: 0,        w0: 84.176,  w1: 14.1844000 },
  mercury: { a0: 281.0103, a1: -0.0328,  d0: 61.4155, d1: -0.0049,  w0: 329.5988, w1: 6.1385108 },
  venus:   { a0: 272.76,   a1: 0,        d0: 67.16,   d1: 0,        w0: 160.20,  w1: -1.4813688 },
  earth:   { a0: 0.00,     a1: -0.641,   d0: 90.00,   d1: -0.557,   w0: 190.147, w1: 360.9856235 },
  moon:    { a0: 269.9949, a1: 0.0031,   d0: 66.5392, d1: 0.0130,   w0: 38.3213, w1: 13.17635815 },
  mars:    { a0: 317.68143,a1: -0.1061,  d0: 52.88650,d1: -0.0609,  w0: 176.630, w1: 350.89198226 },
  jupiter: { a0: 268.056595, a1: -0.006499, d0: 64.495303, d1: 0.002413, w0: 284.95, w1: 870.5360000 },
  saturn:  { a0: 40.589,   a1: -0.036,   d0: 83.537,  d1: -0.004,   w0: 38.90,   w1: 810.7939024 },
  uranus:  { a0: 257.311,  a1: 0,        d0: -15.175, d1: 0,        w0: 203.81,  w1: -501.1600928 },
  neptune: { a0: 299.36,   a1: 0,        d0: 43.46,   d1: 0,        w0: 249.978, w1: 541.1397757 },
};

export interface IauRotationState {
  /** Pole right ascension in radians. */
  alpha: number;
  /** Pole declination in radians. */
  delta: number;
  /** Prime meridian angle W in radians (0..2π). */
  w: number;
  /** Axial tilt (obliquity from ecliptic-plane orbit normal) in radians. */
  tilt: number;
}

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

function wrap(rad: number) {
  const m = rad % TWO_PI;
  return m < 0 ? m + TWO_PI : m;
}

/** Evaluate IAU rotational elements at a given Julian Date. */
export function iauRotationAt(id: SolarBodyId, jd: number): IauRotationState | null {
  const k = IAU_ROTATION[id];
  if (!k) return null;
  const d = jd - JD_J2000;
  const T = d / 36525;
  const alpha = (k.a0 + k.a1 * T) * DEG;
  const delta = (k.d0 + k.d1 * T) * DEG;
  const w = wrap((k.w0 + k.w1 * d) * DEG);
  // Axial tilt = angle between pole and ecliptic north (approx: 90° - δ0
  // relative to Earth's equatorial pole, then rotated into the ecliptic
  // via the Earth obliquity). For the R3F system view we only need a
  // stable tilt visualisation, so return the ICRF-relative complement.
  const tilt = Math.PI / 2 - Math.abs(delta);
  return { alpha, delta, w, tilt };
}

/** Convert a JavaScript Date to Julian Date (UTC — good to ~1s for us). */
export function dateToJulianDate(d: Date): number {
  return d.getTime() / 86_400_000 + 2440587.5;
}

export function iauRotationNow(id: SolarBodyId): IauRotationState | null {
  return iauRotationAt(id, dateToJulianDate(new Date()));
}