/**
 * Deep-sky pointing targets and the camera maths that aims the Atlas at them.
 *
 * Right ascension / declination are inertial (ICRS). Cesium's camera lives in
 * the Earth-fixed frame, so a target direction is rotated by the current
 * ICRF→fixed matrix before it becomes a view direction. Narrowing the frustum
 * FOV then acts as a telescope: the same NASA/CDS survey pixels keep resolving
 * as the field shrinks, which is what "trekking into infinity" feels like.
 */
import { Cartesian3, Math as CMath, Matrix3, Matrix4, Transforms, JulianDate } from "cesium";

export interface StarTarget {
  id: string;
  name: string;
  kind: "galaxy" | "nebula" | "cluster" | "structure" | "star" | "remnant";
  /** Right ascension in degrees (ICRS). */
  ra: number;
  /** Declination in degrees (ICRS). */
  dec: number;
  distance: string;
  note: string;
  /** Suggested telescope field of view, degrees. */
  fov: number;
}

export const STAR_TARGETS: StarTarget[] = [
  { id: "galactic-center", name: "Galactic Center · Sgr A*", kind: "structure", ra: 266.417, dec: -29.008, distance: "26,700 ly", note: "The Milky Way's supermassive black hole, behind 25 magnitudes of dust.", fov: 8 },
  { id: "orion", name: "Orion Nebula · M42", kind: "nebula", ra: 83.822, dec: -5.391, distance: "1,344 ly", note: "Nearest massive star-forming region.", fov: 2.5 },
  { id: "andromeda", name: "Andromeda Galaxy · M31", kind: "galaxy", ra: 10.685, dec: 41.269, distance: "2.5 Mly", note: "Nearest large spiral, approaching us at 110 km/s.", fov: 4 },
  { id: "pleiades", name: "Pleiades · M45", kind: "cluster", ra: 56.75, dec: 24.117, distance: "444 ly", note: "Young open cluster wrapped in reflection nebulosity.", fov: 3 },
  { id: "lmc", name: "Large Magellanic Cloud", kind: "galaxy", ra: 80.894, dec: -69.756, distance: "163,000 ly", note: "Satellite galaxy hosting the Tarantula Nebula.", fov: 10 },
  { id: "smc", name: "Small Magellanic Cloud", kind: "galaxy", ra: 13.187, dec: -72.829, distance: "200,000 ly", note: "Second Magellanic satellite, tidally stretched.", fov: 7 },
  { id: "crab", name: "Crab Nebula · M1", kind: "remnant", ra: 83.633, dec: 22.015, distance: "6,500 ly", note: "SN 1054 remnant; bright in X-ray and gamma-ray surveys.", fov: 1.2 },
  { id: "cygnus-x", name: "Cygnus X / Cygnus A", kind: "structure", ra: 299.868, dec: 40.734, distance: "4,600 ly", note: "Dense star-forming complex and a radio-loud sky landmark.", fov: 6 },
  { id: "vela", name: "Vela Supernova Remnant", kind: "remnant", ra: 128.836, dec: -45.176, distance: "815 ly", note: "Huge soft X-ray shell — spectacular in ROSAT.", fov: 9 },
  { id: "virgo", name: "Virgo Cluster · M87", kind: "galaxy", ra: 187.706, dec: 12.391, distance: "53.5 Mly", note: "First black hole ever imaged sits at its core.", fov: 5 },
  { id: "carina", name: "Carina Nebula · NGC 3372", kind: "nebula", ra: 161.265, dec: -59.684, distance: "8,500 ly", note: "Home of Eta Carinae, a future supernova.", fov: 3 },
  { id: "eagle", name: "Eagle Nebula · M16", kind: "nebula", ra: 274.7, dec: -13.807, distance: "5,700 ly", note: "The Pillars of Creation.", fov: 1.5 },
  { id: "north-pole", name: "North Celestial Pole", kind: "structure", ra: 0, dec: 90, distance: "—", note: "Polaris region; the sky's rotation axis.", fov: 20 },
  { id: "south-pole", name: "South Celestial Pole", kind: "structure", ra: 0, dec: -90, distance: "—", note: "Octans region, no bright pole star.", fov: 20 },
  { id: "cmb-dipole", name: "CMB Dipole Apex", kind: "structure", ra: 167.94, dec: -6.94, distance: "13.8 Gly", note: "Direction of our 370 km/s motion through the microwave background.", fov: 30 },
  { id: "hubble-deep", name: "Hubble Deep Field North", kind: "structure", ra: 189.206, dec: 62.216, distance: "> 12 Gly", note: "A pencil beam through nearly the whole observable universe.", fov: 0.6 },
];

