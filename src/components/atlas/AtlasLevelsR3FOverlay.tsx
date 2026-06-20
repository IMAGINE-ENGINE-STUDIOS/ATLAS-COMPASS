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
  Transforms,
  type Viewer,
} from "cesium";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_SCENE, type LevelScene } from "@/lib/levelTypes";
import { LevelSceneContents } from "@/components/level/LevelScene3D";
import type { LevelPlacement } from "@/lib/useAtlasLevelLayer";

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

  // Reusable scratch matrices
  const scratch = useRef({
    headingM: new THREE.Matrix4(),
    scaleM: new THREE.Matrix4(),
    out: new THREE.Matrix4(),
  }).current;

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
      {/* When `playing` is true, the level's full Play runtimes
          (locomotion, input, physics, mouselook) activate so the user
          can actually walk around inside the level. Only one placement
          is `playing` at a time — the parent component handles that and
          also disables Cesium camera input so mouselook/WASD don't fight
          the globe. */}
      <LevelSceneContents
        scene={scene}
        playing={playing}
        skipAmbient
        skipDirectional
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
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [isLoaded]);

  // Proximity-based LOD: only mount the real R3F scene for placements
  // the camera is actually near. Far away, the cheap green Cesium box
  // from useAtlasLevelLayer is enough. Recomputed at ~4Hz.
  const [nearIds, setNearIds] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const PROX_M = 3000; // within 3km → load real level
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 250) return;
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

  // Disable Cesium camera controls while a level is being played so
  // mouse/keyboard go to the R3F player controller instead of orbiting
  // the globe.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    const ctl: any = v.scene.screenSpaceCameraController;
    if (!ctl) return;
    if (playingId) {
      ctl.enableInputs = false;
    } else {
      ctl.enableInputs = true;
    }
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

  // Auto-exit if the playing level falls out of proximity
  useEffect(() => {
    if (playingId && !nearIds.has(playingId)) setPlayingId(null);
  }, [playingId, nearIds]);

  if (!isLoaded || !viewerRef.current || placements.length === 0 || !ready) return null;
  const viewer = viewerRef.current;
  const visible = placements.filter((p) => nearIds.has(p.id));
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
          <CameraSync viewer={viewer} />
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
          onClick={() => setPlayingId(playablePlacement.id)}
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