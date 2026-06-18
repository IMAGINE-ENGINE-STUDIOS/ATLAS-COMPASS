import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, useGLTF, Environment, Html, TransformControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { RGBELoader } from "three-stdlib";
import { EXRLoader } from "three-stdlib";
import type {
  LevelScene,
  SceneObject,
  PolygonObject,
  PrimitiveObject,
  ModelObject,
  CharacterObject,
  SceneLight,
  AnimationTrack,
  SceneTerrain,
  HDRIEnvironment as HDRIEnvironmentCfg,
} from "@/lib/levelTypes";
import type { TrajectoryObject } from "@/lib/levelTypes";
import {
  buildFaceMaterials,
  objectFaceKeys,
  primitiveFaceKeys,
  resolveFaceKeyFromHit,
} from "@/lib/face-system";
import { FacePaintContext, useFacePaint } from "./FacePaintContext";
import LevelCharacter from "./LevelCharacter";
import PlayableCharacter from "./locomotion/PlayableCharacter";
import PushableRuntime from "./locomotion/PushableRuntime";
import InteractionPromptUI from "./locomotion/InteractionPromptUI";
import NavigationMap from "./locomotion/NavigationMap";
import { TrajectoryRender, TrajectoryRunner } from "./trajectory/TrajectoryRuntime";

/* ---------- helpers ---------- */

function rgbaToColor([r, g, b]: [number, number, number, number]) {
  return new THREE.Color(r, g, b);
}

/* ---------- HDRI environment ----------
 * Loads the active HDRI (.hdr/.exr) and binds it to scene.environment (and
 * optionally scene.background). Restores previous values on unmount/swap so
 * removing an HDRI cleanly falls back to the drei <Environment preset>.
 */
function HDRIEnvironmentRuntime({ cfg }: { cfg: HDRIEnvironmentCfg }) {
  const { scene, gl } = useThree();
  const active = cfg.maps.find((m) => m.id === cfg.activeId);
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!active) {
      setTex(null);
      return;
    }
    // Skip placeholder URLs left behind when a level is restored without its
    // local HDRI blob (e.g. opened in a different browser, or after the
    // per-level HDRI cache was evicted). Trying to fetch "local:<id>" throws
    // "Failed to fetch" repeatedly and used to spam the canvas.
    if (!active.url || active.url.startsWith("local:")) {
      console.warn("[hdri] active map has no usable URL — re-upload to restore lighting");
      setTex(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    // Huge data: URLs (>~10MB) can fail `fetch()` with "Failed to fetch" in
    // Chromium. Convert to a Blob URL first — Blob URLs always load cleanly
    // and also free the giant base64 string from the loader pipeline.
    let urlToLoad = active.url;
    if (active.url.startsWith("data:")) {
      try {
        const [meta, b64] = active.url.split(",", 2);
        const mime = meta.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        urlToLoad = blobUrl;
      } catch (e) {
        console.warn("[hdri] failed to convert data URL to blob", e);
      }
    }
    const Loader: any = active.ext === "exr" ? EXRLoader : RGBELoader;
    const loader = new Loader();
    loader.load(
      urlToLoad,
      (t: THREE.Texture) => {
        if (cancelled) {
          t.dispose();
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          return;
        }
        try {
          t.mapping = THREE.EquirectangularReflectionMapping;
          // Pre-filter via PMREM for correct PBR reflections
          const pmrem = new THREE.PMREMGenerator(gl);
          const target = pmrem.fromEquirectangular(t);
          t.dispose();
          pmrem.dispose();
          setTex(target.texture);
        } catch (err) {
          // PMREM can throw if the WebGL context is lost mid-load. Don't
          // tear down the React tree — fall back to no environment map.
          console.warn("[hdri] PMREM filtering failed", err);
          t.dispose();
          setTex(null);
        } finally {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
        }
      },
      undefined,
      (err: unknown) => {
        console.warn("HDRI load failed", err);
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      },
    );
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [active?.id, active?.url, active?.ext, gl]);

  useEffect(() => {
    if (!tex) return;
    const prevEnv = scene.environment;
    const prevBg = scene.background;
    scene.environment = tex;
    if (cfg.asBackground) scene.background = tex;
    // three r155+ exposes these; guard for older typings.
    (scene as any).environmentIntensity = cfg.intensity;
    (scene as any).backgroundIntensity = cfg.intensity;
    const rot = new THREE.Euler(0, cfg.rotation, 0);
    (scene as any).environmentRotation = rot;
    (scene as any).backgroundRotation = rot;
    return () => {
      scene.environment = prevEnv;
      scene.background = prevBg;
    };
  }, [tex, cfg.asBackground, cfg.intensity, cfg.rotation, scene]);

  useEffect(() => () => { tex?.dispose(); }, [tex]);
  return null;
}

/* ---------- objects ---------- */

function PrimitiveMesh({
  obj,
  selected,
  onSelect,
}: {
  obj: PrimitiveObject;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const geom = useMemo(() => {
    switch (obj.shape) {
      case "sphere":
        return new THREE.SphereGeometry(0.5, 32, 32);
      case "plane":
        return new THREE.PlaneGeometry(1, 1, 1, 1);
      case "cylinder":
        return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
      case "cone":
        return new THREE.ConeGeometry(0.5, 1, 32);
      case "torus":
        return new THREE.TorusGeometry(0.5, 0.15, 16, 64);
      case "box":
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  }, [obj.shape]);

  const paint = useFacePaint();
  const faceKeys = useMemo(() => primitiveFaceKeys(obj.shape), [obj.shape]);
  const isActivePaint = paint.active && paint.objectId === obj.id;
  const materials = useMemo(() => {
    return buildFaceMaterials(
      faceKeys,
      { color: obj.color, metalness: obj.metalness, roughness: obj.roughness },
      obj.faceOverrides,
      isActivePaint ? paint.selected : null,
      { doubleSide: obj.shape === "plane" },
    );
  }, [faceKeys, obj.color, obj.metalness, obj.roughness, obj.faceOverrides, obj.shape, isActivePaint, paint.selected]);

  // Object-level selection tint (blue) wins over the face-paint green
  // overlay when nothing is painted, so users still see what they picked.
  if (selected && !isActivePaint) {
    for (const m of materials) {
      m.emissive = new THREE.Color("#3b82f6");
      m.emissiveIntensity = 0.4;
    }
  }

  return (
    <mesh
      visible={obj.visible}
      geometry={geom}
      material={materials}
      castShadow
      receiveShadow
      userData={{ __faceKeys: faceKeys, __objId: obj.id }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(obj.id);
      }}
    />
  );
}

function PolygonMesh({
  obj,
  selected,
  onSelect,
}: {
  obj: PolygonObject;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const paint = useFacePaint();
  const isActivePaint = paint.active && paint.objectId === obj.id;
  const faceKeys = useMemo(() => objectFaceKeys(obj), [obj.points.length, obj.extrude]);

  const { geometry, materials } = useMemo(() => {
    const topPts = obj.points.length
      ? obj.points
      : ([[-0.5, -0.5], [0.5, -0.5], [0, 0.5]] as Array<[number, number]>);
    let geom: THREE.BufferGeometry;

    if (obj.extrude > 0) {
      // Always-on custom prism builder. Splits sides into N independent
      // material groups so the face-paint system can address each side.
      const N = topPts.length;
      const offs = obj.bottomOffsets || [];
      const tH = obj.pointHeights || [];
      const bH = obj.bottomHeights || [];
      const topV = (i: number): [number, number, number] => {
        const [x, z] = topPts[i];
        return [x, obj.extrude + (tH[i] || 0), -z];
      };
      const botV = (i: number): [number, number, number] => {
        const [x, z] = topPts[i];
        const [ox, oz] = offs[i] || [0, 0];
        return [x + ox, bH[i] || 0, -(z + oz)];
      };
      const contour2D = topPts.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour2D, []);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of topPts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const spanX = Math.max(maxX - minX, 1e-6);
      const spanZ = Math.max(maxZ - minZ, 1e-6);

      const chunks: Array<{ pos: number[]; uv: number[] }> = [];
      // group 0 — top cap
      {
        const pos: number[] = [], uv: number[] = [];
        for (const t of tris)
          for (const i of [t[0], t[1], t[2]]) {
            const [x, z] = topPts[i];
            const v = topV(i);
            pos.push(v[0], v[1], v[2]);
            uv.push((x - minX) / spanX, (z - minZ) / spanZ);
          }
        chunks.push({ pos, uv });
      }
      // group 1 — bottom cap (reverse winding)
      {
        const pos: number[] = [], uv: number[] = [];
        for (const t of tris)
          for (const i of [t[0], t[2], t[1]]) {
            const [x, z] = topPts[i];
            const v = botV(i);
            pos.push(v[0], v[1], v[2]);
            uv.push((x - minX) / spanX, 1 - (z - minZ) / spanZ);
          }
        chunks.push({ pos, uv });
      }
      // groups 2..N+1 — one per side quad
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const a = topV(i), b = topV(j), c = botV(j), d = botV(i);
        const dx = b[0] - a[0], dz = b[2] - a[2];
        const segLen = Math.hypot(dx, dz);
        const pos: number[] = [], uv: number[] = [];
        pos.push(...a, ...b, ...c); uv.push(0, 1, segLen, 1, segLen, 0);
        pos.push(...a, ...c, ...d); uv.push(0, 1, segLen, 0, 0, 0);
        chunks.push({ pos, uv });
      }

      const allPos: number[] = [], allUv: number[] = [];
      geom = new THREE.BufferGeometry();
      chunks.forEach((c, idx) => {
        const start = allPos.length / 3;
        allPos.push(...c.pos); allUv.push(...c.uv);
        geom.addGroup(start, c.pos.length / 3, idx);
      });
      geom.setAttribute("position", new THREE.Float32BufferAttribute(allPos, 3));
      geom.setAttribute("uv", new THREE.Float32BufferAttribute(allUv, 2));
      geom.computeVertexNormals();
    } else {
      // Flat polygon — single group "cap". Honor per-vertex top heights.
      const tH = obj.pointHeights || [];
      const hasHeights = tH.some((h) => Math.abs(h || 0) > 1e-6);
      if (hasHeights) {
        const contour2D = topPts.map(([x, z]) => new THREE.Vector2(x, z));
        const tris = THREE.ShapeUtils.triangulateShape(contour2D, []);
        const positions: number[] = [];
        const uvs: number[] = [];
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const [x, z] of topPts) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const spanX = Math.max(maxX - minX, 1e-6);
        const spanZ = Math.max(maxZ - minZ, 1e-6);
        for (const t of tris)
          for (const i of [t[0], t[1], t[2]]) {
            const [x, z] = topPts[i];
            positions.push(x, tH[i] || 0, -z);
            uvs.push((x - minX) / spanX, (z - minZ) / spanZ);
          }
        geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geom.addGroup(0, positions.length / 3, 0);
        geom.computeVertexNormals();
      } else {
        const shape = new THREE.Shape(topPts.map(([x, z]) => new THREE.Vector2(x, z)));
        geom = new THREE.ShapeGeometry(shape);
        geom.rotateX(-Math.PI / 2);
      }
    }

    const defaultsByKey: Record<string, { color: any; metalness: number; roughness: number }> = {};
    if (obj.extrude > 0) {
      defaultsByKey["top"] = { color: obj.topColor, metalness: 0.1, roughness: 0.7 };
      defaultsByKey["bottom"] = { color: obj.topColor, metalness: 0.1, roughness: 0.7 };
      for (let i = 0; i < topPts.length; i++)
        defaultsByKey[`side_${i}`] = { color: obj.sideColor, metalness: 0.1, roughness: 0.8 };
    } else {
      defaultsByKey["cap"] = { color: obj.fillColor, metalness: 0.1, roughness: 0.8 };
    }
    const mats = buildFaceMaterials(
      faceKeys,
      defaultsByKey,
      obj.faceOverrides,
      isActivePaint ? paint.selected : null,
      { doubleSide: true },
    );
    return { geometry: geom, materials: mats };
  }, [obj.points, obj.bottomOffsets, obj.pointHeights, obj.bottomHeights, obj.extrude, obj.fillColor, obj.sideColor, obj.topColor, obj.faceOverrides, faceKeys, isActivePaint, paint.selected]);

  if (selected && !isActivePaint) {
    for (const m of materials) {
      (m as any).emissive = new THREE.Color("#3b82f6");
      (m as any).emissiveIntensity = 0.4;
    }
  }

  return (
    <mesh
      visible={obj.visible}
      geometry={geometry}
      material={materials}
      castShadow
      receiveShadow
      userData={{ __faceKeys: faceKeys, __objId: obj.id }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(obj.id);
      }}
    />
  );
}

