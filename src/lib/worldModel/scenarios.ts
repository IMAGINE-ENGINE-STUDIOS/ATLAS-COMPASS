/**
 * Scenario generation for the World Model Engine.
 *
 * A scenario is a deterministic, richly populated 3D world: streets, towers,
 * props, moving NPC agents and goal beacons. Everything derives from a seed, so
 * the same world can be rebuilt on any device (and therefore the same latent
 * space is reproducible).
 *
 * `seed-image` is the "walk around a 2D image" mode: an uploaded picture is
 * sampled into a colour + luminance heightfield and extruded into real
 * geometry, so the agent literally explores the picture.
 */
import {
  mulberry32,
  type ArenaSpec,
  type ArenaBlock,
  type SceneProp,
  type SceneAgent,
  type SceneBeacon,
} from "./types";

export type { SceneProp, SceneAgent, SceneBeacon };

export type ScenarioId = "neon-city" | "seed-image" | "arcade-arena" | "voxel-canyon";

export interface ScenarioMeta {
  id: ScenarioId;
  label: string;
  blurb: string;
  needsImage?: boolean;
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: "neon-city",
    label: "Neon city",
    blurb: "Street grid, towers, traffic drones and glowing beacons. Dense visual variety — the best default for training V.",
  },
  {
    id: "seed-image",
    label: "Seed image",
    blurb: "Upload any picture. It becomes a colour + height field you can walk through, and the model learns its structure.",
    needsImage: true,
  },
  {
    id: "arcade-arena",
    label: "Arcade arena",
    blurb: "Bounded playfield with pickups, ramps and patrolling opponents. Good for evolving a goal-seeking controller.",
  },
  {
    id: "voxel-canyon",
    label: "Voxel canyon",
    blurb: "Eroded terrain corridors with long sightlines — hard dynamics, rewarding for M.",
  },
];

const NEON = ["#7dd3fc", "#a78bfa", "#f472b6", "#facc15", "#34d399", "#fb923c", "#f87171", "#38bdf8"];

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

/* ------------------------------------------------------------------ */

function neonCity(seed: number): ArenaSpec {
  const rnd = mulberry32(seed);
  const blocks: ArenaBlock[] = [];
  const props: SceneProp[] = [];
  const agents: SceneAgent[] = [];
  const beacons: SceneBeacon[] = [];
  const cell = 16;
  const half = 3; // 7x7 city cells => 112m across

  for (let gx = -half; gx <= half; gx++) {
    for (let gz = -half; gz <= half; gz++) {
      if (gx === 0 && gz === 0) continue; // plaza
      const cx = gx * cell;
      const cz = gz * cell;
      const towers = 1 + Math.floor(rnd() * 3);
      for (let t = 0; t < towers; t++) {
        const w = 3 + rnd() * 5;
        const d = 3 + rnd() * 5;
        const h = 4 + rnd() * (Math.abs(gx) + Math.abs(gz) < 3 ? 26 : 12);
        blocks.push({
          p: [cx + (rnd() - 0.5) * 6, h / 2, cz + (rnd() - 0.5) * 6],
          s: [w, h, d],
          c: rnd() > 0.72 ? pick(rnd, NEON) : "#1b2440",
        });
      }
      // street furniture
      if (rnd() > 0.4) {
        props.push({
          k: "cyl",
          p: [cx + cell / 2 - 1.5, 2.4, cz + cell / 2 - 1.5],
          s: [0.16, 0.16, 4.8],
          c: "#cbd5f5",
          e: 0.9,
        });
      }
      if (rnd() > 0.6) {
        props.push({ k: "cone", p: [cx - 5 + rnd() * 10, 0.6, cz - 5 + rnd() * 10], s: [0.7, 0.7, 1.2], c: pick(rnd, NEON) });
      }
    }
  }

  // plaza landmark
  props.push({ k: "torus", p: [0, 9, 0], s: [6, 0.7, 1], c: "#7dd3fc", e: 1.6, rot: 0.4 });
  props.push({ k: "cyl", p: [0, 4.5, 0], s: [1.6, 1.6, 9], c: "#0f1a33", e: 0.2 });

  // traffic drones patrolling the avenues
  for (let i = 0; i < 8; i++) {
    const along = (i % 2 === 0 ? 1 : -1) * (cell * (1 + Math.floor(rnd() * half)) - cell / 2);
    const axis = i % 2 === 0;
    agents.push({
      path: axis
        ? [[-52, along], [52, along]]
        : [[along, -52], [along, 52]],
      speed: 4 + rnd() * 7,
      c: pick(rnd, NEON),
      h: 1.2 + rnd() * 5,
      size: 0.9 + rnd() * 0.7,
    });
  }

  for (let i = 0; i < 6; i++) {
    beacons.push({
      p: [(rnd() - 0.5) * 90, 1.4, (rnd() - 0.5) * 90],
      c: pick(rnd, NEON),
    });
  }

  return {
    seed,
    preset: "neon-city",
    groundColor: "#0b1024",
    skyColor: "#04060f",
    fogColor: "#070c1c",
    bounds: 56,
    blocks,
    props,
    agents,
    beacons,
    seedImage: null,
  };
}

