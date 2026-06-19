import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  TransformControls,
  useGLTF,
  Grid,
  Environment,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { GLTFLoader } from "three-stdlib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_CHARACTER_URL } from "@/lib/levelTypes";
import { Wand2, RotateCcw, Move, Scaling, RefreshCw, Upload, Play, Pause, Send, Users, Save, Trash2, Camera, Maximize2, Search, ChevronRight, ChevronDown, Bone as BoneIcon } from "lucide-react";
import { toast } from "sonner";
import {
  listRigSaves,
  saveRig,
  deleteRigSave,
  capturePose,
  applyPose,
  getCachedRigSaves,
  type RigSave,
  type BonePose,
} from "@/lib/rigSaves";

/** Imperative bridge between <Rig/> and the parent panel. */
interface RigBridge {
  root: THREE.Object3D | null;
  snapshot: (() => string | null) | null;
  /**
   * Topology editing — implemented inside <Rig/> (where the live cloned
   * skeleton lives) and called by the surrounding sidebar UI.
   */
  addBoneAt: ((parentName: string, worldPoint: THREE.Vector3) => string | null) | null;
  /**
   * One-shot bone insertion that snaps the new joint onto the spine spline
   * (the line that connects the selected bone to its parent — or to its
   * first child if the selection is the root). Returns the new bone name
   * so the caller can select it immediately.
   */
  addBoneOnSpline: ((parentName: string) => string | null) | null;
  deleteBone: ((name: string) => boolean) | null;
  /**
   * Restore the rig to its authored bind pose AND strip every bone the
   * user added at runtime (anything tagged with userData.__custom).
   */
  resetSkeleton: (() => void) | null;
  /**
   * Skin (mesh) management. A "skin" is one or more SkinnedMeshes loaded
   * from a .glb / .gltf file and re-bound to the CURRENT skeleton by
   * matching bone names. The original skeleton inside the uploaded file
   * is discarded — only its meshes are kept.
   */
  addSkin: ((data: ArrayBuffer, label: string) => Promise<SkinEntry | null>) | null;
  removeSkin: ((id: string) => void) | null;
  setSkinVisible: ((id: string, visible: boolean) => void) | null;
}

export interface SkinEntry {
  id: string;
  label: string;
  meshCount: number;
  visible: boolean;
}

/**
 * Curated free / open-licensed rigged characters. All URLs are public CDN
 * sources (three.js examples + Khronos glTF Sample Models, both CC0 / CC-BY).
 * Loading any of these populates the rig + clip list the same way an upload
 * would.
 */
interface LibraryCharacter {
  id: string;
  name: string;
  category: "Human" | "Creature" | "Robot";
  url: string;
  credit: string;
  /** Real-world height in meters used to normalize the loaded model. */
  realHeight: number;
}

const KHRONOS =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";
const THREE_EX = "https://threejs.org/examples/models/gltf";

const CHARACTER_LIBRARY: LibraryCharacter[] = [
  // Humans
  { id: "xbot",        name: "Xbot",          category: "Human",    url: `${THREE_EX}/Xbot.glb`,                                  credit: "three.js / Mixamo", realHeight: 1.8 },
  { id: "soldier",     name: "Soldier",       category: "Human",    url: `${THREE_EX}/Soldier.glb`,                               credit: "three.js / Mixamo", realHeight: 1.8 },
  { id: "michelle",    name: "Michelle",      category: "Human",    url: `${THREE_EX}/Michelle.glb`,                              credit: "three.js / Mixamo", realHeight: 1.7 },
  { id: "cesium-man",  name: "Cesium Man",    category: "Human",    url: `${KHRONOS}/CesiumMan/glTF-Binary/CesiumMan.glb`,         credit: "Khronos (CC-BY)", realHeight: 1.8 },
  { id: "rigged-fig",  name: "Rigged Figure", category: "Human",    url: `${KHRONOS}/RiggedFigure/glTF-Binary/RiggedFigure.glb`,   credit: "Khronos (CC0)",  realHeight: 1.8 },
  // Creatures — heights are real-world averages in meters.
  { id: "fox",         name: "Fox",           category: "Creature", url: `${KHRONOS}/Fox/glTF-Binary/Fox.glb`,                     credit: "Khronos (CC0)",  realHeight: 0.5 },
  { id: "brainstem",   name: "BrainStem",     category: "Creature", url: `${KHRONOS}/BrainStem/glTF-Binary/BrainStem.glb`,         credit: "Khronos (CC-BY)", realHeight: 1.0 },
  { id: "flamingo",    name: "Flamingo",      category: "Creature", url: `${THREE_EX}/Flamingo.glb`,                              credit: "three.js",        realHeight: 1.2 },
  { id: "stork",       name: "Stork",         category: "Creature", url: `${THREE_EX}/Stork.glb`,                                 credit: "three.js",        realHeight: 1.0 },
  { id: "parrot",      name: "Parrot",        category: "Creature", url: `${THREE_EX}/Parrot.glb`,                                credit: "three.js",        realHeight: 0.35 },
  { id: "horse",       name: "Horse",         category: "Creature", url: `${THREE_EX}/Horse.glb`,                                 credit: "three.js",        realHeight: 1.6 },
  // Robots
  { id: "robot-exp",   name: "Robot Expressive", category: "Robot", url: `${THREE_EX}/RobotExpressive/RobotExpressive.glb`,       credit: "three.js",        realHeight: 1.7 },
];

/** Look up the real-world height (m) for a known model URL. */
const HEIGHT_BY_URL: Record<string, number> = Object.fromEntries(
  CHARACTER_LIBRARY.map((c) => [c.url, c.realHeight]),
);
function lookupRealHeight(url: string): number {
  return HEIGHT_BY_URL[url] ?? 1.8; // default: adult human
}

/**
 * Rig Controller Room
 * --------------------
 * A standalone exploration space for rigs and controllers.
 * - Loads any glTF/GLB with a skinned skeleton.
 * - Renders the mesh + a SkeletonHelper so every bone is visible.
 * - Lists every bone in a sidebar; clicking selects + frames it.
 * - "Auto-set controllers" scans bone names and assigns canonical
 *   controllers (Hips / Spine / Head / Hands / Feet / Shoulders / Knees)
 *   then drops a colored marker on each so the user can grab them.
 * - Selected controller gets a TransformControls (rotate by default,
 *   translate optional) for live posing.
 */

type ControllerKey =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftHand"
  | "rightHand"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftFoot"
  | "rightFoot";

interface ControllerDef {
  key: ControllerKey;
  label: string;
  color: string;
  // Substrings tried in order; first hit wins. Lower-cased.
  patterns: string[];
}

const CONTROLLERS: ControllerDef[] = [
  { key: "hips",          label: "Hips",          color: "#facc15", patterns: ["hips", "pelvis", "root"] },
  { key: "spine",         label: "Spine",         color: "#fb923c", patterns: ["spine1", "spine_01", "spine"] },
  { key: "chest",         label: "Chest",         color: "#f97316", patterns: ["spine2", "chest", "upperchest", "spine_02"] },
  { key: "neck",          label: "Neck",          color: "#22d3ee", patterns: ["neck"] },
  { key: "head",          label: "Head",          color: "#06b6d4", patterns: ["head"] },
  { key: "leftShoulder",  label: "L Shoulder",    color: "#a78bfa", patterns: ["leftshoulder", "shoulder_l", "l_shoulder", "leftarm"] },
  { key: "rightShoulder", label: "R Shoulder",    color: "#c084fc", patterns: ["rightshoulder", "shoulder_r", "r_shoulder", "rightarm"] },
  { key: "leftElbow",     label: "L Elbow",       color: "#818cf8", patterns: ["leftforearm", "forearm_l", "l_forearm", "leftlowerarm"] },
  { key: "rightElbow",    label: "R Elbow",       color: "#a5b4fc", patterns: ["rightforearm", "forearm_r", "r_forearm", "rightlowerarm"] },
  { key: "leftHand",      label: "L Hand",        color: "#4ade80", patterns: ["lefthand", "hand_l", "l_hand"] },
  { key: "rightHand",     label: "R Hand",        color: "#86efac", patterns: ["righthand", "hand_r", "r_hand"] },
  { key: "leftHip",       label: "L Hip",         color: "#f472b6", patterns: ["leftupleg", "leftthigh", "upleg_l", "l_upleg"] },
  { key: "rightHip",      label: "R Hip",         color: "#f9a8d4", patterns: ["rightupleg", "rightthigh", "upleg_r", "r_upleg"] },
  { key: "leftKnee",      label: "L Knee",        color: "#34d399", patterns: ["leftleg", "leg_l", "l_leg", "leftshin", "leftcalf"] },
  { key: "rightKnee",     label: "R Knee",        color: "#6ee7b7", patterns: ["rightleg", "leg_r", "r_leg", "rightshin", "rightcalf"] },
  { key: "leftFoot",      label: "L Foot",        color: "#fb7185", patterns: ["leftfoot", "foot_l", "l_foot"] },
  { key: "rightFoot",     label: "R Foot",        color: "#fda4af", patterns: ["rightfoot", "foot_r", "r_foot"] },
];

function autoMapControllers(bones: THREE.Bone[]): Record<ControllerKey, string | null> {
  const lower = bones.map((b) => b.name.toLowerCase());
  const out = {} as Record<ControllerKey, string | null>;
  for (const def of CONTROLLERS) {
    let foundIdx = -1;
    for (const pat of def.patterns) {
      const i = lower.findIndex((n) => n.includes(pat));
      if (i !== -1) { foundIdx = i; break; }
    }
    out[def.key] = foundIdx === -1 ? null : bones[foundIdx].name;
  }
  return out;
}

