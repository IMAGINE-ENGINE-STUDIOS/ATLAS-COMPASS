import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { pushableRegistry } from "./locomotionState";

/**
 * Wraps a scene object's group so it behaves as a "small object" the player
 * can push/kick. The Object3D position is mutated directly each frame; we
 * never write back to React state so the editor isn't spammed with patches.
 * (Pushed objects "reset" the next time the user leaves Play mode and the
 * scene re-renders from authored state.)
 */
export default function PushableRuntime({
  objectId,
  groupRef,
  mass = 1,
}: {
  objectId: string;
  groupRef: React.RefObject<THREE.Object3D>;
  mass?: number;
}) {
  const stateRef = useRef({
    velocity: new THREE.Vector3(),
    angularY: 0,
    position: new THREE.Vector3(),
    mass,
  });

  useEffect(() => {
    if (!groupRef.current) return;
    stateRef.current.position.copy(groupRef.current.position);
    pushableRegistry.set(objectId, stateRef.current);
    return () => { pushableRegistry.delete(objectId); };
  }, [objectId, groupRef]);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const g = groupRef.current;
    const s = stateRef.current;
    if (!g) return;
    // Apply linear friction (ground-like).
    const friction = Math.exp(-dt * 3.5);
    s.velocity.x *= friction;
    s.velocity.z *= friction;
    s.angularY *= friction;
    if (Math.abs(s.velocity.x) < 0.01) s.velocity.x = 0;
    if (Math.abs(s.velocity.z) < 0.01) s.velocity.z = 0;
    g.position.x += s.velocity.x * dt;
    g.position.z += s.velocity.z * dt;
    g.rotation.y += s.angularY * dt;
    s.position.copy(g.position);
  });

  return null;
}