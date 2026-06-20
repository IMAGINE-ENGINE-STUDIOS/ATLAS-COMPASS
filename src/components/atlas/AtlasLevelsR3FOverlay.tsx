/**
 * AtlasLevelsR3FOverlay
 * ---------------------
 * Renders every placed Level's real R3F scene (geometries, models,
 * characters, terrain, lights…) directly on the globe, in place. The
 * approach: a single full-viewport transparent THREE canvas overlays the
 * Cesium canvas; each frame we copy Cesium's camera projection + orientation
 * onto the THREE camera and express every placement's position relative to
 * Cesium's camera (in ECEF) so float-precision stays usable.
 *
 * Each placement is rendered as a <group> whose local frame is rotated so
 * +Y points along the geodetic normal (the planet's local "up") at the
 * placement's lat/lng — exactly the way the level was authored in the
 * editor. Heading + scale from the placement are applied on top.
 *
 * The canvas is pointer-events: none so Cesium still receives all input
 * (click/zoom/orbit). Clicking a level continues to go through the
 * Cesium pin/beacon in useAtlasLevelLayer.
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
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_SCENE, type LevelScene } from "@/lib/levelTypes";
import { LevelSceneContents } from "@/components/level/LevelScene3D";
import type { PlayCameraPose } from "@/components/level/locomotion/PlayableCharacter";
import { DEFAULT_LEVEL_SIZE_M } from "@/lib/atlasLevelGeo";
import {
  hiddenLevelIds,
  LEVEL_PLAY_EVENT,
  type LevelPlacement,
} from "@/lib/useAtlasLevelLayer";

function CameraSync({ viewer, enabled }: { viewer: Viewer; enabled: boolean }) {
  const { camera, size } = useThree();
  useFrame(() => {
    if (!enabled) return;
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

    // We render every placement in a frame whose origin is the Cesium
    // camera position (in ECEF). So the THREE camera sits at (0,0,0) and
    // simply needs to share Cesium's orientation.
    persp.position.set(0, 0, 0);
    persp.up.set(cam.up.x, cam.up.y, cam.up.z);
    persp.lookAt(cam.direction.x, cam.direction.y, cam.direction.z);
    persp.updateMatrixWorld(true);
  });
  return null;
}

// (Removed LocalPlayFallbackCamera — the level is always rendered as an
//  in-world instance anchored to its ECEF position; Atlas's own first-person
//  camera drives the view both before and during Play. No separate THREE
//  camera frame is needed, which is what caused the "level spinning while
//  earth stays static" effect.)

// THREE local (+X right, +Y up, +Z toward viewer) → ENU (+X east, +Y north,
// +Z up). Mapping: X→X, Y→Z, Z→Y. Both bases right-handed.
const THREE_TO_ENU = (() => {
  const m = new THREE.Matrix4();
  // column-major set: column 1 = THREE.X → ENU(1,0,0)
  //                   column 2 = THREE.Y → ENU(0,0,1)
  //                   column 3 = THREE.Z → ENU(0,1,0)
  m.set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  );
  return m;
})();

function PlacedLevel({
  viewer,
  placement,
  playing,
}: {
  viewer: Viewer;
  placement: LevelPlacement;
  playing: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<LevelScene | null>(null);

  useEffect(() => {
    let canceled = false;
    supabase
      .from("levels")
      .select("scene")
      .eq("id", placement.level_id)
      .maybeSingle()
      .then(({ data }) => {
        if (canceled) return;
        setScene((data?.scene as unknown as LevelScene) ?? { ...EMPTY_SCENE });
      });
    return () => {
      canceled = true;
    };
  }, [placement.level_id]);

  // Precompute the placement's ECEF origin and ENU→ECEF rotation. Only
  // changes when the placement's lat/lng/altitude does.
  const { ecef, enuRot } = useMemo(() => {
    const origin = Cartesian3.fromDegrees(
      placement.lng,
      placement.lat,
      placement.altitude ?? 0,
    );
    const m = Transforms.eastNorthUpToFixedFrame(origin);
    const arr = CesiumMatrix4.toArray(m, []) as number[]; // column-major
    const rot = new THREE.Matrix4().fromArray(arr);
    rot.setPosition(0, 0, 0); // keep rotation only
    return {
      ecef: new THREE.Vector3(origin.x, origin.y, origin.z),
      enuRot: rot,
    };
  }, [placement.lat, placement.lng, placement.altitude]);

  const headingRad = -((placement.heading ?? 0) * Math.PI) / 180;
  const placementScale = placement.scale > 0 ? placement.scale : 1;

  const worldMatrix = useMemo(() => {
    return new THREE.Matrix4()
      .makeTranslation(ecef.x, ecef.y, ecef.z)
      .multiply(enuRot)
      .multiply(THREE_TO_ENU)
      .multiply(new THREE.Matrix4().makeRotationY(headingRad))
      .multiply(new THREE.Matrix4().makeScale(placementScale, placementScale, placementScale));
  }, [ecef, enuRot, headingRad, placementScale]);

  // Reusable scratch matrices
  const scratch = useRef({
    headingM: new THREE.Matrix4(),
    scaleM: new THREE.Matrix4(),
    out: new THREE.Matrix4(),
    eye: new THREE.Vector3(),
    target: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    correctedUp: new THREE.Vector3(),
  }).current;

  const handlePlayCameraPose = (pose: PlayCameraPose) => {
    if (!playing || !viewer || viewer.isDestroyed()) return;
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
    const camPos = viewer.camera.positionWC;
    scratch.out
      .makeTranslation(ecef.x - camPos.x, ecef.y - camPos.y, ecef.z - camPos.z)
      .multiply(enuRot)
      .multiply(THREE_TO_ENU)
      .multiply(scratch.headingM.makeRotationY(headingRad))
      .multiply(scratch.scaleM.makeScale(placementScale, placementScale, placementScale));
    groupRef.current.matrixAutoUpdate = false;
    groupRef.current.matrix.copy(scratch.out);
    groupRef.current.matrixWorldNeedsUpdate = true;
  });

  if (!scene) return null;
  return (
    <group ref={groupRef}>
      {/* Surrounding terrain frame — flat plane the user grew outward
          from the level's edge via the Inspector. Same plane geometry
          the level editor produces; color is read from the placement's
          `surrounding_terrain` config (full editing tools live in the
          Level page). At 0 ft this is skipped entirely. */}
      {(() => {
        const ft = placement.terrain_expand_feet ?? 0;
        if (!ft || ft <= 0) return null;
        const expandM = ft * 0.3048;
        const outer = DEFAULT_LEVEL_SIZE_M + expandM * 2;
        const color = (placement.surrounding_terrain as any)?.color ?? "#2f5d3a";
        // Plane lies in level-local ENU (XZ), slightly below 0 so the
        // level's own ground doesn't z-fight.
        return (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <planeGeometry args={[outer, outer, 1, 1]} />
            <meshStandardMaterial color={color} roughness={1} metalness={0} />
          </mesh>
        );
      })()}
      {/* When `playing` is true, the level's full Play runtimes
          (locomotion, input, physics, mouselook) activate so the user
          can actually walk around inside the level. Only one placement
          is `playing` at a time — the parent component handles that and
          also disables Cesium camera input so mouselook/WASD don't fight
          the globe. */}
      <LevelSceneContents
        scene={scene}
        playing={playing}
        skipBackground
        skipAmbient
        skipDirectional
        onPlayCameraPose={handlePlayCameraPose}
      />
    </group>
  );
}

