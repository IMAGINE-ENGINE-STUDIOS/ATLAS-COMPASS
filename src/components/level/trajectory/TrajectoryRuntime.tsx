import { useMemo, useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { TrajectoryObject, TrajectorySection, SceneObject, Vec3 } from "@/lib/levelTypes";
import { splineDrivenIds } from "../locomotion/locomotionState";

/* ---------- helpers ---------- */

/** Speed at which spline-driven characters switch from walk to run (u/s). */
const RUN_THRESHOLD = 5;
/** Below this effective speed, fall back to idle. */
const IDLE_THRESHOLD = 0.05;

function findClip(names: string[], ...needles: string[]): string | null {
  const lower = names.map((n) => n.toLowerCase());
  for (const n of needles) {
    const i = lower.findIndex((s) => s.includes(n));
    if (i !== -1) return names[i];
  }
  return null;
}

/** Locate the cloned glTF root inside a follower group so we can drive its
 *  animation actions. Returns null for non-character followers. */
function findCharacterRoot(follower: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  follower.traverse((o) => {
    if (found) return;
    const ud: any = (o as any).userData;
    if (ud && Array.isArray(ud.__animationNames) && ud.__actions) {
      found = o;
    }
  });
  return found;
}

interface FollowerAnimState {
  current: string | null;
  action: THREE.AnimationAction | null;
}

function buildCurve(obj: TrajectoryObject): THREE.CatmullRomCurve3 | null {
  if (!obj.points || obj.points.length < 2) return null;
  const pts = obj.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  // Centripetal Catmull-Rom avoids loops/overshoot at sharp control points,
  // producing a visibly smoother curve than the default "catmullrom" mode.
  const curve = new THREE.CatmullRomCurve3(pts, obj.closed, "centripetal", obj.tension);
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
  editable,
  onPointsChange,
  controlsRef,
}: {
  obj: TrajectoryObject;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** When true, control points can be dragged in the viewport. */
  editable?: boolean;
  /** Patches `points` after a drag. */
  onPointsChange?: (points: Vec3[]) => void;
  /** OrbitControls ref — drag temporarily disables camera control. */
  controlsRef?: React.MutableRefObject<any>;
}) {
  const { camera, gl, scene: r3fScene } = useThree();
  const curve = useMemo(() => buildCurve(obj), [obj.points, obj.closed, obj.tension]);

  // Build colored line segments by sampling the curve and tinting per section.
  const segments = useMemo(() => {
    if (!curve) return [] as Array<{ pts: [number, number, number][]; color: string }>;
    // Denser sampling = silkier curve, especially on long paths.
    const SAMPLES = Math.min(600, Math.max(200, obj.points.length * 40));
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

  const beginDrag = (i: number, e: any) => {
    if (!editable || !onPointsChange) return;
    e.stopPropagation();
    if (controlsRef?.current) controlsRef.current.enabled = false;
    const wrapper = r3fScene.getObjectByName(`obj-${obj.id}`);
    const mat = new THREE.Matrix4();
    if (wrapper) {
      wrapper.updateWorldMatrix(true, false);
      mat.copy(wrapper.matrixWorld);
    }
    const inv = mat.clone().invert();
    const handleWorld = new THREE.Vector3(...obj.points[i]).applyMatrix4(mat);
    const vertical = !!(e.shiftKey || e.nativeEvent?.shiftKey);
    let plane: THREE.Plane;
    if (vertical) {
      // Vertical plane through handle facing camera (drag along world Y).
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const n = new THREE.Vector3(camDir.x, 0, camDir.z);
      if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
      n.normalize();
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, handleWorld);
    } else {
      // Horizontal world plane through the handle (drag on XZ).
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        handleWorld,
      );
    }
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const canvas = gl.domElement;
    let latest: Vec3 | null = null;
    const onMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      const local = hit.clone().applyMatrix4(inv);
      latest = [local.x, local.y, local.z];
      const next = obj.points.map((p, j) => (j === i ? latest! : p));
      onPointsChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (controlsRef?.current) controlsRef.current.enabled = true;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const removePoint = (i: number, e: any) => {
    if (!editable || !onPointsChange) return;
    e.stopPropagation();
    if (obj.points.length <= 2) return;
    onPointsChange(obj.points.filter((_, j) => j !== i));
  };

  return (
    <group
      userData={{ __nocast: true, __spline: true }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect?.(obj.id); }}
    >
      {segments.map((s, i) => (
        <Line
          key={i}
          points={s.pts}
          color={s.color}
          lineWidth={selected ? 4 : 2.5}
          transparent
          opacity={0.95}
          userData={{ __nocast: true }}
        />
      ))}
      {/* Control-point handles */}
      {obj.points.map((p, i) => (
        <mesh
          key={i}
          position={p}
          userData={{ __nocast: true }}
          onPointerDown={(e) => {
            if (editable && selected) beginDrag(i, e);
          }}
          onDoubleClick={(e) => removePoint(i, e)}
        >
          <sphereGeometry args={[selected ? 0.2 : 0.12, 16, 16]} />
          <meshBasicMaterial
            color={selected ? (editable ? "#fbbf24" : "#facc15") : "#94a3b8"}
            depthTest={false}
            transparent
            opacity={0.95}
          />
        </mesh>
      ))}
      {/* Insertion "+" handles at the midpoint of every segment. Click to
          insert a new control point exactly on the curve at that location. */}
      {editable && selected && curve && (() => {
        const total = obj.points.length;
        const segCount = obj.closed ? total : total - 1;
        const handles: JSX.Element[] = [];
        for (let i = 0; i < segCount; i++) {
          const jNext = (i + 1) % total;
          // Place the handle at the curve's midpoint between control i and i+1
          // (parameterised by index, not arc length — close enough visually).
          const tMid = (i + 0.5) / (obj.closed ? total : total - 1);
          const mid = curve.getPointAt(Math.min(0.9999, Math.max(0.0001, tMid)));
          const insert = (e: any) => {
            if (!onPointsChange) return;
            e.stopPropagation();
            const newPt: Vec3 = [mid.x, mid.y, mid.z];
            const next = [
              ...obj.points.slice(0, jNext === 0 ? total : jNext),
              newPt,
              ...obj.points.slice(jNext === 0 ? total : jNext),
            ];
            onPointsChange(next);
          };
          handles.push(
            <mesh
              key={`ins-${i}`}
              position={[mid.x, mid.y, mid.z]}
              userData={{ __nocast: true }}
              onPointerDown={insert}
            >
              <sphereGeometry args={[0.09, 12, 12]} />
              <meshBasicMaterial color="#22c55e" depthTest={false} transparent opacity={0.85} />
            </mesh>,
          );
        }
        return <>{handles}</>;
      })()}
      {/* Direction arrow on first segment */}
      {obj.points.length >= 2 && (() => {
        const a = new THREE.Vector3(...obj.points[0]);
        const b = curve.getPointAt(0.02);
        const dir = b.clone().sub(a).normalize();
        const arrowLen = 0.6;
        return (
          <arrowHelper
            userData={{ __nocast: true }}
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
  const smoothYRef = useRef<Map<string, number>>(new Map()); // smoothed Y per follower
  const animRef = useRef<Map<string, FollowerAnimState>>(new Map()); // followerId -> current anim
  const { scene: r3fScene } = useThree();

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
      smoothYRef.current.clear();
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

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), []);

  /** Down-cast from `worldX, worldZ` starting at `fromY`; returns hit Y + normal or null. */
  const sampleSurface = (
    worldX: number,
    worldZ: number,
    fromY: number,
    excludeName: string,
  ): { y: number; normal: THREE.Vector3 } | null => {
    raycaster.set(new THREE.Vector3(worldX, fromY, worldZ), down);
    raycaster.far = 50;
    const targets: THREE.Object3D[] = [];
    const exclude = r3fScene.getObjectByName(excludeName);
    const excludeSet = new Set<THREE.Object3D>();
    if (exclude) exclude.traverse((o) => excludeSet.add(o));
    r3fScene.traverse((o) => {
      if (!(o as any).isMesh) return;
      if (excludeSet.has(o)) return;
      const ud = (o as any).userData ?? {};
      if (ud.__gizmo || ud.__nocast) return;
      // drei <Line> renders as Line2/LineSegments2, which masquerade as Mesh
      // but throw inside raycast unless camera is set. Skip all line types.
      if (
        (o as any).isLine2 ||
        (o as any).isLineSegments2 ||
        (o as any).isLine ||
        (o as any).isLineSegments
      )
        return;
      const mat: any = (o as any).material;
      if (mat && (mat.isLineMaterial || mat.isLineBasicMaterial || mat.isLineDashedMaterial)) return;
      targets.push(o);
    });
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const normal = hit.face?.normal
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);
    return { y: hit.point.y, normal };
  };

  useFrame((_, dt) => {
    if (!playing) {
      splineDrivenIds.clear();
      return;
    }
    const g = groupRef.current;
    if (!g) return;
    const clampedDt = Math.min(dt, 0.1);

    // Re-publish the set of follower ids every frame so other runtimes
    // (PushableRuntime, etc.) can opt out of physics for spline-driven objects.
    splineDrivenIds.clear();
    for (const t of trajectories) for (const f of t.followers) splineDrivenIds.add(f);

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
        let speed = traj.speed * (sec?.speedMul ?? 1);

        // Smart-path: probe upcoming slope (small lookahead along curve) and
        // scale speed before integrating. Uphill slows down, downhill speeds up.
        if (traj.smartPath) {
          const factor = traj.slopeSpeedFactor ?? 0.6;
          const tHere = Math.min(0.9999, Math.max(0, s / totalLen));
          const tNext = Math.min(0.9999, tHere + 0.01);
          const pHere = curve.getPointAt(tHere).applyMatrix4(mat);
          const pNext = curve.getPointAt(tNext).applyMatrix4(mat);
          const hHere = sampleSurface(pHere.x, pHere.z, pHere.y + 5, `obj-${fid}`);
          const hNext = sampleSurface(pNext.x, pNext.z, pNext.y + 5, `obj-${fid}`);
          if (hHere && hNext) {
            const horiz = Math.hypot(pNext.x - pHere.x, pNext.z - pHere.z) || 1e-3;
            const slope = Math.atan2(hNext.y - hHere.y, horiz); // +up / -down
            const scale = Math.max(0.25, Math.min(2, 1 - slope * factor));
            speed *= scale;
          }
        }

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
        let surfaceNormal: THREE.Vector3 | null = null;

        if (traj.smartPath) {
          // Snap Y to terrain/scenery surface.
          const surf = sampleSurface(worldPos.x, worldPos.z, worldPos.y + 5, `obj-${fid}`);
          if (surf) {
            const stepMax = traj.maxStepHeight ?? 0.4;
            const targetY = surf.y;
            const prevY = smoothYRef.current.get(key) ?? targetY;
            const dy = targetY - prevY;
            let newY: number;
            if (Math.abs(dy) <= stepMax) {
              // Small step — apply instantly (climb stairs / curbs).
              newY = targetY;
            } else {
              // Big jump — ease toward target so it looks like walking down a
              // ramp / step instead of teleporting.
              const ease = Math.min(1, clampedDt * 8);
              newY = prevY + dy * ease;
            }
            smoothYRef.current.set(key, newY);
            worldPos.y = newY;
            surfaceNormal = surf.normal;
          }
        }

        follower.position.copy(worldPos);

        // ---- auto walk/run based on effective speed ----
        // Spline-driven characters default to "walk" and switch to "run"
        // once their effective speed exceeds RUN_THRESHOLD (u/s).
        const charRoot = findCharacterRoot(follower);
        if (charRoot) {
          const ud: any = (charRoot as any).userData;
          const names: string[] = ud.__animationNames ?? [];
          const actions: Record<string, THREE.AnimationAction> = ud.__actions ?? {};
          let wanted: string | null = null;
          if (speed < IDLE_THRESHOLD) {
            wanted = findClip(names, "idle", "stand") ?? names[0] ?? null;
          } else if (speed >= RUN_THRESHOLD) {
            wanted = findClip(names, "run", "sprint", "jog") ?? findClip(names, "walk") ?? names[0] ?? null;
          } else {
            wanted = findClip(names, "walk") ?? findClip(names, "run") ?? names[0] ?? null;
          }
          if (wanted && actions[wanted]) {
            const state = animRef.current.get(fid) ?? { current: null, action: null };
            if (state.current !== wanted) {
              const next = actions[wanted];
              if (state.action && state.action !== next) state.action.fadeOut(0.2);
              next.reset().fadeIn(0.2).play();
              next.setLoop(THREE.LoopRepeat, Infinity);
              state.current = wanted;
              state.action = next;
              animRef.current.set(fid, state);
            }
          }
        }

        if (traj.orientToPath) {
          const worldTan = localTan.clone().transformDirection(mat).normalize();
          const yaw = Math.atan2(worldTan.x, worldTan.z);
          follower.rotation.y = yaw;
          if (traj.smartPath && surfaceNormal) {
            // Pitch the follower along the slope (rotate around local X).
            // Project tangent onto vertical plane defined by yaw.
            const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
            const slopeY = -fwd.dot(
              new THREE.Vector3(surfaceNormal.x, 0, surfaceNormal.z),
            );
            // Pitch ≈ angle between tangent projection and horizontal.
            const pitch = Math.atan2(
              new THREE.Vector3(surfaceNormal.x, 0, surfaceNormal.z).length() *
                Math.sign(slopeY),
              surfaceNormal.y || 1,
            );
            follower.rotation.x = Math.max(-0.7, Math.min(0.7, pitch));
          } else {
            follower.rotation.x = 0;
          }
        }
      }
    }
  });

  return null;
}