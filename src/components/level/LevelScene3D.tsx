import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, useGLTF, Environment, Html, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type {
  LevelScene,
  SceneObject,
  PolygonObject,
  PrimitiveObject,
  ModelObject,
  SceneLight,
  AnimationTrack,
  SceneTerrain,
} from "@/lib/levelTypes";

/* ---------- helpers ---------- */

function rgbaToColor([r, g, b]: [number, number, number, number]) {
  return new THREE.Color(r, g, b);
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

  return (
    <mesh
      visible={obj.visible}
      geometry={geom}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(obj.id);
      }}
    >
      <meshStandardMaterial
        color={rgbaToColor(obj.color)}
        metalness={obj.metalness}
        roughness={obj.roughness}
        transparent={obj.color[3] < 1}
        opacity={obj.color[3]}
        emissive={selected ? new THREE.Color("#3b82f6") : new THREE.Color(0, 0, 0)}
        emissiveIntensity={selected ? 0.4 : 0}
        side={obj.shape === "plane" ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
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
  const { geometry, materials } = useMemo(() => {
    const shape = new THREE.Shape(
      obj.points.length
        ? obj.points.map(([x, z]) => new THREE.Vector2(x, z))
        : [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(0, 0.5)],
    );
    const hasOffset =
      obj.extrude > 0 &&
      !!obj.bottomOffsets &&
      obj.bottomOffsets.some(
        (o) => o && (Math.abs(o[0]) > 1e-6 || Math.abs(o[1]) > 1e-6),
      );
    let geom: THREE.BufferGeometry;
    if (hasOffset) {
      // Custom prism: top ring uses poly.points; bottom ring uses
      // (x + ox, z + oz) per index. Triangulate the (top) contour and
      // reuse the same triangle list (flipped) for the bottom cap; build
      // quad sides between corresponding indices.
      const N = obj.points.length;
      const top = obj.points;
      const offs = obj.bottomOffsets || [];
      const positions: number[] = [];
      // Coordinate space matches the rotated default geometry below:
      // shape (x, z) -> world-local (x, y, -z).
      for (let i = 0; i < N; i++) {
        const [x, z] = top[i];
        positions.push(x, obj.extrude, -z);
      }
      for (let i = 0; i < N; i++) {
        const [x, z] = top[i];
        const [ox, oz] = offs[i] || [0, 0];
        positions.push(x + ox, 0, -(z + oz));
      }
      const contour2D = top.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour2D, []);
      const indices: number[] = [];
      // top cap
      for (const t of tris) indices.push(t[0], t[1], t[2]);
      // bottom cap (reverse winding, offset by N)
      for (const t of tris) indices.push(N + t[0], N + t[2], N + t[1]);
      const sideStart = indices.length;
      // sides — quad per edge
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        indices.push(i, j, N + j);
        indices.push(i, N + j, N + i);
      }
      geom = new THREE.BufferGeometry();
      geom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geom.setIndex(indices);
      geom.addGroup(0, sideStart, 0);
      geom.addGroup(sideStart, indices.length - sideStart, 1);
      geom.computeVertexNormals();
    } else {
      geom =
        obj.extrude > 0
          ? new THREE.ExtrudeGeometry(shape, {
              depth: obj.extrude,
              bevelEnabled: obj.bevel > 0,
              bevelSize: obj.bevel,
              bevelThickness: obj.bevel,
              bevelSegments: 2,
            })
          : new THREE.ShapeGeometry(shape);
      geom.rotateX(-Math.PI / 2); // make spline lay on XZ plane
      geom.computeVertexNormals();
    }

    // Two material groups: 0 = caps (top/bottom), 1 = sides
    if (obj.extrude > 0) {
      // ExtrudeGeometry groups: 0 = front (caps), 1 = sides
      const mats = [
        new THREE.MeshStandardMaterial({
          color: rgbaToColor(obj.topColor),
          side: THREE.DoubleSide,
          metalness: 0.1,
          roughness: 0.7,
        }),
        new THREE.MeshStandardMaterial({
          color: rgbaToColor(obj.sideColor),
          side: THREE.DoubleSide,
          metalness: 0.1,
          roughness: 0.8,
        }),
      ];
      return { geometry: geom, materials: mats };
    }
    return {
      geometry: geom,
      materials: [
        new THREE.MeshStandardMaterial({
          color: rgbaToColor(obj.fillColor),
          side: THREE.DoubleSide,
          metalness: 0.1,
          roughness: 0.8,
        }),
      ],
    };
  }, [obj.points, obj.bottomOffsets, obj.extrude, obj.bevel, obj.fillColor, obj.sideColor, obj.topColor]);

  return (
    <mesh
      visible={obj.visible}
      geometry={geometry}
      material={materials}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(obj.id);
      }}
    >
      {selected && (
        <meshBasicMaterial color="#3b82f6" wireframe attach="material-2" />
      )}
    </mesh>
  );
}

