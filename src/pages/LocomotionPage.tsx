import { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import LevelScene3D from "@/components/level/LevelScene3D";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  EMPTY_SCENE,
  DEFAULT_CHARACTER_URL,
  defaultTerrain,
  newId,
  type LevelScene,
  type SceneObject,
  type CharacterObject,
  type PrimitiveObject,
  type TrajectoryObject,
} from "@/lib/levelTypes";
import { Play, Pause, ArrowLeft } from "lucide-react";
import RigControllerRoom from "@/components/level/locomotion/RigControllerRoom";

/**
 * Standalone locomotion playground. Shows a small terrain with stairs, a
 * ramp, and a trajectory with Smart Path enabled — so a character walks
 * the environment, climbs the stairs, follows the ramp's incline, and
 * adjusts speed on slopes. All settings are live-tweakable.
 */

function makeStairs(): PrimitiveObject[] {
  const out: PrimitiveObject[] = [];
  for (let i = 0; i < 6; i++) {
    out.push({
      id: newId("step"),
      kind: "primitive",
      name: `Step ${i + 1}`,
      position: [6, 0.15 + i * 0.3, -3 + i * 0.8],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      shape: "box",
      color: [0.55, 0.45, 0.35, 1],
      metalness: 0.05,
      roughness: 0.9,
      faceOverrides: {},
    } as PrimitiveObject);
    // Add stretched box for step depth
    out[out.length - 1].scale = [3, 0.3, 0.8];
  }
  return out;
}

function makeRamp(): PrimitiveObject {
  return {
    id: newId("ramp"),
    kind: "primitive",
    name: "Ramp",
    position: [-5, 1, 0],
    rotation: [-0.35, 0, 0],
    scale: [3, 0.2, 6],
    visible: true,
    shape: "box",
    color: [0.4, 0.5, 0.7, 1],
    metalness: 0.1,
    roughness: 0.7,
    faceOverrides: {},
  };
}

function makeCharacter(): CharacterObject {
  return {
    id: "loco-char",
    kind: "character",
    name: "Walker",
    position: [0, 0.5, 6],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    url: DEFAULT_CHARACTER_URL,
    source: "Xbot (Mixamo)",
    animationSpeed: 1,
    paused: false,
    currentAnimation: "walk",
    crossfade: 0.25,
  };
}

function makeDemoTrajectory(charId: string): TrajectoryObject {
  return {
    id: "loco-traj",
    kind: "trajectory",
    name: "Demo path",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    points: [
      [0, 0.5, 6],
      [-5, 0.5, 3],
      [-5, 2, -3],
      [0, 0.5, -6],
      [6, 0.5, -3],
      [6, 2.5, 2],
      [3, 0.5, 6],
    ],
    closed: true,
    tension: 0.5,
    speed: 2.5,
    sections: [],
    followers: [charId],
    orientToPath: true,
    loop: true,
    color: "#22d3ee",
    smartPath: true,
    maxStepHeight: 0.4,
    slopeSpeedFactor: 0.6,
  };
}

function buildScene(opts: {
  smartPath: boolean;
  speed: number;
  maxStep: number;
  slopeFactor: number;
}): LevelScene {
  const character = makeCharacter();
  const stairs = makeStairs();
  const ramp = makeRamp();
  const traj = makeDemoTrajectory(character.id);
  traj.smartPath = opts.smartPath;
  traj.speed = opts.speed;
  traj.maxStepHeight = opts.maxStep;
  traj.slopeSpeedFactor = opts.slopeFactor;

  const objects: SceneObject[] = [character, ramp, ...stairs, traj];
  const terrain = defaultTerrain();
  terrain.enabled = true;
  terrain.size = [40, 1, 40];
  terrain.color = [0.18, 0.32, 0.22, 1];

  return {
    ...EMPTY_SCENE,
    objects,
    terrain,
  };
}

