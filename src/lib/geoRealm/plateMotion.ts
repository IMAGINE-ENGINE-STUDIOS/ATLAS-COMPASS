/**
 * MORVEL 2010 Euler poles (DeMets, Gordon, Argus 2010) in the no-net-rotation
 * reference frame (NNR-MORVEL56 subset for the 25 major plates). Values are
 * verbatim from Table 3 of "Geologically current plate motions" (Geophys. J.
 * Int., 181, 1–80, 2010) and Argus et al. 2011.
 *
 *   lat_deg / lon_deg  — location of Euler pole on the sphere
 *   omega_deg_per_Myr  — angular velocity (positive = right-handed rotation)
 *
 * Plate codes match Bird 2003 PB2002 GeoJSON "PlateName" property.
 */
export interface EulerPole {
  code: string;
  name: string;
  lat: number;
  lon: number;
  omega: number; // deg / Myr
  color: string;
}

export const MORVEL_EULER_POLES: EulerPole[] = [
  { code: "PA", name: "Pacific",            lat: -63.58, lon: 114.70, omega: 0.651, color: "#3aa8ff" },
  { code: "NA", name: "North America",      lat: -4.85,  lon: -80.64, omega: 0.209, color: "#ff8c42" },
  { code: "SA", name: "South America",      lat: -22.62, lon: -112.83,omega: 0.109, color: "#ffb020" },
  { code: "EU", name: "Eurasia",            lat: 48.85,  lon: -106.50,omega: 0.223, color: "#40e0ff" },
  { code: "AF", name: "Africa",             lat: 49.66,  lon: -78.08, omega: 0.285, color: "#ffd93d" },
  { code: "AN", name: "Antarctica",         lat: 65.42,  lon: -118.11,omega: 0.250, color: "#c9d6ff" },
  { code: "AU", name: "Australia",          lat: 33.86,  lon: 37.94,  omega: 0.632, color: "#a8dfff" },
  { code: "IN", name: "India",              lat: 50.37,  lon: -3.29,  omega: 0.544, color: "#ff6b3d" },
  { code: "AR", name: "Arabia",             lat: 48.88,  lon: -8.49,  omega: 0.559, color: "#ffa64d" },
  { code: "NZ", name: "Nazca",              lat: 46.23,  lon: -101.06,omega: 0.696, color: "#5cff9d" },
  { code: "CO", name: "Cocos",              lat: 26.93,  lon: -124.31,omega: 1.198, color: "#7dffdf" },
  { code: "CA", name: "Caribbean",          lat: 35.20,  lon: -92.62, omega: 0.286, color: "#f5a623" },
  { code: "PS", name: "Philippine Sea",     lat: -46.02, lon: -31.36, omega: 0.910, color: "#c94f2b" },
  { code: "JF", name: "Juan de Fuca",       lat: -38.31, lon:  60.04, omega: 0.951, color: "#8dffb0" },
  { code: "SC", name: "Scotia",             lat: 22.52,  lon: -106.15,omega: 0.146, color: "#b0e0ff" },
  { code: "SW", name: "Sandwich",           lat: -19.02, lon: -39.64, omega: 1.444, color: "#ffb8b8" },
  { code: "SU", name: "Sunda",              lat: 50.06,  lon: -95.02, omega: 0.337, color: "#e7c8ff" },
  { code: "MA", name: "Mariana",            lat: 43.78,  lon: 149.21, omega: 1.283, color: "#ffe08a" },
  { code: "AT", name: "Anatolia",           lat: 40.11,  lon:  26.66, omega: 1.210, color: "#ff9ecb" },
  { code: "AS", name: "Aegean Sea",         lat: 74.28,  lon: -87.24, omega: 0.641, color: "#c0ff8a" },
  { code: "OK", name: "Okhotsk",            lat: 30.30,  lon: -92.28, omega: 0.229, color: "#8ac6ff" },
  { code: "AM", name: "Amur",               lat: 63.17,  lon: -122.82,omega: 0.297, color: "#9ff5d2" },
  { code: "YZ", name: "Yangtze",            lat: 69.00,  lon: -97.66, omega: 0.334, color: "#ffd08a" },
  { code: "SO", name: "Somalia",            lat: 49.96,  lon: -84.52, omega: 0.325, color: "#c2ff9a" },
  { code: "RI", name: "Rivera",             lat: 20.25,  lon: -107.29,omega: 4.536, color: "#ff5555" },
];