function collectBones(root: THREE.Object3D): THREE.Bone[] {
  const out: THREE.Bone[] = [];
  root.traverse((o) => { if ((o as any).isBone) out.push(o as THREE.Bone); });
  return out;
}

/**
 * Turn raw bone names like `mixamorigRightHandPinky2` into readable labels
 * like "Right Hand Pinky 2" for hover tooltips and the OBJECT bar.
 */
function prettifyBoneName(name: string): string {
  return name
    .replace(/^mixamorig:?/i, "")
    .replace(/[_\-:]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function findSkeleton(root: THREE.Object3D): THREE.Skeleton | null {
  let sk: THREE.Skeleton | null = null;
  root.traverse((o: any) => { if (!sk && o.isSkinnedMesh && o.skeleton) sk = o.skeleton; });
  return sk;
}

function findObjectByName(root: THREE.Object3D, name: string | null): THREE.Object3D | null {
  if (!name) return null;
  let found: THREE.Object3D | null = null;
  root.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}

function getStableRigBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  let hasBones = false;
  root.updateWorldMatrix(true, true);
  collectBones(root).forEach((bone) => {
    bone.updateWorldMatrix(true, false);
    point.setFromMatrixPosition(bone.matrixWorld);
    if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) {
      box.expandByPoint(point);
      hasBones = true;
    }
  });
  if (hasBones) return box;
  box.setFromObject(root);
  return box;
}

function collectBoneSplineEdges(
  root: THREE.Object3D,
  selectedBoneName: string | null,
  includeSubtree: boolean,
): [THREE.Object3D, THREE.Object3D][] {
  const selected = findObjectByName(root, selectedBoneName) as THREE.Bone | null;
  if (!selected || !(selected as any).isBone) return [];
  const boneSet = new Set(collectBones(root));
  const edges: [THREE.Object3D, THREE.Object3D][] = [];
  let cursor: THREE.Object3D = selected;
  while (cursor.parent && boneSet.has(cursor.parent as THREE.Bone)) {
    edges.unshift([cursor.parent, cursor]);
    cursor = cursor.parent;
  }
  const addChildren = (bone: THREE.Object3D) => {
    bone.children.forEach((child) => {
      if (!(child as any).isBone) return;
      edges.push([bone, child]);
      if (includeSubtree) addChildren(child);
    });
  };
  addChildren(selected);
  return edges;
}

function depthOf(o: THREE.Object3D): number {
  let d = 0;
  let cur: THREE.Object3D | null = o;
  while (cur?.parent) { d++; cur = cur.parent; }
  return d;
}

function BoneSplineOverlay({
  root,
  selectedBoneName,
  expanded,
  xray = false,
}: {
  root: THREE.Object3D;
  selectedBoneName: string | null;
  expanded: boolean;
  xray?: boolean;
}) {
  const edges = useMemo(
    () => collectBoneSplineEdges(root, selectedBoneName, expanded),
    [root, selectedBoneName, expanded],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(edges.length, 1) * 6), 3));
    return g;
  }, [edges.length]);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    if (!edges.length) return;
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    edges.forEach(([start, end], i) => {
      start.updateWorldMatrix(true, false);
      end.updateWorldMatrix(true, false);
      a.setFromMatrixPosition(start.matrixWorld);
      b.setFromMatrixPosition(end.matrixWorld);
      attr.setXYZ(i * 2, a.x, a.y, a.z);
      attr.setXYZ(i * 2 + 1, b.x, b.y, b.z);
    });
    attr.needsUpdate = true;
    geometry.computeBoundingSphere();
  });

  if (!edges.length) return null;
  return (
    <lineSegments geometry={geometry} renderOrder={1200} frustumCulled={false}>
      <lineBasicMaterial
        color={expanded ? "#22ff88" : "#f8f871"}
        transparent
        opacity={xray ? 0.95 : 0.85}
        depthTest={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function BonePickHotspot({
  bone,
  selected,
  hovered,
  armed,
  xray = false,
  onHover,
  onSelect,
}: {
  bone: THREE.Bone;
  selected: boolean;
  hovered: boolean;
  armed?: boolean;
  xray?: boolean;
  onHover: (name: string | null) => void;
  onSelect: (name: string) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    bone.updateWorldMatrix(true, false);
    ref.current.position.setFromMatrixPosition(bone.matrixWorld);
  });
  const active = selected || hovered || armed;
  const color = armed ? "#22ff88" : selected ? "#f8f871" : hovered ? "#5cff9e" : xray ? "#5fd9ff" : "#7dd3fc";
  const visR = xray
    ? selected ? 0.038 : hovered ? 0.03 : 0.016
    : selected ? 0.06 : hovered ? 0.045 : 0.022;
  const hitR = xray ? 0.058 : 0.085;
  return (
    <mesh
      ref={ref}
      onPointerOver={(e) => { e.stopPropagation(); onHover(bone.name); }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(null); }}
      onClick={(e) => { e.stopPropagation(); onSelect(bone.name); }}
      renderOrder={1300}
      frustumCulled={false}
    >
      <sphereGeometry args={[hitR, 12, 12]} />
      <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      <mesh raycast={() => null}>
        <sphereGeometry args={[visR, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={active ? 1 : xray ? 0.66 : 0.42}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      {active && (
        <Html center distanceFactor={xray ? 2 : 5} zIndexRange={[100, 0]} style={{ pointerEvents: "none" }}>
          <div
            className="px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap"
            style={{
              background: "rgba(4,16,26,0.9)",
              color,
              border: `1px solid ${color}`,
              transform: "translateY(-15px)",
              boxShadow: `0 0 10px ${color}88`,
            }}
          >
            {prettifyBoneName(bone.name)}
          </div>
        </Html>
      )}
    </mesh>
  );
}

/* --------------------------- Rig viewer --------------------------- */

/**
 * Tiny in-Canvas helper that exposes the WebGL canvas's `toDataURL` to the
 * parent via the shared bridge ref. Lets the sidebar grab a thumbnail when
 * the user saves a rig without having to lift the renderer out.
 */
function SnapshotBridge({ bridgeRef }: { bridgeRef: React.MutableRefObject<RigBridge> }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    bridgeRef.current.snapshot = () => {
      try {
        // Force a render so the buffer is current before reading pixels.
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/jpeg", 0.6);
      } catch (e) {
        console.warn("[rig] snapshot failed", e);
        return null;
      }
    };
    return () => { bridgeRef.current.snapshot = null; };
  }, [gl, scene, camera, bridgeRef]);
  return null;
}

/**
 * In-canvas helper that snaps the OrbitControls camera to a preset whenever
 * `tick` changes. We re-run on every tick (not just on preset change) so the
 * Reset View button works even when the active preset is already "reset".
 */
