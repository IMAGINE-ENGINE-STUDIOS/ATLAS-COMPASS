/**
 * MeshEditorCanvas
 * ----------------
 * R3F canvas that loads a GLB from a Blob/ArrayBuffer/URL, exposes the
 * loaded scene root back to the parent, and supports:
 *   • Per-mesh visibility toggling (via `hiddenMeshes` prop)
 *   • Per-mesh material overrides (base color, metalness, roughness,
 *     emissive, opacity)
 *   • Face painting — hover-drag paints vertex colors on the picked
 *     triangle when `paintActive` is on.
 *
 * The parent (MeshEditorModal) owns all edit state; the canvas mutates
 * the underlying `THREE.Object3D` tree so exporting via GLTFExporter
 * bakes the edits into the emitted GLB.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Environment, Grid, Bounds } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface MaterialOverride {
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}

interface Props {
  source: Blob | ArrayBuffer | string;
  hiddenMeshes: Set<string>;
  overrides: Record<string, MaterialOverride>;
  paintActive: boolean;
  paintColor: string;
  environmentPreset: "studio" | "sunset" | "warehouse" | "city" | "dawn" | "night";
  showGrid: boolean;
  onSceneReady: (root: THREE.Object3D, meshes: { name: string; uuid: string }[]) => void;
}

function LoadedModel({
  source, hiddenMeshes, overrides, paintActive, paintColor, onSceneReady,
}: Omit<Props, "environmentPreset" | "showGrid">) {
  const [root, setRoot] = useState<THREE.Object3D | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const originalMats = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());

  // Load GLB from any of the supported source shapes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let buf: ArrayBuffer;
      if (source instanceof Blob) buf = await source.arrayBuffer();
      else if (source instanceof ArrayBuffer) buf = source;
      else {
        const r = await fetch(source);
        buf = await r.arrayBuffer();
      }
      if (cancelled) return;
      const loader = new GLTFLoader();
      loader.parse(buf, "", (gltf) => {
        if (cancelled) return;
        const scene = gltf.scene;
        // Cache originals so an override toggle-off can restore.
        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            originalMats.current.set(m.uuid, m.material);
          }
        });
        setRoot(scene);
        // Enumerate meshes for the panel list.
        const meshList: { name: string; uuid: string }[] = [];
        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            meshList.push({ name: obj.name || `Mesh ${meshList.length + 1}`, uuid: obj.uuid });
          }
        });
        onSceneReady(scene, meshList);
      }, (err) => {
        console.warn("[MeshEditorCanvas] GLB parse failed", err);
      });
    })();
    return () => { cancelled = true; };
  }, [source, onSceneReady]);

  // Apply visibility + material overrides whenever they change.
  useEffect(() => {
    if (!root) return;
    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const m = obj as THREE.Mesh;
      m.visible = !hiddenMeshes.has(m.uuid);
      const ov = overrides[m.uuid];
      if (!ov) return;
      const applyTo = (mat: THREE.Material) => {
        const std = mat as THREE.MeshStandardMaterial;
        if (ov.color !== undefined && std.color) std.color = new THREE.Color(ov.color);
        if (ov.metalness !== undefined && "metalness" in std) std.metalness = ov.metalness;
        if (ov.roughness !== undefined && "roughness" in std) std.roughness = ov.roughness;
        if (ov.emissive !== undefined && std.emissive) std.emissive = new THREE.Color(ov.emissive);
        if (ov.emissiveIntensity !== undefined) std.emissiveIntensity = ov.emissiveIntensity;
        if (ov.opacity !== undefined) {
          std.opacity = ov.opacity;
          std.transparent = ov.opacity < 1;
        }
        std.needsUpdate = true;
      };
      if (Array.isArray(m.material)) m.material.forEach(applyTo);
      else if (m.material) applyTo(m.material);
    });
  }, [root, hiddenMeshes, overrides]);

  // Face-painting: on pointer-move with paintActive, paint vertex colors
  // on the picked triangle of the hit mesh.
  const painting = useRef(false);
  const paintFace = (e: ThreeEvent<PointerEvent>) => {
    if (!paintActive || !painting.current) return;
    const mesh = e.object as THREE.Mesh;
    if (!mesh.isMesh || !e.face) return;
    const geom = mesh.geometry as THREE.BufferGeometry;
    let colorAttr = geom.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!colorAttr) {
      const count = (geom.getAttribute("position") as THREE.BufferAttribute).count;
      const arr = new Float32Array(count * 3).fill(1);
      colorAttr = new THREE.BufferAttribute(arr, 3);
      geom.setAttribute("color", colorAttr);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat && "vertexColors" in mat) {
        mat.vertexColors = true;
        mat.needsUpdate = true;
      }
    }
    const c = new THREE.Color(paintColor);
    const idxs = [e.face.a, e.face.b, e.face.c];
    for (const i of idxs) {
      colorAttr.setXYZ(i, c.r, c.g, c.b);
    }
    colorAttr.needsUpdate = true;
  };

  if (!root) return null;
  return (
    <group
      ref={groupRef}
      onPointerDown={(e) => { if (paintActive) { painting.current = true; paintFace(e); } }}
      onPointerUp={() => { painting.current = false; }}
      onPointerMove={paintFace}
    >
      <primitive object={root} />
    </group>
  );
}

function AutoFrame({ trigger }: { trigger: unknown }) {
  // Sentinel that just re-fits the bounds when the child model swaps.
  useThree();
  void trigger;
  return null;
}

export default function MeshEditorCanvas({
  source, hiddenMeshes, overrides, paintActive, paintColor,
  environmentPreset, showGrid, onSceneReady,
}: Props) {
  const key = useMemo(() => Math.random().toString(36).slice(2), [source]);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [3, 2.4, 3], fov: 45, near: 0.01, far: 5000 }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <color attach="background" args={["#08090c"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} castShadow />
      <Suspense fallback={null}>
        <Environment preset={environmentPreset} background={false} />
      </Suspense>
      {showGrid && (
        <Grid
          args={[40, 40]}
          cellSize={0.5}
          cellThickness={0.6}
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#3f8fbf"
          cellColor="#233043"
          fadeDistance={40}
          infiniteGrid
          position={[0, -0.001, 0]}
        />
      )}
      <Bounds fit clip observe margin={1.3} key={key}>
        <LoadedModel
          source={source}
          hiddenMeshes={hiddenMeshes}
          overrides={overrides}
          paintActive={paintActive}
          paintColor={paintColor}
          onSceneReady={onSceneReady}
        />
      </Bounds>
      <AutoFrame trigger={source} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.05}
        maxDistance={2000}
        enabled={!paintActive}
      />
    </Canvas>
  );
}