function GLTFModelMesh({ obj, onSelect }: { obj: ModelObject; onSelect?: (id: string) => void }) {
  const gltf = useGLTF(obj.url);
  return (
    <primitive
      object={gltf.scene.clone()}
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
  const color = rgbaToColor(terrain.color);
  const material = (
    <meshStandardMaterial
      color={color}
      wireframe={terrain.wireframe}
      transparent={terrain.color[3] < 1}
      opacity={terrain.color[3]}
      metalness={0.05}
      roughness={0.95}
      side={THREE.DoubleSide}
    />
  );
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
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          userData={{ isTerrain: true }}
        >
          <planeGeometry args={[sx, sz, Math.max(1, Math.round(sx)), Math.max(1, Math.round(sz))]} />
          {material}
        </mesh>
      ) : terrain.shape === "box" ? (
        <mesh receiveShadow userData={{ isTerrain: true }} position={[0, -sy / 2, 0]}>
          <boxGeometry args={[sx, sy, sz]} />
          {material}
        </mesh>
      ) : (
        <mesh receiveShadow userData={{ isTerrain: true }}>
          <sphereGeometry args={[sx / 2, 48, 32]} />
          {material}
        </mesh>
      )}
    </group>
  );
}

function RenderObject({
  obj,
  selectedId,
  onSelect,
  onFocus,
}: {
  obj: SceneObject;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onFocus?: (id: string) => void;
}) {
  const selected = selectedId === obj.id;
  if (obj.kind === "primitive") return <PrimitiveMesh obj={obj} selected={selected} onSelect={onSelect} />;
  if (obj.kind === "polygon") return <PolygonMesh obj={obj} selected={selected} onSelect={onSelect} />;
  if (obj.kind === "model") return <GLTFModelMesh obj={obj} onSelect={onSelect} />;
  return null;
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
  transformMode,
  onObjectTransform,
  snap,
  selectedLightId,
  onSelectLight,
  addingPolygonPoint,
  onAddingPointHandled,
}: LevelSceneProps & {
  focusRequest?: { id: string; nonce: number } | null;
  onFocusHandled?: () => void;
  controlsRef?: React.MutableRefObject<any>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  // Pick a sensible focus action for double-click — set focus request from parent
  const handleFocus = (id: string) => onSelect?.(id);
  return (
    <>
      <color attach="background" args={[scene.environment.background]} />
      {!skipAmbient && <ambientLight intensity={scene.environment.ambient} />}
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
          <group
            key={o.id}
            name={`obj-${o.id}`}
            position={o.position}
            rotation={o.rotation as any}
            scale={o.scale}
            onDoubleClick={(e) => {
              e.stopPropagation();
              (e as any).nativeEvent?.preventDefault?.();
              // ask parent (Canvas wrapper) to focus this object
              (window as any).__levelFocusObject?.(o.id);
            }}
          >
            <RenderObject obj={o} selectedId={selectedId} onSelect={onSelect ? (id) => onSelect(id) : undefined} />
          </group>
        ))}
      </group>
      <AnimationRunner tracks={scene.animations} playing={!!playing} groupRef={groupRef} />
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
            addingPoint={!!addingPolygonPoint}
            onAddingPointHandled={onAddingPointHandled}
          />
        );
      })()}
    </>
  );
}

/**
 * Standalone editor canvas (with controls + grid). Used by the LEVEL editor page.
 */
