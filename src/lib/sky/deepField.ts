/**
 * Deep-field trekking — real telescope pixels streamed as you zoom in.
 *
 * The all-sky skybox is a fixed-resolution panorama: past a few degrees of
 * field it has nothing left to resolve. Real observatory archives instead serve
 * *cutouts*: a gnomonic (TAN) render of a small patch of sky at whatever scale
 * you ask for. That is exactly a pinhole camera image, so a TAN cutout whose
 * field matches the Cesium frustum can be drawn straight over the viewport and
 * is geometrically correct — pan or zoom, request a new cutout, and the survey
 * keeps resolving finer detail all the way down to the archive's native pixels.
 */
import { Cartesian3, Math as CMath, Matrix3, Transforms, JulianDate } from "cesium";
import type { SkySurveyId } from "./skySurveys";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Deep field only makes sense once the frustum is narrower than the mosaic. */
export const DEEP_FIELD_MAX_FOV = 12;

export interface DeepFieldFrame {
  ra: number;
  dec: number;
  /** Field of view spanned by the square cutout, degrees. */
  fov: number;
  /** Screen roll of celestial north, degrees clockwise from screen up. */
  roll: number;
  /** Square side in CSS px the image must occupy. */
  size: number;
  url: string;
}

export function cutoutUrl(survey: SkySurveyId, ra: number, dec: number, fov: number, width: number) {
  const q = new URLSearchParams({
    mode: "cutout",
    survey,
    ra: ra.toFixed(5),
    dec: dec.toFixed(5),
    fov: fov.toFixed(5),
    width: String(width),
    apikey: ANON,
  });
  return `${SUPABASE_URL}/functions/v1/sky-imagery?${q.toString()}`;
}

/** Camera pointing + the exact square cutout geometry that covers the canvas. */
export function deepFieldGeometry(viewer: any): Omit<DeepFieldFrame, "url"> | null {
  if (!viewer || viewer.isDestroyed?.()) return null;
  const camera = viewer.camera;
  const frustum = camera?.frustum;
  if (!frustum || !("fov" in frustum)) return null;

  const canvas = viewer.scene?.canvas;
  const w = canvas?.clientWidth || window.innerWidth;
  const h = canvas?.clientHeight || window.innerHeight;

  // Cesium's `fov` is horizontal when the canvas is landscape, vertical otherwise.
  const fovRad: number = frustum.fov;
  const fovX = w >= h ? fovRad : 2 * Math.atan(Math.tan(fovRad / 2) * (w / h));

  // Cover the canvas with one square image, then scale its field to match.
  const size = Math.max(w, h);
  const fov = CMath.toDegrees(2 * Math.atan(Math.tan(fovX / 2) * (size / w)));

  const icrfToFixed = Transforms.computeIcrfToFixedMatrix(JulianDate.now(), new Matrix3());
  const toIcrf = (v: Cartesian3) =>
    icrfToFixed
      ? Cartesian3.normalize(
          Matrix3.multiplyByVector(Matrix3.transpose(icrfToFixed, new Matrix3()), v, new Cartesian3()),
          new Cartesian3(),
        )
      : Cartesian3.normalize(v.clone(), new Cartesian3());

  const dir = toIcrf(camera.directionWC);
  const up = toIcrf(camera.upWC);
  const right = toIcrf(camera.rightWC);

  const ra = (CMath.toDegrees(Math.atan2(dir.y, dir.x)) + 360) % 360;
  const dec = CMath.toDegrees(Math.asin(Math.max(-1, Math.min(1, dir.z))));

  // Position angle of the celestial pole projected onto the image plane.
  const pole = new Cartesian3(0, 0, 1);
  const along = Cartesian3.dot(pole, dir);
  const perp = Cartesian3.subtract(pole, Cartesian3.multiplyByScalar(dir, along, new Cartesian3()), new Cartesian3());
  const roll = Cartesian3.magnitude(perp) < 1e-6
    ? 0
    : CMath.toDegrees(Math.atan2(Cartesian3.dot(perp, right), Cartesian3.dot(perp, up)));

  return { ra, dec, fov, roll, size };
}

/** Angular separation between two sky coordinates, degrees. */
export function skySeparation(a: { ra: number; dec: number }, b: { ra: number; dec: number }) {
  const d1 = CMath.toRadians(a.dec), d2 = CMath.toRadians(b.dec);
  const dra = CMath.toRadians(a.ra - b.ra);
  const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dra);
  return CMath.toDegrees(Math.acos(Math.max(-1, Math.min(1, cos))));
}

/**
 * Should we pull a fresh cutout? Re-request when the view drifts by more than a
 * fifth of the field, when the zoom changes by 25%, or on a survey/roll change.
 */
export function needsRefresh(prev: Omit<DeepFieldFrame, "url"> | null, next: Omit<DeepFieldFrame, "url">) {
  if (!prev) return true;
  if (skySeparation(prev, next) > next.fov * 0.2) return true;
  if (next.fov / prev.fov > 1.25 || prev.fov / next.fov > 1.25) return true;
  if (Math.abs(prev.roll - next.roll) > 3) return true;
  if (Math.abs(prev.size - next.size) > 40) return true;
  return false;
}

/** Requested pixel width — supersample a little so the field stays crisp. */
export function cutoutWidth(size: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return Math.min(1600, Math.max(512, Math.round(size * dpr)));
}