export default function LocomotionPage() {
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<"path" | "rig">("path");
  // Build the demo scene exactly once so live slider changes do NOT recreate
  // objects (which would reset character position, generate new ids, and
  // restart the trajectory phase). Sliders patch the trajectory in place.
  const [scene, setScene] = useState<LevelScene>(() =>
    buildScene({ smartPath: true, speed: 2.5, maxStep: 0.4, slopeFactor: 0.6 }),
  );

  const traj = scene.objects.find(
    (o) => o.kind === "trajectory",
  ) as TrajectoryObject | undefined;
  const smartPath = !!traj?.smartPath;
  const speed = traj?.speed ?? 2.5;
  const maxStep = traj?.maxStepHeight ?? 0.4;
  const slopeFactor = traj?.slopeSpeedFactor ?? 0.6;

  const patchTraj = useCallback((patch: Partial<TrajectoryObject>) => {
    setScene((s) => ({
      ...s,
      objects: s.objects.map((o) =>
        o.kind === "trajectory" ? { ...o, ...patch } : o,
      ),
    }));
  }, []);

  const resetCharacter = useCallback(() => {
    setScene((s) => ({
      ...s,
      objects: s.objects.map((o) =>
        o.id === "loco-char"
          ? { ...o, position: [0, 0.5, 6] as [number, number, number] }
          : o,
      ),
    }));
  }, []);

  return (
    <div className="fixed inset-0 flex bg-slate-950 text-foreground">
      {mode === "rig" ? (
        <div className="flex w-full h-full">
          <div className="absolute top-3 right-3 z-20 flex gap-1.5 rounded-md bg-background/80 backdrop-blur border border-border/40 p-1">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setMode("path")}>Path Lab</Button>
            <Button size="sm" variant="default" className="h-7" onClick={() => setMode("rig")}>Rig Room</Button>
          </div>
          <RigControllerRoom />
        </div>
      ) : (
      <>
      {/* Side panel */}
      <aside className="w-80 shrink-0 border-r border-border/40 bg-background/80 backdrop-blur p-4 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <Link to="/levels">
            <Button size="sm" variant="ghost" className="h-8 px-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
          <Button
            size="sm"
            variant={playing ? "default" : "outline"}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? (
              <><Pause className="w-3 h-3 mr-1" /> Pause</>
            ) : (
              <><Play className="w-3 h-3 mr-1" /> Play</>
            )}
          </Button>
        </div>

        <div className="flex gap-1.5 rounded-md border border-border/40 p-1">
          <Button size="sm" variant="default" className="h-7 flex-1" onClick={() => setMode("path")}>Path Lab</Button>
          <Button size="sm" variant="ghost" className="h-7 flex-1" onClick={() => setMode("rig")}>Rig Room</Button>
        </div>

        <div>
          <h1 className="text-lg font-semibold tracking-tight">Locomotion Lab</h1>
          <p className="text-xs text-muted-foreground mt-1">
            A character follows a closed trajectory across stairs, a ramp,
            and uneven terrain. Toggle <strong>Smart Path</strong> to see the
            difference between floating along the spline and walking the world.
          </p>
        </div>

        <div className="rounded border border-border/40 p-3 space-y-3 bg-muted/10">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={smartPath} onCheckedChange={(v) => patchTraj({ smartPath: v })} />
            Smart path (terrain-aware)
          </label>
          <p className="text-[11px] text-muted-foreground leading-snug">
            When on, the follower raycasts the world each frame, snaps to the
            surface, climbs steps up to <em>Max step</em>, and slows / speeds
            up on slopes by <em>Slope factor</em>.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Base speed ({speed.toFixed(2)} u/s)</Label>
            <Slider
              value={[speed]} min={0.2} max={10} step={0.1}
              onValueChange={([v]) => patchTraj({ speed: v })}
            />
          </div>
          <div>
            <Label className="text-xs">Max step ({maxStep.toFixed(2)} m)</Label>
            <Slider
              value={[maxStep]} min={0.05} max={1.2} step={0.05}
              onValueChange={([v]) => patchTraj({ maxStepHeight: v })}
            />
          </div>
          <div>
            <Label className="text-xs">Slope factor (×{slopeFactor.toFixed(2)})</Label>
            <Slider
              value={[slopeFactor]} min={0} max={2} step={0.05}
              onValueChange={([v]) => patchTraj({ slopeSpeedFactor: v })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              0 = ignore slope. Higher values exaggerate uphill slowdown /
              downhill speedup.
            </p>
          </div>
          <Button size="sm" variant="outline" className="w-full" onClick={resetCharacter}>
            Reset character position
          </Button>
        </div>

        <div className="border-t border-border/40 pt-3">
          <p className="text-[11px] text-muted-foreground leading-snug">
            Want a full editor? Open any LEVEL and add a trajectory with
            followers — the same Smart Path option is available there.
          </p>
          <Link to="/levels" className="block mt-2">
            <Button variant="outline" size="sm" className="w-full">
              Open LEVEL editor
            </Button>
          </Link>
        </div>
      </aside>

      {/* Viewport */}
      <main className="flex-1 relative">
        <LevelScene3D
          scene={scene}
          playing={playing}
          showGrid={false}
          className="w-full h-full"
        />
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-md bg-background/70 backdrop-blur border border-border/40 text-[11px] text-muted-foreground">
          Locomotion playground · {playing ? "Playing" : "Paused"} · Smart path {smartPath ? "ON" : "OFF"}
        </div>
      </main>
      </>
      )}
    </div>
  );
}