import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ArenaSpec } from "@/lib/worldModel/types";

/**
 * The real, rendered world the agent observes. The camera is driven entirely by
 * an action vector, so the same rig can be steered by the keyboard (Explore) or
 * by the evolved controller (Agent playback).
 *
 * action = [forward, strafe, turn, look], each in [-1, 1]
 */

interface AgentRigProps {
  actionRef: MutableRefObject<Float32Array>;
  poseRef: MutableRefObject<{ x: number; z: number; yaw: number }>;
}

function AgentRig({ actionRef, poseRef }: AgentRigProps) {
  const { camera } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);

  useFrame((_, dt) => {
    const a = actionRef.current;
    const step = Math.min(dt, 0.05);
    yaw.current -= a[2] * step * 1.8;
    pitch.current = THREE.MathUtils.clamp(pitch.current + a[3] * step * 1.2, -1.1, 1.1);
    const speed = 9;
    const fwd = new THREE.Vector3(Math.sin(yaw.current), 0, Math.cos(yaw.current));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    camera.position.addScaledVector(fwd, -a[0] * speed * step);
    camera.position.addScaledVector(right, a[1] * speed * step);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -40, 40);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -40, 40);
    camera.position.y = 1.7;
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    poseRef.current = { x: camera.position.x, z: camera.position.z, yaw: yaw.current };
  });
  return null;
}

interface CaptureProps {
  frameSize: number;
  everyNth: number;
  onFrame: (rgb: Uint8Array) => void;
  active: boolean;
}

/**
 * Reads the live WebGL canvas back down to frameSize x frameSize RGB. The host
 * canvas is created with preserveDrawingBuffer so the last rendered frame is
 * still readable here.
 */
function Capture({ frameSize, everyNth, onFrame, active }: CaptureProps) {
  const { gl } = useThree();
  const tick = useRef(0);
  const scratch = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = frameSize;
    c.height = frameSize;
    return c;
  }, [frameSize]);

  useFrame(() => {
    if (!active) return;
    tick.current++;
    if (tick.current % everyNth !== 0) return;
    const ctx = scratch.getContext("2d");
    if (!ctx) return;
    const src = gl.domElement;
    if (!src.width || !src.height) return;
    const side = Math.min(src.width, src.height);
    ctx.drawImage(
      src,
      (src.width - side) / 2,
      (src.height - side) / 2,
      side,
      side,
      0,
      0,
      frameSize,
      frameSize,
    );
    const data = ctx.getImageData(0, 0, frameSize, frameSize).data;
    const rgb = new Uint8Array(frameSize * frameSize * 3);
    for (let i = 0; i < frameSize * frameSize; i++) {
      rgb[i * 3] = data[i * 4];
      rgb[i * 3 + 1] = data[i * 4 + 1];
      rgb[i * 3 + 2] = data[i * 4 + 2];
    }
    onFrame(rgb);
  });
  return null;
}

export interface WorldArenaProps {
  arena: ArenaSpec;
  actionRef: MutableRefObject<Float32Array>;
  poseRef: MutableRefObject<{ x: number; z: number; yaw: number }>;
  frameSize: number;
  capturing: boolean;
  captureEveryNth?: number;
  onFrame: (rgb: Uint8Array) => void;
  className?: string;
}

export default function WorldArena({
  arena,
  actionRef,
  poseRef,
  frameSize,
  capturing,
  captureEveryNth = 3,
  onFrame,
  className,
}: WorldArenaProps) {
  return (
    <Canvas
      className={className}
      camera={{ position: [0, 1.7, 12], fov: 70, near: 0.05, far: 400 }}
      dpr={1}
      shadows={false}
      gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color(arena.skyColor);
        scene.fog = new THREE.Fog(arena.fogColor, 18, 120);
      }}
    >
      <hemisphereLight args={[0x9fc4ff, 0x0b1024, 0.9]} />
      <directionalLight position={[24, 34, 12]} intensity={1.4} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={arena.groundColor} roughness={0.95} />
      </mesh>
      <gridHelper args={[200, 100, 0x2d4a7a, 0x1b2a4a]} position={[0, 0.02, 0]} />
      {arena.blocks.map((b, i) => (
        <mesh key={i} position={b.p}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color={b.c} roughness={0.4} metalness={0.15} />
        </mesh>
      ))}
      <AgentRig actionRef={actionRef} poseRef={poseRef} />
      <Capture
        frameSize={frameSize}
        everyNth={captureEveryNth}
        onFrame={onFrame}
        active={capturing}
      />
    </Canvas>
  );
}

/** Maps the keyboard onto the action vector used by V/M/C. */
export function useKeyboardAction(actionRef: MutableRefObject<Float32Array>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      actionRef.current = new Float32Array(actionRef.current.length);
      return;
    }
    const down = new Set<string>();
    const apply = () => {
      const a = actionRef.current;
      a[0] = (down.has("w") || down.has("arrowup") ? 1 : 0) - (down.has("s") || down.has("arrowdown") ? 1 : 0);
      a[1] = (down.has("d") ? 1 : 0) - (down.has("a") ? 1 : 0);
      a[2] = (down.has("arrowright") || down.has("e") ? 1 : 0) - (down.has("arrowleft") || down.has("q") ? 1 : 0);
      a[3] = (down.has("r") ? 1 : 0) - (down.has("f") ? 1 : 0);
    };
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e", "r", "f", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        down.add(k);
        apply();
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      down.delete(e.key.toLowerCase());
      apply();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [actionRef, enabled]);
}
