import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { TrajectoryObject, TrajectorySection, SceneObject } from "@/lib/levelTypes";

/* ---------- helpers ---------- */

function buildCurve(obj: TrajectoryObject): THREE.CatmullRomCurve3 | null {
  if (!obj.points || obj.points.length < 2) return null;
  const pts = obj.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(pts, obj.closed, "catmullrom", obj.tension);
  return curve;
}

function sectionAt(sections: TrajectorySection[], t: number): TrajectorySection | null {
  for (const s of sections) {
    if (t >= s.tStart && t < s.tEnd) return s;
  }
  return null;
}

/* ---------- render ---------- */

export function TrajectoryRender({
  obj,
  selected,
  onSelect,
}: {
  obj: TrajectoryObject;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const curve = useMemo(() => buildCurve(obj), [obj.points, obj.closed, obj.tension]);

  // Build colored line segments by sampling the curve and tinting per section.
  const segments = useMemo(() => {
    if (!curve) return [] as Array<{ pts: [number, number, number][]; color: string }>;
    const SAMPLES = 200;
    const points: THREE.Vector3[] = curve.getSpacedPoints(SAMPLES);
    const segs: Array<{ pts: [number, number, number][]; color: string }> = [];
    let current: { pts: [number, number, number][]; color: string } | null = null;
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      const sec = sectionAt(obj.sections, t);
      const altitude = sec?.altitude ?? 0;
      const color = sec?.color ?? obj.color;
      const p: [number, number, number] = [points[i].x, points[i].y + altitude, points[i].z];
      if (!current || current.color !== color) {
        if (current) current.pts.push(p); // close previous with overlap
        current = { pts: [p], color };
        segs.push(current);
      } else {
        current.pts.push(p);
      }
    }
    return segs;
  }, [curve, obj.sections, obj.color]);

  if (!curve) {
    return (
      <Html center>
        <div style={{ fontSize: 10, padding: "2px 6px", background: "rgba(0,0,0,0.6)", color: "#fff", borderRadius: 4 }}>
          Trajectory needs ≥ 2 points
        </div>
      </Html>
    );
  }

  return (
    <group onPointerDown={(e) => { e.stopPropagation(); onSelect?.(obj.id); }}>
      {segments.map((s, i) => (
        <Line
          key={i}
          points={s.pts}
          color={s.color}
          lineWidth={selected ? 4 : 2.5}
          transparent
          opacity={0.95}
        />
      ))}
      {/* Control-point handles */}
      {obj.points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[selected ? 0.18 : 0.12, 12, 12]} />
          <meshBasicMaterial color={selected ? "#fbbf24" : "#94a3b8"} />
        </mesh>
      ))}
      {/* Direction arrow on first segment */}
      {obj.points.length >= 2 && (() => {
        const a = new THREE.Vector3(...obj.points[0]);
        const b = curve.getPointAt(0.02);
        const dir = b.clone().sub(a).normalize();
        const arrowLen = 0.6;
        return (
          <arrowHelper
            args={[dir, a, arrowLen, selected ? 0xfbbf24 : 0x64748b, 0.2, 0.15]}
          />
        );
      })()}
    </group>
  );
}

/* ---------- runtime ---------- */

/**
 * Advances every trajectory follower along its curve while `playing`.
 * Followers are located by their group name (`obj-${id}`) inside the
 * provided scene group ref — same pattern AnimationRunner uses.
 */
export function TrajectoryRunner({
  objects,
  playing,
  groupRef,
}: {
  objects: SceneObject[];
  playing: boolean;
  groupRef: React.RefObject<THREE.Group>;
}) {
  const phaseRef = useRef<Map<string, number>>(new Map()); // key: traj.id + ":" + followerId
  const origRef = useRef<Map<string, [number, number, number]>>(new Map()); // followerId -> original pos

  const trajectories = useMemo(
    () => objects.filter((o) => o.kind === "trajectory") as TrajectoryObject[],
    [objects],
  );

  // Snapshot original positions of all followers when play starts; restore on stop.
  useEffect(() => {
    if (!playing) {
      // restore
      const g = groupRef.current;
      if (g) {
        origRef.current.forEach((pos, fid) => {
          const f = g.getObjectByName(`obj-${fid}`);
          if (f) f.position.set(pos[0], pos[1], pos[2]);
        });
      }
      origRef.current.clear();
      phaseRef.current.clear();
      return;
    }
    const g = groupRef.current;
    if (!g) return;
    const allFollowers = new Set<string>();
    trajectories.forEach((t) => t.followers.forEach((f) => allFollowers.add(f)));
    allFollowers.forEach((fid) => {
      const f = g.getObjectByName(`obj-${fid}`);
      if (f) origRef.current.set(fid, [f.position.x, f.position.y, f.position.z]);
    });
  }, [playing, trajectories, groupRef]);

  useFrame((_, dt) => {
    if (!playing) return;
    const g = groupRef.current;
    if (!g) return;
    const clampedDt = Math.min(dt, 0.1);

    for (const traj of trajectories) {
      const curve = buildCurve(traj);
      if (!curve) continue;
      const totalLen = curve.getLength();
      if (totalLen <= 0) continue;

      // World-space transform of the trajectory's own group (rotation/scale/pos).
      const trajGroup = g.getObjectByName(`obj-${traj.id}`);
      const mat = new THREE.Matrix4();
      if (trajGroup) {
        trajGroup.updateWorldMatrix(true, false);
        mat.copy(trajGroup.matrixWorld);
      }

      for (const fid of traj.followers) {
        if (fid === traj.id) continue;
        const follower = g.getObjectByName(`obj-${fid}`);
        if (!follower) continue;

        const key = `${traj.id}:${fid}`;
        let s = phaseRef.current.get(key) ?? 0;
        const t0 = (s / totalLen) % 1;
        const sec = sectionAt(traj.sections, t0);
        const speed = traj.speed * (sec?.speedMul ?? 1);
        s += speed * clampedDt;
        if (!traj.closed && !traj.loop) {
          if (s >= totalLen) s = totalLen;
        } else {
          s = ((s % totalLen) + totalLen) % totalLen;
        }
        phaseRef.current.set(key, s);

        const t = Math.min(0.9999, Math.max(0, s / totalLen));
        const localPos = curve.getPointAt(t);
        const localTan = curve.getTangentAt(t);

        // Apply altitude from active section (in local space, since the
        // trajectory's own rotation/scale will fold it into world).
        const activeSec = sectionAt(traj.sections, t);
        localPos.y += activeSec?.altitude ?? 0;

        const worldPos = localPos.clone().applyMatrix4(mat);
        follower.position.copy(worldPos);

        if (traj.orientToPath) {
          const worldTan = localTan.clone().transformDirection(mat).normalize();
          const yaw = Math.atan2(worldTan.x, worldTan.z);
          follower.rotation.y = yaw;
        }
      }
    }
  });

  return null;
}