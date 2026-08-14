import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ArenaSpec, SceneAgent, SceneProp } from "@/lib/worldModel/types";

/**
 * The real, rendered world the agent observes: streets, towers, props, moving
 * NPCs and beacons. The camera is driven entirely by an action vector, so the
 * same rig is steered by the keyboard, by the autonomous explorer during data
 * collection, or by the evolved controller.
 *
 * action = [forward, strafe, turn, look], each in [-1, 1]
 */

export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

interface AgentRigProps {
  actionRef: MutableRefObject<Float32Array>;
  poseRef: MutableRefObject<Pose>;
  bounds: number;
  colliders: Array<{ x: number; z: number; rx: number; rz: number }>;
}

function AgentRig({ actionRef, poseRef, bounds, colliders }: AgentRigProps) {
  const { camera } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const bob = useRef(0);

  // Spawn on open ground: the scenario may have dropped a tower on the origin.
  useEffect(() => {
    const free = (x: number, z: number) =>
      !colliders.some((c) => Math.abs(x - c.x) < c.rx + 1.2 && Math.abs(z - c.z) < c.rz + 1.2);
    if (free(camera.position.x, camera.position.z)) return;
    for (let r = 2; r < bounds; r += 2) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        if (free(x, z)) {
          camera.position.set(x, 1.7, z);
          yaw.current = Math.atan2(-x, -z);
          return;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colliders, bounds]);

  useFrame((_, dt) => {
    const a = actionRef.current;
    const step = Math.min(dt, 0.05);
    yaw.current -= a[2] * step * 1.9;
    pitch.current = THREE.MathUtils.clamp(pitch.current + a[3] * step * 1.2, -0.9, 0.9);
    const speed = 9.5;
    const fwd = new THREE.Vector3(Math.sin(yaw.current), 0, Math.cos(yaw.current));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    const nx = camera.position.x - fwd.x * a[0] * speed * step + right.x * a[1] * speed * step;
    const nz = camera.position.z - fwd.z * a[0] * speed * step + right.z * a[1] * speed * step;

    // Cheap AABB rejection so the agent walks around buildings instead of
    // through them — collisions are part of the dynamics M has to learn.
    const blocked = (x: number, z: number) =>
      colliders.some((c) => Math.abs(x - c.x) < c.rx + 0.45 && Math.abs(z - c.z) < c.rz + 0.45);

    if (!blocked(nx, camera.position.z)) camera.position.x = nx;
    if (!blocked(camera.position.x, nz)) camera.position.z = nz;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -bounds, bounds);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -bounds, bounds);

    bob.current += Math.abs(a[0]) * step * 9;
    camera.position.y = 1.7 + Math.sin(bob.current) * 0.045;
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    poseRef.current = { x: camera.position.x, z: camera.position.z, yaw: yaw.current };
  });
  return null;
}

/* -------------------------------------------------------------- */

function Buildings({ arena }: { arena: ArenaSpec }) {
  const groups = useMemo(() => {
    const byColor = new Map<string, ArenaSpec["blocks"]>();
    arena.blocks.forEach((b) => {
      const list = byColor.get(b.c) ?? [];
      list.push(b);
      byColor.set(b.c, list);
    });
    return Array.from(byColor.entries());
  }, [arena]);

  return (
    <>
      {groups.map(([color, blocks]) => (
        <InstancedBlocks key={color} color={color} blocks={blocks} />
      ))}
    </>
  );
}

function InstancedBlocks({ color, blocks }: { color: string; blocks: ArenaSpec["blocks"] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    blocks.forEach((b, i) => {
      m.compose(
        new THREE.Vector3(b.p[0], b.p[1], b.p[2]),
        new THREE.Quaternion(),
        new THREE.Vector3(b.s[0], b.s[1], b.s[2]),
      );
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [blocks]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.12} />
    </instancedMesh>
  );
}

function Prop({ prop }: { prop: SceneProp }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current || !prop.rot) return;
    ref.current.rotation.y = state.clock.elapsedTime * prop.rot;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * prop.rot * 0.6) * 0.4;
  });
  const geom = () => {
    switch (prop.k) {
      case "cyl":
        return <cylinderGeometry args={[prop.s[0], prop.s[1], prop.s[2], 12]} />;
      case "cone":
        return <coneGeometry args={[prop.s[0], prop.s[2], 14]} />;
      case "sphere":
        return <sphereGeometry args={[prop.s[0], 20, 14]} />;
      case "torus":
        return <torusGeometry args={[prop.s[0], prop.s[1], 10, 32]} />;
      default:
        return <boxGeometry args={prop.s} />;
    }
  };
  return (
    <mesh ref={ref} position={prop.p}>
      {geom()}
      <meshStandardMaterial
        color={prop.c}
        emissive={prop.c}
        emissiveIntensity={prop.e ?? 0}
        roughness={0.4}
        metalness={0.2}
      />
    </mesh>
  );
}

