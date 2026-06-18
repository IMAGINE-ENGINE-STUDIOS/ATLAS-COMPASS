import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { pushableRegistry } from "./locomotionState";

/**
 * Wraps a scene object's group so it behaves as a "small object" the player
 * can push/kick. Adds a lightweight collision pass:
 *  - gravity pulls the object down until it rests on something below
 *  - a short down-raycast snaps the bottom to the surface (ground/terrain/
 *    other meshes), so objects sit on shelves, stairs and slopes
 *  - 4 cardinal horizontal raycasts block penetration into static meshes
 *    (walls / other pushables) by clamping the per-axis velocity
 *
 * The Object3D position is mutated directly each frame; we never write back
 * to React state so the editor isn't spammed with patches. (Pushed objects
 * "reset" the next time the user leaves Play mode.)
 */
export default function PushableRuntime({
  objectId,
  groupRef,
  mass = 1,
  gravity = 18,
}: {
  objectId: string;
  groupRef: React.RefObject<THREE.Object3D>;
  mass?: number;
  gravity?: number;
}) {
  const { scene } = useThree();
  const stateRef = useRef({
    velocity: new THREE.Vector3(),
    angularY: 0,
    position: new THREE.Vector3(),
    mass,
  });
  const verticalVel = useRef(0);
  const grounded = useRef(false);
  const sizeRef = useRef({ radius: 0.4, halfHeight: 0.4 });

  useEffect(() => {
    if (!groupRef.current) return;
    stateRef.current.position.copy(groupRef.current.position);
    pushableRegistry.set(objectId, stateRef.current);
    // Measure the object once so we know how to snap the bottom and how
    // far to cast horizontal blocking rays.
    const box = new THREE.Box3().setFromObject(groupRef.current);
    const size = box.getSize(new THREE.Vector3());
    sizeRef.current.radius = Math.max(0.1, Math.max(size.x, size.z) * 0.5);
    sizeRef.current.halfHeight = Math.max(0.1, size.y * 0.5);
    return () => { pushableRegistry.delete(objectId); };
  }, [objectId, groupRef]);

  // Reusable scratch.
  const ray = useRef(new THREE.Raycaster()).current;
  const tmpDown = useRef(new THREE.Vector3(0, -1, 0)).current;

  const collectTargets = (self: THREE.Object3D): THREE.Object3D[] => {
    const skip = new Set<THREE.Object3D>();
    self.traverse((o) => skip.add(o));
    const out: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (skip.has(o)) return;
      if ((o as any).isMesh) {
        const ud = (o as any).userData ?? {};
        if (ud.__gizmo) return;
        out.push(o);
      }
    });
    return out;
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const g = groupRef.current;
    const s = stateRef.current;
    if (!g) return;

    const targets = collectTargets(g);
    const { radius, halfHeight } = sizeRef.current;

    // ---- horizontal friction (only when grounded; air keeps momentum) ----
    const friction = Math.exp(-dt * (grounded.current ? 3.5 : 0.4));
    s.velocity.x *= friction;
    s.velocity.z *= friction;
    s.angularY *= friction;
    if (Math.abs(s.velocity.x) < 0.01) s.velocity.x = 0;
    if (Math.abs(s.velocity.z) < 0.01) s.velocity.z = 0;

    // ---- horizontal motion with blocking raycasts (per-axis) ----
    const tryMove = (axis: "x" | "z", delta: number) => {
      if (delta === 0) return;
      const dir = new THREE.Vector3(
        axis === "x" ? Math.sign(delta) : 0,
        0,
        axis === "z" ? Math.sign(delta) : 0,
      );
      const origin = new THREE.Vector3(g.position.x, g.position.y + halfHeight * 0.5, g.position.z);
      ray.set(origin, dir);
      ray.far = radius + Math.abs(delta) + 0.02;
      const hit = ray.intersectObjects(targets, true)[0];
      if (hit && hit.distance < radius + Math.abs(delta)) {
        // Block: snap up to the wall, kill velocity on that axis.
        const allowed = Math.max(0, hit.distance - radius);
        g.position[axis] += Math.sign(delta) * allowed;
        s.velocity[axis] = 0;
      } else {
        g.position[axis] += delta;
      }
    };
    tryMove("x", s.velocity.x * dt);
    tryMove("z", s.velocity.z * dt);
    g.rotation.y += s.angularY * dt;

    // ---- gravity + ground snap ----
    verticalVel.current -= gravity * dt;
    g.position.y += verticalVel.current * dt;

    // Down-ray from the object's top to find the surface to rest on.
    ray.set(new THREE.Vector3(g.position.x, g.position.y + halfHeight + 0.05, g.position.z), tmpDown);
    ray.far = halfHeight * 2 + 4;
    const down = ray.intersectObjects(targets, true)[0];
    if (down) {
      const restY = down.point.y + halfHeight;
      if (g.position.y <= restY) {
        g.position.y = restY;
        // Tiny bounce on impact, then settle.
        if (verticalVel.current < -3) verticalVel.current = -verticalVel.current * 0.15;
        else verticalVel.current = 0;
        grounded.current = true;
      } else {
        grounded.current = false;
      }
    } else {
      grounded.current = false;
      // Safety: respawn if it fell out of the world.
      if (g.position.y < -100) {
        g.position.y = 50;
        verticalVel.current = 0;
      }
    }

    s.position.copy(g.position);
  });

  return null;
}