export default function LevelScene3D(
  props: LevelSceneProps & { className?: string }
) {
  const { className, ...rest } = props;
  const controlsRef = useRef<any>(null);
  const [focusReq, setFocusReq] = useState<{ id: string; nonce: number } | null>(null);
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
      className={className}
      shadows
      camera={{ position: [6, 6, 8], fov: 50 }}
      onPointerMissed={() => rest.onSelect?.(null)}
    >
      <Suspense fallback={null}>
        <LevelSceneContents
          {...rest}
          focusRequest={focusReq}
          onFocusHandled={() => setFocusReq(null)}
          controlsRef={controlsRef}
        />
        <Environment preset="city" />
      </Suspense>
      <OrbitControls ref={controlsRef} makeDefault enableDamping />
    </Canvas>
  );
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
  addingPoint,
  onAddingPointHandled,
}: {
  poly: PolygonObject;
  controlsRef?: React.MutableRefObject<any>;
  onChange: (pts: Array<[number, number]>) => void;
  onOffsetsChange?: (offsets: Array<[number, number]>) => void;
  addingPoint?: boolean;
  onAddingPointHandled?: () => void;
}) {
  const { camera, gl } = useThree();
  // Index of the bottom (orange) handle currently armed for offset drag
  // via double-click. Cleared on pointer-up or Escape.
  const [armedOffsetIndex, setArmedOffsetIndex] = useState<number | null>(null);
  // Hover preview for add-point-on-edge mode: insertion index + local 2D coord.
  const [hoverInsert, setHoverInsert] = useState<{
    index: number; // insert AFTER this segment start index
    local: [number, number]; // shape-space (lx, lz_shape) — same units as poly.points
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
      poly.points.map(([x, z]) =>
        new THREE.Vector3(x, (poly.extrude || 0) + 0.01, -z).applyMatrix4(objMatrix),
      ),
    [poly.points, poly.extrude, objMatrix],
  );
  const bottomPoints = useMemo(
    () =>
      poly.points.map(([x, z], i) => {
        const o = poly.bottomOffsets?.[i] || [0, 0];
        return new THREE.Vector3(x + o[0], -0.01, -(z + o[1])).applyMatrix4(objMatrix);
      }),
    [poly.points, poly.bottomOffsets, objMatrix],
  );
  const hasExtrude = (poly.extrude || 0) > 0.001;

  // Disarm offset mode when the polygon being edited changes.
  useEffect(() => {
    setArmedOffsetIndex(null);
  }, [poly.id]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setArmedOffsetIndex(null);
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

  const beginDrag = (index: number, ring: "top" | "bottom", e: any) => {
    e.stopPropagation();
    if (controlsRef?.current) controlsRef.current.enabled = false;
    // Drag plane sits at the handle's face so the cursor stays under it.
    const planeY = ring === "top" ? (poly.extrude || 0) + 0.01 : -0.01;
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
    const planeY = (poly.extrude || 0) + 0.01;
    const origin = new THREE.Vector3(0, planeY, 0).applyMatrix4(objMatrix);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(objMatrix).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const computeNearest = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      const local = hit.clone().applyMatrix4(invObjMatrix);
      // shape coords: lx = local.x, ly = -local.z
      const px = local.x, py = -local.z;
      const segCount = poly.closed ? poly.points.length : poly.points.length - 1;
      let best = { dist: Infinity, index: 0, point: [px, py] as [number, number] };
      for (let i = 0; i < segCount; i++) {
        const a = poly.points[i];
        const b = poly.points[(i + 1) % poly.points.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy || 1e-6;
        const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
        const sx = a[0] + dx * t, sy = a[1] + dy * t;
        const d = Math.hypot(px - sx, py - sy);
        if (d < best.dist) best = { dist: d, index: i, point: [sx, sy] };
      }
      return best;
    };

    const onMove = (ev: PointerEvent) => {
      const r = computeNearest(ev.clientX, ev.clientY);
      if (r) setHoverInsert({ index: r.index, local: r.point });
    };
    const onClick = (ev: MouseEvent) => {
      const r = computeNearest(ev.clientX, ev.clientY);
      if (!r) return;
      ev.stopPropagation();
      ev.preventDefault();
      const next = [...poly.points];
      next.splice(r.index + 1, 0, r.point);
      onChange(next as Array<[number, number]>);
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
  }, [addingPoint, gl, camera, poly.points, poly.closed, poly.extrude, objMatrix, invObjMatrix, onChange, onAddingPointHandled]);

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
              onPointerDown={(e) => beginDrag(i, "top", e)}
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
              <meshBasicMaterial color="#facc15" depthTest={false} depthWrite={false} toneMapped={false} />
            </mesh>
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
        const wp = new THREE.Vector3(
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