/** Patrolling NPC — moving geometry gives M genuinely stochastic dynamics. */
function Npc({ spec, offset }: { spec: SceneAgent; offset: number }) {
  const ref = useRef<THREE.Group>(null);
  const total = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < spec.path.length; i++) {
      const a = spec.path[i];
      const b = spec.path[(i + 1) % spec.path.length];
      sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return sum || 1;
  }, [spec.path]);

  useFrame((state) => {
    if (!ref.current) return;
    let d = ((state.clock.elapsedTime * spec.speed + offset * total) % total + total) % total;
    for (let i = 0; i < spec.path.length; i++) {
      const a = spec.path[i];
      const b = spec.path[(i + 1) % spec.path.length];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.001;
      if (d <= seg) {
        const t = d / seg;
        ref.current.position.set(a[0] + (b[0] - a[0]) * t, spec.h, a[1] + (b[1] - a[1]) * t);
        ref.current.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
        return;
      }
      d -= seg;
    }
  });

  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[spec.size, spec.size * 0.6, spec.size * 1.6]} />
        <meshStandardMaterial color={spec.c} emissive={spec.c} emissiveIntensity={0.7} roughness={0.3} />
      </mesh>
      <pointLight color={spec.c} intensity={2.2} distance={12} />
    </group>
  );
}

function Beacon({ p, c }: { p: [number, number, number]; c: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y = p[1] + Math.sin(state.clock.elapsedTime * 2 + p[0]) * 0.35;
    ref.current.rotation.y = state.clock.elapsedTime * 1.4;
  });
  return (
    <mesh ref={ref} position={p}>
      <octahedronGeometry args={[0.7, 0]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.6} />
    </mesh>
  );
}

/** The seed picture draped on the ground so the agent can navigate by it. */
function SeedGround({ url, size }: { url: string; size: number }) {
  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [url]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/* -------------------------------------------------------------- */

interface CaptureProps {
  frameSize: number;
  everyNth: number;
  onFrame: (rgb: Uint8Array) => void;
  active: boolean;
}

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
    ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, frameSize, frameSize);
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
  poseRef: MutableRefObject<Pose>;
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
  const bounds = arena.bounds ?? 44;
  const colliders = useMemo(
    () => arena.blocks.map((b) => ({ x: b.p[0], z: b.p[2], rx: b.s[0] / 2, rz: b.s[2] / 2 })),
    [arena],
  );

  return (
    <Canvas
      className={className}
      camera={{ position: [0, 1.7, 10], fov: 72, near: 0.05, far: 400 }}
      dpr={1}
      shadows={false}
      gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color(arena.skyColor);
        scene.fog = new THREE.Fog(arena.fogColor, 22, 150);
      }}
    >
      <hemisphereLight args={[0x9fc4ff, 0x0b1024, 0.85]} />
      <directionalLight position={[28, 40, 16]} intensity={1.25} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color={arena.groundColor} roughness={0.95} />
      </mesh>
      {arena.seedImage ? (
        <SeedGround url={arena.seedImage} size={100} />
      ) : (
        <gridHelper args={[240, 120, 0x2d4a7a, 0x18243c]} position={[0, 0.02, 0]} />
      )}
      <Buildings arena={arena} />
      {(arena.props ?? []).map((p, i) => (
        <Prop key={i} prop={p} />
      ))}
      {(arena.agents ?? []).map((a, i) => (
        <Npc key={i} spec={a} offset={i / Math.max(1, (arena.agents ?? []).length)} />
      ))}
      {(arena.beacons ?? []).map((b, i) => (
        <Beacon key={i} p={b.p} c={b.c} />
      ))}
      <AgentRig actionRef={actionRef} poseRef={poseRef} bounds={bounds} colliders={colliders} />
      <Capture frameSize={frameSize} everyNth={captureEveryNth} onFrame={onFrame} active={capturing} />
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