function GLTFModelMesh({ obj, onSelect }: { obj: ModelObject; onSelect?: (id: string) => void }) {
  const gltf = useGLTF(obj.url);
  // Clone once per url so each instance owns its own materials and the
  // override pass can mutate them without leaking across instances.
  const root = useMemo(() => gltf.scene.clone(true), [gltf]);

  // Apply per-mesh material overrides. We assign each mesh a stable key
  // (mesh.name or fallback) and stash the ORIGINAL material in userData
  // so toggling overrides off restores the look.
  useEffect(() => {
    const overrides = obj.materialOverrides || {};
    let i = 0;
    root.traverse((n: any) => {
      if (!n.isMesh) return;
      const key = n.name || `mesh_${i++}`;
      n.userData.__meshKey = key;
      n.userData.__objId = obj.id;
      // Expose a single-entry face-key map so the FacePickerOverlay can
      // resolve a click on a model mesh to "mesh:<name>".
      n.userData.__faceKeys = [`mesh:${key}`];
      if (!n.userData.__origMat) n.userData.__origMat = n.material;

      const ov = overrides[key];
      if (!ov) {
        n.material = n.userData.__origMat;
        return;
      }

      // Always work on a clone so the original survives untouched.
      const base: any = n.userData.__origMat;
      const mat = (base?.clone?.() ?? new THREE.MeshStandardMaterial()) as any;
      if (ov.color) mat.color = new THREE.Color(ov.color[0], ov.color[1], ov.color[2]);
      if (ov.opacity != null) {
        mat.opacity = ov.opacity;
        mat.transparent = ov.opacity < 1;
      }
      if (ov.metalness != null && "metalness" in mat) mat.metalness = ov.metalness;
      if (ov.roughness != null && "roughness" in mat) mat.roughness = ov.roughness;

      const loadMap = (url?: string) => {
        if (!url) return undefined;
        const t = new THREE.TextureLoader().load(url);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (ov.repeat) t.repeat.set(ov.repeat[0], ov.repeat[1]);
        if (ov.offset) t.offset.set(ov.offset[0], ov.offset[1]);
        if (ov.rotation) t.rotation = ov.rotation;
        t.center.set(0.5, 0.5);
        return t;
      };
      if (ov.map !== undefined) mat.map = loadMap(ov.map);
      if (ov.normalMap !== undefined) mat.normalMap = loadMap(ov.normalMap);
      if (ov.roughnessMap !== undefined) mat.roughnessMap = loadMap(ov.roughnessMap);
      mat.needsUpdate = true;
      n.material = mat;
    });
  }, [root, obj.id, obj.materialOverrides]);

  return (
    <primitive
      object={root}
      visible={obj.visible}
      onClick={(e: any) => {
        e.stopPropagation();
        onSelect?.(obj.id);
      }}
    />
  );
}

/* ---------- terrain ---------- */

function TerrainModel({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const cloned = useMemo(() => gltf.scene.clone(), [gltf]);
  useEffect(() => {
    cloned.traverse((c: any) => {
      if (c.isMesh) {
        c.receiveShadow = true;
        c.userData.isTerrain = true;
      }
    });
  }, [cloned]);
  return <primitive object={cloned} />;
}

function RenderTerrain({ terrain }: { terrain: SceneTerrain }) {
  if (!terrain.enabled || !terrain.visible) return null;
  const [sx, sy, sz] = terrain.size;
  return (
    <group
      name="__terrain_root"
      position={terrain.position}
      rotation={terrain.rotation as any}
      userData={{ isTerrain: true }}
    >
      {terrain.source === "model" && terrain.modelUrl ? (
        <Suspense fallback={null}>
          <TerrainModel url={terrain.modelUrl} />
        </Suspense>
      ) : terrain.shape === "plane" ? (
        <SculptablePlane terrain={terrain} />
      ) : terrain.shape === "box" ? (
        <mesh receiveShadow userData={{ isTerrain: true }} position={[0, -sy / 2, 0]}>
          <boxGeometry args={[sx, sy, sz]} />
          <TerrainMaterial terrain={terrain} displacement={false} />
        </mesh>
      ) : (
        <mesh receiveShadow userData={{ isTerrain: true }}>
          <sphereGeometry args={[sx / 2, 48, 32]} />
          <TerrainMaterial terrain={terrain} displacement={false} />
        </mesh>
      )}
    </group>
  );
}

/* ---------- terrain material (color + texture + depth) ---------- */

function useImageTexture(
  url?: string,
  repeat = 1,
  colorSpace: "srgb" | "linear" = "srgb",
): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) {
      setTex(null);
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let cancelled = false;
    loader.load(
      url,
      (t) => {
        if (cancelled) {
          t.dispose();
          return;
        }
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        t.anisotropy = 8;
        // Color (albedo) maps must declare sRGB so three.js linearises them
        // correctly — without this the texture renders dim or invisible
        // against a white base color in r152+.
        (t as any).colorSpace =
          colorSpace === "srgb" ? (THREE as any).SRGBColorSpace : (THREE as any).LinearSRGBColorSpace;
        t.needsUpdate = true;
        setTex(t);
      },
      undefined,
      (err) => console.warn("[terrain] texture load failed", err),
    );
    return () => {
      cancelled = true;
    };
  }, [url, colorSpace]);
  // Keep repeat reactive without reloading the texture
  useEffect(() => {
    if (!tex) return;
    tex.repeat.set(repeat, repeat);
    tex.needsUpdate = true;
  }, [tex, repeat]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);
  return tex;
}

function TerrainMaterial({
  terrain,
  displacement,
}: {
  terrain: SceneTerrain;
  /** Allow displacementMap to actually displace geometry (plane only). */
  displacement?: boolean;
}) {
  const baseColor = rgbaToColor(terrain.color);
  const repeat = terrain.texture?.repeat ?? 1;
  const map = useImageTexture(terrain.texture?.url, repeat, "srgb");
  // Depth maps are luminance data, not color — keep them in linear space.
  const dispMap = useImageTexture(
    displacement ? terrain.depthMap?.url : undefined,
    repeat,
    "linear",
  );
  const mat = terrain.material;
  const metalness = mat?.metalness ?? 0.05;
  const roughness = mat?.roughness ?? 0.95;
  const envMapIntensity = mat?.reflectivity ?? 1;
  return (
    <meshStandardMaterial
      // Force three.js to rebuild the material when map presence flips so the
      // shader picks up the new uniforms instead of silently keeping the
      // map-less program.
      key={`${terrain.texture?.url ? "tex" : "no"}-${terrain.depthMap?.url ? "depth" : "flat"}`}
      color={map ? "#ffffff" : baseColor}
      map={map ?? undefined}
      displacementMap={dispMap ?? undefined}
      displacementScale={displacement ? terrain.depthMap?.scale ?? 0 : 0}
      wireframe={terrain.wireframe}
      transparent={terrain.color[3] < 1}
      opacity={terrain.color[3]}
      metalness={metalness}
      roughness={roughness}
      envMapIntensity={envMapIntensity}
      side={THREE.DoubleSide}
    />
  );
}