export default function AtlasLevelsR3FOverlay({
  viewerRef,
  isLoaded,
  placements,
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
  isLoaded: boolean;
  placements: LevelPlacement[];
}) {
  // Defer mounting the heavy R3F overlay so the globe + green placeholder
  // boxes paint first. Keeps initial Atlas load snappy.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isLoaded) return;
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, [isLoaded]);

  // Proximity-based LOD: only mount the real R3F scene for placements
  // the camera is actually near. Far away, the cheap green Cesium box
  // from useAtlasLevelLayer is enough. Recomputed at ~4Hz.
  const [nearIds, setNearIds] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [pendingPlayId, setPendingPlayId] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const PROX_M = 5000; // within 5km → load real level
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 150) return;
      last = t;
      if (viewer.isDestroyed()) return;
      const cam = viewer.camera.positionWC;
      const next = new Set<string>();
      for (const p of placements) {
        const o = Cartesian3.fromDegrees(p.lng, p.lat, p.altitude ?? 0);
        const dx = o.x - cam.x, dy = o.y - cam.y, dz = o.z - cam.z;
        if (dx * dx + dy * dy + dz * dz < PROX_M * PROX_M) next.add(p.id);
      }
      setNearIds((prev) => {
        if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
        return next;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, placements, viewerRef]);

  // Sync the shared hiddenLevelIds set so Cesium's green box fades out
  // exactly when the R3F scene fades in (CallbackProperty re-reads each
  // frame).
  useEffect(() => {
    hiddenLevelIds.clear();
    nearIds.forEach((id) => hiddenLevelIds.add(id));
    if (playingId) hiddenLevelIds.add(playingId);
    if (pendingPlayId) hiddenLevelIds.add(pendingPlayId);
    viewerRef.current?.scene.requestRender?.();
  }, [nearIds, playingId, pendingPlayId, viewerRef]);

  // Click a Cesium pin → request play. Auto-starts once camera arrives.
  useEffect(() => {
    const onReq = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id) setPendingPlayId(id);
    };
    window.addEventListener(LEVEL_PLAY_EVENT, onReq as any);
    return () => window.removeEventListener(LEVEL_PLAY_EVENT, onReq as any);
  }, []);

  useEffect(() => {
    if (!pendingPlayId || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const p = placements.find((placement) => placement.id === pendingPlayId);
    if (!p || viewer.isDestroyed()) return;
    // No fly-in: snap the camera into the level at the playable
    // character's eye height so the user immediately controls the
    // character. The level stays fixed where it sits in the Atlas
    // world and the Earth itself stays fixed — the user can walk
    // out of the level and (eventually) all over the planet.
    viewer.trackedEntity = undefined;
    viewer.selectedEntity = undefined;
    try {
      // Park the Cesium camera in a third-person-ish pose looking horizontally
      // across the level so the surrounding city stays visible as a backdrop
      // while the R3F PlayableCharacter owns the play view. Slightly behind
      // and above the level origin, looking forward.
      const eye = Cartesian3.fromDegrees(p.lng, p.lat, (p.altitude ?? 0) + 8);
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
    setNearIds((prev) => new Set(prev).add(p.id));
    setPlayingId(p.id);
    setPendingPlayId(null);
  }, [pendingPlayId, placements, viewerRef]);

  useEffect(() => {
    if (pendingPlayId && nearIds.has(pendingPlayId)) {
      setPlayingId(pendingPlayId);
      setPendingPlayId(null);
    }
  }, [pendingPlayId, nearIds]);

  // During Play, the level's playable/main character owns input and sends its
  // camera pose into Cesium every frame, so buildings and the Atlas world stay
  // visible while the user gets the same editor Play experience in-place.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const c = viewer.scene.screenSpaceCameraController;
    const prev = {
      rotate: c.enableRotate,
      translate: c.enableTranslate,
      zoom: c.enableZoom,
      tilt: c.enableTilt,
      look: c.enableLook,
    };
    if (playingId) {
      c.enableRotate = false;
      c.enableTranslate = false;
      c.enableZoom = false;
      c.enableTilt = false;
      c.enableLook = false;
    }
    // Tell the Atlas keyboard-nav hook to stand down while the character
    // owns WASD/Arrows. Restored on cleanup below.
    if (typeof window !== "undefined") {
      window.__atlasLevelPlaying = !!playingId;
    }
    return () => {
      c.enableRotate = prev.rotate;
      c.enableTranslate = prev.translate;
      c.enableZoom = prev.zoom;
      c.enableTilt = prev.tilt;
      c.enableLook = prev.look;
      if (typeof window !== "undefined") {
        window.__atlasLevelPlaying = false;
      }
    };
  }, [playingId, viewerRef]);

  // Esc to exit play
  useEffect(() => {
    if (!playingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayingId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playingId]);

  if (!isLoaded || !viewerRef.current || placements.length === 0 || !ready) return null;
  const viewer = viewerRef.current;
  const visible = playingId
    ? placements.filter((p) => p.id === playingId)
    : placements.filter((p) => nearIds.has(p.id) || p.id === pendingPlayId);
  if (visible.length === 0) return null;
  const playablePlacement = visible[0]; // nearest = first added; good enough
  return (
    <>
      <div
        className="fixed inset-0 z-[40]"
        style={{ pointerEvents: playingId ? "auto" : "none" }}
      >
        <Canvas
          gl={{ alpha: true, antialias: true, logarithmicDepthBuffer: true }}
          camera={{ position: [0, 0, 0], fov: 60, near: 1, far: 1e10 }}
          style={{
            background: "transparent",
            pointerEvents: playingId ? "auto" : "none",
          }}
        >
          {/* Atlas camera sync — level instances stay anchored to their
              ECEF position when NOT playing. During Play we hand the R3F
              camera over to PlayableCharacter so the editor's play camera
              behaves identically inside Atlas. */}
          <CameraSync viewer={viewer} enabled />
          <hemisphereLight args={["#cfe6ff", "#3d5c3d", 0.6]} />
          <directionalLight position={[100, 200, 100]} intensity={1.2} />
          {visible.map((p) => (
            <PlacedLevel
              key={p.id}
              viewer={viewer}
              placement={p}
              playing={playingId === p.id}
            />
          ))}
        </Canvas>
      </div>
      {/* In-world Play / Stop HUD button — only shows when a level is in
          proximity. Lets the user actually enter the nearest level
          without leaving the unified Atlas world. */}
      {!playingId && playablePlacement && (
        <button
          onClick={() => setPendingPlayId(playablePlacement.id)}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[45] px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold shadow-lg pointer-events-auto"
        >
          ▶ Play {playablePlacement.levels?.name ?? "Level"}
        </button>
      )}
      {playingId && (
        <button
          onClick={() => setPlayingId(null)}
          className="fixed top-4 right-4 z-[55] px-3 py-1.5 rounded-md bg-black/70 hover:bg-black/90 text-white text-xs font-semibold border border-white/20 pointer-events-auto"
        >
          Exit Level (Esc)
        </button>
      )}
    </>
  );
}