import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Walkability heat-map overlay.
 *
 * Renders a flat grid of small tiles a few centimetres above the ground.
 * Each tile is the result of a "can a character stand here?" probe:
 *
 *   GREEN  — a ground hit exists, the surface slope is <= maxSlope, and there's
 *            enough vertical clearance for the character's height.
 *   RED    — no ground (a hole / pit), too steep to stand on, or a ceiling /
 *            obstacle would intersect the character capsule at that spot.
 *
 * It re-samples whenever `nonce` changes (toggle the panel off/on after moving
 * geometry to refresh).
 */
export default function NavigationMap({
  size = 20,
  resolution = 40,
  charHeight = 1.7,
  charRadius = 0.32,
  maxSlopeDeg = 45,
  centerXZ,
  excludeObjects,
  nonce = 0,
}: {
  size?: number;
  resolution?: number;
  charHeight?: number;
  charRadius?: number;
  maxSlopeDeg?: number;
  /** World-space [x, z] center of the sampled area. */
  centerXZ: [number, number];
  /** Objects to skip when probing (the playable character itself). */
  excludeObjects?: THREE.Object3D[];
  nonce?: number;
}) {
  const { scene } = useThree();
  const [tiles, setTiles] = useState<
    Array<{ x: number; z: number; y: number; walkable: boolean }>
  >([]);

  useEffect(() => {
    // Build a "static collidables" list once per probe pass.
    const excludeSet = new Set<THREE.Object3D>();
    for (const o of excludeObjects ?? []) o.traverse((c) => excludeSet.add(c));
    const meshes: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (excludeSet.has(o)) return;
      if ((o as any).isMesh && !(o as any).userData?.__gizmo) meshes.push(o);
    });

    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const step = size / resolution;
    const half = size / 2;
    const maxSlopeCos = Math.cos((maxSlopeDeg * Math.PI) / 180);
    const out: Array<{ x: number; z: number; y: number; walkable: boolean }> = [];

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const wx = centerXZ[0] - half + step * (i + 0.5);
        const wz = centerXZ[1] - half + step * (j + 0.5);
        ray.set(new THREE.Vector3(wx, 50, wz), down);
        ray.far = 100;
        const hits = ray.intersectObjects(meshes, true);
        const ground = hits[0];
        let walkable = false;
        let y = -0.5;
        if (ground) {
          y = ground.point.y;
          // Slope check via face normal (in world space).
          let slopeOk = true;
          const face = ground.face;
          if (face) {
            const n = face.normal.clone().applyMatrix3(
              new THREE.Matrix3().getNormalMatrix(ground.object.matrixWorld),
            ).normalize();
            slopeOk = n.y >= maxSlopeCos;
          }
          // Headroom check: shoot a ray UP from just above the ground and
          // confirm nothing intersects within the character's height.
          ray.set(new THREE.Vector3(wx, y + 0.05, wz), new THREE.Vector3(0, 1, 0));
          ray.far = charHeight;
          const ceiling = ray.intersectObjects(meshes, true)[0];
          const headroomOk = !ceiling || ceiling.distance > charHeight - 0.05;
          walkable = slopeOk && headroomOk;
        }
        out.push({ x: wx, z: wz, y, walkable });
      }
    }
    setTiles(out);
    // intentionally re-run when nonce / center / resolution changes
  }, [scene, size, resolution, charHeight, charRadius, maxSlopeDeg, centerXZ[0], centerXZ[1], nonce, excludeObjects]);

  const tileSize = size / resolution;

  // Two batched meshes (one green, one red) via instancing-light approach:
  // simple per-tile <mesh> is fine at 40x40 = 1600 quads on dev hardware,
  // but we group them to keep the DOM-side R3F overhead down.
  const greenMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#22c55e",
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), []);
  const redMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#ef4444",
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), []);

  return (
    <group renderOrder={5000} userData={{ __gizmo: true }}>
      {tiles.map((t, i) => (
        <mesh
          key={i}
          position={[t.x, t.y + 0.03, t.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={t.walkable ? greenMat : redMat}
        >
          <planeGeometry args={[tileSize * 0.92, tileSize * 0.92]} />
        </mesh>
      ))}
    </group>
  );
}