/**
 * Subdividable plane that can carry a sculpted heightmap. Vertex Z (which
 * becomes world Y after the parent group's -PI/2 X rotation) is driven from
 * `terrain.heightmap.data`. The mesh is named `__terrain_plane` so the
 * sculpt overlay can find and mutate it directly.
 */
function SculptablePlane({ terrain }: { terrain: SceneTerrain }) {
  const [sx, , sz] = terrain.size;
  const N = Math.max(2, Math.min(256, terrain.heightmap?.resolution ?? 64));
  const geom = useMemo(() => new THREE.PlaneGeometry(sx, sz, N, N), [sx, sz, N]);
  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => {
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const data = terrain.heightmap?.data;
    const has = data && data.length === pos.count;
    for (let i = 0; i < pos.count; i++) {
      arr[i * 3 + 2] = has ? data![i] : 0;
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }, [geom, terrain.heightmap?.data]);
  return (
    <mesh
      name="__terrain_plane"
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      castShadow
      userData={{ isTerrain: true }}
      geometry={geom}
    >
      <TerrainMaterial terrain={terrain} displacement />
    </mesh>
  );
}

/* ---------- terrain sculpt overlay ---------- */

export interface TerrainSculptConfig {
  active: boolean;
  tool: "lift" | "dig" | "smooth" | "flatten";
  radius: number;
  strength: number;
  commit: (heights: number[]) => void;
}

