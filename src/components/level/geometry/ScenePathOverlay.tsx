import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { LevelScene, SceneObject } from "@/lib/levelTypes";

/**
 * Visual overlay for scene splines + per-object action button pins.
 * Draws each path as a polyline. For objects with a "movement" spline binding
 * a small glowing marker travels along the bound path so authors get instant
 * visual confirmation. Action button pins float above their owning object.
 */
export function ScenePathOverlay({
  scene,
  selectedId,
}: {
  scene: LevelScene;
  selectedId: string | null;
}) {
  const paths = scene.scenePaths ?? [];
  if (paths.length === 0 && !scene.objects.some(hasButtons)) return null;

  return (
    <group>
      {paths.map((p) => {
        if (p.waypoints.length < 2) return null;
        const pts = p.waypoints.map((w) => new THREE.Vector3(w[0], w[1], w[2]));
        if (p.closed) pts.push(pts[0].clone());
        return (
          <group key={p.id}>
            <Line points={pts} color={p.color} lineWidth={2} transparent opacity={0.85} />
            {p.triggerRadius && p.triggerRadius > 0 && (
              <mesh position={[p.waypoints[0][0], p.waypoints[0][1], p.waypoints[0][2]]}>
                <sphereGeometry args={[p.triggerRadius, 24, 12]} />
                <meshBasicMaterial color={p.color} wireframe transparent opacity={0.18} />
              </mesh>
            )}
          </group>
        );
      })}

      {scene.objects.map((o) => (
        <MovementMarker key={`mark-${o.id}`} obj={o} scene={scene} />
      ))}

      {scene.objects.map((o) => (
        <ActionButtonPins key={`btn-${o.id}`} obj={o} selected={selectedId === o.id} />
      ))}
    </group>
  );
}

function hasButtons(o: SceneObject) {
  return (o.actionButtons?.length ?? 0) > 0;
}

function MovementMarker({ obj, scene }: { obj: SceneObject; scene: LevelScene }) {
  const ref = useRef<THREE.Mesh>(null);
  const binding = obj.splineBindings?.find((b) => b.mode === "movement");
  const path = useMemo(
    () => scene.scenePaths?.find((p) => p.id === binding?.pathId),
    [scene.scenePaths, binding?.pathId],
  );

  // Pre-compute cumulative segment lengths for constant-speed travel.
  const segs = useMemo(() => {
    if (!path || path.waypoints.length < 2) return null;
    const pts = path.waypoints.map((w) => new THREE.Vector3(w[0], w[1], w[2]));
    if (path.closed) pts.push(pts[0].clone());
    const lens: number[] = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, lens, total: lens[lens.length - 1] };
  }, [path]);

  useFrame((state) => {
    if (!ref.current || !segs || segs.total <= 0 || !binding) return;
    const speed = Math.max(0.0001, binding.speed ?? 1);
    let d = (state.clock.elapsedTime * speed) % segs.total;
    if (!binding.loop) {
      const oneWay = segs.total;
      d = (state.clock.elapsedTime * speed) % (oneWay * 2);
      if (d > oneWay) d = oneWay * 2 - d;
    }
    let i = 1;
    while (i < segs.lens.length && segs.lens[i] < d) i++;
    const a = segs.pts[i - 1];
    const b = segs.pts[i] ?? segs.pts[i - 1];
    const segLen = (segs.lens[i] ?? segs.lens[i - 1]) - segs.lens[i - 1];
    const t = segLen > 0 ? (d - segs.lens[i - 1]) / segLen : 0;
    ref.current.position.set(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t,
    );
  });

  if (!binding || !path || !segs) return null;
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.12, 16, 12]} />
      <meshBasicMaterial color={path.color} />
    </mesh>
  );
}

function ActionButtonPins({ obj, selected }: { obj: SceneObject; selected: boolean }) {
  const buttons = obj.actionButtons ?? [];
  if (buttons.length === 0) return null;
  return (
    <group position={obj.position as any}>
      {buttons.map((b, i) => {
        if (!b.pinVisible) return null;
        const y = (b.pinOffset ?? 1.2) + i * 0.32;
        return (
          <Html
            key={b.id}
            position={[0, y, 0]}
            center
            distanceFactor={8}
            style={{ pointerEvents: "none" }}
          >
            <div
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap shadow-lg backdrop-blur ${
                selected ? "bg-primary text-primary-foreground" : "bg-background/85 border border-border/60 text-foreground"
              }`}
            >
              {b.label}
              {b.pinText && <span className="opacity-70 ml-1.5">· {b.pinText}</span>}
            </div>
          </Html>
        );
      })}
    </group>
  );
}