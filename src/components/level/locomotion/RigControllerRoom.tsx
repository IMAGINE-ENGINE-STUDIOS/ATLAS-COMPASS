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
import { Wand2, RotateCcw, Move, RefreshCw, Upload, Play, Pause, Send, Users } from "lucide-react";
import { toast } from "sonner";

/**
 * Curated free / open-licensed rigged characters. All URLs are public CDN
 * sources (three.js examples + Khronos glTF Sample Models, both CC0 / CC-BY).
 * Loading any of these populates the rig + clip list the same way an upload
 * would.
 */
interface LibraryCharacter {
  id: string;
  name: string;
  category: "Human" | "Creature" | "Monster" | "Robot";
  url: string;
  credit: string;
}

const KHRONOS =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";
const THREE_EX = "https://threejs.org/examples/models/gltf";

const CHARACTER_LIBRARY: LibraryCharacter[] = [
  // Humans
  { id: "xbot",        name: "Xbot",          category: "Human",    url: `${THREE_EX}/Xbot.glb`,                                  credit: "three.js / Mixamo" },
  { id: "soldier",     name: "Soldier",       category: "Human",    url: `${THREE_EX}/Soldier.glb`,                               credit: "three.js / Mixamo" },
  { id: "michelle",    name: "Michelle",      category: "Human",    url: `${THREE_EX}/Michelle.glb`,                              credit: "three.js / Mixamo" },
  { id: "cesium-man",  name: "Cesium Man",    category: "Human",    url: `${KHRONOS}/CesiumMan/glTF-Binary/CesiumMan.glb`,         credit: "Khronos (CC-BY)" },
  { id: "rigged-fig",  name: "Rigged Figure", category: "Human",    url: `${KHRONOS}/RiggedFigure/glTF-Binary/RiggedFigure.glb`,   credit: "Khronos (CC0)" },
  // Creatures
  { id: "fox",         name: "Fox",           category: "Creature", url: `${KHRONOS}/Fox/glTF-Binary/Fox.glb`,                     credit: "Khronos (CC0)" },
  { id: "brainstem",   name: "BrainStem",     category: "Creature", url: `${KHRONOS}/BrainStem/glTF-Binary/BrainStem.glb`,         credit: "Khronos (CC-BY)" },
  { id: "flamingo",    name: "Flamingo",      category: "Creature", url: `${THREE_EX}/Flamingo.glb`,                              credit: "three.js" },
  { id: "stork",       name: "Stork",         category: "Creature", url: `${THREE_EX}/Stork.glb`,                                 credit: "three.js" },
  { id: "parrot",      name: "Parrot",        category: "Creature", url: `${THREE_EX}/Parrot.glb`,                                credit: "three.js" },
  { id: "horse",       name: "Horse",         category: "Creature", url: `${THREE_EX}/Horse.glb`,                                 credit: "three.js" },
  // Robots
  { id: "robot-exp",   name: "Robot Expressive", category: "Robot", url: `${THREE_EX}/RobotExpressive/RobotExpressive.glb`,       credit: "three.js" },
];

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

function Rig({
  url,
  showSkeleton,
  selectedBoneName,
  transformMode,
  onLoaded,
  onSelectBone,
  highlightedBones,
  activeClip,
  playing,
  speed,
}: {
  url: string;
  showSkeleton: boolean;
  selectedBoneName: string | null;
  transformMode: "rotate" | "translate";
  onLoaded: (info: { bones: THREE.Bone[]; skeleton: THREE.Skeleton | null; clips: string[] }) => void;
  onSelectBone: (name: string) => void;
  highlightedBones: { name: string; color: string }[];
  activeClip: string | null;
  playing: boolean;
  speed: number;
}) {
  const gltf = useGLTF(url);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
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
    onLoaded({
      bones: collectBones(cloned),
      skeleton: findSkeleton(cloned),
      clips: clips.map((c) => c.name),
    });
    return () => {
      r3fScene.remove(helper);
      helper.dispose?.();
      helperRef.current = null;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
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
      <primitive object={cloned} />
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
    toast.success(`Loaded ${c.name}`);
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

        <div className="space-y-1.5">
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

        <div className="rounded border border-border/40 p-3 space-y-2 bg-muted/10">
          <Label className="text-[11px]">Character library</Label>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Free rigged models. Click to load — replaces the current rig.
          </p>
          {(["Human", "Creature", "Robot"] as const).map((cat) => {
            const items = CHARACTER_LIBRARY.filter((c) => c.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-1.5 mb-1">
                  {cat}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {items.map((c) => {
                    const active = url === c.url;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleLoadLibrary(c)}
                        title={c.credit}
                        className={`text-left text-[11px] px-2 py-1 rounded border transition truncate ${
                          active
                            ? "border-foreground/40 bg-foreground/10"
                            : "border-border/40 hover:bg-muted/30"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleAutoSet} disabled={bones.length === 0}>
            <Wand2 className="w-3 h-3 mr-1.5" /> Auto-set
          </Button>
          <Button size="sm" variant="outline" onClick={handleResetPose}>
            <RotateCcw className="w-3 h-3 mr-1.5" /> Reset pose
          </Button>
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

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs">Controllers ({mappedCount}/{CONTROLLERS.length})</Label>
            {mappedCount > 0 && (
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={handleClearControllers}
              >clear</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {CONTROLLERS.map((c) => {
              const mapped = controllerMap[c.key];
              const active = selectedBoneName === mapped;
              return (
                <button
                  key={c.key}
                  disabled={!mapped}
                  onClick={() => mapped && setSelectedBoneName(mapped)}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded border text-[10px] text-left transition ${
                    !mapped
                      ? "border-border/20 text-muted-foreground/60"
                      : active
                        ? "border-foreground/40 bg-foreground/10"
                        : "border-border/40 hover:bg-muted/30"
                  }`}
                  title={mapped ?? "Not detected"}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: mapped ? c.color : "transparent", border: `1px solid ${c.color}` }}
                  />
                  <span className="truncate">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

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
      </aside>

      {/* Viewport */}
      <main className="flex-1 relative">
        <Canvas
          camera={{ position: [2.2, 1.6, 2.2], fov: 45, near: 0.05, far: 200 }}
          shadows
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
            {url && (
              <Rig
                url={url}
                showSkeleton={showSkeleton}
                selectedBoneName={selectedBoneName}
                transformMode={transformMode}
                onLoaded={onLoaded}
                onSelectBone={setSelectedBoneName}
                highlightedBones={highlightedBones}
                activeClip={activeClip}
                playing={playing}
                speed={speed}
              />
            )}
          </Suspense>
          <OrbitControls makeDefault target={[0, 1, 0]} />
        </Canvas>
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-md bg-background/70 backdrop-blur border border-border/40 text-[11px] text-muted-foreground">
          {selectedBoneName ? <>Selected: <span className="text-foreground font-mono">{selectedBoneName}</span></> : "Click a controller marker or bone in the list"}
        </div>
      </main>
    </div>
  );
}