function TerrainSculptOverlay({
  sculpt,
  controlsRef,
}: {
  sculpt: TerrainSculptConfig;
  controlsRef?: React.MutableRefObject<any>;
}) {
  const { camera, gl, scene: r3fScene } = useThree();
  const [brush, setBrush] = useState<{ p: [number, number, number] } | null>(null);
  const downRef = useRef(false);
  const flattenZRef = useRef(0);
  // Keep latest sculpt config accessible from stable event handlers
  const cfgRef = useRef(sculpt);
  useEffect(() => { cfgRef.current = sculpt; }, [sculpt]);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const v = new THREE.Vector3();

    const getPlane = (): THREE.Mesh | null =>
      (r3fScene.getObjectByName("__terrain_plane") as THREE.Mesh) ?? null;

    const pick = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const plane = getPlane();
      if (!plane) return null;
      const hits = raycaster.intersectObject(plane, false);
      return hits[0] ?? null;
    };

    const neighborAvg = (arr: Float32Array, side: number, i: number) => {
      const r = Math.floor(i / side);
      const c = i % side;
      let sum = 0, n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= side || nc >= side) continue;
          sum += arr[(nr * side + nc) * 3 + 2];
          n++;
        }
      }
      return n > 0 ? sum / n : 0;
    };

    const applyBrush = (hit: THREE.Intersection) => {
      const cfg = cfgRef.current;
      const plane = hit.object as THREE.Mesh;
      const geom = plane.geometry as THREE.BufferGeometry;
      const pos = geom.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const side = Math.round(Math.sqrt(pos.count));
      const local = plane.worldToLocal(v.copy(hit.point));
      const r = cfg.radius;
      const r2 = r * r;
      const s = cfg.strength;
      let changed = false;
      for (let i = 0; i < pos.count; i++) {
        const vx = arr[i * 3];
        const vy = arr[i * 3 + 1];
        const dx = vx - local.x;
        const dy = vy - local.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const t = 1 - Math.sqrt(d2) / r;
        const fall = t * t * (3 - 2 * t);
        const zi = i * 3 + 2;
        let z = arr[zi];
        if (cfg.tool === "lift") z += s * fall;
        else if (cfg.tool === "dig") z -= s * fall;
        else if (cfg.tool === "flatten") {
          z += (flattenZRef.current - z) * Math.min(1, fall * s * 4);
        } else if (cfg.tool === "smooth") {
          const avg = neighborAvg(arr, side, i);
          z += (avg - z) * Math.min(1, fall * s * 4);
        }
        arr[zi] = z;
        changed = true;
      }
      if (changed) {
        pos.needsUpdate = true;
        geom.computeVertexNormals();
      }
    };

    const commit = () => {
      const plane = getPlane();
      if (!plane) return;
      const pos = (plane.geometry as THREE.BufferGeometry).attributes
        .position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const out = new Array(pos.count);
      for (let i = 0; i < pos.count; i++) out[i] = arr[i * 3 + 2];
      cfgRef.current.commit(out);
    };

    const onMove = (ev: PointerEvent) => {
      const hit = pick(ev);
      if (!hit) { setBrush(null); return; }
      setBrush({ p: [hit.point.x, hit.point.y + 0.02, hit.point.z] });
      if (downRef.current) applyBrush(hit);
    };
    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const hit = pick(ev);
      if (!hit) return;
      ev.stopPropagation();
      ev.preventDefault();
      downRef.current = true;
      const plane = hit.object as THREE.Mesh;
      const local = plane.worldToLocal(v.copy(hit.point));
      flattenZRef.current = local.z;
      if (controlsRef?.current) controlsRef.current.enabled = false;
      applyBrush(hit);
    };
    const onUp = () => {
      if (!downRef.current) return;
      downRef.current = false;
      if (controlsRef?.current) controlsRef.current.enabled = true;
      commit();
    };
    const onLeave = () => setBrush(null);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
      if (controlsRef?.current) controlsRef.current.enabled = true;
    };
  }, [camera, gl, r3fScene, controlsRef]);

  if (!brush) return null;
  const color = sculpt.tool === "dig" ? "#f97316"
    : sculpt.tool === "lift" ? "#22d3ee"
    : sculpt.tool === "smooth" ? "#a78bfa"
    : "#facc15";
  return (
    <group position={brush.p}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={9999}>
        <ringGeometry args={[Math.max(0.01, sculpt.radius * 0.96), sculpt.radius, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={9998}>
        <circleGeometry args={[sculpt.radius, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function RenderObject({
  obj,
  selectedId,
  onSelect,
  onFocus,
  playing,
  controlsRef,
  onTrajectoryPointsChange,
}: {
  obj: SceneObject;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onFocus?: (id: string) => void;
  playing?: boolean;
  controlsRef?: React.MutableRefObject<any>;
  onTrajectoryPointsChange?: (id: string, points: [number, number, number][]) => void;
}) {
  const selected = selectedId === obj.id;
  if (obj.kind === "primitive") return <PrimitiveMesh obj={obj} selected={selected} onSelect={onSelect} />;
  if (obj.kind === "polygon") return <PolygonMesh obj={obj} selected={selected} onSelect={onSelect} />;
  if (obj.kind === "model") return <GLTFModelMesh obj={obj} onSelect={onSelect} />;
  if (obj.kind === "character") {
    const isPlayer = !!playing && !!(obj as CharacterObject).playable;
    if (isPlayer) {
      return (
        <Suspense fallback={null}>
          <PlayableCharacter obj={obj as CharacterObject} enabled={true} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={null}>
        <LevelCharacter obj={obj as CharacterObject} onSelect={onSelect} />
      </Suspense>
    );
  }
  if (obj.kind === "trajectory") {
    return (
      <TrajectoryRender
        obj={obj as TrajectoryObject}
        selected={selected}
        onSelect={onSelect}
        editable={!playing}
        controlsRef={controlsRef}
        onPointsChange={
          onTrajectoryPointsChange
            ? (pts) => onTrajectoryPointsChange(obj.id, pts)
            : undefined
        }
      />
    );
  }
  return null;
}

/**
 * Wraps a single scene object in its transform group, tagging userData with
 * interaction hooks the locomotion runtime reads (sit/use markers, objId).
 * When playing, pushable objects get a `PushableRuntime` so the player can
 * shove them around at runtime without mutating React state.
 *
 * Playable characters skip the wrapper transform entirely — they self-manage
 * world position via the locomotion runtime.
 */
function ObjectSlot({
  obj,
  selectedId,
  onSelect,
  playing,
  controlsRef,
  onTrajectoryPointsChange,
}: {
  obj: SceneObject;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  playing: boolean;
  controlsRef?: React.MutableRefObject<any>;
  onTrajectoryPointsChange?: (id: string, points: [number, number, number][]) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const isPlayer =
    playing && obj.kind === "character" && !!(obj as CharacterObject).playable;
  const isPushable = playing && obj.interaction === "pushable";
  const interactionTag = obj.interaction === "sit" || obj.interaction === "use"
    ? obj.interaction
    : undefined;

  // Tag userData so the locomotion raycaster can resolve markers.
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.userData.__objId = obj.id;
    if (interactionTag) g.userData.__interaction = interactionTag;
    else delete g.userData.__interaction;
  }, [obj.id, interactionTag]);

  if (isPlayer) {
    // Detach from authored transform; the player drives its own world matrix.
    return (
      <RenderObject
        obj={obj}
        selectedId={selectedId}
        onSelect={onSelect ? (id) => onSelect(id) : undefined}
        playing={playing}
        controlsRef={controlsRef}
        onTrajectoryPointsChange={onTrajectoryPointsChange}
      />
    );
  }

  return (
    <group
      ref={groupRef}
      name={`obj-${obj.id}`}
      position={obj.position}
      rotation={obj.rotation as any}
      scale={obj.scale}
      onDoubleClick={(e) => {
        e.stopPropagation();
        (e as any).nativeEvent?.preventDefault?.();
        (window as any).__levelFocusObject?.(obj.id);
      }}
    >
      <RenderObject
        obj={obj}
        selectedId={selectedId}
        onSelect={onSelect ? (id) => onSelect(id) : undefined}
        playing={playing}
        controlsRef={controlsRef}
        onTrajectoryPointsChange={onTrajectoryPointsChange}
      />
      {isPushable && (
        <PushableRuntime
          objectId={obj.id}
          groupRef={groupRef}
          gravityEnabled={!!obj.physics?.gravity}
        />
      )}
    </group>
  );
}

function RenderLight({ light, skipAmbient }: { light: SceneLight; skipAmbient?: boolean }) {
  if (light.kind === "ambient" && skipAmbient) return null;
  const color = rgbaToColor(light.color);
  if (light.kind === "directional")
    return <directionalLight position={light.position} color={color} intensity={light.intensity} castShadow={light.castShadow} />;
  if (light.kind === "point")
    return <pointLight position={light.position} color={color} intensity={light.intensity} castShadow={light.castShadow} />;
  if (light.kind === "spot")
    return <spotLight position={light.position} color={color} intensity={light.intensity} castShadow={light.castShadow} />;
  return <ambientLight color={color} intensity={light.intensity} />;
}

/* ---------- global illumination ---------- */

function GlobalIllumination({ gi }: { gi: NonNullable<LevelScene["environment"]["gi"]> }) {
  if (!gi.enabled) return null;
  return (
    <>
      <hemisphereLight
        color={gi.skyColor}
        groundColor={gi.groundColor}
        intensity={gi.hemisphereIntensity}
      />
      {gi.contactShadows && (
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={gi.contactOpacity}
          blur={gi.contactBlur}
          scale={40}
          far={20}
          color="#000000"
        />
      )}
    </>
  );
}

/* ---------- light gizmo (scene-space icon + area of effect) ---------- */

function LightGizmo({
  light,
  selected,
  onSelect,
}: {
  light: SceneLight;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  if (light.kind === "ambient") return null; // ambient has no position
  const color = rgbaToColor(light.color);
  const pos = light.position;
  // Area-of-effect radius scales with intensity. Spot uses a cone height.
  const radius = Math.max(1, light.intensity * 3);
  // Direction for directional / spot: from position toward target (default origin)
  const dirVec = useMemo(() => {
    const t = light.target ?? [0, 0, 0];
    const v = new THREE.Vector3(t[0] - pos[0], t[1] - pos[1], t[2] - pos[2]);
    if (v.lengthSq() < 1e-6) v.set(0, -1, 0);
    return v.normalize();
  }, [light.target, pos[0], pos[1], pos[2]]);
  // Quaternion to rotate +Y axis toward dirVec (cone/arrow points along +Y by default)
  const orientQ = useMemo(() => {
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dirVec.clone().negate(), // cone opens in -Y locally, so flip
    );
  }, [dirVec]);

  return (
    <group position={pos as any}>
      {/* clickable icon */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(light.id);
        }}
        renderOrder={1000}
      >
        <octahedronGeometry args={[0.25, 0]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* selection ring */}
      {selected && (
        <mesh renderOrder={1001}>
          <ringGeometry args={[0.35, 0.42, 32]} />
          <meshBasicMaterial
            color="#facc15"
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            transparent
            opacity={0.9}
          />
        </mesh>
      )}
      {/* area of effect (only when selected) */}
      {selected && light.kind === "point" && (
        <mesh>
          <sphereGeometry args={[radius, 24, 16]} />
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      )}
      {selected && light.kind === "spot" && (
        <group quaternion={orientQ as any}>
          {/* cone tip at origin, base at -radius along Y after rotation */}
          <mesh position={[0, -radius / 2, 0]}>
            <coneGeometry args={[radius * 0.5, radius, 24, 1, true]} />
            <meshBasicMaterial
              color={color}
              wireframe
              transparent
              opacity={0.4}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
      {selected && light.kind === "directional" && (
        <group quaternion={orientQ as any}>
          {/* arrow shaft */}
          <mesh position={[0, -radius / 2, 0]}>
            <cylinderGeometry args={[0.04, 0.04, radius, 12]} />
            <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
          </mesh>
          {/* arrowhead */}
          <mesh position={[0, -radius, 0]}>
            <coneGeometry args={[0.2, 0.5, 16]} />
            <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ---------- animation runner ---------- */

function AnimationRunner({
  tracks,
  playing,
  groupRef,
}: {
  tracks: AnimationTrack[];
  playing: boolean;
  groupRef: React.RefObject<THREE.Group>;
}) {
  const timeRef = useRef(0);
  useFrame((_, dt) => {
    if (!playing || !groupRef.current) return;
    timeRef.current += dt;
    for (const track of tracks) {
      if (track.keyframes.length < 2) continue;
      const t = track.loop ? timeRef.current % track.duration : Math.min(timeRef.current, track.duration);
      // find surrounding keyframes
      let a = track.keyframes[0];
      let b = track.keyframes[track.keyframes.length - 1];
      for (let i = 0; i < track.keyframes.length - 1; i++) {
        if (track.keyframes[i].t <= t && track.keyframes[i + 1].t >= t) {
          a = track.keyframes[i];
          b = track.keyframes[i + 1];
          break;
        }
      }
      const span = Math.max(0.001, b.t - a.t);
      const k = Math.min(1, Math.max(0, (t - a.t) / span));
      const target = groupRef.current.getObjectByName(`obj-${track.targetId}`);
      if (!target) continue;
      if (a.position && b.position) {
        target.position.set(
          a.position[0] + (b.position[0] - a.position[0]) * k,
          a.position[1] + (b.position[1] - a.position[1]) * k,
          a.position[2] + (b.position[2] - a.position[2]) * k,
        );
      }
      if (a.rotation && b.rotation) {
        target.rotation.set(
          a.rotation[0] + (b.rotation[0] - a.rotation[0]) * k,
          a.rotation[1] + (b.rotation[1] - a.rotation[1]) * k,
          a.rotation[2] + (b.rotation[2] - a.rotation[2]) * k,
        );
      }
      if (a.scale && b.scale) {
        target.scale.set(
          a.scale[0] + (b.scale[0] - a.scale[0]) * k,
          a.scale[1] + (b.scale[1] - a.scale[1]) * k,
          a.scale[2] + (b.scale[2] - a.scale[2]) * k,
        );
      }
    }
  });
  return null;
}

/* ---------- exported components ---------- */

export interface LevelSceneProps {
  scene: LevelScene;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  showGrid?: boolean;
  playing?: boolean;
  skipAmbient?: boolean; // suppress ambient when embedded under a global light rig
  editingPolygonId?: string | null;
  onPolygonPointsChange?: (id: string, points: Array<[number, number]>) => void;
  onPolygonOffsetsChange?: (id: string, offsets: Array<[number, number]>) => void;
  onPolygonHeightsChange?: (
    id: string,
    heights: { top?: number[]; bottom?: number[] },
  ) => void;
  /**
   * Atomic multi-field patch for a polygon — used when a single drag must
   * update points + bottomOffsets together (e.g. moving only the top ring
   * while pinning the bottom in place).
   */
  onPolygonPatch?: (
    id: string,
    patch: {
      points?: Array<[number, number]>;
      bottomOffsets?: Array<[number, number]>;
      pointHeights?: number[];
      bottomHeights?: number[];
    },
  ) => void;
  /** Drag-edit of trajectory control points in the viewport. */
  onTrajectoryPointsChange?: (
    id: string,
    points: [number, number, number][],
  ) => void;
  transformMode?: "translate" | "rotate" | "scale" | null;
  onObjectTransform?: (
    id: string,
    t: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] },
  ) => void;
  snap?: number;
  selectedLightId?: string | null;
  onSelectLight?: (id: string) => void;
  addingPolygonPoint?: boolean;
  onAddingPointHandled?: () => void;
  /** Face-paint mode state (provided by the editor page). */
  facePaint?: {
    active: boolean;
    objectId: string | null;
    selected: Set<string>;
    toggle: (key: string, add: boolean) => void;
    clear: () => void;
  };
  /** Terrain sculpt mode state (provided by the editor page). */
  sculpt?: TerrainSculptConfig;
}

/**
 * Reusable R3F scene contents — can be mounted inside an editor Canvas or
 * inside another Canvas (e.g. on the Atlas) as an actor.
 */
export function LevelSceneContents({
  scene,
  selectedId,
  onSelect,
  showGrid,
  playing,
  skipAmbient,
  focusRequest,
  onFocusHandled,
  controlsRef,
  editingPolygonId,
  onPolygonPointsChange,
  onPolygonOffsetsChange,
  onPolygonHeightsChange,
  onPolygonPatch,
  onTrajectoryPointsChange,
  transformMode,
  onObjectTransform,
  snap,
  selectedLightId,
  onSelectLight,
  addingPolygonPoint,
  onAddingPointHandled,
  facePaint,
  sculpt,
}: LevelSceneProps & {
  focusRequest?: { id: string; nonce: number } | null;
  onFocusHandled?: () => void;
  controlsRef?: React.MutableRefObject<any>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  // Pick a sensible focus action for double-click — set focus request from parent
  const handleFocus = (id: string) => onSelect?.(id);
  const facePaintValue = facePaint ?? {
    active: false,
    objectId: null,
    selected: new Set<string>(),
    toggle: () => {},
    clear: () => {},
  };
  return (
    <FacePaintContext.Provider value={facePaintValue}>
      {/* HDRI takes over the background when asBackground is on; otherwise solid color. */}
      {!(scene.environment.hdri && scene.environment.hdri.asBackground && scene.environment.hdri.activeId) && (
        <color attach="background" args={[scene.environment.background]} />
      )}
      {scene.environment.hdri && scene.environment.hdri.activeId && (
        <HDRIEnvironmentRuntime cfg={scene.environment.hdri} />
      )}
      {scene.environment.gi?.enabled ? (
        <GlobalIllumination gi={scene.environment.gi} />
      ) : (
        !skipAmbient && <ambientLight intensity={scene.environment.ambient} />
      )}
      {scene.lights.map((l) => (
        <RenderLight key={l.id} light={l} skipAmbient={skipAmbient} />
      ))}
      {!playing &&
        scene.lights.map((l) => (
          <LightGizmo
            key={`gz-${l.id}`}
            light={l}
            selected={selectedLightId === l.id}
            onSelect={onSelectLight}
          />
        ))}
      {showGrid && (
        <Grid
          args={[40, 40]}
          cellSize={snap && snap > 0 ? snap : 1}
          sectionSize={snap && snap > 0 ? snap * 5 : 5}
          cellColor={snap && snap > 0 ? "#3b82f6" : "#1f2937"}
          sectionColor="#3b82f6"
          cellThickness={snap && snap > 0 ? 1 : 0.6}
          sectionThickness={1.2}
          fadeDistance={50}
          infiniteGrid
          position={[0, 0, 0]}
        />
      )}
      {scene.terrain?.enabled && <RenderTerrain terrain={scene.terrain} />}
      <group ref={groupRef} onPointerMissed={() => onSelect?.(null)}>
        {scene.objects.map((o) => (
          <ObjectSlot
            key={o.id}
            obj={o}
            selectedId={selectedId}
            onSelect={onSelect}
            playing={!!playing}
            controlsRef={controlsRef}
            onTrajectoryPointsChange={onTrajectoryPointsChange}
          />
        ))}
      </group>
      {/* HUD prompt for sit / use markers — overlays the canvas via Html. */}
      {playing && (
        <Html fullscreen prepend zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <InteractionPromptUI />
        </Html>
      )}
      {/* Walkability heat-map for the first character that requests it. */}
      {(() => {
        const navChar = scene.objects.find(
          (o) => o.kind === "character" && (o as CharacterObject).showNavMap,
        ) as CharacterObject | undefined;
        if (!navChar) return null;
        const cfg = navChar.locomotion ?? {};
        return (
          <NavigationMap
            centerXZ={[navChar.position[0], navChar.position[2]]}
            charHeight={cfg.height ?? 1.7}
            charRadius={cfg.radius ?? 0.32}
            size={24}
            resolution={36}
            nonce={scene.objects.length}
          />
        );
      })()}
      <AnimationRunner tracks={scene.animations} playing={!!playing} groupRef={groupRef} />
      <TrajectoryRunner objects={scene.objects} playing={!!playing} groupRef={groupRef} />
      <FocusController
        target={focusRequest}
        groupRef={groupRef}
        controlsRef={controlsRef}
        onDone={onFocusHandled}
      />
      {selectedId && transformMode && !editingPolygonId && !playing && onObjectTransform && (
        <TransformGizmo
          targetId={selectedId}
          mode={transformMode}
          groupRef={groupRef}
          controlsRef={controlsRef}
          snap={snap}
          snapToTerrain={!!scene.terrain?.enabled && !!scene.terrain?.snapToSurface}
          onCommit={(t) => onObjectTransform(selectedId, t)}
        />
      )}
      {editingPolygonId && (() => {
        const poly = scene.objects.find((o) => o.id === editingPolygonId && o.kind === "polygon") as
          | PolygonObject | undefined;
        if (!poly || !onPolygonPointsChange) return null;
        return (
          <PolygonEditOverlay
            poly={poly}
            controlsRef={controlsRef}
            onChange={(pts) => onPolygonPointsChange(poly.id, pts)}
            onOffsetsChange={(offs) => onPolygonOffsetsChange?.(poly.id, offs)}
            onHeightsChange={(h) => onPolygonHeightsChange?.(poly.id, h)}
            onPatch={(p) => onPolygonPatch?.(poly.id, p)}
            addingPoint={!!addingPolygonPoint}
            onAddingPointHandled={onAddingPointHandled}
          />
        );
      })()}
      {facePaintValue.active && facePaintValue.objectId && (
        <FacePickerOverlay
          groupRef={groupRef}
          objectId={facePaintValue.objectId}
          toggle={facePaintValue.toggle}
        />
      )}
      {sculpt?.active &&
        scene.terrain?.enabled &&
        scene.terrain.source === "primitive" &&
        scene.terrain.shape === "plane" && (
          <TerrainSculptOverlay sculpt={sculpt} controlsRef={controlsRef} />
        )}
    </FacePaintContext.Provider>
  );
}

/**
 * Standalone editor canvas (with controls + grid). Used by the LEVEL editor page.
 */
export default function LevelScene3D(
  props: LevelSceneProps & { className?: string }
) {
  return <LevelScene3DInner {...props} />;
}

/**
 * Click-handler overlay active during "Paint Faces" mode. Raycasts the
 * scene from pointer events, finds the target object's mesh, and toggles
 * the hit face key in the shared selection set.
 */
function FacePickerOverlay({
  groupRef,
  objectId,
  toggle,
}: {
  groupRef: React.RefObject<THREE.Group>;
  objectId: string;
  toggle: (key: string, add: boolean) => void;
}) {
  const { camera, gl, scene: r3fScene } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const target = groupRef.current?.getObjectByName(`obj-${objectId}`);
    if (!target) return;
    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(target, true);
      const hit = hits.find((h) => (h.object as any).userData?.__faceKeys || (h.object as any).isMesh);
      if (!hit) return;
      const obj = hit.object as any;
      let key: string | null = null;
      if (obj.userData?.__faceKeys) {
        key = resolveFaceKeyFromHit(hit);
      } else if (obj.isMesh && obj.name) {
        key = `mesh:${obj.name}`;
      }
      if (!key) return;
      ev.stopPropagation();
      ev.preventDefault();
      toggle(key, ev.shiftKey);
    };
    canvas.addEventListener("pointerdown", onDown, true);
    return () => canvas.removeEventListener("pointerdown", onDown, true);
  }, [camera, gl, groupRef, objectId, toggle]);
  return null;
}

function LevelScene3DInner(
  props: LevelSceneProps & { className?: string }
) {
  const { className, ...rest } = props;
  const controlsRef = useRef<any>(null);
  const [focusReq, setFocusReq] = useState<{ id: string; nonce: number } | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  // Bridge so the inner <group onDoubleClick> can trigger a focus request
  // without threading a ref/callback through every render.
  useEffect(() => {
    (window as any).__levelFocusObject = (id: string) =>
      setFocusReq({ id, nonce: Date.now() });
    return () => {
      if ((window as any).__levelFocusObject) delete (window as any).__levelFocusObject;
    };
  }, []);
  return (
    <Canvas
      key={canvasKey}
      className={className}
      shadows
      camera={{ position: [6, 6, 8], fov: 50 }}
      // Cap pixel ratio so high-DPI screens (e.g. retina × browser zoom)
      // don't push the GPU past its memory budget and lose the context.
      dpr={[1, 1.75]}
      gl={{ powerPreference: "high-performance", antialias: true, preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        const onLost = (e: Event) => {
          e.preventDefault();
          console.warn("[scene] WebGL context lost — attempting recovery");
        };
        const onRestored = () => {
          console.warn("[scene] WebGL context restored — remounting Canvas");
          // Force a clean remount so all GPU resources rebuild against the
          // new context (avoids the dreaded permanent black canvas).
          setCanvasKey((k) => k + 1);
        };
        canvas.addEventListener("webglcontextlost", onLost, false);
        canvas.addEventListener("webglcontextrestored", onRestored, false);
      }}
      onPointerMissed={() => rest.onSelect?.(null)}
    >
      <SceneErrorBoundary onError={(err) => console.warn("[scene] render error caught", err)}>
        <Suspense fallback={null}>
          <LevelSceneContents
            {...rest}
            focusRequest={focusReq}
            onFocusHandled={() => setFocusReq(null)}
            controlsRef={controlsRef}
          />
          {/* Fall back to a neutral studio preset only when the user hasn't supplied an HDRI. */}
          {!(rest.scene.environment.hdri && rest.scene.environment.hdri.activeId) && (
            <Environment preset="city" />
          )}
        </Suspense>
      </SceneErrorBoundary>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        enabled={!hasActivePlayer(rest)}
      />
    </Canvas>
  );
}

/** True when Play mode is on AND any character is flagged playable. */
function hasActivePlayer(props: LevelSceneProps) {
  if (!props.playing) return false;
  return props.scene.objects.some(
    (o) => o.kind === "character" && (o as CharacterObject).playable,
  );
}

/**
 * Error boundary scoped to the R3F scene tree. A single misbehaving asset
 * (broken HDRI, malformed GLTF, sculpt math edge case) won't unmount the
 * whole canvas — it just suppresses that subtree until the next render.
 */
class SceneErrorBoundary extends Component<
  { children: ReactNode; onError?: (err: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    this.props.onError?.(err);
    // Recover on the next frame so transient failures don't lock the canvas.
    queueMicrotask(() => this.setState({ failed: false }));
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/* ---------- focus / smooth camera move ---------- */

function TransformGizmo({
  targetId,
  mode,
  groupRef,
  controlsRef,
  snap,
  snapToTerrain,
  onCommit,
}: {
  targetId: string;
  mode: "translate" | "rotate" | "scale";
  groupRef: React.RefObject<THREE.Group>;
  controlsRef?: React.MutableRefObject<any>;
  snap?: number;
  snapToTerrain?: boolean;
  onCommit: (t: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  }) => void;
}) {
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const tcRef = useRef<any>(null);
  const { scene: r3fScene } = useThree();
  useEffect(() => {
    // Find the group named obj-<id> after render
    const t = groupRef.current?.getObjectByName(`obj-${targetId}`) ?? null;
    setTarget(t);
  }, [targetId, groupRef]);

  // Surface snap: while dragging in translate mode, raycast straight down
  // from above the target's XZ position onto the terrain mesh.
  useEffect(() => {
    const ctl = tcRef.current;
    if (!ctl || !target) return;
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const onChange = () => {
      if (!snapToTerrain || mode !== "translate") return;
      const terrainRoot = r3fScene.getObjectByName("__terrain_root");
      if (!terrainRoot) return;
      const origin = new THREE.Vector3(target.position.x, 1000, target.position.z);
      raycaster.set(origin, down);
      const hits = raycaster.intersectObject(terrainRoot, true);
      if (hits.length) target.position.y = hits[0].point.y;
    };
    ctl.addEventListener("objectChange", onChange);
    return () => ctl.removeEventListener("objectChange", onChange);
  }, [target, snapToTerrain, mode, r3fScene]);

  if (!target) return null;
  return (
    <TransformControls
      ref={tcRef}
      object={target as any}
      mode={mode}
      size={0.8}
      translationSnap={snap && snap > 0 ? snap : null}
      rotationSnap={snap && snap > 0 ? Math.PI / 12 : null}
      scaleSnap={snap && snap > 0 ? snap : null}
      onMouseDown={() => {
        if (controlsRef?.current) controlsRef.current.enabled = false;
      }}
      onMouseUp={() => {
        if (controlsRef?.current) controlsRef.current.enabled = true;
        // Final surface-snap pass before commit
        if (snapToTerrain && mode === "translate") {
          const terrainRoot = r3fScene.getObjectByName("__terrain_root");
          if (terrainRoot) {
            const raycaster = new THREE.Raycaster();
            raycaster.set(
              new THREE.Vector3(target.position.x, 1000, target.position.z),
              new THREE.Vector3(0, -1, 0),
            );
            const hits = raycaster.intersectObject(terrainRoot, true);
            if (hits.length) target.position.y = hits[0].point.y;
          }
        }
        onCommit({
          position: [target.position.x, target.position.y, target.position.z],
          rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
          scale: [target.scale.x, target.scale.y, target.scale.z],
        });
      }}
    />
  );
}

function PolygonEditOverlay({
  poly,
  controlsRef,
  onChange,
  onOffsetsChange,
  onHeightsChange,
  onPatch,
  addingPoint,
  onAddingPointHandled,
}: {
  poly: PolygonObject;
  controlsRef?: React.MutableRefObject<any>;
  onChange: (pts: Array<[number, number]>) => void;
  onOffsetsChange?: (offsets: Array<[number, number]>) => void;
  onHeightsChange?: (h: { top?: number[]; bottom?: number[] }) => void;
  onPatch?: (p: {
    points?: Array<[number, number]>;
    bottomOffsets?: Array<[number, number]>;
    pointHeights?: number[];
    bottomHeights?: number[];
  }) => void;
  addingPoint?: boolean;
  onAddingPointHandled?: () => void;
}) {
  const { camera, gl, scene: r3fScene } = useThree();
  // Index of the bottom (orange) handle currently armed for offset drag
  // via double-click. Cleared on pointer-up or Escape.
  const [armedOffsetIndex, setArmedOffsetIndex] = useState<number | null>(null);
  // Index of the top (yellow) handle armed for INDEPENDENT drag — a drag
  // that moves only the top ring while pinning the bottom in place.
  const [armedTopIndex, setArmedTopIndex] = useState<number | null>(null);
  // Hover preview for add-point-on-edge mode: insertion index + local 2D coord.
  const [hoverInsert, setHoverInsert] = useState<{
    index: number; // insert AFTER this segment start index
    local: [number, number]; // shape-space (lx, lz_shape) — same units as poly.points
    world?: [number, number, number]; // optional world-space hit position for the ghost
  } | null>(null);
  const dragRef = useRef<{
    index: number;
    plane: THREE.Plane;
    onMove: (ev: PointerEvent) => void;
    onUp: (ev: PointerEvent) => void;
  } | null>(null);

  // The polygon is laid out on the XZ plane (geometry.rotateX(-PI/2)),
  // so each 2D spline point (px, pz) lives at local (px, 0, pz). The mesh
  // itself is then translated/rotated/scaled by the object's transform.
  // For dragging we project the cursor onto the world-space XZ plane that
  // passes through the object's origin and convert back to local 2D.
  const objMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3(...poly.position);
    const rot = new THREE.Euler(...(poly.rotation as any));
    const scl = new THREE.Vector3(...poly.scale);
    m.compose(pos, new THREE.Quaternion().setFromEuler(rot), scl);
    return m;
  }, [poly.position, poly.rotation, poly.scale]);
  const invObjMatrix = useMemo(() => objMatrix.clone().invert(), [objMatrix]);

  // Top corners (extruded prism top face) and bottom corners (the spline
  // baseline). Both rings are rendered as draggable handles so every
  // corner of the geometry is visible and controllable.
  const topPoints = useMemo(
    () =>
      poly.points.map(([x, z], i) => {
        const h = poly.pointHeights?.[i] || 0;
        return new THREE.Vector3(x, (poly.extrude || 0) + h + 0.01, -z).applyMatrix4(objMatrix);
      }),
    [poly.points, poly.pointHeights, poly.extrude, objMatrix],
  );
  const bottomPoints = useMemo(
    () =>
      poly.points.map(([x, z], i) => {
        const o = poly.bottomOffsets?.[i] || [0, 0];
        const h = poly.bottomHeights?.[i] || 0;
        return new THREE.Vector3(x + o[0], h - 0.01, -(z + o[1])).applyMatrix4(objMatrix);
      }),
    [poly.points, poly.bottomOffsets, poly.bottomHeights, objMatrix],
  );
  const hasExtrude = (poly.extrude || 0) > 0.001;

  // Disarm offset mode when the polygon being edited changes.
  useEffect(() => {
    setArmedOffsetIndex(null);
    setArmedTopIndex(null);
  }, [poly.id]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setArmedOffsetIndex(null);
        setArmedTopIndex(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Begin a bottom-offset drag (armed via double-click on an orange handle).
  // Mutates poly.bottomOffsets[index] instead of poly.points[index] so the
  // bottom corner moves independently of its yellow top counterpart.
  const beginOffsetDrag = (index: number, e: any) => {
    e.stopPropagation();
    if (controlsRef?.current) controlsRef.current.enabled = false;
    const origin = new THREE.Vector3(0, -0.01, 0).applyMatrix4(objMatrix);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(objMatrix).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const canvas = gl.domElement;
    const onMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      const local = hit.clone().applyMatrix4(invObjMatrix);
      const sx = local.x, sy = -local.z;
      const [tx, tz] = poly.points[index];
      const next: Array<[number, number]> = [];
      for (let i = 0; i < poly.points.length; i++) {
        next.push(
          i === index
            ? [sx - tx, sy - tz]
            : (poly.bottomOffsets?.[i] || [0, 0]),
        );
      }
      onOffsetsChange?.(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (controlsRef?.current) controlsRef.current.enabled = true;
      setArmedOffsetIndex(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Begin an INDEPENDENT TOP drag (armed via double-click on a yellow
  // handle). Mutates poly.points[index] AND simultaneously rewrites
  // poly.bottomOffsets[index] so the bottom corner stays anchored where
  // it currently is. This is the symmetric counterpart of beginOffsetDrag.
  const beginIndependentTopDrag = (index: number, e: any) => {
    e.stopPropagation();
    if (controlsRef?.current) controlsRef.current.enabled = false;
    const planeY = (poly.extrude || 0) + (poly.pointHeights?.[index] || 0) + 0.01;
    const origin = new THREE.Vector3(0, planeY, 0).applyMatrix4(objMatrix);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(objMatrix).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const canvas = gl.domElement;
    // Capture the bottom corner's current XZ in shape-space — we must keep
    // it fixed across the whole drag.
    const [origTx, origTz] = poly.points[index];
    const [origOx, origOz] = poly.bottomOffsets?.[index] || [0, 0];
    const bottomFixedX = origTx + origOx;
    const bottomFixedZ = origTz + origOz;
    const onMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      const local = hit.clone().applyMatrix4(invObjMatrix);
      const newTx = local.x, newTz = -local.z;
      const nextPoints = poly.points.map((p, i) =>
        i === index ? [newTx, newTz] : p,
      ) as Array<[number, number]>;
      const nextOffsets = poly.points.map((_, i) =>
        i === index
          ? [bottomFixedX - newTx, bottomFixedZ - newTz]
          : (poly.bottomOffsets?.[i] || [0, 0]),
      ) as Array<[number, number]>;
      onPatch?.({ points: nextPoints, bottomOffsets: nextOffsets });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (controlsRef?.current) controlsRef.current.enabled = true;
      setArmedTopIndex(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const beginDrag = (index: number, ring: "top" | "bottom", e: any) => {
    e.stopPropagation();
    if (controlsRef?.current) controlsRef.current.enabled = false;
    const verticalMode = !!(e.shiftKey || e.nativeEvent?.shiftKey);
    if (verticalMode) {
      // Drag along the object's local Y axis. Build a vertical plane that
      // contains the handle and faces the camera (best precision).
      const handleWorld =
        ring === "top"
          ? topPoints[index].clone()
          : bottomPoints[index].clone();
      const yAxisWorld = new THREE.Vector3(0, 1, 0)
        .transformDirection(objMatrix)
        .normalize();
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      // Plane normal: perpendicular to Y axis, as parallel to camera view as possible.
      let n = new THREE.Vector3().crossVectors(yAxisWorld, camDir).normalize();
      if (n.lengthSq() < 1e-4) n = new THREE.Vector3(1, 0, 0);
      n.crossVectors(n, yAxisWorld).normalize(); // ensure n is perp to Y
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, handleWorld);
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const canvas = gl.domElement;
      const startH =
        (ring === "top"
          ? poly.pointHeights?.[index]
          : poly.bottomHeights?.[index]) || 0;
      // Convert handle's starting local Y into a reference.
      const startLocal = handleWorld.clone().applyMatrix4(invObjMatrix);
      const baseY = startLocal.y; // current local Y of the handle (includes startH offset)
      const onMove = (ev: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, hit)) return;
        const local = hit.clone().applyMatrix4(invObjMatrix);
        const delta = local.y - baseY;
        const newH = startH + delta;
        if (ring === "top") {
          const next: number[] = poly.points.map((_, i) =>
            i === index ? newH : (poly.pointHeights?.[i] || 0),
          );
          onHeightsChange?.({ top: next });
        } else {
          const next: number[] = poly.points.map((_, i) =>
            i === index ? newH : (poly.bottomHeights?.[i] || 0),
          );
          onHeightsChange?.({ bottom: next });
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (controlsRef?.current) controlsRef.current.enabled = true;
        dragRef.current = null;
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      dragRef.current = { index, plane, onMove, onUp };
      return;
    }
    // Drag plane sits at the handle's face so the cursor stays under it.
    const planeY =
      ring === "top"
        ? (poly.extrude || 0) + (poly.pointHeights?.[index] || 0) + 0.01
        : (poly.bottomHeights?.[index] || 0) - 0.01;
    const origin = new THREE.Vector3(0, planeY, 0).applyMatrix4(objMatrix);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(objMatrix).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const canvas = gl.domElement;
    const onMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      const local = hit.clone().applyMatrix4(invObjMatrix);
      // Invert the geometry's rotateX(-PI/2): shape sy = -world-local z.
      const next = poly.points.map((p, i) =>
        i === index ? [local.x, -local.z] : p,
      ) as Array<[number, number]>;
      onChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (controlsRef?.current) controlsRef.current.enabled = true;
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    dragRef.current = { index, plane, onMove, onUp };
  };

  useEffect(() => {
    return () => {
      const d = dragRef.current;
      if (d) {
        window.removeEventListener("pointermove", d.onMove);
        window.removeEventListener("pointerup", d.onUp);
        if (controlsRef?.current) controlsRef.current.enabled = true;
      }
    };
  }, [controlsRef]);

  // Add-point-on-edge mode: track cursor over the top-face plane and snap a
  // ghost insertion handle to the nearest edge. Click commits the new point.
  useEffect(() => {
    if (!addingPoint) {
      setHoverInsert(null);
      return;
    }
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    // Resolve insertion data from a screen-space point. We raycast against
    // the polygon's actual mesh (which has per-face material groups + a
    // userData.__faceKeys map) so the user can insert points by clicking
    // ANY edge — top spline, bottom spline, or vertical side seam.
    const computeInsertion = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const target = r3fScene.getObjectByName(`obj-${poly.id}`);
      const N = poly.points.length;
      const segCount = poly.closed ? N : N - 1;
      const tH = poly.pointHeights || [];
      const bH = poly.bottomHeights || [];
      const offs = poly.bottomOffsets || [];

      // Helper: nearest segment on a given ring (2D in shape coords),
      // returns {index, t, sx, sy} for the closest projection.
      const nearestOnRing = (
        ring: Array<[number, number]>,
        px: number,
        py: number,
      ) => {
        let best = { dist: Infinity, index: 0, t: 0, sx: px, sy: py };
        for (let i = 0; i < segCount; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % N];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const len2 = dx * dx + dy * dy || 1e-6;
          const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
          const sx = a[0] + dx * t, sy = a[1] + dy * t;
          const d = Math.hypot(px - sx, py - sy);
          if (d < best.dist) best = { dist: d, index: i, t, sx, sy };
        }
        return best;
      };
      const topRing = poly.points;
      const botRing: Array<[number, number]> = poly.points.map(([x, z], i) => {
        const [ox, oz] = offs[i] || [0, 0];
        return [x + ox, z + oz];
      });

      // First try the actual mesh — gives us face key + exact 3D hit.
      if (target) {
        const hits = raycaster.intersectObject(target, true);
        const hit = hits.find(
          (h) => (h.object as any).userData?.__faceKeys && (h.object as any).userData?.__objId === poly.id,
        );
        if (hit && hit.point) {
          const local = hit.point.clone().applyMatrix4(invObjMatrix);
          const px = local.x, py = -local.z, hY = local.y;
          const key = resolveFaceKeyFromHit(hit);

          if (key === "bottom") {
            const r = nearestOnRing(botRing, px, py);
            // Insertion XZ on bottom: use projected point. Derive the new
            // top XZ by undoing the interpolated offset so the new top
            // vertex still sits along the top ring's straight edge.
            const offA = offs[r.index] || [0, 0];
            const offB = offs[(r.index + 1) % N] || [0, 0];
            const newOff: [number, number] = [
              offA[0] + (offB[0] - offA[0]) * r.t,
              offA[1] + (offB[1] - offA[1]) * r.t,
            ];
            const topA = poly.points[r.index];
            const topB = poly.points[(r.index + 1) % N];
            const newTopXZ: [number, number] = [
              topA[0] + (topB[0] - topA[0]) * r.t,
              topA[1] + (topB[1] - topA[1]) * r.t,
            ];
            const newTopH = (tH[r.index] || 0) + ((tH[(r.index + 1) % N] || 0) - (tH[r.index] || 0)) * r.t;
            return {
              source: "bottom" as const,
              index: r.index,
              local: newTopXZ,
              world: hit.point.toArray() as [number, number, number],
              newOffset: newOff,
              newTopHeight: newTopH,
              newBottomHeight: hY,
            };
          }

          if (key && key.startsWith("side_")) {
            const i = parseInt(key.slice(5), 10);
            // Project the hit onto side i's top edge to get the param t.
            const a = poly.points[i];
            const b = poly.points[(i + 1) % N];
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const len2 = dx * dx + dy * dy || 1e-6;
            const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
            const newTopXZ: [number, number] = [a[0] + dx * t, a[1] + dy * t];
            const offA = offs[i] || [0, 0];
            const offB = offs[(i + 1) % N] || [0, 0];
            const newOff: [number, number] = [
              offA[0] + (offB[0] - offA[0]) * t,
              offA[1] + (offB[1] - offA[1]) * t,
            ];
            const newTopH = (tH[i] || 0) + ((tH[(i + 1) % N] || 0) - (tH[i] || 0)) * t;
            const newBotH = (bH[i] || 0) + ((bH[(i + 1) % N] || 0) - (bH[i] || 0)) * t;
            return {
              source: "side" as const,
              index: i,
              local: newTopXZ,
              world: hit.point.toArray() as [number, number, number],
              newOffset: newOff,
              newTopHeight: newTopH,
              newBottomHeight: newBotH,
            };
          }

          // top cap / flat — existing behavior, but also derive the new
          // top height from the click's Y so dome-shaped tops can grow.
          const r = nearestOnRing(topRing, px, py);
          const newTopH = hY - (poly.extrude || 0);
          const offA = offs[r.index] || [0, 0];
          const offB = offs[(r.index + 1) % N] || [0, 0];
          const newOff: [number, number] = [
            offA[0] + (offB[0] - offA[0]) * r.t,
            offA[1] + (offB[1] - offA[1]) * r.t,
          ];
          const newBotH = (bH[r.index] || 0) + ((bH[(r.index + 1) % N] || 0) - (bH[r.index] || 0)) * r.t;
          return {
            source: "top" as const,
            index: r.index,
            local: [r.sx, r.sy] as [number, number],
            world: hit.point.toArray() as [number, number, number],
            newOffset: newOff,
            newTopHeight: newTopH,
            newBottomHeight: newBotH,
          };
        }
      }

      // Fallback to the original top-plane raycast (handles empty space
      // hovering — keeps the old UX working even when the cursor is off
      // the mesh).
      const planeY = (poly.extrude || 0) + 0.01;
      const origin = new THREE.Vector3(0, planeY, 0).applyMatrix4(objMatrix);
      const normal = new THREE.Vector3(0, 1, 0).transformDirection(objMatrix).normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
      const planeHit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, planeHit)) return null;
      const local = planeHit.clone().applyMatrix4(invObjMatrix);
      const r = nearestOnRing(topRing, local.x, -local.z);
      const offA = offs[r.index] || [0, 0];
      const offB = offs[(r.index + 1) % N] || [0, 0];
      return {
        source: "top" as const,
        index: r.index,
        local: [r.sx, r.sy] as [number, number],
        world: planeHit.toArray() as [number, number, number],
        newOffset: [
          offA[0] + (offB[0] - offA[0]) * r.t,
          offA[1] + (offB[1] - offA[1]) * r.t,
        ] as [number, number],
        newTopHeight: (tH[r.index] || 0) + ((tH[(r.index + 1) % N] || 0) - (tH[r.index] || 0)) * r.t,
        newBottomHeight: (bH[r.index] || 0) + ((bH[(r.index + 1) % N] || 0) - (bH[r.index] || 0)) * r.t,
      };
    };

    const onMove = (ev: PointerEvent) => {
      const r = computeInsertion(ev.clientX, ev.clientY);
      if (r) setHoverInsert({ index: r.index, local: r.local, world: r.world });
    };
    const onClick = (ev: MouseEvent) => {
      const r = computeInsertion(ev.clientX, ev.clientY);
      if (!r) return;
      ev.stopPropagation();
      ev.preventDefault();
      const at = r.index + 1;
      const nextPoints = [...poly.points];
      nextPoints.splice(at, 0, r.local);
      const N = poly.points.length;
      const padArr = (arr: number[] | undefined, fill = 0) => {
        const out = Array.from({ length: N }, (_, i) => arr?.[i] ?? fill);
        return out;
      };
      const padOffs = (arr: Array<[number, number]> | undefined) => {
        return Array.from({ length: N }, (_, i) => arr?.[i] ?? [0, 0]) as Array<[number, number]>;
      };
      const nextOffsets = padOffs(poly.bottomOffsets);
      nextOffsets.splice(at, 0, r.newOffset);
      const nextTopH = padArr(poly.pointHeights);
      nextTopH.splice(at, 0, r.newTopHeight);
      const nextBotH = padArr(poly.bottomHeights);
      nextBotH.splice(at, 0, r.newBottomHeight);
      if (onPatch) {
        onPatch({
          points: nextPoints as Array<[number, number]>,
          bottomOffsets: nextOffsets,
          pointHeights: nextTopH,
          bottomHeights: nextBotH,
        });
      } else {
        onChange(nextPoints as Array<[number, number]>);
      }
      onAddingPointHandled?.();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onAddingPointHandled?.();
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [addingPoint, gl, camera, r3fScene, poly.id, poly.points, poly.closed, poly.extrude, poly.bottomOffsets, poly.pointHeights, poly.bottomHeights, objMatrix, invObjMatrix, onChange, onPatch, onAddingPointHandled]);

  return (
    <group>
      {/* outline + handles (top ring) */}
      {topPoints.map((wp, i) => {
        const next = topPoints[(i + 1) % topPoints.length];
        const mid = wp.clone().add(next).multiplyScalar(0.5);
        // segment length in local units (matches the inspector point values)
        const a = poly.points[i];
        const b = poly.points[(i + 1) % poly.points.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return (
          <group key={`top-${i}`}>
            {/* draggable handle */}
            <mesh
              position={wp.toArray() as any}
              onPointerDown={(e) => {
                if (armedTopIndex === i && hasExtrude) {
                  beginIndependentTopDrag(i, e);
                } else {
                  beginDrag(i, "top", e);
                }
              }}
              onDoubleClick={(e: any) => {
                e.stopPropagation();
                if (hasExtrude) setArmedTopIndex(i);
              }}
              onContextMenu={(e: any) => {
                e.stopPropagation();
                e.nativeEvent?.preventDefault?.();
                if (poly.points.length > 3) {
                  onChange(poly.points.filter((_, j) => j !== i));
                }
              }}
              renderOrder={999}
            >
              <sphereGeometry args={[0.055, 16, 16]} />
              <meshBasicMaterial
                color={armedTopIndex === i ? "#22c55e" : "#facc15"}
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {armedTopIndex === i && (
              <mesh position={wp.toArray() as any} renderOrder={998}>
                <ringGeometry args={[0.09, 0.12, 24]} />
                <meshBasicMaterial
                  color="#22c55e"
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  transparent
                  opacity={0.9}
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}
            {/* point index label */}
            <Html position={wp.clone().add(new THREE.Vector3(0, 0.25, 0)).toArray() as any} center distanceFactor={8} zIndexRange={[100, 0]}>
              <div style={{
                background: "rgba(15,23,42,0.85)", color: "#facc15", padding: "1px 6px",
                borderRadius: 999, fontSize: 10, fontFamily: "ui-monospace, monospace",
                border: "1px solid #facc1555", whiteSpace: "nowrap", pointerEvents: "none",
              }}>
                P{i} · {a[0].toFixed(2)},{a[1].toFixed(2)}
              </div>
            </Html>
            {/* segment length label */}
            {(poly.closed || i < topPoints.length - 1) && (
              <Html position={mid.toArray() as any} center distanceFactor={8} zIndexRange={[100, 0]}>
                <div style={{
                  background: "rgba(15,23,42,0.85)", color: "#67e8f9", padding: "1px 6px",
                  borderRadius: 4, fontSize: 10, fontFamily: "ui-monospace, monospace",
                  border: "1px solid #67e8f955", whiteSpace: "nowrap", pointerEvents: "none",
                }}>
                  {len.toFixed(2)}
                </div>
              </Html>
            )}
          </group>
        );
      })}
      {/* bottom ring handles (only meaningful when extruded) */}
      {hasExtrude &&
        bottomPoints.map((wp, i) => (
          <group key={`bot-${i}`}>
            <mesh
              position={wp.toArray() as any}
              onPointerDown={(e) => {
                if (armedOffsetIndex === i) {
                  beginOffsetDrag(i, e);
                } else {
                  beginDrag(i, "bottom", e);
                }
              }}
              onDoubleClick={(e: any) => {
                e.stopPropagation();
                setArmedOffsetIndex(i);
              }}
              onContextMenu={(e: any) => {
                e.stopPropagation();
                e.nativeEvent?.preventDefault?.();
                // Right-click on an armed/offset handle clears its offset;
                // otherwise removes the spline point entirely.
                const o = poly.bottomOffsets?.[i];
                if (o && (Math.abs(o[0]) > 1e-6 || Math.abs(o[1]) > 1e-6)) {
                  const next = poly.points.map((_, j) =>
                    j === i ? [0, 0] : (poly.bottomOffsets?.[j] || [0, 0]),
                  ) as Array<[number, number]>;
                  onOffsetsChange?.(next);
                  setArmedOffsetIndex(null);
                  return;
                }
                if (poly.points.length > 3) {
                  onChange(poly.points.filter((_, j) => j !== i));
                }
              }}
              renderOrder={999}
            >
              <sphereGeometry args={[0.045, 14, 14]} />
              <meshBasicMaterial
                color={armedOffsetIndex === i ? "#22c55e" : "#f97316"}
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {armedOffsetIndex === i && (
              <mesh position={wp.toArray() as any} renderOrder={998}>
                <ringGeometry args={[0.08, 0.11, 24]} />
                <meshBasicMaterial
                  color="#22c55e"
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  transparent
                  opacity={0.9}
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}
          </group>
        ))}
      {/* edge lines: top ring, bottom ring, and verticals connecting them */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(g) => {
            const verts: number[] = [];
            // top ring
            for (let i = 0; i < topPoints.length; i++) {
              const a = topPoints[i];
              const b = topPoints[(i + 1) % topPoints.length];
              if (!poly.closed && i === topPoints.length - 1) continue;
              verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
            }
            if (hasExtrude) {
              // bottom ring
              for (let i = 0; i < bottomPoints.length; i++) {
                const a = bottomPoints[i];
                const b = bottomPoints[(i + 1) % bottomPoints.length];
                if (!poly.closed && i === bottomPoints.length - 1) continue;
                verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
              }
              // verticals
              for (let i = 0; i < topPoints.length; i++) {
                const t = topPoints[i];
                const b = bottomPoints[i];
                verts.push(t.x, t.y, t.z, b.x, b.y, b.z);
              }
            }
            g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
          }}
        />
        <lineBasicMaterial attach="material" color="#facc15" depthTest={false} transparent opacity={0.9} />
      </line>
      {/* hover ghost handle in add-point mode */}
      {addingPoint && hoverInsert && (() => {
        // Prefer the real world hit (works for top/bottom/side faces),
        // and fall back to the top-plane projection for empty-space hovers.
        const wp = hoverInsert.world
          ? new THREE.Vector3(...hoverInsert.world)
          : new THREE.Vector3(
              hoverInsert.local[0],
              (poly.extrude || 0) + 0.02,
              -hoverInsert.local[1],
            ).applyMatrix4(objMatrix);
        return (
          <mesh position={wp.toArray() as any} renderOrder={1000}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshBasicMaterial color="#22c55e" depthTest={false} depthWrite={false} toneMapped={false} transparent opacity={0.9} />
          </mesh>
        );
      })()}
    </group>
  );
}

function FocusController({
  target,
  groupRef,
  controlsRef,
  onDone,
}: {
  target?: { id: string; nonce: number } | null;
  groupRef: React.RefObject<THREE.Group>;
  controlsRef?: React.MutableRefObject<any>;
  onDone?: () => void;
}) {
  const { camera } = useThree();
  const animRef = useRef<{
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    if (!target || !groupRef.current) return;
    const obj = groupRef.current.getObjectByName(`obj-${target.id}`);
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
    const fov = ((camera as THREE.PerspectiveCamera).fov ?? 50) * (Math.PI / 180);
    const distance = (radius / Math.tan(fov / 2)) * 1.8 + radius;
    // Keep current viewing direction; just slide along it to the new framing
    const ctrls = controlsRef?.current;
    const currentTarget = ctrls?.target
      ? ctrls.target.clone()
      : new THREE.Vector3(0, 0, 0);
    const dir = camera.position.clone().sub(currentTarget);
    if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1);
    dir.normalize();
    const toPos = center.clone().add(dir.multiplyScalar(distance));
    animRef.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: currentTarget,
      toTarget: center.clone(),
      t: 0,
      duration: 0.6,
    };
  }, [target?.id, target?.nonce, camera, groupRef, controlsRef]);

  useFrame((_, dt) => {
    const a = animRef.current;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / a.duration);
    // ease-in-out cubic
    const k = a.t < 0.5 ? 4 * a.t * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 3) / 2;
    camera.position.lerpVectors(a.fromPos, a.toPos, k);
    const ctrls = controlsRef?.current;
    if (ctrls?.target) {
      ctrls.target.lerpVectors(a.fromTarget, a.toTarget, k);
      ctrls.update?.();
    }
    camera.lookAt(ctrls?.target ?? a.toTarget);
    if (a.t >= 1) {
      animRef.current = null;
      onDone?.();
    }
  });

  return null;
}