function CameraDirector({
  position,
  target,
  tick,
}: {
  position: [number, number, number];
  target: [number, number, number];
  tick: number;
}) {
  const { camera, controls } = useThree() as any;
  useEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    if (controls && controls.target) {
      controls.target.set(target[0], target[1], target[2]);
      controls.update?.();
    } else {
      camera.lookAt(target[0], target[1], target[2]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return null;
}

function SelectedBoneFocusDirector({
  bridgeRef,
  selectedBoneName,
}: {
  bridgeRef: React.MutableRefObject<RigBridge>;
  selectedBoneName: string | null;
}) {
  const { controls } = useThree() as any;
  useEffect(() => {
    if (!selectedBoneName || !controls?.target) return;
    const root = bridgeRef.current.root;
    const bone = root ? findObjectByName(root, selectedBoneName) : null;
    if (!bone) return;
    const p = new THREE.Vector3();
    bone.updateWorldMatrix(true, false);
    p.setFromMatrixPosition(bone.matrixWorld);
    controls.target.copy(p);
    controls.update?.();
  }, [bridgeRef, controls, selectedBoneName]);
  return null;
}

function Rig({
  url,
  targetHeight,
  showSkeleton,
  selectedBoneName,
  transformMode,
  onLoaded,
  onSelectBone,
  hoveredBoneName,
  onHoverBone,
  highlightedBones,
  activeClip,
  playing,
  speed,
  pendingPose,
  onPoseApplied,
  onBoneEdited,
  addBoneMode,
  onTopologyChanged,
  bridgeRef,
}: {
  url: string;
  targetHeight: number;
  showSkeleton: boolean;
  selectedBoneName: string | null;
  transformMode: "rotate" | "translate" | "scale";
  onLoaded: (info: { bones: THREE.Bone[]; skeleton: THREE.Skeleton | null; clips: string[] }) => void;
  onSelectBone: (name: string) => void;
  hoveredBoneName: string | null;
  onHoverBone: (name: string | null) => void;
  highlightedBones: { name: string; color: string }[];
  activeClip: string | null;
  playing: boolean;
  speed: number;
  pendingPose: BonePose[] | null;
  onPoseApplied: () => void;
  onBoneEdited?: () => void;
  addBoneMode?: boolean;
  onTopologyChanged?: (bones: THREE.Bone[]) => void;
  bridgeRef: React.MutableRefObject<RigBridge>;
}) {
  const gltf = useGLTF(url);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  // Topology version bumps when bones are added/removed so we can re-emit
  // the bone list and rebuild the SkeletonHelper.
  const [topologyVersion, setTopologyVersion] = useState(0);
  const liveBones = useMemo(() => collectBones(cloned), [cloned, topologyVersion]);
  // Render every rig at its native scale (scale = 1). Bounding-box based
  // normalization broke skinned meshes and pushed characters off-camera,
  // so the room now trusts each glTF's authored size.
  const normalizedScale = 1;
  const helperRef = useRef<THREE.SkeletonHelper | null>(null);
  const { scene: r3fScene } = useThree();
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const clipsRef = useRef<THREE.AnimationClip[]>([]);

  useEffect(() => {
    cloned.traverse((n: any) => {
      if (n.isMesh || n.isSkinnedMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        n.frustumCulled = false;
      }
    });
    const helper = new THREE.SkeletonHelper(cloned);
    const hmat = helper.material as any;
    hmat.linewidth = 2;
    hmat.depthTest = false;
    hmat.transparent = true;
    hmat.opacity = 0.95;
    helper.renderOrder = 999;
    helper.visible = showSkeleton;
    helperRef.current = helper;
    r3fScene.add(helper);
    const clips = (gltf.animations as THREE.AnimationClip[]) ?? [];
    clipsRef.current = clips;
    mixerRef.current = new THREE.AnimationMixer(cloned);
    bridgeRef.current.root = cloned;
    // Expose topology mutators to the sidebar via the shared bridge.
    bridgeRef.current.addBoneAt = (parentName, worldPoint) => {
      let parent: THREE.Object3D | null = null;
      cloned.traverse((o) => { if (!parent && o.name === parentName) parent = o; });
      if (!parent) return null;
      const local = (parent as THREE.Object3D).worldToLocal(worldPoint.clone());
      const bone = new THREE.Bone();
      bone.name = `custom_bone_${Math.random().toString(36).slice(2, 7)}`;
      bone.position.copy(local);
      (bone as any).userData.__custom = true;
      (parent as THREE.Object3D).add(bone);
      setTopologyVersion((v) => v + 1);
      return bone.name;
    };
    bridgeRef.current.deleteBone = (name) => {
      let target: THREE.Object3D | null = null;
      cloned.traverse((o) => { if (!target && o.name === name) target = o; });
      if (!target || !(target as THREE.Object3D).parent) return false;
      (target as THREE.Object3D).parent!.remove(target as THREE.Object3D);
      setTopologyVersion((v) => v + 1);
      return true;
    };
    bridgeRef.current.addBoneOnSpline = (parentName) => {
      let parent: THREE.Object3D | null = null;
      cloned.traverse((o) => { if (!parent && o.name === parentName) parent = o; });
      if (!parent) return null;
      const p = parent as THREE.Object3D;
      // Anchor point in WORLD space: midpoint between the selected bone and
      // its parent along the spine. If the selection IS a root bone (its
      // parent isn't a bone), fall back to the first child bone instead.
      p.updateWorldMatrix(true, false);
      const selfWorld = new THREE.Vector3().setFromMatrixPosition(p.matrixWorld);
      const boneSet = new Set(collectBones(cloned));
      let neighbor: THREE.Object3D | null = null;
      if (p.parent && boneSet.has(p.parent as THREE.Bone)) neighbor = p.parent;
      else neighbor = (p.children.find((c) => (c as any).isBone) as THREE.Object3D | undefined) ?? null;
      const target = new THREE.Vector3();
      if (neighbor) {
        neighbor.updateWorldMatrix(true, false);
        const nWorld = new THREE.Vector3().setFromMatrixPosition(neighbor.matrixWorld);
        target.copy(selfWorld).lerp(nWorld, 0.5);
      } else {
        // No neighbor — offset 0.15m up the world Y so the new bone is visible.
        target.copy(selfWorld).add(new THREE.Vector3(0, 0.15, 0));
      }
      const local = p.worldToLocal(target.clone());
      const bone = new THREE.Bone();
      bone.name = `custom_bone_${Math.random().toString(36).slice(2, 7)}`;
      bone.position.copy(local);
      (bone as any).userData.__custom = true;
      p.add(bone);
      setTopologyVersion((v) => v + 1);
      return bone.name;
    };
    bridgeRef.current.resetSkeleton = () => {
      // 1. Remove every runtime-added bone (deepest first so parents survive).
      const customs: THREE.Object3D[] = [];
      cloned.traverse((o) => { if ((o as any).userData?.__custom) customs.push(o); });
      customs.sort((a, b) => depthOf(b) - depthOf(a));
      customs.forEach((b) => b.parent?.remove(b));
      // 2. Restore the bind pose on every SkinnedMesh's skeleton.
      cloned.traverse((o: any) => {
        if (o.isSkinnedMesh && o.skeleton) {
          try { o.skeleton.pose(); } catch { /* ignore */ }
        }
      });
      // 3. Reset transforms on any remaining bone whose bind matrix is known.
      const bones = collectBones(cloned);
      bones.forEach((b) => {
        // SkeletonUtils.clone preserves the authored local transform on the
        // bone object itself, but a previous pose() call already restored it
        // via boneInverses, so we just need to flag matrices as dirty.
        b.updateMatrix();
        b.updateMatrixWorld(true);
      });
      setTopologyVersion((v) => v + 1);
    };
    onLoaded({
      bones: collectBones(cloned),
      skeleton: findSkeleton(cloned),
      clips: clips.map((c) => c.name),
    });
    // Apply a queued pose (from a loaded save) once the rig is mounted.
    if (pendingPose && pendingPose.length > 0) {
      try { applyPose(cloned, pendingPose); } catch {}
      onPoseApplied();
    }
    return () => {
      r3fScene.remove(helper);
      helper.dispose?.();
      helperRef.current = null;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
      if (bridgeRef.current.root === cloned) bridgeRef.current.root = null;
      bridgeRef.current.addBoneAt = null;
      bridgeRef.current.addBoneOnSpline = null;
      bridgeRef.current.deleteBone = null;
      bridgeRef.current.resetSkeleton = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned]);

  // Rebuild SkeletonHelper + re-emit bone list whenever topology mutates.
  useEffect(() => {
    if (topologyVersion === 0) return;
    if (helperRef.current) {
      r3fScene.remove(helperRef.current);
      helperRef.current.dispose?.();
    }
    const helper = new THREE.SkeletonHelper(cloned);
    const hmat = helper.material as any;
    hmat.linewidth = 2;
    hmat.depthTest = false;
    hmat.transparent = true;
    hmat.opacity = 0.95;
    helper.renderOrder = 999;
    helper.visible = showSkeleton;
    helperRef.current = helper;
    r3fScene.add(helper);
    const next = collectBones(cloned);
    onTopologyChanged?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyVersion]);

  useEffect(() => {
    if (helperRef.current) helperRef.current.visible = showSkeleton;
  }, [showSkeleton]);

  // Swap / start / stop the active animation action.
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    if (actionRef.current) {
      actionRef.current.fadeOut(0.2);
      actionRef.current = null;
    }
    if (!activeClip) return;
    const clip = clipsRef.current.find((c) => c.name === activeClip);
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setEffectiveTimeScale(speed);
    action.fadeIn(0.2).play();
    action.paused = !playing;
    actionRef.current = action;
  }, [activeClip]);

  useEffect(() => {
    if (!actionRef.current) return;
    actionRef.current.paused = !playing;
  }, [playing]);

  useEffect(() => {
    actionRef.current?.setEffectiveTimeScale(speed);
  }, [speed]);

  useFrame((_, dt) => {
    if (mixerRef.current && playing) mixerRef.current.update(dt);
  });

  // Resolve selected bone object for TransformControls
  const selectedBone = useMemo(() => {
    if (!selectedBoneName) return null;
    let found: THREE.Object3D | null = null;
    cloned.traverse((o) => { if (!found && o.name === selectedBoneName) found = o; });
    return found;
  }, [cloned, selectedBoneName]);

  return (
    <>
      <group
        onClick={(e: any) => {
          if (!addBoneMode) return;
          if (!selectedBoneName) return;
          e.stopPropagation();
          const wp = e.point as THREE.Vector3;
          const newName = bridgeRef.current.addBoneAt?.(selectedBoneName, wp);
          if (newName) onSelectBone(newName);
        }}
      >
        <primitive object={cloned} scale={normalizedScale} />
      </group>
      {highlightedBones.map((h) => (
        <ControllerMarker
          key={h.name}
          root={cloned}
          boneName={h.name}
          color={h.color}
          selected={selectedBoneName === h.name}
          onSelect={onSelectBone}
        />
      ))}
      <BoneSplineOverlay root={cloned} selectedBoneName={selectedBoneName} expanded={!!addBoneMode} />
      {liveBones.map((b) => (
        <BonePickHotspot
          key={b.uuid}
          bone={b}
          selected={selectedBoneName === b.name}
          hovered={hoveredBoneName === b.name}
          armed={addBoneMode && selectedBoneName === b.name}
          onHover={onHoverBone}
          onSelect={onSelectBone}
        />
      ))}
      {selectedBone && (
        <TransformControls
          key={transformMode}
          object={selectedBone as THREE.Object3D}
          mode={transformMode}
          space="local"
          size={0.6}
          onMouseUp={() => onBoneEdited?.()}
        />
      )}
    </>
  );
}

function ControllerMarker({
  root,
  boneName,
  color,
  selected,
  onSelect,
}: {
  root: THREE.Object3D;
  boneName: string;
  color: string;
  selected: boolean;
  onSelect: (n: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const bone = useMemo(() => {
    let f: THREE.Object3D | null = null;
    root.traverse((o) => { if (!f && o.name === boneName) f = o; });
    return f;
  }, [root, boneName]);

  useEffect(() => {
    if (!bone || !meshRef.current) return;
    // Re-parent the marker to the bone so it follows pose live.
    bone.add(meshRef.current);
    return () => { bone.remove(meshRef.current!); };
  }, [bone]);

  if (!bone) return null;
  return (
    <mesh
      ref={meshRef}
      onClick={(e) => { e.stopPropagation(); onSelect(boneName); }}
    >
      <sphereGeometry args={[selected ? 0.045 : 0.03, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={selected ? 1.1 : 0.4}
        roughness={0.3}
        metalness={0.2}
      />
    </mesh>
  );
}

/* --------------------------- Main page ---------------------------- */

/**
 * OBJECT controller bar — appears in the side panel whenever the user has a
 * bone selected (via hover-click in the X-ray view, the bone list, or a
 * marker in the main viewport). Mirrors the look of the editor's Object
 * Inspector and exposes live rotation sliders against the selected bone in
 * the live rig, plus a Reset that restores the bone's bind rotation.
 */
function ObjectControllerBar({
  bridgeRef,
  selectedBoneName,
  hoveredBoneName,
  onClear,
}: {
  bridgeRef: React.MutableRefObject<RigBridge>;
  selectedBoneName: string | null;
  hoveredBoneName?: string | null;
  onClear: () => void;
}) {
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const initialRef = useRef<THREE.Euler | null>(null);
  const boneRef = useRef<THREE.Object3D | null>(null);
  // Effective bone: selected (editable) wins, otherwise hovered (preview).
  const effectiveName = selectedBoneName ?? hoveredBoneName ?? null;
  const isPreview = !selectedBoneName && !!hoveredBoneName;

  // Resolve the currently-selected bone every time the selection changes.
  useEffect(() => {
    boneRef.current = null;
    initialRef.current = null;
    if (!effectiveName) { setRotation([0, 0, 0]); return; }
    const root = bridgeRef.current.root;
    if (!root) return;
    let found: THREE.Object3D | null = null;
    root.traverse((o) => { if (!found && o.name === effectiveName) found = o; });
    if (!found) return;
    boneRef.current = found;
    initialRef.current = found.rotation.clone();
    setRotation([found.rotation.x, found.rotation.y, found.rotation.z]);
  }, [effectiveName, bridgeRef]);

  const applyAxis = (axis: 0 | 1 | 2, value: number) => {
    if (isPreview) return; // hovering = read-only preview
    const next: [number, number, number] = [...rotation] as any;
    next[axis] = value;
    setRotation(next);
    const b = boneRef.current;
    if (b) b.rotation.set(next[0], next[1], next[2]);
  };

  const reset = () => {
    if (isPreview) return;
    const b = boneRef.current;
    const init = initialRef.current;
    if (b && init) {
      b.rotation.copy(init);
      setRotation([init.x, init.y, init.z]);
    }
  };

  return (
    <div
      className="rounded-md p-3 space-y-2"
      style={{
        background: "linear-gradient(180deg, rgba(34,255,136,0.06), rgba(34,255,136,0.02))",
        border: "1px solid rgba(34,255,136,0.35)",
        boxShadow: "0 0 18px rgba(34,255,136,0.08)",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] uppercase tracking-[0.22em] font-semibold"
          style={{ color: "#22ff88", textShadow: "0 0 6px rgba(34,255,136,0.5)" }}
        >
          {isPreview ? "Object · Bone (preview)" : "Object · Bone"}
        </span>
        {selectedBoneName && (
          <button
            onClick={onClear}
            className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            clear
          </button>
        )}
      </div>

      {!effectiveName ? (
        <p className="text-[10px] text-muted-foreground italic">
          Hover then click a node on the X-ray to load it here.
        </p>
      ) : (
        <>
          <div className="text-[11px] font-mono truncate" style={{ color: "#bbffd5" }}>
            {prettifyBoneName(effectiveName)}
          </div>
          <div className="text-[9px] text-muted-foreground font-mono truncate -mt-1">
            {effectiveName}
          </div>

          {(["X", "Y", "Z"] as const).map((axis, i) => (
            <div key={axis}>
              <div className="flex items-center justify-between">
                <Label className="text-[10px]">Rot {axis}</Label>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                  {((rotation[i] * 180) / Math.PI).toFixed(1)}°
                </span>
              </div>
              <Slider
                value={[rotation[i]]}
                min={-Math.PI}
                max={Math.PI}
                step={0.01}
                onValueChange={([v]) => applyAxis(i as 0 | 1 | 2, v)}
                disabled={isPreview}
              />
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full"
            onClick={reset}
            disabled={isPreview}
          >
            <RotateCcw className="w-3 h-3 mr-1.5" /> Reset rotation
          </Button>
        </>
      )}
    </div>
  );
}

/* --------------------- X-ray body map (controllers) ---------------------- */

/* --------------------- Bone hierarchy + searcher ---------------------- */

/**
 * Build a parent/child tree of the rig's bones rooted under the scene's
 * top-level bones (those whose parent isn't itself a bone). Walks the live
 * THREE object graph rather than a flat list so the indentation truly
 * reflects the skeleton hierarchy.
 */
interface BoneNode { bone: THREE.Bone; depth: number; children: BoneNode[]; }

function buildBoneTree(bones: THREE.Bone[]): BoneNode[] {
  const set = new Set(bones);
  const nodeMap = new Map<THREE.Bone, BoneNode>();
  bones.forEach((b) => nodeMap.set(b, { bone: b, depth: 0, children: [] }));
  const roots: BoneNode[] = [];
  bones.forEach((b) => {
    const node = nodeMap.get(b)!;
    let parent: THREE.Object3D | null = b.parent;
    while (parent && !(parent as any).isBone) parent = parent.parent;
    if (parent && set.has(parent as THREE.Bone)) {
      const pn = nodeMap.get(parent as THREE.Bone)!;
      node.depth = pn.depth + 1;
      pn.children.push(node);
    } else {
      roots.push(node);
    }
  });
  // Recompute depth via DFS in case insertion order misordered it.
  const fix = (n: BoneNode, d: number) => { n.depth = d; n.children.forEach((c) => fix(c, d + 1)); };
  roots.forEach((r) => fix(r, 0));
  return roots;
}

function BoneHierarchyPanel({
  bones,
  selectedBoneName,
  onSelect,
}: {
  bones: THREE.Bone[];
  selectedBoneName: string | null;
  onSelect: (n: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
  const tree = useMemo(() => buildBoneTree(bones), [bones]);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedBoneName]);

  const q = query.trim().toLowerCase();
  const matches = (b: THREE.Bone) =>
    !q || b.name.toLowerCase().includes(q) || prettifyBoneName(b.name).toLowerCase().includes(q);

  // While searching, auto-expand everything so hits remain visible.
  const effectiveCollapsed = q ? new Set<string>() : collapsed;

  const toggle = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  /** A node is rendered if it matches OR any of its descendants matches. */
  const subtreeMatches = (node: BoneNode): boolean =>
    matches(node.bone) || node.children.some(subtreeMatches);

  const renderNode = (node: BoneNode): JSX.Element | null => {
    if (q && !subtreeMatches(node)) return null;
    const isCollapsed = effectiveCollapsed.has(node.bone.name);
    const isSel = selectedBoneName === node.bone.name;
    const hit = q && matches(node.bone);
    return (
      <div key={node.bone.uuid} style={{ paddingLeft: node.depth * 10 }}>
        <div
          className={`group flex items-center gap-1 pl-1 pr-2 py-1 rounded-md text-[11px] font-mono transition-colors ${
            isSel ? "bg-[rgba(34,255,136,0.24)] text-[#d8ffe7] ring-1 ring-[rgba(34,255,136,0.55)] shadow-[0_0_14px_rgba(34,255,136,0.16)]" : "hover:bg-muted/30 text-muted-foreground"
          }`}
        >
          {node.children.length > 0 ? (
            <button
              onClick={() => toggle(node.bone.name)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}
          <button
            ref={isSel ? selectedRowRef : undefined}
            onClick={() => onSelect(node.bone.name)}
            className={`flex-1 min-w-0 text-left truncate leading-tight ${
              hit ? "text-[#22ff88]" : ""
            }`}
            title={node.bone.name}
          >
            {prettifyBoneName(node.bone.name) || node.bone.name}
          </button>
        </div>
        {!isCollapsed && node.children.length > 0 && (
          <div>{node.children.map(renderNode)}</div>
        )}
      </div>
    );
  };

  return (
    <div
      className="rounded-md border p-2 space-y-1.5"
      style={{
        background: "linear-gradient(180deg, rgba(34,255,136,0.04), rgba(34,255,136,0.01))",
        borderColor: "rgba(34,255,136,0.25)",
      }}
    >
      <div className="flex items-center justify-between px-0.5">
        <span
          className="text-[10px] uppercase tracking-[0.22em] font-semibold flex items-center gap-1"
          style={{ color: "#22ff88" }}
        >
          <BoneIcon className="w-3 h-3" /> Hierarchy · {bones.length}
        </span>
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bones…"
          className="h-7 pl-7 text-[11px]"
        />
      </div>
      {selectedBoneName && (
        <button
          onClick={() => onSelect(selectedBoneName)}
          className="w-full min-w-0 rounded-md px-2 py-1 text-left font-mono text-[10px] leading-tight bg-[rgba(34,255,136,0.12)] text-[#bbffd5] border border-[rgba(34,255,136,0.28)]"
          title={selectedBoneName}
        >
          <span className="block uppercase tracking-[0.16em] text-[8px] text-[#22ff88]">Selected bone</span>
          <span className="block truncate">{prettifyBoneName(selectedBoneName)}</span>
        </button>
      )}
      <ScrollArea className="h-56 -mx-0.5">
        <div className="pr-1">
          {tree.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic px-2 py-2">Loading rig…</p>
          ) : (
            tree.map(renderNode)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* --------------------- X-ray body map ---------------------- */

/**
 * Live X-ray mini-viewport. Clones the *currently selected* character glTF,
 * recoats every mesh in a transparent additive cyan material, and projects a
 * SkeletonHelper on top so the entire rig reads like a medical x-ray. Every
 * bone gets a tiny invisible hotspot the user can hover (preview the name)
 * or click (selects it in the main viewport).
 */
function XrayLiveMesh({
  url,
  selectedBoneName,
  hoveredBoneName,
  addBoneMode,
  onHoverBone,
  onSelectBone,
}: {
  url: string;
  selectedBoneName: string | null;
  hoveredBoneName: string | null;
  addBoneMode?: boolean;
  onHoverBone: (name: string | null) => void;
  onSelectBone: (name: string) => void;
}) {
  const gltf = useGLTF(url);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const bones = useMemo(() => collectBones(cloned), [cloned]);
  const { scene, camera, controls } = useThree() as any;
  // Frame the model ONCE per loaded rig. Without this guard the framing
  // block was re-running whenever the `controls` reference changed (e.g.
  // OrbitControls remount, a pose edit triggering re-render), which made
  // the viewport "snap" back to 100% and felt like an unwanted zoom-in.
  const framedRef = useRef<THREE.Object3D | null>(null);

  // Swap every mesh to a glowing cyan x-ray material and add a skeleton helper.
  useEffect(() => {
    const original = new Map<any, any>();
    cloned.traverse((o: any) => {
      if (o.isMesh || o.isSkinnedMesh) {
        original.set(o, o.material);
        o.material = new THREE.MeshBasicMaterial({
          color: new THREE.Color("#7be7ff"),
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        o.frustumCulled = false;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    const helper = new THREE.SkeletonHelper(cloned);
    const mat: any = helper.material;
    if (mat) {
      mat.transparent = true;
      mat.opacity = 0.95;
      mat.depthTest = false;
    }
    helper.renderOrder = 999;
    scene.add(helper);

    // Frame the model exactly once per cloned rig.
    if (framedRef.current !== cloned) {
      // Use the skeleton itself for framing. Skinned mesh bounds can include
      // bad bind-pose geometry below the feet, which is what made this camera
      // stare at the soles or jump out of focus.
      const box = getStableRigBox(cloned);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      if (size.lengthSq() === 0 || !Number.isFinite(size.y)) return;
      // Aim at the upper torso, not the feet.
      const target = new THREE.Vector3(
        center.x,
        box.min.y + size.y * 0.58,
        center.z,
      );
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const dist = maxDim * 2.35;
      camera.position.set(target.x, target.y, target.z + dist);
      camera.near = Math.max(0.001, dist / 100);
      camera.far = Math.max(200, dist * 10);
      camera.updateProjectionMatrix?.();
      if (controls && controls.target) {
        controls.target.copy(target);
        controls.update?.();
      } else {
        camera.lookAt(target);
      }
      framedRef.current = cloned;
    }

    return () => {
      scene.remove(helper);
      helper.dispose?.();
      original.forEach((m, mesh) => { (mesh as any).material = m; });
    };
    // Intentionally only react to `cloned` / `scene` changes — including
    // `camera` or `controls` here causes the framing block to retrigger
    // every time those refs are reassigned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, scene]);

  return (
    <>
      <primitive object={cloned} />
      <BoneSplineOverlay root={cloned} selectedBoneName={selectedBoneName} expanded={!!addBoneMode} xray />
      {bones.map((b) => (
        <BonePickHotspot
          key={b.uuid}
          bone={b}
          selected={selectedBoneName === b.name}
          hovered={hoveredBoneName === b.name}
          armed={addBoneMode && selectedBoneName === b.name}
          xray
          onHover={onHoverBone}
          onSelect={onSelectBone}
        />
      ))}
    </>
  );
}

function XrayBodyMap({
  url,
  bones,
  controllerMap,
  selectedBoneName,
  addBoneMode,
  onSelectBone,
  hoveredBone: hoveredBoneProp,
  onHoverBone,
  onClearControllers,
  mappedCount,
}: {
  url: string;
  bones: THREE.Bone[];
  controllerMap: Record<ControllerKey, string | null>;
  selectedBoneName: string | null;
  addBoneMode?: boolean;
  onSelectBone: (boneName: string) => void;
  hoveredBone?: string | null;
  onHoverBone?: (name: string | null) => void;
  onClearControllers?: () => void;
  mappedCount: number;
}) {
  const [hoveredBoneLocal, setHoveredBoneLocal] = useState<string | null>(null);
  const hoveredBone = hoveredBoneProp !== undefined ? hoveredBoneProp : hoveredBoneLocal;
  const setHoveredBone = (n: string | null) => {
    if (onHoverBone) onHoverBone(n);
    else setHoveredBoneLocal(n);
  };
  const display = hoveredBone ?? selectedBoneName;
  return (
    <div className="relative rounded-lg border border-cyan-400/20 bg-[radial-gradient(ellipse_at_center,hsl(190_90%_45%/0.10),transparent_70%),linear-gradient(180deg,hsl(220_50%_6%),hsl(220_45%_3%))] p-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/80 font-semibold">
            X-Ray · Live Rig
          </span>
          <span className="text-[10px] text-cyan-200/40 tabular-nums">
            {bones.length.toString().padStart(3, "0")} bones · {mappedCount}/{CONTROLLERS.length} mapped
          </span>
        </div>
        {onClearControllers && (
          <button
            className="text-[10px] text-cyan-200/60 hover:text-cyan-100 underline-offset-2 hover:underline"
            onClick={onClearControllers}
          >
            clear
          </button>
        )}
      </div>

      {/* Live x-ray viewport */}
      <div
        className="relative h-[340px] rounded-md overflow-hidden border border-cyan-400/10 bg-[#04101a]"
        style={{ containerType: "inline-size" }}
      >
        <Canvas
          camera={{ position: [0, 1.35, 3.2], fov: 30, near: 0.01, far: 200 }}
          gl={{ antialias: true, alpha: false }}
          dpr={[1, 1.5]}
        >
          <color attach="background" args={["#04101a"]} />
          <ambientLight intensity={0.6} />
          <Suspense fallback={null}>
            {url && (
              <XrayLiveMesh
                url={url}
                selectedBoneName={selectedBoneName}
                hoveredBoneName={hoveredBone}
                addBoneMode={addBoneMode}
                onHoverBone={setHoveredBone}
                onSelectBone={onSelectBone}
              />
            )}
          </Suspense>
          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom={false}
            enableRotate={false}
            autoRotate={false}
            minDistance={0.4}
            maxDistance={8}
          />
        </Canvas>

        {/* Scanline overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.22] mix-blend-screen"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, hsl(190 95% 60% / 0.35) 0 1px, transparent 1px 4px)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-cyan-400/20 to-transparent"
        />
        {/* Corner crosshairs */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <g stroke="hsl(190 95% 70% / 0.55)" strokeWidth="0.3" fill="none" vectorEffect="non-scaling-stroke">
            <path d="M1 5 V1 H5" />
            <path d="M99 5 V1 H95" />
            <path d="M1 95 V99 H5" />
            <path d="M99 95 V99 H95" />
          </g>
        </svg>
        {/* Hovered/selected bone readout */}
        <div className="absolute left-2 bottom-2 right-2 flex items-end justify-between gap-1.5 pointer-events-none">
          <span
            className="font-mono px-1.5 py-0.5 rounded flex-1 min-w-0 break-all leading-tight"
            style={{
              fontSize: "clamp(8px, 2.2cqw, 11px)",
              background: "rgba(0,0,0,0.5)",
              color: display ? "#22ff88" : "rgba(190,236,255,0.7)",
              border: display ? "1px solid #22ff8855" : "1px solid transparent",
              textShadow: display ? "0 0 6px #22ff8866" : undefined,
            }}
            title={display ? prettifyBoneName(display) : undefined}
          >
            {display ? prettifyBoneName(display) : "hover any bone…"}
          </span>
          <span
            className="uppercase tracking-wider text-cyan-300/70 bg-black/40 px-1.5 py-0.5 rounded shrink-0 leading-tight"
            style={{ fontSize: "clamp(7px, 1.8cqw, 9px)" }}
          >
            live
          </span>
        </div>
      </div>

      <p className="mt-1.5 text-[10px] text-cyan-200/50 leading-snug">
        Fixed 100% X-ray frame. Click any highlighted joint here or in the main character to select it.
      </p>
    </div>
  );
}

export interface SceneCharacterRef {
  id: string;
  name: string;
  url: string;
  currentAnimation?: string;
}

export interface RigControllerRoomProps {
  /** Characters currently present in the linked scene (e.g. the Locomotion Walker). */
  sceneCharacters?: SceneCharacterRef[];
  /** Push a rig change (URL swap + chosen clip + pose) back to a scene character. */
  onApplyToCharacter?: (
    characterId: string,
    patch: {
      url: string;
      currentAnimation?: string;
      pose?: BonePose[];
      rigSaveId?: string;
      source?: string;
    },
  ) => void;
  /**
   * Emits the currently-loaded rig (character name, model url, bone list,
   * and selected bone) whenever it changes. Lets the host (LevelEditorPage)
   * mirror the rig + its bone hierarchy in the left-side Components panel.
   */
  onRigStateChange?: (state: {
    name: string;
    url: string;
    bones: { name: string; parentName: string | null }[];
    selectedBoneName: string | null;
  } | null) => void;
  /** Receive bone-selection requests from outside (e.g. Components panel). */
  externalSelectedBoneName?: string | null;
  /**
   * Extra panels rendered at the bottom of the rig-room aside. Used by the
   * Locomotion page to embed the editor's Layers / Components / Lights
   * panels into this sidebar instead of the LevelEditorPage left aside.
   */
  sidebarExtras?: React.ReactNode;
  /** Whether the rig-room sidebar is expanded (default true). */
  sidebarOpen?: boolean;
}

export default function RigControllerRoom({
  sceneCharacters = [],
  onApplyToCharacter,
  onRigStateChange,
  externalSelectedBoneName,
  sidebarExtras,
  sidebarOpen = true,
}: RigControllerRoomProps = {}) {
  const [url, setUrl] = useState<string>(DEFAULT_CHARACTER_URL);
  const [pendingUrl, setPendingUrl] = useState<string>(DEFAULT_CHARACTER_URL);
  const [sourceLabel, setSourceLabel] = useState<string>("Xbot (Mixamo)");
  const [bones, setBones] = useState<THREE.Bone[]>([]);
  const [selectedBoneName, setSelectedBoneName] = useState<string | null>(null);
  const [hoveredBoneName, setHoveredBoneName] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [transformMode, setTransformMode] = useState<"rotate" | "translate" | "scale">("translate");
  const [controllerMap, setControllerMap] = useState<Record<ControllerKey, string | null>>(
    {} as Record<ControllerKey, string | null>,
  );
  const [clips, setClips] = useState<string[]>([]);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [animOpen, setAnimOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  // Bone authoring mode: when true, clicking on the rig in the main viewport
  // anchors a new bone (child of the currently selected bone) at the click
  // position. Stays armed until the user toggles it off.
  const [addBoneMode, setAddBoneMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [targetCharId, setTargetCharId] = useState<string | null>(sceneCharacters[0]?.id ?? null);

  // Deep-link support: any page in the app can open the rig room for an
  // arbitrary character by navigating to /locomotion?url=<glb>&name=<label>
  // &target=<levelId:objId>. We honor it ONCE on mount so subsequent in-room
  // model swaps aren't clobbered by the original query.
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const linkUrl = qs.get("url");
    const linkName = qs.get("name");
    const linkTarget = qs.get("target");
    if (linkUrl) {
      setUrl(linkUrl);
      setPendingUrl(linkName ?? linkUrl);
      setSourceLabel(linkName ?? "Character");
      setActiveSaveId(null);
    }
    if (linkTarget) {
      setTargetCharId(linkTarget);
    }
    deepLinkAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emit the live rig state up to the host so the Components panel can render
  // this character + its bone hierarchy without duplicating the GLTF load.
  useEffect(() => {
    if (!onRigStateChange) return;
    if (bones.length === 0) {
      onRigStateChange(null);
      return;
    }
    const boneSet = new Set(bones);
    const serialised = bones.map((b) => {
      let p: THREE.Object3D | null = b.parent;
      while (p && !(p as any).isBone) p = p.parent;
      return {
        name: b.name,
        parentName: p && boneSet.has(p as THREE.Bone) ? (p as THREE.Bone).name : null,
      };
    });
    onRigStateChange({
      name: sourceLabel,
      url,
      bones: serialised,
      selectedBoneName,
    });
  }, [bones, sourceLabel, url, selectedBoneName, onRigStateChange]);

  // Allow the host to drive bone selection from the Components hierarchy.
  useEffect(() => {
    if (externalSelectedBoneName === undefined) return;
    setSelectedBoneName(externalSelectedBoneName);
  }, [externalSelectedBoneName]);

  // When a new bone is picked, default the gizmo to translate (move) at the
  // bone's location. The user can then switch to rotate/scale from the toolbar,
  // which overrides this default for the current selection.
  const lastSelectedBoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedBoneName && selectedBoneName !== lastSelectedBoneRef.current) {
      setTransformMode("translate");
      // Pause the animation mixer while posing — otherwise the active clip
      // would overwrite every slider tweak and gizmo drag on the next frame,
      // making manual edits look broken.
      setPlaying(false);
    }
    lastSelectedBoneRef.current = selectedBoneName;
  }, [selectedBoneName]);

  // ----- cinematic camera presets -----
  // The viewport offers a Reset View + four canned angles. Each click bumps
  // `cameraTick` so the in-canvas <CameraDirector/> re-applies the active
  // preset, even when the user re-picks the same one.
  type CameraPresetId = "reset" | "front" | "side" | "back" | "top";
  interface CamPreset { id: CameraPresetId; label: string; position: [number, number, number]; target: [number, number, number]; }
  const CAMERA_PRESETS: CamPreset[] = useMemo(() => [
    { id: "reset", label: "Reset",          position: [5, 3.5, 5],  target: [0, 0.9, 0] },
    { id: "front", label: "Front close-up", position: [0, 1.6, 3.0],    target: [0, 1.5, 0] },
    { id: "side",  label: "Profile",        position: [3.5, 1.4, 0],    target: [0, 1.2, 0] },
    { id: "back",  label: "Hero back",      position: [0, 1.8, -3.8],   target: [0, 1.2, 0] },
    { id: "top",   label: "Top down",       position: [0.01, 5.5, 0.01],target: [0, 0.9, 0] },
  ], []);
  const [activeCamera, setActiveCamera] = useState<CameraPresetId>("reset");
  const [cameraTick, setCameraTick] = useState(0);
  const activePreset = CAMERA_PRESETS.find((p) => p.id === activeCamera) ?? CAMERA_PRESETS[0];
  const focusCamera = (id: CameraPresetId) => {
    setActiveCamera(id);
    setCameraTick((t) => t + 1);
  };

  // Expose reset to the global header button so the camera icon in the top
  // toolbar also recenters the rig room scene.
  useEffect(() => {
    (window as any).__levelResetCamera = () => focusCamera("reset");
    return () => {
      if ((window as any).__levelResetCamera) delete (window as any).__levelResetCamera;
    };
  }, []);

  // ----- save system state -----
  const bridgeRef = useRef<RigBridge>({
    root: null,
    snapshot: null,
    addBoneAt: null,
    addBoneOnSpline: null,
    deleteBone: null,
    resetSkeleton: null,
    addSkin: null,
    removeSkin: null,
    setSkinVisible: null,
  });
  const [pendingPose, setPendingPose] = useState<BonePose[] | null>(null);
  const [saves, setSaves] = useState<RigSave[]>(() => getCachedRigSaves());
  const [savesLoading, setSavesLoading] = useState(false);
  const [activeSaveId, setActiveSaveId] = useState<string | null>(null);

  const [saveSearch, setSaveSearch] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSavesLoading(true);
    listRigSaves()
      .then((rows) => { if (!cancelled) setSaves(rows); })
      .catch((e) => console.warn("[rig] list saves failed", e))
      .finally(() => { if (!cancelled) setSavesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (sceneCharacters.length && !sceneCharacters.find((c) => c.id === targetCharId)) {
      setTargetCharId(sceneCharacters[0].id);
    }
  }, [sceneCharacters, targetCharId]);

  const onLoaded = ({ bones, clips }: { bones: THREE.Bone[]; clips: string[] }) => {
    setBones(bones);
    setSelectedBoneName(null);
    setControllerMap({} as Record<ControllerKey, string | null>);
    setClips(clips);
    setActiveClip(clips[0] ?? null);
  };

  const handleAutoSet = () => {
    if (bones.length === 0) return;
    setControllerMap(autoMapControllers(bones));
  };

  const handleClearControllers = () => {
    setControllerMap({} as Record<ControllerKey, string | null>);
  };

  const handleResetPose = () => {
    // Force a reload of the URL to re-clone with bind pose.
    const u = url;
    setUrl("");
    setTimeout(() => setUrl(u), 10);
  };

  const handleUploadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUrl(dataUrl);
      setPendingUrl(file.name);
      setSourceLabel(file.name);
      toast.success(`Loaded ${file.name}`);
    };
    reader.onerror = () => toast.error("Failed to read file");
    reader.readAsDataURL(file);
  };

  const handleLoadSceneCharacter = (c: SceneCharacterRef) => {
    setUrl(c.url);
    setPendingUrl(c.url);
    setSourceLabel(c.name);
    setTargetCharId(c.id);
  };

  const handleLoadLibrary = (c: LibraryCharacter) => {
    setUrl(c.url);
    setPendingUrl(c.url);
    setSourceLabel(`${c.name} · ${c.credit}`);
    setActiveSaveId(null);
    toast.success(`Loaded ${c.name}`);
  };

  const handleSave = async () => {
    const root = bridgeRef.current.root;
    if (!root) { toast.error("Rig not ready yet"); return; }
    const defaultName = `${sourceLabel.split("·")[0].trim() || "Rig"} ${new Date()
      .toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    const name = window.prompt("Save rig as…", defaultName);
    if (!name || !name.trim()) return;
    const pose = capturePose(root);
    const thumb = bridgeRef.current.snapshot?.() ?? null;
    try {
      const row = await saveRig({
        name: name.trim(),
        source_label: sourceLabel,
        model_url: url,
        active_clip: activeClip,
        speed,
        controller_map: controllerMap,
        pose,
        thumbnail: thumb,
      });
      setSaves((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);
      setActiveSaveId(row.id);
      toast.success("Rig saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    }
  };

  const handleLoadSave = (s: RigSave) => {
    setActiveSaveId(s.id);
    setSourceLabel(s.source_label ?? s.name);
    setPendingUrl(s.model_url.startsWith("data:") ? s.name : s.model_url);
    setSpeed(s.speed ?? 1);
    setControllerMap((s.controller_map as Record<ControllerKey, string | null>) ?? ({} as Record<ControllerKey, string | null>));
    setPendingPose(s.pose ?? null);
    // Force a reload even if the URL is identical (re-clone for clean apply).
    setUrl("");
    setTimeout(() => {
      setUrl(s.model_url);
      if (s.active_clip) setActiveClip(s.active_clip);
    }, 20);
    toast.success(`Loaded ${s.name}`);
  };

  const handleDeleteSave = async (s: RigSave) => {
    if (!window.confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    setSaves((prev) => prev.filter((r) => r.id !== s.id));
    if (activeSaveId === s.id) setActiveSaveId(null);
    try { await deleteRigSave(s.id); } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };

  const handleApplyToCharacter = () => {
    if (!targetCharId || !onApplyToCharacter) return;
    const root = bridgeRef.current.root;
    const livePose = root ? capturePose(root) : undefined;
    onApplyToCharacter(targetCharId, {
      url,
      currentAnimation: activeClip ?? undefined,
      pose: livePose,
      rigSaveId: activeSaveId ?? undefined,
      source: sourceLabel,
    });
    toast.success("Applied to scene character (pose + clip)");
  };

  const highlightedBones = useMemo(
    () =>
      CONTROLLERS.flatMap((c) => {
        const name = controllerMap[c.key];
        return name ? [{ name, color: c.color }] : [];
      }),
    [controllerMap],
  );

  const mappedCount = Object.values(controllerMap).filter(Boolean).length;

  return (
    <div className="flex w-full h-full bg-slate-950 text-foreground">
      {/* Side panel */}
      <aside
        className={`shrink-0 border-r border-border/40 bg-background/80 backdrop-blur overflow-y-auto transition-all duration-300
          ${sidebarOpen ? "w-80 p-4 space-y-4" : "w-0 p-0 overflow-hidden border-r-0"}
          [&::-webkit-scrollbar]:w-1.5
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-black
          [&::-webkit-scrollbar-thumb]:rounded-full
        `}
      >
        <div className={sidebarOpen ? "" : "hidden"}>
          {/* ═══════════ COMMAND DECK HEADER ═══════════ */}
          <div className="relative -mx-4 -mt-4 mb-4 px-4 pt-4 pb-3 border-b border-white/[0.08] bg-[linear-gradient(180deg,hsl(var(--primary)/0.06),transparent_70%)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-primary/70 tracking-[0.18em]">{`//`}</span>
                <h2 className="text-[12px] font-bold uppercase tracking-[0.28em] text-white leading-none">
                  CTRL · ROOM
                </h2>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-primary/40 bg-primary/10">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary))]" />
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">{playing ? "LIVE" : "STBY"}</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-white/40">
              <div className="flex flex-col"><span className="text-white/30">BONES</span><span className="text-white/90 tabular-nums">{String(bones.length).padStart(3,"0")}</span></div>
              <div className="flex flex-col"><span className="text-white/30">CLIPS</span><span className="text-white/90 tabular-nums">{String(clips.length).padStart(3,"0")}</span></div>
              <div className="flex flex-col"><span className="text-white/30">SAVES</span><span className="text-white/90 tabular-nums">{String(saves.length).padStart(3,"0")}</span></div>
            </div>
          </div>

          {sidebarExtras && (
            <div className="mb-3 -mx-4 px-4 pb-3 border-b border-border/30">
              {sidebarExtras}
            </div>
          )}

        {sceneCharacters.length > 0 && (
          <div className="rounded border border-border/40 p-3 space-y-2 bg-muted/10">
            <Label className="text-[11px] flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Scene characters
            </Label>
            <div className="grid gap-1">
              {sceneCharacters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleLoadSceneCharacter(c)}
                  className={`text-left text-[11px] px-2 py-1 rounded border transition ${
                    targetCharId === c.id
                      ? "border-foreground/40 bg-foreground/10"
                      : "border-border/40 hover:bg-muted/30"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {onApplyToCharacter && (
              <Button
                size="sm"
                className="w-full h-7"
                onClick={handleApplyToCharacter}
                disabled={!targetCharId}
              >
                <Send className="w-3 h-3 mr-1.5" />
                Apply rig + clip to scene
              </Button>
            )}
          </div>
        )}

        {/* ═══════════ ASSET DECK — clips + library dropdown ═══════════ */}
        <div className="space-y-2">
          {/* Header row + toggle */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-primary/60 tracking-[0.18em]">{`>`}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/70 font-semibold">ASSET DECK</span>
              <span className="font-mono text-[9px] tabular-nums text-white/30">
                {String(clips.length + saves.length).padStart(3, "0")}
              </span>
            </div>
            <button
              onClick={() => setDeckOpen((o) => !o)}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition flex items-center gap-1"
            >
              {deckOpen ? "HIDE" : "SHOW"}
              <ChevronDown className={`w-3 h-3 transition-transform ${deckOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* Search engine — always visible */}
          <div className="relative flex items-center border border-white/10 bg-black/40 focus-within:border-primary/50 transition">
            <span className="pl-2.5 font-mono text-[10px] text-primary/70 select-none">{`>`}</span>
            <input
              value={saveSearch}
              onChange={(e) => setSaveSearch(e.target.value)}
              placeholder="search rigs…"
              className="flex-1 bg-transparent h-8 px-2 font-mono text-[11px] text-white placeholder:text-white/25 focus:outline-none"
            />
            <Search className="w-3 h-3 text-white/30 mr-2.5" />
          </div>

          {/* Expanded content: clips + library */}
          {deckOpen && (
            <>
              {/* Clips */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="font-mono text-[9px] text-primary/60 tracking-[0.18em]">{`>`}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/50 font-semibold">CLIPS</span>
                  <span className="font-mono text-[9px] tabular-nums text-white/30">{String(clips.length).padStart(3, "0")}</span>
                </div>
                {clips.length === 0 ? (
                  <p className="font-mono text-[10px] text-white/30 px-1 py-1">// no clips loaded</p>
                ) : (
                  <ScrollArea className="max-h-32">
                    <div className="grid grid-cols-1 gap-1 pr-1.5">
                      {clips.map((name) => {
                        const isActive = activeClip === name;
                        return (
                          <button
                            key={name}
                            onClick={() => setActiveClip(name)}
                            className={`group flex items-center gap-2 px-2.5 py-1.5 border text-left transition-all ${
                              isActive
                                ? "bg-primary/10 border-primary/60 text-white shadow-[inset_2px_0_0_hsl(var(--primary))]"
                                : "bg-white/[0.02] border-white/10 text-white/70 hover:border-white/30 hover:bg-white/[0.05]"
                            }`}
                          >
                            <span className={`font-mono text-[9px] tabular-nums ${isActive ? "text-primary" : "text-white/30"}`}>
                              {isActive ? "●" : "○"}
                            </span>
                            <span className="flex-1 truncate text-[11px] font-medium">{name}</span>
                            {isActive && playing && (
                              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-primary animate-pulse">LIVE</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>

              {/* Library */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="font-mono text-[9px] text-primary/60 tracking-[0.18em]">{`>`}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/50 font-semibold">LIBRARY</span>
                  <span className="font-mono text-[9px] tabular-nums text-white/30">{String(saves.length).padStart(3, "0")}</span>
                </div>
                <div className="max-h-40 overflow-y-auto -mx-1 px-1 space-y-1">
                  {saves.length === 0 ? (
                    <p className="font-mono text-[10px] text-white/30 text-center py-2">
                      {savesLoading ? "// loading…" : "// empty — press SAVE to record"}
                    </p>
                  ) : (
                    saves
                      .filter((s) => s.name.toLowerCase().includes(saveSearch.toLowerCase()))
                      .map((s, i) => {
                        const active = activeSaveId === s.id;
                        return (
                          <div
                            key={s.id}
                            className={`group flex items-center gap-2 pl-2 pr-1 py-1.5 border transition cursor-pointer ${
                              active
                                ? "border-primary/50 bg-primary/[0.08] shadow-[inset_2px_0_0_hsl(var(--primary))]"
                                : "border-white/[0.06] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]"
                            }`}
                          >
                            <span className={`font-mono text-[9px] tabular-nums w-5 shrink-0 ${active ? "text-primary" : "text-white/25"}`}>
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <button
                              onClick={() => handleLoadSave(s)}
                              className="flex-1 flex items-center gap-2 text-left min-w-0"
                            >
                              <div className="w-7 h-7 overflow-hidden bg-black border border-white/10 flex-shrink-0 grid place-items-center">
                                {s.thumbnail ? (
                                  <img src={s.thumbnail} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <BoneIcon className="w-3 h-3 text-white/30" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`text-[11px] truncate leading-tight ${active ? "text-white font-semibold" : "text-white/80"}`}>
                                  {s.name}
                                </p>
                                <p className="font-mono tabular-nums text-[9px] text-white/30 leading-tight">
                                  {new Date(s.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSave(s);
                              }}
                              className="opacity-0 group-hover:opacity-100 grid place-items-center w-7 h-7 text-white/40 hover:text-destructive hover:bg-destructive/10 transition"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ═══════════ HERO RIG DECK ═══════════ */}
        {(() => {
          const sel = activeSaveId ? saves.find((s) => s.id === activeSaveId) : null;
          return (
            <div className="relative bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--background)))] border border-white/10 p-3 space-y-3"
              style={{ clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}
            >
              {/* Corner brackets */}
              <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-primary/60" />
              <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-primary/60" />

              {/* Thumbnail panel */}
              <div className="relative aspect-square w-full bg-black border border-white/[0.08] overflow-hidden">
                {sel?.thumbnail ? (
                  <img src={sel.thumbnail} alt={sel.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-white/20">
                    <BoneIcon className="w-12 h-12" />
                  </div>
                )}
                {/* Scanline overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(180deg,transparent_0,transparent_3px,rgba(255,255,255,0.02)_3px,rgba(255,255,255,0.02)_4px)]" />
                {/* Telemetry overlay */}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-white/70">
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${playing ? "bg-primary animate-pulse" : "bg-white/30"}`} />
                    {playing ? "REC" : "IDLE"}
                  </span>
                  <span className="text-white/40 tabular-nums">×{speed.toFixed(2)}</span>
                </div>
                {/* Name bar */}
                <div className="absolute bottom-0 inset-x-0 px-2.5 py-1.5 bg-gradient-to-t from-black/95 to-transparent">
                  <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary/80">{sel ? "ACTIVE RIG" : "SOURCE"}</div>
                  <div className="text-[13px] font-semibold text-white truncate leading-tight">
                    {sel?.name ?? (sourceLabel || "Default rig")}
                  </div>
                </div>
              </div>

              {/* Transport row — bold game-controller buttons */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  disabled={!activeClip}
                  className={`group h-11 flex items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-[0.25em] transition-all disabled:opacity-30 ${
                    playing
                      ? "bg-primary text-primary-foreground border-primary shadow-[0_0_18px_hsl(var(--primary)/0.55)]"
                      : "bg-white/[0.04] text-white border-white/15 hover:bg-white/[0.1] hover:border-primary/50"
                  }`}
                  title={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{playing ? "PAUSE" : "PLAY"}</span>
                </button>
                <button
                  onClick={handleAutoSet}
                  disabled={bones.length === 0}
                  className="w-11 h-11 grid place-items-center border border-white/15 bg-white/[0.04] text-white/80 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-30"
                  title="Auto-set controllers"
                >
                  <Wand2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleResetPose}
                  className="w-11 h-11 grid place-items-center border border-white/15 bg-white/[0.04] text-white/80 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all"
                  title="Reset pose"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={bones.length === 0}
                  className="w-11 h-11 grid place-items-center border border-primary/40 bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-30"
                  title="Save rig"
                >
                  <Save className="w-4 h-4" />
                </button>
              </div>

              {/* THROTTLE — speed */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.25em]">
                  <span className="text-white/40">THROTTLE</span>
                  <span className="text-primary text-[12px] tabular-nums font-bold">×{speed.toFixed(2)}</span>
                </div>
                <div className="relative">
                  <Slider
                    value={[speed]}
                    min={0}
                    max={3}
                    step={0.05}
                    onValueChange={([v]) => setSpeed(v)}
                  />
                  <div className="absolute inset-x-0 -bottom-2 flex justify-between pointer-events-none font-mono text-[8px] text-white/25 tabular-nums">
                    <span>0.0</span><span>1.0</span><span>2.0</span><span>3.0</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}


        <div className="rounded border border-border/40 p-3 space-y-2 bg-muted/10">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={showSkeleton} onCheckedChange={setShowSkeleton} />
            Show skeleton overlay
          </label>
        </div>

        <XrayBodyMap
          url={url}
          bones={bones}
          controllerMap={controllerMap}
          selectedBoneName={selectedBoneName}
          addBoneMode={addBoneMode}
          onSelectBone={(boneName) => setSelectedBoneName(boneName)}
          hoveredBone={hoveredBoneName}
          onHoverBone={setHoveredBoneName}
          onClearControllers={mappedCount > 0 ? handleClearControllers : undefined}
          mappedCount={mappedCount}
        />

        <ObjectControllerBar
          bridgeRef={bridgeRef}
          selectedBoneName={selectedBoneName}
          hoveredBoneName={hoveredBoneName}
          onClear={() => setSelectedBoneName(null)}
        />

        <BoneHierarchyPanel
          bones={bones}
          selectedBoneName={selectedBoneName}
          onSelect={setSelectedBoneName}
        />

        {/* ---- Model URL / Upload (moved to the bottom of the sidebar) ---- */}
        <div className="space-y-1.5 pt-2 border-t border-border/30">
          <Label className="text-xs">Model URL (.glb / .gltf)</Label>
          <div className="flex gap-1.5">
            <Input
              value={pendingUrl}
              onChange={(e) => setPendingUrl(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => { setUrl(pendingUrl); setSourceLabel(pendingUrl); }}
              disabled={!pendingUrl || pendingUrl === url}
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadFile(f);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3 h-3 mr-1.5" /> Upload .glb / .gltf
            </Button>
          </div>
        </div>

        </div>
      </aside>

      {/* Viewport */}
      <main className="flex-1 relative">
        <Canvas
          camera={{ position: [5, 3.5, 5], fov: 52, near: 0.05, far: 200 }}
          shadows
          gl={{ preserveDrawingBuffer: true }}
        >
          <color attach="background" args={["#0b1220"]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 8, 4]} intensity={1.0} castShadow />
          <Grid
            args={[20, 20]}
            cellColor="#1f2937"
            sectionColor="#374151"
            fadeDistance={20}
            infiniteGrid
          />
          <Suspense
            fallback={
              <Html center>
                <div className="text-xs text-muted-foreground bg-background/80 px-3 py-1.5 rounded">
                  Loading rig…
                </div>
              </Html>
            }
          >
            <Environment preset="city" />
            <SnapshotBridge bridgeRef={bridgeRef} />
            <CameraDirector
              position={activePreset.position}
              target={activePreset.target}
              tick={cameraTick}
            />
            <SelectedBoneFocusDirector bridgeRef={bridgeRef} selectedBoneName={selectedBoneName} />
            {url && (
              <Rig
                url={url}
                targetHeight={lookupRealHeight(url)}
                showSkeleton={showSkeleton}
                selectedBoneName={selectedBoneName}
                hoveredBoneName={hoveredBoneName}
                onHoverBone={setHoveredBoneName}
                transformMode={transformMode}
                onLoaded={onLoaded}
                onSelectBone={setSelectedBoneName}
                highlightedBones={highlightedBones}
                activeClip={activeClip}
                playing={playing}
                speed={speed}
                pendingPose={pendingPose}
                onPoseApplied={() => setPendingPose(null)}
                onBoneEdited={() => {
                  // The user just nudged a bone via TransformControls. Auto-
                  // pause the active clip so their edit stays visible (the
                  // mixer would otherwise overwrite local transforms on the
                  // next frame) and snapshot the live pose so a subsequent
                  // Save captures the edit even if Play is hit afterwards.
                  setPlaying(false);
                  const root = bridgeRef.current.root;
                  if (root) setPendingPose(capturePose(root));
                }}
                addBoneMode={addBoneMode}
                onTopologyChanged={(next) => setBones(next)}
                bridgeRef={bridgeRef}
              />
            )}
          </Suspense>
          <OrbitControls makeDefault target={[0, 0.9, 0]} />
        </Canvas>
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-md bg-background/70 backdrop-blur border border-border/40 text-[11px] text-muted-foreground">
          {selectedBoneName ? <>Selected: <span className="text-foreground font-mono">{selectedBoneName}</span></> : "Click a controller marker or bone in the list"}
        </div>

        {/* Bone topology editor — Add / Delete. Lives just under the selection
            readout so the affordances are next to what they act on. */}
        <div className="absolute top-14 left-3 flex items-center gap-1 px-1.5 py-1 rounded-md bg-background/70 backdrop-blur border border-border/40">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={() => {
              if (!selectedBoneName) {
                toast.error("Select a parent bone first");
                return;
              }
              const newName = bridgeRef.current.addBoneOnSpline?.(selectedBoneName);
              if (newName) {
                setSelectedBoneName(newName);
                toast.success(`Anchored new bone on spine of ${prettifyBoneName(selectedBoneName)}`);
              } else {
                toast.error("Couldn't anchor a new bone here");
              }
            }}
            title={selectedBoneName
              ? `Add a new bone on the spine, as a child of "${selectedBoneName}"`
              : "Select a bone first to anchor children to it"}
          >
            <BoneIcon className="w-3 h-3" />
            Add bone
          </Button>
          <div className="w-px h-4 bg-border/40 mx-0.5" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] gap-1 text-red-300 hover:text-red-200 hover:bg-red-500/10"
            disabled={!selectedBoneName}
            onClick={() => {
              if (!selectedBoneName) return;
              const name = selectedBoneName;
              if (!window.confirm(`Delete bone "${name}" and all its children?`)) return;
              const ok = bridgeRef.current.deleteBone?.(name);
              if (ok) {
                setSelectedBoneName(null);
                toast.success(`Removed ${prettifyBoneName(name)}`);
              } else {
                toast.error("Couldn't delete that bone");
              }
            }}
            title="Delete the selected bone"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </Button>
          <div className="w-px h-4 bg-border/40 mx-0.5" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={() => {
              if (!window.confirm("Reset skeleton to its original bind pose and remove every custom bone you've added?")) return;
              bridgeRef.current.resetSkeleton?.();
              setSelectedBoneName(null);
              toast.success("Skeleton reset to original");
            }}
            title="Restore the rig to its authored bind pose and strip every custom bone"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
        </div>

        {/* Cinematic camera deck — Reset + 4 preset angles. */}
        <div className="absolute top-3 right-3 flex items-center gap-1 px-1.5 py-1 rounded-md bg-background/70 backdrop-blur border border-border/40">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={() => focusCamera("reset")}
            title="Reset view"
          >
            <Maximize2 className="w-3 h-3" /> Reset
          </Button>
          <div className="w-px h-4 bg-border/40 mx-0.5" />
          {CAMERA_PRESETS.filter((p) => p.id !== "reset").map((p, i) => (
            <Button
              key={p.id}
              size="sm"
              variant={activeCamera === p.id ? "default" : "ghost"}
              className="h-7 px-2 text-[11px] gap-1"
              onClick={() => focusCamera(p.id)}
              title={p.label}
            >
              <Camera className="w-3 h-3" /> {i + 1}
            </Button>
          ))}
        </div>

        {/* Gizmo mode controls — bottom-left of viewport */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 px-1.5 py-1.5 rounded-2xl bg-black/70 backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          <button
            onClick={() => setTransformMode("translate")}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 ${
              transformMode === "translate"
                ? "bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                : "bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08]"
            }`}
            title="Move"
          >
            <Move className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTransformMode("rotate")}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 ${
              transformMode === "rotate"
                ? "bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                : "bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08]"
            }`}
            title="Rotate"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTransformMode("scale")}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 ${
              transformMode === "scale"
                ? "bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                : "bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08]"
            }`}
            title="Scale"
          >
            <Scaling className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}