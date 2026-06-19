import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  cancelTeleportPick,
  isTeleportPickActive,
  resolveTeleportPick,
  subscribeTeleportPick,
} from "@/components/level/teleportPicker";

/**
 * When a teleport pick is requested, this overlay raycasts the scene at the
 * cursor and renders a glowing gold marker at the hovered point. Clicking
 * resolves with the hit point (and object id if a named object was hit).
 */
export default function TeleportPickerOverlay({
  groupRef,
}: {
  groupRef: React.MutableRefObject<THREE.Group | null>;
}) {
  const { camera, gl, scene } = useThree();
  const [active, setActive] = useState(isTeleportPickActive());
  const [hit, setHit] = useState<{
    p: [number, number, number];
    name?: string;
  } | null>(null);
  const hitRef = useRef<typeof hit>(null);
  hitRef.current = hit;

  useEffect(() => subscribeTeleportPick(setActive), []);

  useEffect(() => {
    if (!active) {
      setHit(null);
      return;
    }
    const canvas = gl.domElement;
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(0);
    const ndc = new THREE.Vector2();

    const findOwner = (o: THREE.Object3D | null): THREE.Object3D | null => {
      let cur: THREE.Object3D | null = o;
      while (cur) {
        const ud = cur.userData as any;
        if (ud?.__objId || (cur.name && cur.name.startsWith("obj-"))) return cur;
        cur = cur.parent;
      }
      return null;
    };

    const pick = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      // Prefer hitting scene objects + terrain; fall back to the y=0 ground plane.
      const targets: THREE.Object3D[] = [];
      const terrain = scene.getObjectByName("__terrain_plane");
      if (terrain) targets.push(terrain);
      if (groupRef.current) targets.push(groupRef.current);
      const hits = raycaster.intersectObjects(targets, true);
      const first = hits.find(
        (h) => !(h.object.userData as any)?.__teleportMarker,
      );
      if (first) {
        const owner = findOwner(first.object);
        const ud = (owner?.userData as any) ?? {};
        const id: string | undefined =
          ud.__objId ??
          (owner?.name?.startsWith("obj-") ? owner.name.slice(4) : undefined);
        const name = id ? `Object ${id.slice(0, 6)}` : undefined;
        return {
          p: [first.point.x, first.point.y, first.point.z] as [number, number, number],
          id,
          name,
        };
      }
      // Ground plane fallback at y=0.
      const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const out = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(ground, out)) {
        return { p: [out.x, out.y, out.z] as [number, number, number] };
      }
      return null;
    };

    const onMove = (ev: PointerEvent) => {
      const r = pick(ev);
      setHit(r ? { p: r.p, name: r.name } : null);
    };
    const onClick = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const r = pick(ev);
      if (!r) return;
      ev.preventDefault();
      ev.stopPropagation();
      resolveTeleportPick({ point: r.p, objectId: r.id });
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cancelTeleportPick();
    };
    canvas.addEventListener("pointermove", onMove);
    // capture-phase click so we beat OrbitControls / object onClick
    canvas.addEventListener("pointerdown", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      canvas.style.cursor = prevCursor;
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, camera, gl, scene, groupRef]);

  if (!active) return null;

  return (
    <>
      {hit && (
        <group position={hit.p}>
          {/* glowing gold disc on the ground */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.02, 0]}
            userData={{ __teleportMarker: true, __nocast: true }}
          >
            <ringGeometry args={[0.55, 0.85, 48]} />
            <meshBasicMaterial
              color="#ffcf3a"
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.025, 0]}
            userData={{ __teleportMarker: true, __nocast: true }}
          >
            <circleGeometry args={[0.55, 48]} />
            <meshBasicMaterial
              color="#ffd76a"
              transparent
              opacity={0.22}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* warm gold point light */}
          <pointLight
            color="#ffc14d"
            intensity={6}
            distance={6}
            decay={2}
            position={[0, 1.2, 0]}
          />
          {/* vertical beam */}
          <mesh
            position={[0, 1.5, 0]}
            userData={{ __teleportMarker: true, __nocast: true }}
          >
            <cylinderGeometry args={[0.06, 0.06, 3, 16, 1, true]} />
            <meshBasicMaterial
              color="#ffd76a"
              transparent
              opacity={0.35}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      )}
      <Html
        fullscreen
        prepend
        zIndexRange={[100, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div className="absolute inset-x-0 top-3 flex justify-center">
          <div className="px-3 py-1.5 rounded-full bg-black/70 border border-amber-300/40 backdrop-blur text-[11px] text-amber-200 shadow-lg">
            <span className="font-medium">Pick teleport destination</span>
            <span className="opacity-70 ml-2">
              click on the ground or an object · Esc to cancel
              {hit?.name ? ` · ${hit.name}` : ""}
            </span>
          </div>
        </div>
      </Html>
    </>
  );
}