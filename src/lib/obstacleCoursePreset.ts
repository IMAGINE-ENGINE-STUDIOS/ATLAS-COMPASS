import {
  DEFAULT_CHARACTER_URL,
  DEFAULT_LAYER_ID,
  EMPTY_SCENE,
  LevelScene,
  PrimitiveObject,
  SceneObject,
  defaultLayers,
  defaultTerrain,
  newId,
} from "./levelTypes";

type RGBA = [number, number, number, number];
type Vec3 = [number, number, number];

interface BoxOpts {
  name: string;
  pos: Vec3;
  size: Vec3;
  rot?: Vec3;
  color?: RGBA;
  metalness?: number;
  roughness?: number;
  interaction?: "pushable" | "sit" | "use";
  gravity?: boolean;
  shape?: "box" | "cylinder" | "sphere" | "cone";
}

const COLORS: Record<string, RGBA> = {
  ground: [0.18, 0.22, 0.28, 1],
  stair: [0.78, 0.42, 0.18, 1],
  ramp: [0.25, 0.55, 0.85, 1],
  wall: [0.45, 0.45, 0.5, 1],
  platform: [0.55, 0.75, 0.35, 1],
  hazard: [0.95, 0.25, 0.25, 1],
  pushable: [0.95, 0.78, 0.22, 1],
  goal: [0.4, 0.95, 0.55, 1],
  pillar: [0.32, 0.32, 0.38, 1],
};

function box(o: BoxOpts): PrimitiveObject {
  return {
    id: newId("obj"),
    name: o.name,
    kind: "primitive",
    shape: o.shape ?? "box",
    position: o.pos,
    rotation: o.rot ?? [0, 0, 0],
    scale: o.size,
    visible: true,
    color: o.color ?? COLORS.platform,
    metalness: o.metalness ?? 0.05,
    roughness: o.roughness ?? 0.85,
    layerId: DEFAULT_LAYER_ID,
    interaction: o.interaction,
    physics: o.gravity ? { gravity: true } : undefined,
  };
}

/**
 * Build a feature-rich obstacle course used to develop and test the
 * locomotion system. Includes:
 *  - flat spawn pad
 *  - staircases (low + tall steps)
 *  - ramps at different slopes
 *  - elevated platforms with gap jumps
 *  - narrow balance beam
 *  - slalom of pillars
 *  - low ceiling crouch tunnel
 *  - pushable crates (with gravity) + bowling pins
 *  - moving-target platforms (static placeholders)
 *  - parkour wall jumps
 *  - hazard pit
 *  - goal podium
 * Plus a playable Xbot character at spawn.
 */
