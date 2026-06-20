import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { objectWorldRefs, splineDrivenIds } from "@/components/level/locomotion/locomotionState";
import type { LevelScene } from "@/lib/levelTypes";

/**
 * Rigid-group runtime.
 *
 * Mounts during Play mode and, for each `SceneGroup` with ≥2 members, keeps
 * every member moving as a single body. We deliberately avoid `THREE.Group`
 * reparenting (which would fight `PushableRuntime` / `TrajectoryRuntime`
 * writing directly to each member's local position). Instead, we pick a
 * `leader` (first non-spline-driven member each frame), measure its per-frame
 * world delta, and replay that delta onto every other member that is not
 * itself being driven by a spline this frame. The result: kicking one box of
 * a group nudges the whole group; running a member along a trajectory drags
 * the rest with it.
 */
export default function GroupRuntime({ scene, playing }: { scene: LevelScene; playing: boolean }) {
  const lastLeaderPos = useRef(new Map<string, THREE.Vector3>());

  useEffect(() => {
    if (!playing) lastLeaderPos.current.clear();
  }, [playing]);

  useFrame(() => {
    if (!playing) return;
    const groups = scene.groups ?? [];
    if (groups.length === 0) return;
    for (const g of groups) {
      if (!g.memberIds || g.memberIds.length < 2) continue;
      // Pick a leader: prefer one currently being spline-driven (so the
      // group follows the trajectory); else first available object3d.
      let leader: THREE.Object3D | null = null;
      let leaderId = "";
      for (const mid of g.memberIds) {
        if (splineDrivenIds.has(mid)) {
          const o = objectWorldRefs.get(mid);
          if (o) { leader = o; leaderId = mid; break; }
        }
      }
      if (!leader) {
        for (const mid of g.memberIds) {
          const o = objectWorldRefs.get(mid);
          if (o) { leader = o; leaderId = mid; break; }
        }
      }
      if (!leader) continue;

      const prev = lastLeaderPos.current.get(g.id);
      const cur = leader.position;
      if (!prev) {
        lastLeaderPos.current.set(g.id, cur.clone());
        continue;
      }
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const dz = cur.z - prev.z;
      prev.copy(cur);
      if (dx === 0 && dy === 0 && dz === 0) continue;
      for (const mid of g.memberIds) {
        if (mid === leaderId) continue;
        if (splineDrivenIds.has(mid)) continue;
        const obj = objectWorldRefs.get(mid);
        if (!obj) continue;
        obj.position.x += dx;
        obj.position.y += dy;
        obj.position.z += dz;
      }
    }
  });

  return null;
}