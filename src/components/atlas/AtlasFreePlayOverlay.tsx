/**
 * AtlasFreePlayOverlay
 * --------------------
 * Drops a single playable character anywhere on the Atlas globe and lets
 * the user walk/run around it. Architecturally identical to
 * AtlasLevelsR3FOverlay's PlacedLevel (full ECEF anchoring, ENU frame,
 * camera-relative origin for float precision) — but the scene is just one
 * playable character with `walkOnEarth: true`, no persisted level needed.
 *
 * Mount with `spawn={null}` to keep the overlay dormant. Pass a spawn to
 * activate Play mode; the parent should also flip Cesium's input handlers
 * for free-play, the same way it does for levels.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  Cartesian3,
  Ellipsoid,
  Matrix4 as CesiumMatrix4,
  Math as CesiumMath,
  Transforms,
  type Viewer,
} from "cesium";
import { EMPTY_SCENE, type LevelScene, type CharacterObject } from "@/lib/levelTypes";
import { LevelSceneContents } from "@/components/level/LevelScene3D";
import type { PlayCameraPose } from "@/components/level/locomotion/PlayableCharacter";
import { atlasWorldScheduler } from "@/lib/atlasWorldScheduler";
import { clampEyeAboveTerrain } from "@/lib/atlasCameraClamp";
import { CameraSync, THREE_TO_ENU } from "@/lib/atlasR3F";

export interface FreePlaySpawn {
  lat: number;
  lng: number;
  alt: number;
  characterUrl: string;
  characterName: string;
}

const SOLDIER_URL = "https://threejs.org/examples/models/gltf/Soldier.glb";
export const DEFAULT_FREEPLAY_CHARACTER: Pick<FreePlaySpawn, "characterUrl" | "characterName"> = {
  characterUrl: SOLDIER_URL,
  characterName: "Soldier",
};

// CameraSync + THREE_TO_ENU now imported from @/lib/atlasR3F (shared).
function FreePlayInstance({
  viewer,
  spawn,
  scene,
  ellipsoid,
}: {
  viewer: Viewer;
  spawn: FreePlaySpawn;
  scene: LevelScene;
  ellipsoid: Ellipsoid;
}) {
  const groupRef = useRef<THREE.Group>(null);
  // Ground lift is held in a ref (not state) so height refinements from
  // the scheduler never trigger React re-renders / worldMatrix churn —
  // that was the source of the "idle shake" and mouse-look bounce. The
  // useFrame loop below lerps the actual applied lift toward the target
  // so any transition is smooth and imperceptible.
  const groundLiftTargetRef = useRef(0);
  const groundLiftAppliedRef = useRef(0);

  useEffect(() => {
    groundLiftTargetRef.current = 0;
    groundLiftAppliedRef.current = 0;
  }, [spawn.lat, spawn.lng, spawn.alt]);

  // Share the global ground-sampling budget so free-play doesn't compete
  // with placed MAPs for Cesium height samples.
  useEffect(() => {
    return atlasWorldScheduler.registerGroundProbe(viewer, {
      id: "freeplay",
      getLngLat: () => ({ lng: spawn.lng, lat: spawn.lat }),
      onHeight: (h) => {
        const needed = Math.max(0, h - (spawn.alt ?? 0) + 0.05);
        // Wide deadband + ref-only update: prevents micro-oscillations
        // (±10 cm sample noise as tiles refine) from moving the world.
        if (Math.abs(needed - groundLiftTargetRef.current) > 0.6) {
          groundLiftTargetRef.current = needed;
        }
      },
    });
  }, [viewer, spawn.lat, spawn.lng, spawn.alt]);

  // Origin frame is computed ONCE per spawn — never recomputed for
  // ground-height refinements. The per-frame lift is folded into the
  // ENU translation below.
  const { ecefBase, enuRot, up } = useMemo(() => {
    const baseAlt = spawn.alt ?? 0;
    const origin = Cartesian3.fromDegrees(spawn.lng, spawn.lat, baseAlt, ellipsoid);
    const m = Transforms.eastNorthUpToFixedFrame(origin, ellipsoid);
    const arr = CesiumMatrix4.toArray(m, []) as number[];
    const rot = new THREE.Matrix4().fromArray(arr);
    // Extract the ENU "up" axis (column 2 in the 4x4) so we can offset
    // the origin along the local vertical by the ground-lift amount.
    const upVec = new THREE.Vector3(arr[8], arr[9], arr[10]).normalize();
    rot.setPosition(0, 0, 0);
    return {
      ecefBase: new THREE.Vector3(origin.x, origin.y, origin.z),
      enuRot: rot,
      up: upVec,
    };
  }, [spawn.lat, spawn.lng, spawn.alt, ellipsoid]);

  const scratch = useRef({
    out: new THREE.Matrix4(),
    worldMatrix: new THREE.Matrix4(),
    ecef: new THREE.Vector3(),
    eye: new THREE.Vector3(),
    target: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    correctedUp: new THREE.Vector3(),
    smoothEye: new THREE.Vector3(),
  }).current;
  const clampState = useRef({ lastSampleAt: 0, hasSmoothEye: false });

  // Recompute the (live) world matrix each frame from ecefBase + smoothed lift.
  const computeWorldMatrix = () => {
    const lift = groundLiftAppliedRef.current;
    scratch.ecef.set(
      ecefBase.x + up.x * lift,
      ecefBase.y + up.y * lift,
      ecefBase.z + up.z * lift,
    );
    scratch.worldMatrix
      .makeTranslation(scratch.ecef.x, scratch.ecef.y, scratch.ecef.z)
      .multiply(enuRot)
      .multiply(THREE_TO_ENU);
    return scratch.worldMatrix;
  };

  const handlePlayCameraPose = (pose: PlayCameraPose) => {
    if (!viewer || viewer.isDestroyed()) return;
    const worldMatrix = computeWorldMatrix();
    const eyeEcef = scratch.eye.fromArray(pose.eye).applyMatrix4(worldMatrix);
    const targetEcef = scratch.target.fromArray(pose.target).applyMatrix4(worldMatrix);
    scratch.dir.subVectors(targetEcef, eyeEcef).normalize();
    scratch.up.set(0, 1, 0).transformDirection(worldMatrix).normalize();
    scratch.right.crossVectors(scratch.dir, scratch.up);
    if (scratch.right.lengthSq() < 1e-8) return;
    scratch.right.normalize();
    scratch.correctedUp.crossVectors(scratch.right, scratch.dir).normalize();
    // Sample-clamp the eye above the terrain at ~4Hz. Between samples,
    // and even at the sample instant, lerp the applied eye toward the
    // clamped target so height jitter from tile refinement can't pop
    // the camera. The horizontal (x,y in ECEF ~) is dominated by the
    // pose so lerping the whole vector is fine and much smoother than
    // snapping directly.
    let targetEye = eyeEcef;
    const now = performance.now();
    if (now - clampState.current.lastSampleAt > 240) {
      const clamped = clampEyeAboveTerrain(viewer, eyeEcef, 0.6);
      targetEye = scratch.eye.set(clamped.x, clamped.y, clamped.z);
      clampState.current.lastSampleAt = now;
    }
    if (!clampState.current.hasSmoothEye) {
      scratch.smoothEye.copy(targetEye);
      clampState.current.hasSmoothEye = true;
    } else {
      scratch.smoothEye.lerp(targetEye, 0.35);
    }
    const outEye = new Cartesian3(scratch.smoothEye.x, scratch.smoothEye.y, scratch.smoothEye.z);
    try {
      viewer.camera.lookAtTransform(CesiumMatrix4.IDENTITY);
      viewer.camera.setView({
        destination: outEye,
        orientation: {
          direction: new Cartesian3(scratch.dir.x, scratch.dir.y, scratch.dir.z),
          up: new Cartesian3(scratch.correctedUp.x, scratch.correctedUp.y, scratch.correctedUp.z),
        },
      });
    } catch {}
  };

  useFrame((_state, delta) => {
    if (!groupRef.current || !viewer || viewer.isDestroyed()) return;
    // Smoothly ease the applied ground lift toward its target — critical
    // in idle, where the scheduler may only nudge by a fraction of a
    // meter. Half-life ~200ms.
    const k = 1 - Math.exp(-(delta || 1 / 60) / 0.2);
    groundLiftAppliedRef.current +=
      (groundLiftTargetRef.current - groundLiftAppliedRef.current) * k;
    const worldMatrix = computeWorldMatrix();
    const camPos = viewer.camera.positionWC;
    scratch.out
      .makeTranslation(
        scratch.ecef.x - camPos.x,
        scratch.ecef.y - camPos.y,
        scratch.ecef.z - camPos.z,
      )
      .multiply(enuRot)
      .multiply(THREE_TO_ENU);
    groupRef.current.matrixAutoUpdate = false;
    groupRef.current.matrix.copy(scratch.out);
    groupRef.current.matrixWorldNeedsUpdate = true;
    void worldMatrix; // ensure ecef is refreshed each frame
  });

  return (
    <group ref={groupRef}>
      <LevelSceneContents
        scene={scene}
        playing
        skipBackground
        skipAmbient
        skipDirectional
        onPlayCameraPose={handlePlayCameraPose}
        immediatePlayCamera
      />
    </group>
  );
}

export default function AtlasFreePlayOverlay({
  viewerRef,
  spawn,
  onExit,
  ellipsoid = Ellipsoid.WGS84,
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
  spawn: FreePlaySpawn | null;
  onExit: () => void;
  ellipsoid?: Ellipsoid;
}) {
  // Synthesize a one-character scene with the soldier (or whatever was
  // chosen) as the playable, walking directly on the Earth.
  const scene: LevelScene | null = useMemo(() => {
    if (!spawn) return null;
    const charId = "freeplay-char";
    const character: CharacterObject = {
      id: charId,
      name: spawn.characterName,
      kind: "character",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      url: spawn.characterUrl,
      animationSpeed: 1,
      paused: false,
      crossfade: 0.25,
      playable: true,
      controlScheme: "both",
      cameraMode: "third",
      walkOnEarth: true,
      locomotion: {
        walkSpeed: 2.4,
        runSpeed: 6.0,
        jumpHeight: 1.3,
        gravity: 18,
        height: 1.7,
        radius: 0.32,
      },
    };
    return {
      ...EMPTY_SCENE,
      objects: [character],
      mainCharacterId: charId,
    };
  }, [spawn]);

  // While playing, hand input/camera to the character — disable Cesium's
  // mouse camera controls, and silence the Atlas keyboard-nav hook.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !spawn) return;
    const c = viewer.scene.screenSpaceCameraController;
    const prev = {
      rotate: c.enableRotate,
      translate: c.enableTranslate,
      zoom: c.enableZoom,
      tilt: c.enableTilt,
      look: c.enableLook,
    };
    c.enableRotate = false;
    c.enableTranslate = false;
    c.enableZoom = false;
    c.enableTilt = false;
    c.enableLook = false;
    if (typeof window !== "undefined") window.__atlasLevelPlaying = true;

    // Park the Cesium camera into a third-person pose; the playable's
    // PlayCameraPose callback takes over on the first frame.
    try {
      const eye = Cartesian3.fromDegrees(spawn.lng, spawn.lat, (spawn.alt ?? 0) + 8, ellipsoid);
      viewer.camera.lookAtTransform(CesiumMatrix4.IDENTITY);
      viewer.camera.setView({
        destination: eye,
        orientation: {
          heading: CesiumMath.toRadians(0),
          pitch: CesiumMath.toRadians(-15),
          roll: 0,
        },
      });
    } catch {}

    return () => {
      c.enableRotate = prev.rotate;
      c.enableTranslate = prev.translate;
      c.enableZoom = prev.zoom;
      c.enableTilt = prev.tilt;
      c.enableLook = prev.look;
      if (typeof window !== "undefined") window.__atlasLevelPlaying = false;
    };
  }, [spawn, viewerRef, ellipsoid]);

  // Esc to exit free-play.
  useEffect(() => {
    if (!spawn) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spawn, onExit]);

  if (!spawn || !scene || !viewerRef.current) return null;
  const viewer = viewerRef.current;

  return (
    <>
      <div className="fixed inset-0 z-[42]" style={{ pointerEvents: "auto" }}>
        <Canvas
          gl={{ alpha: true, antialias: false, logarithmicDepthBuffer: true }}
          camera={{ position: [0, 0, 0], fov: 60, near: 1, far: 1e10 }}
          style={{ background: "transparent", pointerEvents: "auto" }}
        >
          <CameraSync viewer={viewer} />
          <hemisphereLight args={["#cfe6ff", "#3d5c3d", 0.6]} />
          <directionalLight position={[100, 200, 100]} intensity={1.2} />
          <FreePlayInstance viewer={viewer} spawn={spawn} scene={scene} ellipsoid={ellipsoid} />
        </Canvas>
      </div>
      <button
        onClick={onExit}
        className="fixed top-4 right-4 z-[55] px-3 py-1.5 rounded-md bg-black/70 hover:bg-black/90 text-white text-xs font-semibold border border-white/20 pointer-events-auto"
      >
        Exit Play (Esc)
      </button>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[55] px-3 py-1.5 rounded-full bg-black/70 text-white/85 text-[11px] font-mono border border-white/15 pointer-events-none">
        WASD move · Shift run · Space jump · Mouse look · Esc exit
      </div>
      <MobileTouchControls visible />
    </>
  );
}