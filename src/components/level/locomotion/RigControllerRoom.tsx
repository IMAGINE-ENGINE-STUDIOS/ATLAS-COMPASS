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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_CHARACTER_URL } from "@/lib/levelTypes";
import { Wand2, RotateCcw, Move, RefreshCw, Upload, Play, Pause, Send, Users, Save, Trash2, Image as ImageIcon, Camera, Maximize2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function findSkeleton(root: THREE.Object3D): THREE.Skeleton | null {
  let sk: THREE.Skeleton | null = null;
  root.traverse((o: any) => { if (!sk && o.isSkinnedMesh && o.skeleton) sk = o.skeleton; });
  return sk;
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

function Rig({
  url,
  targetHeight,
  showSkeleton,
  selectedBoneName,
  transformMode,
  onLoaded,
  onSelectBone,
  highlightedBones,
  activeClip,
  playing,
  speed,
  pendingPose,
  onPoseApplied,
  bridgeRef,
}: {
  url: string;
  targetHeight: number;
  showSkeleton: boolean;
  selectedBoneName: string | null;
  transformMode: "rotate" | "translate";
  onLoaded: (info: { bones: THREE.Bone[]; skeleton: THREE.Skeleton | null; clips: string[] }) => void;
  onSelectBone: (name: string) => void;
  highlightedBones: { name: string; color: string }[];
  activeClip: string | null;
  playing: boolean;
  speed: number;
  pendingPose: BonePose[] | null;
  onPoseApplied: () => void;
  bridgeRef: React.MutableRefObject<RigBridge>;
}) {
  const gltf = useGLTF(url);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
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
    (helper.material as any).linewidth = 2;
    helper.visible = showSkeleton;
    helperRef.current = helper;
    r3fScene.add(helper);
    const clips = (gltf.animations as THREE.AnimationClip[]) ?? [];
    clipsRef.current = clips;
    mixerRef.current = new THREE.AnimationMixer(cloned);
    bridgeRef.current.root = cloned;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned]);

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
      <primitive object={cloned} scale={normalizedScale} />
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
      {selectedBone && (
        <TransformControls
          object={selectedBone as THREE.Object3D}
          mode={transformMode}
          size={0.6}
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

export interface SceneCharacterRef {
  id: string;
  name: string;
  url: string;
  currentAnimation?: string;
}

export interface RigControllerRoomProps {
  /** Characters currently present in the linked scene (e.g. the Locomotion Walker). */
  sceneCharacters?: SceneCharacterRef[];
  /** Push a rig change (URL swap + chosen clip) back to a scene character. */
  onApplyToCharacter?: (characterId: string, patch: { url: string; currentAnimation?: string }) => void;
}

export default function RigControllerRoom({
  sceneCharacters = [],
  onApplyToCharacter,
}: RigControllerRoomProps = {}) {
  const [url, setUrl] = useState<string>(DEFAULT_CHARACTER_URL);
  const [pendingUrl, setPendingUrl] = useState<string>(DEFAULT_CHARACTER_URL);
  const [sourceLabel, setSourceLabel] = useState<string>("Xbot (Mixamo)");
  const [bones, setBones] = useState<THREE.Bone[]>([]);
  const [selectedBoneName, setSelectedBoneName] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [transformMode, setTransformMode] = useState<"rotate" | "translate">("rotate");
  const [controllerMap, setControllerMap] = useState<Record<ControllerKey, string | null>>(
    {} as Record<ControllerKey, string | null>,
  );
  const [clips, setClips] = useState<string[]>([]);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [targetCharId, setTargetCharId] = useState<string | null>(sceneCharacters[0]?.id ?? null);

  // ----- cinematic camera presets -----
  // The viewport offers a Reset View + four canned angles. Each click bumps
  // `cameraTick` so the in-canvas <CameraDirector/> re-applies the active
  // preset, even when the user re-picks the same one.
  type CameraPresetId = "reset" | "front" | "side" | "back" | "top";
  interface CamPreset { id: CameraPresetId; label: string; position: [number, number, number]; target: [number, number, number]; }
  const CAMERA_PRESETS: CamPreset[] = useMemo(() => [
    { id: "reset", label: "Reset",          position: [2.2, 1.6, 2.2],  target: [0, 1, 0] },
    { id: "front", label: "Front close-up", position: [0, 1.6, 2.6],    target: [0, 1.5, 0] },
    { id: "side",  label: "Profile",        position: [3.0, 1.4, 0],    target: [0, 1.2, 0] },
    { id: "back",  label: "Hero back",      position: [0, 1.8, -3.2],   target: [0, 1.2, 0] },
    { id: "top",   label: "Top down",       position: [0.01, 4.5, 0.01],target: [0, 0.9, 0] },
  ], []);
  const [activeCamera, setActiveCamera] = useState<CameraPresetId>("reset");
  const [cameraTick, setCameraTick] = useState(0);
  const activePreset = CAMERA_PRESETS.find((p) => p.id === activeCamera) ?? CAMERA_PRESETS[0];
  const focusCamera = (id: CameraPresetId) => {
    setActiveCamera(id);
    setCameraTick((t) => t + 1);
  };

  // ----- save system state -----
  const bridgeRef = useRef<RigBridge>({ root: null, snapshot: null });
  const [pendingPose, setPendingPose] = useState<BonePose[] | null>(null);
  const [saves, setSaves] = useState<RigSave[]>(() => getCachedRigSaves());
  const [savesLoading, setSavesLoading] = useState(false);
  const [activeSaveId, setActiveSaveId] = useState<string | null>(null);

  // Hydrate saves from the server (cache rendered immediately above).
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
    onApplyToCharacter(targetCharId, { url, currentAnimation: activeClip ?? undefined });
    toast.success("Applied to scene character");
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
      <aside className="w-80 shrink-0 border-r border-border/40 bg-background/80 backdrop-blur p-4 space-y-4 overflow-y-auto">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Rig Controller Room</h2>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            Explore any rigged character. Auto-detect controllers (hips, hands,
            feet, head…) then drag the colored markers to pose the rig.
          </p>
        </div>

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

        {/* Character library as a single compact dropdown. */}
        <div className="space-y-1.5">
          <Label className="text-[11px]">Character library</Label>
          <Select
            value={CHARACTER_LIBRARY.find((c) => c.url === url)?.id ?? ""}
            onValueChange={(id) => {
              const c = CHARACTER_LIBRARY.find((x) => x.id === id);
              if (c) handleLoadLibrary(c);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Pick a rigged character…" />
            </SelectTrigger>
            <SelectContent>
              {(["Human", "Creature", "Robot"] as const).map((cat) => {
                const items = CHARACTER_LIBRARY.filter((c) => c.category === cat);
                if (items.length === 0) return null;
                return (
                  <SelectGroup key={cat}>
                    <SelectLabel className="text-[10px] uppercase tracking-wide">
                      {cat}
                    </SelectLabel>
                    {items.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleAutoSet} disabled={bones.length === 0}>
            <Wand2 className="w-3 h-3 mr-1.5" /> Auto-set
          </Button>
          <Button size="sm" variant="outline" onClick={handleResetPose}>
            <RotateCcw className="w-3 h-3 mr-1.5" /> Reset pose
          </Button>
        </div>

        {/* ---- Save + Saved gallery ---- */}
        <div className="rounded border border-border/40 p-3 space-y-2 bg-muted/10">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] flex items-center gap-1.5">
              <Save className="w-3 h-3" /> Saved rigs ({saves.length})
            </Label>
            <Button
              size="sm"
              className="h-7"
              onClick={handleSave}
              disabled={bones.length === 0}
            >
              <Save className="w-3 h-3 mr-1.5" /> Save
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Stores model, pose, controllers, and clip — synced to your account
            with a local cache fallback.
          </p>
          {saves.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/70 italic">
              {savesLoading ? "Loading…" : "No saves yet — pose the rig then hit Save."}
            </p>
          ) : (
            <ScrollArea className="h-44">
              <div className="grid grid-cols-2 gap-1.5 pr-1.5">
                {saves.map((s) => {
                  const active = activeSaveId === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`group relative rounded border overflow-hidden transition ${
                        active ? "border-foreground/40 ring-1 ring-foreground/30" : "border-border/40 hover:border-border"
                      }`}
                    >
                      <button
                        onClick={() => handleLoadSave(s)}
                        className="block w-full text-left"
                        title={`${s.name}\n${new Date(s.created_at).toLocaleString()}`}
                      >
                        <div className="aspect-square bg-slate-900 flex items-center justify-center">
                          {s.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.thumbnail} alt={s.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="px-1.5 py-1 text-[10px] truncate">{s.name}</div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSave(s); }}
                        className="absolute top-1 right-1 p-1 rounded bg-background/80 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="rounded border border-border/40 p-3 space-y-2 bg-muted/10">
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Animations ({clips.length})</Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={() => setPlaying((p) => !p)}
              disabled={!activeClip}
            >
              {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </Button>
          </div>
          {clips.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No clips found in this glTF.</p>
          ) : (
            <ScrollArea className="h-28">
              <div className="grid gap-0.5">
                {clips.map((name) => (
                  <button
                    key={name}
                    onClick={() => setActiveClip(name)}
                    className={`text-left text-[11px] px-2 py-0.5 rounded transition ${
                      activeClip === name
                        ? "bg-foreground/15 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
          <div>
            <Label className="text-[10px]">Speed ×{speed.toFixed(2)}</Label>
            <Slider value={[speed]} min={0} max={3} step={0.05} onValueChange={([v]) => setSpeed(v)} />
          </div>
        </div>

        <div className="rounded border border-border/40 p-3 space-y-2 bg-muted/10">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={showSkeleton} onCheckedChange={setShowSkeleton} />
            Show skeleton overlay
          </label>
          <div className="flex items-center gap-2 text-xs">
            <Button
              size="sm" variant={transformMode === "rotate" ? "default" : "outline"}
              className="h-7 flex-1"
              onClick={() => setTransformMode("rotate")}
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Rotate
            </Button>
            <Button
              size="sm" variant={transformMode === "translate" ? "default" : "outline"}
              className="h-7 flex-1"
              onClick={() => setTransformMode("translate")}
            >
              <Move className="w-3 h-3 mr-1" /> Move
            </Button>
          </div>
        </div>

        <XrayBodyMap
          controllerMap={controllerMap}
          selectedBoneName={selectedBoneName}
          onSelectController={(boneName) => setSelectedBoneName(boneName)}
          onClearControllers={mappedCount > 0 ? handleClearControllers : undefined}
          mappedCount={mappedCount}
        />

        <div>
          <Label className="text-xs">All bones ({bones.length})</Label>
          <ScrollArea className="h-48 mt-1 rounded border border-border/40">
            <ul className="text-[11px] font-mono">
              {bones.map((b) => (
                <li key={b.uuid}>
                  <button
                    onClick={() => setSelectedBoneName(b.name)}
                    className={`block w-full text-left px-2 py-0.5 truncate hover:bg-muted/30 ${
                      selectedBoneName === b.name ? "bg-muted/40 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {b.name}
                  </button>
                </li>
              ))}
              {bones.length === 0 && (
                <li className="px-2 py-2 text-[11px] text-muted-foreground">
                  Loading rig…
                </li>
              )}
            </ul>
          </ScrollArea>
        </div>

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
          <p className="text-[10px] text-muted-foreground truncate">Source: {sourceLabel}</p>
        </div>
      </aside>

      {/* Viewport */}
      <main className="flex-1 relative">
        <Canvas
          camera={{ position: [2.2, 1.6, 2.2], fov: 45, near: 0.05, far: 200 }}
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
            {url && (
              <Rig
                url={url}
                targetHeight={lookupRealHeight(url)}
                showSkeleton={showSkeleton}
                selectedBoneName={selectedBoneName}
                transformMode={transformMode}
                onLoaded={onLoaded}
                onSelectBone={setSelectedBoneName}
                highlightedBones={highlightedBones}
                activeClip={activeClip}
                playing={playing}
                speed={speed}
                pendingPose={pendingPose}
                onPoseApplied={() => setPendingPose(null)}
                bridgeRef={bridgeRef}
              />
            )}
          </Suspense>
          <OrbitControls makeDefault target={[0, 1, 0]} />
        </Canvas>
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-md bg-background/70 backdrop-blur border border-border/40 text-[11px] text-muted-foreground">
          {selectedBoneName ? <>Selected: <span className="text-foreground font-mono">{selectedBoneName}</span></> : "Click a controller marker or bone in the list"}
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
      </main>
    </div>
  );
}