function arcadeArena(seed: number): ArenaSpec {
  const rnd = mulberry32(seed);
  const blocks: ArenaBlock[] = [];
  const props: SceneProp[] = [];
  const agents: SceneAgent[] = [];
  const beacons: SceneBeacon[] = [];
  const R = 40;

  // perimeter wall
  for (let i = 0; i < 4; i++) {
    const horizontal = i % 2 === 0;
    const sign = i < 2 ? 1 : -1;
    blocks.push({
      p: [horizontal ? 0 : sign * R, 2.5, horizontal ? sign * R : 0],
      s: [horizontal ? R * 2 : 1.5, 5, horizontal ? 1.5 : R * 2],
      c: "#20305c",
    });
  }
  // ramps + cover
  for (let i = 0; i < 18; i++) {
    const w = 2 + rnd() * 6;
    blocks.push({
      p: [(rnd() - 0.5) * R * 1.7, 0.9 + rnd() * 2, (rnd() - 0.5) * R * 1.7],
      s: [w, 1.8 + rnd() * 3.5, 2 + rnd() * 6],
      c: rnd() > 0.5 ? "#243357" : pick(rnd, NEON),
    });
  }
  for (let i = 0; i < 14; i++) {
    beacons.push({ p: [(rnd() - 0.5) * R * 1.8, 1.2, (rnd() - 0.5) * R * 1.8], c: "#facc15" });
  }
  for (let i = 0; i < 5; i++) {
    const r = 8 + i * 5;
    agents.push({
      path: [[-r, -r], [r, -r], [r, r], [-r, r]],
      speed: 5 + rnd() * 6,
      c: "#f87171",
      h: 1.1,
      size: 1.3,
    });
  }
  props.push({ k: "sphere", p: [0, 14, 0], s: [4, 4, 4], c: "#a78bfa", e: 1.2 });

  return {
    seed,
    preset: "arcade-arena",
    groundColor: "#101a33",
    skyColor: "#060a18",
    fogColor: "#0a1226",
    bounds: R - 3,
    blocks,
    props,
    agents,
    beacons,
    seedImage: null,
  };
}

function voxelCanyon(seed: number): ArenaSpec {
  const rnd = mulberry32(seed);
  const blocks: ArenaBlock[] = [];
  const props: SceneProp[] = [];
  const beacons: SceneBeacon[] = [];
  const N = 22;
  const cell = 5;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = (i - N / 2) * cell;
      const z = (j - N / 2) * cell;
      const ridge = Math.sin(x * 0.07) * Math.cos(z * 0.05) + Math.sin((x + z) * 0.11) * 0.5;
      const corridor = Math.abs(ridge) < 0.28;
      if (corridor) continue;
      const h = 2 + Math.abs(ridge) * 16 + rnd() * 2;
      const shade = Math.min(1, 0.35 + Math.abs(ridge) * 0.5);
      blocks.push({
        p: [x, h / 2, z],
        s: [cell, h, cell],
        c: `rgb(${Math.round(120 * shade)},${Math.round(96 * shade)},${Math.round(80 * shade)})`,
      });
    }
  }
  for (let i = 0; i < 8; i++) {
    beacons.push({ p: [(rnd() - 0.5) * 90, 1.3, (rnd() - 0.5) * 90], c: "#34d399" });
  }
  props.push({ k: "sphere", p: [0, 40, -70], s: [12, 12, 12], c: "#fb923c", e: 1.8 });
  return {
    seed,
    preset: "voxel-canyon",
    groundColor: "#2a2118",
    skyColor: "#1b1408",
    fogColor: "#2a2013",
    bounds: 54,
    blocks,
    props,
    agents: [],
    beacons,
    seedImage: null,
  };
}

/* ------------------------------------------------------------------ */

export function generateScenario(id: ScenarioId, seed: number): ArenaSpec {
  switch (id) {
    case "arcade-arena":
      return arcadeArena(seed);
    case "voxel-canyon":
      return voxelCanyon(seed);
    case "seed-image":
      return neonCity(seed); // replaced once an image is supplied
    case "neon-city":
    default:
      return neonCity(seed);
  }
}

/**
 * Turn a 2D picture into a walkable world: the image is sampled on a grid, each
 * cell becomes a coloured column whose height follows perceptual luminance, and
 * the full image is also draped on the ground so the agent can orient itself.
 */
export async function arenaFromImage(dataUrl: string, grid = 34, relief = 26): Promise<ArenaSpec> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = grid;
  c.height = grid;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, grid, grid);
  const px = ctx.getImageData(0, 0, grid, grid).data;

  const cell = 100 / grid;
  const blocks: ArenaBlock[] = [];
  const beacons: SceneBeacon[] = [];
  let brightest = { l: -1, x: 0, z: 0, c: "#ffffff" };

  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const o = (j * grid + i) * 4;
      const r = px[o];
      const g = px[o + 1];
      const b = px[o + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const x = (i - grid / 2) * cell + cell / 2;
      const z = (j - grid / 2) * cell + cell / 2;
      const h = 0.4 + Math.pow(lum, 1.4) * relief;
      const col = `rgb(${r},${g},${b})`;
      if (lum > brightest.l) brightest = { l: lum, x, z, c: col };
      // skip near-flat cells so dark regions become walkable plazas
      if (h < 1.1) continue;
      blocks.push({ p: [x, h / 2, z], s: [cell * 0.94, h, cell * 0.94], c: col });
    }
  }
  beacons.push({ p: [brightest.x, 1.4, brightest.z], c: brightest.c });

  return {
    seed: 1,
    preset: "seed-image",
    groundColor: "#0a0f1e",
    skyColor: "#05070f",
    fogColor: "#080d1a",
    bounds: 52,
    blocks,
    props: [],
    agents: [],
    beacons,
    seedImage: dataUrl,
  };
}
