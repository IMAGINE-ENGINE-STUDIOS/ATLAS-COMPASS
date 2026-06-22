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
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  Cartesian3,
  Matrix4 as CesiumMatrix4,
  Math as CesiumMath,
  Transforms,
  type Viewer,
} from "cesium";
import { EMPTY_SCENE, type LevelScene, type CharacterObject } from "@/lib/levelTypes";
import { LevelSceneContents } from "@/components/level/LevelScene3D";
import type { PlayCameraPose } from "@/components/level/locomotion/PlayableCharacter";
import { atlasWorldScheduler } from "@/lib/atlasWorldScheduler";

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

function CameraSync({ viewer }: { viewer: Viewer }) {
  const { camera, size } = useThree();
  useFrame(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const cam = viewer.camera;
    const persp = camera as THREE.PerspectiveCamera;
    const fr: any = cam.frustum;
    const fovy = fr?.fovy ?? fr?.fov ?? Math.PI / 3;
    persp.fov = THREE.MathUtils.radToDeg(fovy);
    persp.aspect = size.width / Math.max(1, size.height);
    persp.near = Math.max(0.1, fr?.near ?? 1);
    persp.far = fr?.far ?? 1e10;
    persp.updateProjectionMatrix();
    persp.position.set(0, 0, 0);
    persp.up.set(cam.up.x, cam.up.y, cam.up.z);
    persp.lookAt(cam.direction.x, cam.direction.y, cam.direction.z);
    persp.updateMatrixWorld(true);
  });
  return null;
}

// THREE local (+X right,+Y up,+Z toward viewer) → ENU (+X east,+Y north,+Z up)
const THREE_TO_ENU = (() => {
  const m = new THREE.Matrix4();
  m.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  return m;
})();

function FreePlayInstance({
  viewer,
  spawn,
  scene,
}: {
  viewer: Viewer;
  spawn: FreePlaySpawn;
  scene: LevelScene;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [groundLift, setGroundLift] = useState(0);

  useEffect(() => {
    setGroundLift(0);
  }, [spawn.lat, spawn.lng, spawn.alt]);

  // Share the global ground-sampling budget so free-play doesn't compete
  // with placed MAPs for Cesium height samples.
  useEffect(() => {
    return atlasWorldScheduler.registerGroundProbe(viewer, {
      id: "freeplay",
      getLngLat: () => ({ lng: spawn.lng, lat: spawn.lat }),
      onHeight: (h) => {
        const needed = Math.max(0, h - (spawn.alt ?? 0) + 0.05);
        setGroundLift((prev) => (Math.abs(needed - prev) > 0.05 ? needed : prev));
      },
    });
  }, [viewer, spawn.lat, spawn.lng, spawn.alt]);

  const { ecef, enuRot } = useMemo(() => {
    const baseAlt = (spawn.alt ?? 0) + groundLift;
    const origin = Cartesian3.fromDegrees(spawn.lng, spawn.lat, baseAlt);
    const m = Transforms.eastNorthUpToFixedFrame(origin);
    const arr = CesiumMatrix4.toArray(m, []) as number[];
    const rot = new THREE.Matrix4().fromArray(arr);
    rot.setPosition(0, 0, 0);
    return {
      ecef: new THREE.Vector3(origin.x, origin.y, origin.z),
      enuRot: rot,
    };
  }, [spawn.lat, spawn.lng, spawn.alt, groundLift]);

  const worldMatrix = useMemo(() => {
    return new THREE.Matrix4()
      .makeTranslation(ecef.x, ecef.y, ecef.z)
      .multiply(enuRot)
      .multiply(THREE_TO_ENU);
  }, [ecef, enuRot]);

  const scratch = useRef({
    out: new THREE.Matrix4(),
    eye: new THREE.Vector3(),
    target: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    correctedUp: new THREE.Vector3(),
  }).current;

  const handlePlayCameraPose = (pose: PlayCameraPose) => {
    if (!viewer || viewer.isDestroyed()) return;
    const eyeEcef = scratch.eye.fromArray(pose.eye).applyMatrix4(worldMatrix);
    const targetEcef = scratch.target.fromArray(pose.target).applyMatrix4(worldMatrix);
    scratch.dir.subVectors(targetEcef, eyeEcef).normalize();
    scratch.up.set(0, 1, 0).transformDirection(worldMatrix).normalize();
    scratch.right.crossVectors(scratch.dir, scratch.up);
    if (scratch.right.lengthSq() < 1e-8) return;
    scratch.right.normalize();
    scratch.correctedUp.crossVectors(scratch.right, scratch.dir).normalize();
    try {
      viewer.camera.lookAtTransform(CesiumMatrix4.IDENTITY);
      viewer.camera.setView({
        destination: new Cartesian3(eyeEcef.x, eyeEcef.y, eyeEcef.z),
        orientation: {
          direction: new Cartesian3(scratch.dir.x, scratch.dir.y, scratch.dir.z),
          up: new Cartesian3(scratch.correctedUp.x, scratch.correctedUp.y, scratch.correctedUp.z),
        },
      });
    } catch {}
  };

  useFrame(() => {
    if (!groupRef.current || !viewer || viewer.isDestroyed()) return;
    // Ground-clamp handled by atlasWorldScheduler.
    const camPos = viewer.camera.positionWC;
    scratch.out
      .makeTranslation(ecef.x - camPos.x, ecef.y - camPos.y, ecef.z - camPos.z)
      .multiply(enuRot)
      .multiply(THREE_TO_ENU);
    groupRef.current.matrixAutoUpdate = false;
    groupRef.current.matrix.copy(scratch.out);
    groupRef.current.matrixWorldNeedsUpdate = true;
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
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
  spawn: FreePlaySpawn | null;
  onExit: () => void;
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
      const eye = Cartesian3.fromDegrees(spawn.lng, spawn.lat, (spawn.alt ?? 0) + 8);
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
  }, [spawn, viewerRef]);

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
          gl={{ alpha: true, antialias: true, logarithmicDepthBuffer: true }}
          camera={{ position: [0, 0, 0], fov: 60, near: 1, far: 1e10 }}
          style={{ background: "transparent", pointerEvents: "auto" }}
        >
          <CameraSync viewer={viewer} />
          <hemisphereLight args={["#cfe6ff", "#3d5c3d", 0.6]} />
          <directionalLight position={[100, 200, 100]} intensity={1.2} />
          <FreePlayInstance viewer={viewer} spawn={spawn} scene={scene} />
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
    </>
  );
}