export function buildObstacleCourseScene(): LevelScene {
  const objects: SceneObject[] = [];

  // --- Spawn pad
  objects.push(
    box({ name: "Spawn pad", pos: [0, 0.05, 0], size: [6, 0.1, 6], color: [0.2, 0.65, 0.95, 1] }),
  );

  // --- Low staircase (8 steps, 0.2m rise)
  for (let i = 0; i < 8; i++) {
    objects.push(
      box({
        name: `Low step ${i + 1}`,
        pos: [6 + i * 0.6, 0.1 + i * 0.2, 0],
        size: [0.6, 0.2 + i * 0.2, 3],
        color: COLORS.stair,
      }),
    );
  }

  // --- Tall staircase (testing max step height) — 5 steps × 0.45m
  for (let i = 0; i < 5; i++) {
    objects.push(
      box({
        name: `Tall step ${i + 1}`,
        pos: [6 + i * 0.9, 0.225 + i * 0.45, -5],
        size: [0.9, 0.45 + i * 0.45, 3],
        color: [0.85, 0.32, 0.32, 1],
      }),
    );
  }

  // --- Ramps: gentle 15°, medium 30°, steep 45°
  const ramps: Array<{ name: string; angleDeg: number; offsetX: number }> = [
    { name: "Ramp 15°", angleDeg: 15, offsetX: -6 },
    { name: "Ramp 30°", angleDeg: 30, offsetX: -9 },
    { name: "Ramp 45°", angleDeg: 45, offsetX: -12 },
  ];
  ramps.forEach((r) => {
    const len = 6;
    const a = (r.angleDeg * Math.PI) / 180;
    objects.push(
      box({
        name: r.name,
        pos: [r.offsetX, (len / 2) * Math.sin(a), 0],
        size: [2, 0.2, len],
        rot: [a, 0, 0],
        color: COLORS.ramp,
      }),
    );
  });

  // --- Elevated platforms with gap jumps (increasing gaps)
  const platBaseZ = 8;
  const gaps = [1.0, 1.6, 2.2, 2.8, 3.4];
  let cursorZ = platBaseZ;
  for (let i = 0; i < gaps.length; i++) {
    objects.push(
      box({
        name: `Jump pad ${i + 1}`,
        pos: [0, 1.0, cursorZ],
        size: [2, 0.2, 2],
        color: COLORS.platform,
      }),
    );
    cursorZ += 2 + gaps[i];
  }

  // --- Narrow balance beam
  objects.push(
    box({
      name: "Balance beam",
      pos: [-4, 0.5, 8],
      size: [0.25, 0.2, 10],
      color: [0.7, 0.55, 0.2, 1],
    }),
  );

  // --- Pillar slalom
  for (let i = 0; i < 8; i++) {
    objects.push(
      box({
        name: `Slalom pillar ${i + 1}`,
        pos: [(-8 + i * 1.2), 1.0, -10 + (i % 2) * 1.2],
        size: [0.5, 2.0, 0.5],
        shape: "cylinder",
        color: COLORS.pillar,
      }),
    );
  }

  // --- Crouch tunnel (low ceiling)
  objects.push(
    box({ name: "Tunnel floor", pos: [12, 0.05, -10], size: [3, 0.1, 8], color: COLORS.ground }),
    box({ name: "Tunnel ceiling", pos: [12, 1.3, -10], size: [3, 0.1, 8], color: COLORS.wall }),
    box({ name: "Tunnel wall L", pos: [10.6, 0.7, -10], size: [0.2, 1.4, 8], color: COLORS.wall }),
    box({ name: "Tunnel wall R", pos: [13.4, 0.7, -10], size: [0.2, 1.4, 8], color: COLORS.wall }),
  );

  // --- Pushable crates (with gravity)
  for (let i = 0; i < 4; i++) {
    objects.push(
      box({
        name: `Pushable crate ${i + 1}`,
        pos: [-2 + i * 1.1, 0.4, 4],
        size: [0.8, 0.8, 0.8],
        color: COLORS.pushable,
        interaction: "pushable",
        gravity: true,
        roughness: 0.7,
      }),
    );
  }

  // --- Bowling-pin cluster (pushable spheres)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    objects.push(
      box({
        name: `Bowling pin ${i + 1}`,
        pos: [10 + Math.cos(ang) * 1.2, 0.4, 6 + Math.sin(ang) * 1.2],
        size: [0.4, 0.4, 0.4],
        shape: "sphere",
        color: [0.95, 0.95, 0.95, 1],
        interaction: "pushable",
        gravity: true,
        metalness: 0.2,
        roughness: 0.4,
      }),
    );
  }

  // --- Parkour wall-jump corridor (alternating high platforms)
  for (let i = 0; i < 5; i++) {
    objects.push(
      box({
        name: `Parkour ledge ${i + 1}`,
        pos: [-16 + i * 1.8, 1.5 + i * 0.5, -8 + (i % 2) * 2.5],
        size: [1.6, 0.2, 1.2],
        color: [0.55, 0.35, 0.85, 1],
      }),
    );
  }

  // --- Hazard pit walls (visual marker only; pit is the gap in ground)
  objects.push(
    box({
      name: "Hazard pit marker",
      pos: [4, 0.05, -16],
      size: [4, 0.1, 4],
      color: COLORS.hazard,
    }),
  );

  // --- Big arena walls (perimeter)
  const ARENA = 30;
  objects.push(
    box({ name: "Wall +X", pos: [ARENA, 1.5, 0], size: [0.3, 3, ARENA * 2], color: COLORS.wall, metalness: 0.1 }),
    box({ name: "Wall -X", pos: [-ARENA, 1.5, 0], size: [0.3, 3, ARENA * 2], color: COLORS.wall, metalness: 0.1 }),
    box({ name: "Wall +Z", pos: [0, 1.5, ARENA], size: [ARENA * 2, 3, 0.3], color: COLORS.wall, metalness: 0.1 }),
    box({ name: "Wall -Z", pos: [0, 1.5, -ARENA], size: [ARENA * 2, 3, 0.3], color: COLORS.wall, metalness: 0.1 }),
  );

  // --- Goal podium
  objects.push(
    box({
      name: "Goal podium",
      pos: [0, 0.6, 20],
      size: [3, 1.2, 3],
      color: COLORS.goal,
      metalness: 0.4,
      roughness: 0.25,
    }),
    box({
      name: "Goal flag",
      pos: [0, 2.4, 20],
      size: [0.1, 2.4, 0.1],
      shape: "cylinder",
      color: [0.9, 0.9, 0.9, 1],
    }),
  );

  // --- Playable character at spawn
  objects.push({
    id: newId("chr"),
    name: "Test Subject",
    kind: "character",
    url: DEFAULT_CHARACTER_URL,
    source: "Xbot (Mixamo)",
    position: [0, 0.1, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    layerId: DEFAULT_LAYER_ID,
    animationSpeed: 1,
    paused: false,
    crossfade: 0.2,
    playable: true,
    controlScheme: "both",
    cameraMode: "third",
    locomotion: {
      walkSpeed: 2.2,
      runSpeed: 5.5,
      jumpHeight: 1.6,
      gravity: 22,
      height: 1.7,
      radius: 0.32,
      maxStepHeight: 0.45,
    },
  });

  const terrain = defaultTerrain();
  terrain.enabled = true;
  terrain.size = [80, 1, 80];
  terrain.color = [0.12, 0.16, 0.22, 1];
  terrain.snapToSurface = false;

  return {
    ...EMPTY_SCENE,
    layers: defaultLayers(),
    terrain,
    objects,
    lights: [
      {
        id: "obs-key",
        name: "Sun",
        kind: "directional",
        position: [12, 18, 8],
        color: [1, 0.96, 0.88, 1],
        intensity: 1.6,
        castShadow: true,
      },
      {
        id: "obs-fill",
        name: "Fill",
        kind: "ambient",
        position: [0, 0, 0],
        color: [0.6, 0.7, 0.95, 1],
        intensity: 0.35,
      },
    ],
    environment: {
      background: "#0d1422",
      ambient: 0.45,
      fog: { color: "#0d1422", near: 25, far: 90 },
      gi: {
        enabled: true,
        skyColor: "#9ecbff",
        groundColor: "#34402e",
        hemisphereIntensity: 0.55,
        contactShadows: true,
        contactOpacity: 0.4,
        contactBlur: 2.5,
      },
    },
  };
}