/** ICRS right ascension / declination (degrees) → unit vector in the ICRF. */
export function icrfDirection(raDeg: number, decDeg: number): Cartesian3 {
  const ra = CMath.toRadians(raDeg);
  const dec = CMath.toRadians(decDeg);
  return new Cartesian3(
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  );
}

/** Same direction expressed in the frame the Cesium camera uses right now. */
export function fixedDirection(raDeg: number, decDeg: number): Cartesian3 {
  const dir = icrfDirection(raDeg, decDeg);
  const matrix = Transforms.computeIcrfToFixedMatrix(JulianDate.now(), new Matrix3());
  if (!matrix) return dir;
  return Cartesian3.normalize(Matrix3.multiplyByVector(matrix, dir, new Cartesian3()), new Cartesian3());
}

/** Aim the camera at a celestial coordinate without moving its position. */
export function pointCameraAtSky(viewer: any, raDeg: number, decDeg: number) {
  if (!viewer || viewer.isDestroyed?.()) return;
  const camera = viewer.camera;
  try { camera.lookAtTransform?.(Matrix4.IDENTITY); } catch {}
  viewer.trackedEntity = undefined;
  const direction = fixedDirection(raDeg, decDeg);
  // Any vector not parallel to the view direction gives a stable roll-free up.
  const worldUp = Math.abs(direction.z) > 0.98 ? new Cartesian3(0, 1, 0) : new Cartesian3(0, 0, 1);
  const right = Cartesian3.normalize(Cartesian3.cross(direction, worldUp, new Cartesian3()), new Cartesian3());
  const up = Cartesian3.normalize(Cartesian3.cross(right, direction, new Cartesian3()), new Cartesian3());
  camera.setView({
    destination: camera.positionWC.clone(),
    orientation: { direction, up },
  });
  try { viewer.scene.requestRender?.(); } catch {}
}

export const MIN_FOV_DEG = 0.05;
export const MAX_FOV_DEG = 75;

/** Telescope zoom: narrow or widen the perspective frustum. */
export function setSkyFov(viewer: any, fovDeg: number) {
  if (!viewer || viewer.isDestroyed?.()) return;
  const clamped = Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, fovDeg));
  const frustum = viewer.camera.frustum;
  if (frustum && "fov" in frustum) frustum.fov = CMath.toRadians(clamped);
  try { viewer.scene.requestRender?.(); } catch {}
}

export function currentFovDeg(viewer: any): number {
  const frustum = viewer?.camera?.frustum;
  if (!frustum || !("fov" in frustum)) return 60;
  return CMath.toDegrees(frustum.fov);
}

/** Where is the camera looking, in ICRS degrees? */
export function cameraSkyCoords(viewer: any): { ra: number; dec: number } | null {
  if (!viewer || viewer.isDestroyed?.()) return null;
  const matrix = Transforms.computeIcrfToFixedMatrix(JulianDate.now(), new Matrix3());
  const dir = viewer.camera.directionWC.clone();
  const icrf = matrix
    ? Matrix3.multiplyByVector(Matrix3.transpose(matrix, new Matrix3()), dir, new Cartesian3())
    : dir;
  Cartesian3.normalize(icrf, icrf);
  const ra = (CMath.toDegrees(Math.atan2(icrf.y, icrf.x)) + 360) % 360;
  const dec = CMath.toDegrees(Math.asin(Math.max(-1, Math.min(1, icrf.z))));
  return { ra, dec };
}
