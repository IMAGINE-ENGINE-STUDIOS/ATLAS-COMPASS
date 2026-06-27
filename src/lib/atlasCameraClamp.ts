/**
 * atlasCameraClamp
 * ----------------
 * Shared utility for keeping a Cesium camera "eye" position from clipping
 * inside the globe / 3D Tiles surface. We sample the terrain height under
 * the eye (cheap synchronous sample — no async wait) and bump the eye up
 * if it sits below `surface + margin`. Used by both the level play overlay
 * and the free-play overlay so first/third person cameras never see the
 * inside of the Earth tiles or buildings.
 */
import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  type Viewer,
} from "cesium";

const _carto = new Cartographic();

export function clampEyeAboveTerrain(
  viewer: Viewer,
  eye: { x: number; y: number; z: number },
  marginMeters: number = 0.6,
): Cartesian3 {
  try {
    Cartographic.fromCartesian(new Cartesian3(eye.x, eye.y, eye.z), undefined, _carto);
    const scene = viewer.scene;
    // Prefer the actual rendered surface (3D Tiles + globe), fall back to globe.
    let surfaceH: number | null = null;
    const sampled = scene.sampleHeight?.(_carto, [], 0.05);
    if (typeof sampled === "number" && Number.isFinite(sampled)) surfaceH = sampled;
    if (surfaceH === null) {
      const gh = scene.globe?.getHeight?.(_carto);
      if (typeof gh === "number" && Number.isFinite(gh)) surfaceH = gh;
    }
    if (surfaceH !== null && _carto.height < surfaceH + marginMeters) {
      return Cartesian3.fromRadians(_carto.longitude, _carto.latitude, surfaceH + marginMeters);
    }
  } catch {}
  return new Cartesian3(eye.x, eye.y, eye.z);
}

void CesiumMath;