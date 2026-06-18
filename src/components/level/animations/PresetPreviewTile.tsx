import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "@/lib/levelTypes";
import type { ObjectAnimationPreset } from "@/lib/objectAnimationPresets";
import { presetDefaults } from "@/lib/objectAnimationPresets";

/**
 * Cheap wireframe-cube preview that plays a preset's keyframes on loop.
 * Used in the object animation gallery — every tile renders this so the user
 * sees what the motion looks like before applying.
 */
export default function PresetPreviewTile({
  preset,
  params,
}: {
  preset: ObjectAnimationPreset;
  /** Optional override for parametric tab. Defaults to the preset's defaults. */
  params?: Record<string, any>;
}) {
  return (
    <div className="relative w-full aspect-square rounded-md overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 border border-border/40">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [3.2, 2.4, 3.2], fov: 30 }}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 2]} intensity={0.6} />
        <gridHelper args={[6, 6, "#334155", "#1e293b"]} position={[0, -0.5, 0]} />
        <Cube preset={preset} params={params} />
      </Canvas>
    </div>
  );
}

function Cube({
  preset,
  params,
}: {
  preset: ObjectAnimationPreset;
  params?: Record<string, any>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const t0 = useRef(performance.now() / 1000);

  const base = useMemo(
    () => ({
      position: [0, 0, 0] as Vec3,
      rotation: [0, 0, 0] as Vec3,
      scale: [0.7, 0.7, 0.7] as Vec3,
    }),
    [],
  );

  const track = useMemo(
    () => preset.build("__preview__", params ?? presetDefaults(preset), base),
    [preset, params, base],
  );

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const now = performance.now() / 1000;
    const elapsed = now - t0.current;
    const dur = track.duration || 1;
    const tt = track.loop ? elapsed % dur : Math.min(elapsed, dur);
    const kfs = track.keyframes;
    if (kfs.length === 0) return;
    // find surrounding keyframes
    let a = kfs[0], b = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (tt >= kfs[i].t && tt <= kfs[i + 1].t) {
        a = kfs[i];
        b = kfs[i + 1];
        break;
      }
    }
    const span = Math.max(b.t - a.t, 1e-6);
    const u = Math.min(1, Math.max(0, (tt - a.t) / span));
    const lerp = (x: Vec3 | undefined, y: Vec3 | undefined, fallback: Vec3): Vec3 =>
      x && y
        ? [x[0] + (y[0] - x[0]) * u, x[1] + (y[1] - x[1]) * u, x[2] + (y[2] - x[2]) * u]
        : fallback;
    const p = lerp(a.position, b.position, base.position);
    const r = lerp(a.rotation, b.rotation, base.rotation);
    const s = lerp(a.scale, b.scale, base.scale);
    m.position.set(p[0], p[1], p[2]);
    m.rotation.set(r[0], r[1], r[2]);
    m.scale.set(s[0], s[1], s[2]);
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#3b82f6" metalness={0.2} roughness={0.4} wireframe={false} />
    </mesh>
  );
}