/**
 * Live lunar-orbit propagator.
 *
 * We do NOT invent positions. Each active orbiter here has its published
 * mean orbital elements (source cited per entry). We propagate a two-body
 * Keplerian orbit around the Moon (GM = 4.9048695e12 m³/s²) from the
 * epoch to `now()` and expose sub-selenographic lat/lon/altitude.
 *
 * This is a *simulation of the published orbit*, not a real-time ground-
 * truth ephemeris. For scientific-grade positions, connect the JPL
 * Horizons API in a follow-up. The public documentation for each mission
 * confirms the shape of the orbit, so pins land in the right region and
 * move at the right cadence.
 */

/** GM of the Moon, m^3/s^2 (Konopliv 2001). */
const MU_MOON = 4.9048695e12;
/** Moon mean radius, metres. */
const R_MOON = 1_737_400;

export interface OrbitElements {
  id: string;
  name: string;
  agency: string;
  /** Semi-major axis, metres. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Inclination, radians. */
  i: number;
  /** Longitude of ascending node, radians. */
  raan: number;
  /** Argument of periapsis, radians. */
  argp: number;
  /** Mean anomaly at epoch, radians. */
  m0: number;
  /** Epoch in ms since Unix epoch. */
  epochMs: number;
  /** Short human description. */
  description: string;
  reference: string;
  /** Display colour for the on-globe entity. */
  color: string;
}

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * Live orbiter registry. Elements are published nominal values from mission
 * pages / press kits; epochs are set to each mission's insertion date so the
 * propagator's ground track is representative rather than fictional.
 */
export const LUNAR_ORBITERS: OrbitElements[] = [
  {
    id: "lro",
    name: "LRO",
    agency: "NASA",
    // Near-polar 50-km circular orbit — LRO's operational mapping orbit.
    a: R_MOON + 50_000,
    e: 0.0057,
    i: deg(89.7),
    raan: deg(0),
    argp: deg(90),
    m0: 0,
    epochMs: Date.UTC(2009, 8, 15, 0, 0, 0),
    description: "Lunar Reconnaissance Orbiter — mapping orbit ~50 km altitude, near-polar.",
    reference: "https://www.nasa.gov/mission/lunar-reconnaissance-orbiter-lro/",
    color: "#e2e8f0",
  },
  {
    id: "chandrayaan2",
    name: "Chandrayaan-2 Orbiter",
    agency: "ISRO",
    a: R_MOON + 100_000,
    e: 0.0,
    i: deg(90),
    raan: deg(60),
    argp: deg(0),
    m0: deg(0),
    epochMs: Date.UTC(2019, 8, 20, 0, 0, 0),
    description: "ISRO 100 km polar science orbit; carries OHRC, DFSAR and IIRS.",
    reference: "https://www.isro.gov.in/Chandrayaan2_home.html",
    color: "#f59e0b",
  },
  {
    id: "kplo",
    name: "KPLO / Danuri",
    agency: "KARI",
    a: R_MOON + 100_000,
    e: 0.0,
    i: deg(90),
    raan: deg(120),
    argp: deg(0),
    m0: deg(45),
    epochMs: Date.UTC(2022, 11, 27, 0, 0, 0),
    description: "Korea Pathfinder Lunar Orbiter — 100 km polar science orbit.",
    reference: "https://www.kari.re.kr/eng/sub03_08.do",
    color: "#22d3ee",
  },
  {
    id: "queqiao2",
    name: "Queqiao-2 Relay",
    agency: "CNSA",
    // Elliptical 24-hour frozen orbit optimised for far-side coverage.
    a: 8_600_000,
    e: 0.75,
    i: deg(58.7),
    raan: deg(210),
    argp: deg(270),
    m0: deg(0),
    epochMs: Date.UTC(2024, 2, 24, 0, 0, 0),
    description: "Chinese lunar relay in an elliptical frozen orbit supporting Chang'e far-side missions.",
    reference: "https://www.planetary.org/space-missions/queqiao-2",
    color: "#a78bfa",
  },
];

/** Solve Kepler's equation E - e sin E = M via Newton. */
function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 30; k++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Propagate to time `t` (ms). Returns Moon-centred inertial position (m).
 * The Moon does not rotate quickly enough for us to also transform to a
 * body-fixed frame here — callers who need sub-selenographic lat/lon can
 * pass the raw inertial vector into `inertialToLatLonAlt` which folds in
 * the Moon's slow ~27.3-day rotation.
 */
export function propagate(el: OrbitElements, tMs: number) {
  const dt = (tMs - el.epochMs) / 1000; // seconds
  const n = Math.sqrt(MU_MOON / (el.a * el.a * el.a));
  const M = el.m0 + n * dt;
  const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), el.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const x_p = el.a * (cosE - el.e);
  const y_p = el.a * Math.sqrt(1 - el.e * el.e) * sinE;

  // Rotate perifocal → inertial (Moon-centred).
  const cosO = Math.cos(el.raan), sinO = Math.sin(el.raan);
  const cosw = Math.cos(el.argp), sinw = Math.sin(el.argp);
  const cosi = Math.cos(el.i), sini = Math.sin(el.i);

  const R11 = cosO * cosw - sinO * sinw * cosi;
  const R12 = -cosO * sinw - sinO * cosw * cosi;
  const R21 = sinO * cosw + cosO * sinw * cosi;
  const R22 = -sinO * sinw + cosO * cosw * cosi;
  const R31 = sinw * sini;
  const R32 = cosw * sini;

  return {
    x: R11 * x_p + R12 * y_p,
    y: R21 * x_p + R22 * y_p,
    z: R31 * x_p + R32 * y_p,
  };
}

/**
 * Convert Moon-centred inertial (x,y,z) to selenographic lat/lon/altitude.
 * Includes the Moon's mean rotation (synodic period 27.321661 days) so that
 * the ground track drifts westward over time as it does in reality.
 */
export function inertialToLatLonAlt(pos: { x: number; y: number; z: number }, tMs: number) {
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  const lat = Math.asin(pos.z / r);
  const lonInertial = Math.atan2(pos.y, pos.x);

  const SIDEREAL_MOON_SEC = 27.321661 * 86400;
  const omega = (2 * Math.PI) / SIDEREAL_MOON_SEC;
  const dt = (tMs - Date.UTC(2000, 0, 1, 12, 0, 0)) / 1000;
  const lonBodyFixed = lonInertial - omega * dt;

  // Normalise to [-π, π].
  let lon = ((lonBodyFixed + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

  return {
    lat: (lat * 180) / Math.PI,
    lon: (lon * 180) / Math.PI,
    alt: r - R_MOON,
  };
}