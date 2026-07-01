/**
 * Shared helpers for the Atlas R3F overlays (Levels, FreePlay, Splats).
 *
 * Previously each overlay defined its own copy of `CameraSync` and the
 * THREE→ENU basis matrix. That was pure duplication AND meant three separate
 * per-frame Cesium→THREE camera syncs on identical inputs. Centralising both
 * here is behaviour-preserving and shrinks the surface area for future work
 * (e.g. merging Canvases).
 */
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Viewer } from "cesium";

// THREE local (+X right, +Y up, +Z toward viewer) → ENU
// (+X east, +Y north, +Z up). Mapping: X→X, Y→Z, Z→Y. Both bases right-handed.
export const THREE_TO_ENU = (() => {
  const m = new THREE.Matrix4();
  m.set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  );
  return m;
})();

/**
 * Mirror Cesium's camera onto the R3F perspective camera every frame. The
 * R3F camera sits at the origin — the world/level/splat groups compensate
 * by rendering relative to `viewer.camera.positionWC` (keeps float precision
 * usable at ECEF scale).
 */
export function CameraSync({
  viewer,
  enabled = true,
}: {
  viewer: Viewer;
  enabled?: boolean;
}) {
  const { camera, size } = useThree();
  useFrame(() => {
    if (!enabled) return;
    if (!viewer || viewer.isDestroyed()) return;
    const cam = viewer.camera;
    const persp = camera as THREE.PerspectiveCamera;
    const fr: any = cam.frustum;
    const fovy = fr?.fovy ?? fr?.fov ?? Math.PI / 3;
    persp.fov = THREE.MathUtils.radToDeg(fovy);
    persp.aspect = size.width / Math.max(1, size.height);
    persp.near = Math.max(0.1, fr?.near ?? 1);
    persp.far = fr?.far ?? 1e10;
    persp.updateProjectionMatrix();
    persp.position.set(0, 0, 0);
    persp.up.set(cam.up.x, cam.up.y, cam.up.z);
    persp.lookAt(cam.direction.x, cam.direction.y, cam.direction.z);
    persp.updateMatrixWorld(true);
  });
  return null;
}