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
    const geom =
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
  }, [obj.points, obj.extrude, obj.bevel, obj.fillColor, obj.sideColor, obj.topColor]);

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
  transformMode?: "translate" | "rotate" | "scale" | null;
  onObjectTransform?: (
    id: string,
    t: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] },
  ) => void;
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
  transformMode,
  onObjectTransform,
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
      {showGrid && (
        <Grid
          args={[40, 40]}
          cellColor="#1f2937"
          sectionColor="#3b82f6"
          fadeDistance={50}
          infiniteGrid
          position={[0, 0, 0]}
        />
      )}
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
  onCommit,
}: {
  targetId: string;
  mode: "translate" | "rotate" | "scale";
  groupRef: React.RefObject<THREE.Group>;
  controlsRef?: React.MutableRefObject<any>;
  onCommit: (t: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  }) => void;
}) {
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    // Find the group named obj-<id> after render
    const t = groupRef.current?.getObjectByName(`obj-${targetId}`) ?? null;
    setTarget(t);
  }, [targetId, groupRef]);

  if (!target) return null;
  return (
    <TransformControls
      object={target as any}
      mode={mode}
      size={0.8}
      onMouseDown={() => {
        if (controlsRef?.current) controlsRef.current.enabled = false;
      }}
      onMouseUp={() => {
        if (controlsRef?.current) controlsRef.current.enabled = true;
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
}: {
  poly: PolygonObject;
  controlsRef?: React.MutableRefObject<any>;
  onChange: (pts: Array<[number, number]>) => void;
}) {
  const { camera, gl } = useThree();
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

  const worldPoints = useMemo(
    () =>
      poly.points.map(([x, z]) =>
        // Geometry has rotateX(-PI/2) applied, which maps shape vertex
        // (sx, sy, 0) -> world-local (sx, 0, -sy). The top face of the
        // extrusion sits at y = extrude, so lift handles to the top so
        // they're visible on the corners of the box (with a tiny epsilon).
        new THREE.Vector3(x, (poly.extrude || 0) + 0.01, -z).applyMatrix4(objMatrix),
      ),
    [poly.points, poly.extrude, objMatrix],
  );

  const beginDrag = (index: number, e: any) => {
    e.stopPropagation();
    if (controlsRef?.current) controlsRef.current.enabled = false;
    // Plane passes through the TOP face of the extrusion (matching handle Y)
    const origin = new THREE.Vector3(0, (poly.extrude || 0) + 0.01, 0).applyMatrix4(objMatrix);
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

  return (
    <group>
      {/* outline + handles */}
      {worldPoints.map((wp, i) => {
        const next = worldPoints[(i + 1) % worldPoints.length];
        const mid = wp.clone().add(next).multiplyScalar(0.5);
        // segment length in local units (matches the inspector point values)
        const a = poly.points[i];
        const b = poly.points[(i + 1) % poly.points.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return (
          <group key={i}>
            {/* draggable handle */}
            <mesh
              position={wp.toArray() as any}
              onPointerDown={(e) => beginDrag(i, e)}
              renderOrder={999}
            >
              <sphereGeometry args={[0.16, 20, 20]} />
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
            {(poly.closed || i < worldPoints.length - 1) && (
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
      {/* edge lines */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(g) => {
            const verts: number[] = [];
            for (let i = 0; i < worldPoints.length; i++) {
              const a = worldPoints[i];
              const b = worldPoints[(i + 1) % worldPoints.length];
              if (!poly.closed && i === worldPoints.length - 1) continue;
              verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
            }
            g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
          }}
        />
        <lineBasicMaterial attach="material" color="#facc15" depthTest={false} transparent opacity={0.9} />
      </line>
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