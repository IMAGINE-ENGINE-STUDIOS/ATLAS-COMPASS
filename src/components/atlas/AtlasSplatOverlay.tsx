/**
 * AtlasSplatOverlay
 * -----------------
 * Renders user-uploaded 3D Gaussian Splat landmarks on top of Cesium tiles.
 * Same camera-sync pattern as AtlasLevelsR3FOverlay: a transparent THREE
 * canvas mirrors Cesium's camera, and each splat is positioned relative to
 * the Cesium camera position in ECEF to keep float precision usable.
 *
 * Only the 3 nearest in-radius splats are kept loaded (LRU). The R3F canvas
 * is pointer-events:none so Cesium continues to own input.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  Cartesian3,
  Matrix4 as CesiumMatrix4,
  Transforms,
  type Viewer,
  Color as CesiumColor,
  VerticalOrigin,
  HeightReference,
  LabelStyle,
  Cartesian2,
  CallbackProperty,
} from "cesium";
import { supabase } from "@/integrations/supabase/client";
import { CameraSync, THREE_TO_ENU } from "@/lib/atlasR3F";
// Splat runtime is heavy (~MB of WASM/GLSL) and only used when a landmark
// enters range — dynamic import inside the SplatNode effect below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GaussianSplats3DPromise: Promise<any> | null = null;
function loadGaussianSplats3D() {
  if (!GaussianSplats3DPromise) {
    // @ts-ignore – no bundled types
    GaussianSplats3DPromise = import("@mkkellogg/gaussian-splats-3d");
  }
  return GaussianSplats3DPromise;
}

const MAX_LOADED = 3;
const BUCKET = "splat-landmarks";
const EARTH_RADIUS_M = 6371000;

export type SplatLandmark = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  altitude: number;
  heading: number;
  pitch: number;
  roll: number;
  scale: number;
  radius_m: number;
  file_path: string;
};

function isWorldPointInFront(viewer: Viewer, world: Cartesian3) {
  const camera = viewer.camera;
  const toPoint = Cartesian3.subtract(world, camera.positionWC, new Cartesian3());
  if (Cartesian3.dot(toPoint, camera.directionWC) <= 0) return false;
  return Cartesian3.dot(world, camera.positionWC) >= EARTH_RADIUS_M * EARTH_RADIUS_M;
}

function SplatNode({
  viewer,
  landmark,
  signedUrl,
}: {
  viewer: Viewer;
  landmark: SplatLandmark;
  signedUrl: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const dropInRef = useRef<any>(null);

  // ECEF anchor + ENU rotation (recomputed only when coords change)
  const { ecef, enuRot } = useMemo(() => {
    const origin = Cartesian3.fromDegrees(
      landmark.longitude,
      landmark.latitude,
      landmark.altitude || 0
    );
    const m = Transforms.eastNorthUpToFixedFrame(origin);
    const arr = CesiumMatrix4.toArray(m, []) as number[];
    const rot = new THREE.Matrix4().fromArray(arr);
    rot.setPosition(0, 0, 0);
    return { ecef: new THREE.Vector3(origin.x, origin.y, origin.z), enuRot: rot };
  }, [landmark.longitude, landmark.latitude, landmark.altitude]);

  const headingRad = -(landmark.heading * Math.PI) / 180;
  const pitchRad = (landmark.pitch * Math.PI) / 180;
  const rollRad = (landmark.roll * Math.PI) / 180;
  const sc = landmark.scale > 0 ? landmark.scale : 1;

  // Load splat on mount, dispose on unmount
  useEffect(() => {
    if (!groupRef.current) return;
    let cancelled = false;
    let dropIn: any = null;
    loadGaussianSplats3D().then((mod: any) => {
      if (cancelled || !groupRef.current) return;
      const NS = mod.default ?? mod;
      dropIn = new NS.DropInViewer({
        gpuAcceleratedSort: true,
        sharedMemoryForWorkers: false,
        selfDrivenMode: false,
        useBuiltInControls: false,
      });
      dropInRef.current = dropIn;
      groupRef.current.add(dropIn);
      dropIn
        .addSplatScene(signedUrl, {
          showLoadingUI: false,
          splatAlphaRemovalThreshold: 5,
          progressiveLoad: true,
        })
        .then(() => {
          if (cancelled) return;
          viewer.scene.requestRender?.();
        })
        .catch((err: any) => {
          console.warn("[splat] load failed", landmark.name, err);
        });
    });

    return () => {
      cancelled = true;
      try { dropIn?.dispose?.(); } catch {}
      if (groupRef.current && dropIn && dropIn.parent === groupRef.current) {
        groupRef.current.remove(dropIn);
      }
      dropInRef.current = null;
    };
  }, [signedUrl, landmark.name, viewer]);

  // Per-frame: position group relative to current Cesium camera origin
  const scratch = useRef({
    out: new THREE.Matrix4(),
    rot: new THREE.Matrix4(),
    scl: new THREE.Matrix4(),
    eul: new THREE.Euler(),
  }).current;
  useFrame(() => {
    if (!groupRef.current || !viewer || viewer.isDestroyed()) return;
    const camPos = viewer.camera.positionWC;
    scratch.eul.set(pitchRad, headingRad, rollRad, "YXZ");
    scratch.rot.makeRotationFromEuler(scratch.eul);
    scratch.out
      .makeTranslation(ecef.x - camPos.x, ecef.y - camPos.y, ecef.z - camPos.z)
      .multiply(enuRot)
      .multiply(THREE_TO_ENU)
      .multiply(scratch.rot)
      .multiply(scratch.scl.makeScale(sc, sc, sc));
    groupRef.current.matrixAutoUpdate = false;
    groupRef.current.matrix.copy(scratch.out);
    groupRef.current.matrixWorldNeedsUpdate = true;
  });

  return <group ref={groupRef} />;
}

export default function AtlasSplatOverlay({
  viewerRef,
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
}) {
  const [landmarks, setLandmarks] = useState<SplatLandmark[]>([]);
  const [loadedIds, setLoadedIds] = useState<string[]>([]); // LRU, max 3
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  // Subscribe to landmarks
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("splat_landmarks")
        .select(
          "id,name,longitude,latitude,altitude,heading,pitch,roll,scale,radius_m,file_path"
        );
      if (!cancelled) setLandmarks((data as SplatLandmark[]) ?? []);
    };
    load();
    const ch = supabase
      .channel("splat_landmarks_rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "splat_landmarks" },
        () => load()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  // Cesium pin markers for every landmark (visible even before splat loads)
  useEffect(() => {
    if (!ready) return;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const entities = landmarks.map((lm) => {
      const pinWorld = Cartesian3.fromDegrees(lm.longitude, lm.latitude, lm.altitude || 0);
      const inFront = new CallbackProperty(() => {
        if (viewer.isDestroyed()) return false;
        return isWorldPointInFront(viewer, pinWorld);
      }, false);
      return viewer.entities.add({
        id: `splat-pin-${lm.id}`,
        position: pinWorld,
        point: {
          show: inFront,
          pixelSize: 12,
          color: CesiumColor.fromCssColorString("#34d399"),
          outlineColor: CesiumColor.WHITE,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          show: inFront,
          text: lm.name,
          font: "600 12px Inter, system-ui, sans-serif",
          fillColor: CesiumColor.WHITE,
          outlineColor: CesiumColor.fromCssColorString("#064e3b"),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -14),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          showBackground: true,
          backgroundColor: CesiumColor.fromCssColorString("rgba(6,78,59,0.75)"),
          backgroundPadding: new Cartesian2(6, 4),
        },
      });
    });
    viewer.scene.requestRender?.();
    return () => {
      if (viewer.isDestroyed()) return;
      for (const e of entities) {
        try { viewer.entities.remove(e); } catch {}
      }
      viewer.scene.requestRender?.();
    };
  }, [ready, landmarks, viewerRef]);

  // Wait for viewer — B1: guard the recursive setTimeout with cleanup so an
  // unmount mid-wait can't fire setReady on an unmounted component.
  useEffect(() => {
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (cancelled) return;
      if (viewerRef.current && !viewerRef.current.isDestroyed?.()) {
        setReady(true);
      } else {
        handle = setTimeout(tick, 300);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (handle) clearTimeout(handle);
    };
  }, [viewerRef]);

  // Proximity loop: pick nearest splats in radius, manage LRU
  useEffect(() => {
    if (!ready || landmarks.length === 0) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 500) return; // 2Hz is plenty
      last = t;
      if (viewer.isDestroyed()) return;
      const camPos = viewer.camera.positionWC;
      const inRange: { id: string; d: number; lm: SplatLandmark }[] = [];
      for (const lm of landmarks) {
        const p = Cartesian3.fromDegrees(lm.longitude, lm.latitude, lm.altitude || 0);
        const dx = p.x - camPos.x;
        const dy = p.y - camPos.y;
        const dz = p.z - camPos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < lm.radius_m * 1.5) inRange.push({ id: lm.id, d, lm });
      }
      inRange.sort((a, b) => a.d - b.d);
      const desired = inRange.slice(0, MAX_LOADED).map((x) => x.id);

      setLoadedIds((prev) => {
        // unload anything far beyond radius * 3
        const farGone = prev.filter((id) => {
          const lm = landmarks.find((l) => l.id === id);
          if (!lm) return false;
          const p = Cartesian3.fromDegrees(lm.longitude, lm.latitude, lm.altitude || 0);
          const dx = p.x - camPos.x,
            dy = p.y - camPos.y,
            dz = p.z - camPos.z;
          return Math.sqrt(dx * dx + dy * dy + dz * dz) > lm.radius_m * 3;
        });
        let next = prev.filter((id) => !farGone.includes(id));
        for (const id of desired) {
          if (!next.includes(id)) next.push(id);
        }
        if (next.length > MAX_LOADED) next = next.slice(next.length - MAX_LOADED);
        // shallow-equal early exit
        if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
        return next;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, landmarks, viewerRef]);

  // Resolve signed URLs for loaded splats — fetch in parallel (P17) instead
  // of blocking each request on the previous.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = loadedIds
        .filter((id) => !signedUrls[id])
        .map((id) => ({ id, lm: landmarks.find((l) => l.id === id) }))
        .filter((x): x is { id: string; lm: SplatLandmark } => !!x.lm);
      if (missing.length === 0) return;
      const results = await Promise.all(
        missing.map(async ({ id, lm }) => {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(lm.file_path, 60 * 60);
          return { id, url: data?.signedUrl };
        }),
      );
      if (cancelled) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.url) next[r.id] = r.url;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedIds, landmarks]);

  if (!ready || !viewerRef.current) return null;
  const viewer = viewerRef.current;
  const visible = landmarks.filter((l) => loadedIds.includes(l.id) && signedUrls[l.id]);
  if (visible.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[39] pointer-events-none">
      <Canvas
        gl={{ alpha: true, antialias: false, logarithmicDepthBuffer: true, premultipliedAlpha: false }}
        camera={{ position: [0, 0, 0], fov: 60, near: 1, far: 1e10 }}
        style={{ background: "transparent", pointerEvents: "none" }}
      >
        <CameraSync viewer={viewer} />
        {visible.map((lm) => (
          <SplatNode
            key={lm.id}
            viewer={viewer}
            landmark={lm}
            signedUrl={signedUrls[lm.id]!}
          />
        ))}
      </Canvas>
    </div>
  );
}