/**
 * Compute surface velocity at (lat, lon) in mm/yr given an Euler pole.
 * v = ω × r  (both in Earth-centered Cartesian). ω is in rad/Myr; r in km.
 * Returns { east_mm_yr, north_mm_yr, speed_mm_yr }.
 */
export function velocityAt(pole: EulerPole, lat: number, lon: number) {
  const EARTH_KM = 6371;
  const D2R = Math.PI / 180;
  const omegaRadPerMyr = pole.omega * D2R;

  // ω vector in Cartesian (unit direction × magnitude)
  const pl = pole.lat * D2R;
  const po = pole.lon * D2R;
  const wx = omegaRadPerMyr * Math.cos(pl) * Math.cos(po);
  const wy = omegaRadPerMyr * Math.cos(pl) * Math.sin(po);
  const wz = omegaRadPerMyr * Math.sin(pl);

  // position vector on Earth surface
  const rl = lat * D2R;
  const ro = lon * D2R;
  const rx = EARTH_KM * Math.cos(rl) * Math.cos(ro);
  const ry = EARTH_KM * Math.cos(rl) * Math.sin(ro);
  const rz = EARTH_KM * Math.sin(rl);

  // v = ω × r  (km / Myr = mm / yr)
  const vx = wy * rz - wz * ry;
  const vy = wz * rx - wx * rz;
  const vz = wx * ry - wy * rx;

  // Convert to east/north local components
  const east = -Math.sin(ro) * vx + Math.cos(ro) * vy;
  const north =
    -Math.sin(rl) * Math.cos(ro) * vx -
    Math.sin(rl) * Math.sin(ro) * vy +
    Math.cos(rl) * vz;
  const speed = Math.hypot(east, north);
  return { east_mm_yr: east, north_mm_yr: north, speed_mm_yr: speed };
}

/** Two-letter code shorthand mapping for Bird 2003 PlateName strings. */
export function poleForPlateName(name: string | undefined): EulerPole | null {
  if (!name) return null;
  const n = name.toLowerCase();
  const match = MORVEL_EULER_POLES.find((p) =>
    n.includes(p.name.toLowerCase()) || n === p.code.toLowerCase(),
  );
  return match ?? null;
}

/**
 * Map a plate surface velocity (mm/yr) to an activity color ramp:
 *   slow (0)   → deep blue
 *   moderate   → cyan → green → yellow
 *   fast (100+)→ orange → red
 * Anchored to observed range: Eurasia ~5–20, Nazca ~60–80, Rivera >100.
 */
export function activityColor(speedMmYr: number | null | undefined): string {
  if (speedMmYr == null || Number.isNaN(speedMmYr)) return "#3a4c66";
  const stops: Array<[number, [number, number, number]]> = [
    [0,   [0x1b, 0x3c, 0x7a]], // deep blue
    [15,  [0x2a, 0x8f, 0xd8]], // cyan
    [35,  [0x3d, 0xd6, 0x9a]], // green
    [60,  [0xff, 0xd0, 0x3a]], // yellow
    [90,  [0xff, 0x7a, 0x1f]], // orange
    [130, [0xff, 0x2d, 0x2d]], // red
  ];
  const v = Math.max(0, speedMmYr);
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (v <= b) {
      const t = (v - a) / (b - a || 1);
      const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
      const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
      const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return "rgb(255,45,45)";
}