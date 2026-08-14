/**
 * World Model Engine — shared types.
 *
 * Implements the architecture from Ha & Schmidhuber, "World Models" (2018,
 * worldmodels.github.io):
 *
 *   V  Variational autoencoder   frame  -> z            (what I see)
 *   M  MDN-RNN                   z,a    -> h, p(z')     (what happens next)
 *   C  Linear controller         z,h    -> a            (what I do)
 */

export interface ArenaBlock {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
}

export interface SceneProp {
  k: "box" | "cyl" | "cone" | "sphere" | "torus";
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  /** emissive intensity */
  e?: number;
  rot?: number;
}

export interface SceneAgent {
  /** patrol path in world XZ, traversed as a loop */
  path: Array<[number, number]>;
  speed: number;
  c: string;
  h: number;
  size: number;
}

export interface SceneBeacon {
  p: [number, number, number];
  c: string;
}

/** Deterministic description of the observable 3D world. */
export interface ArenaSpec {
  seed: number;
  groundColor: string;
  skyColor: string;
  fogColor: string;
  blocks: ArenaBlock[];
  /** scenario preset that produced this world */
  preset?: string;
  /** half-extent the agent is confined to */
  bounds?: number;
  props?: SceneProp[];
  agents?: SceneAgent[];
  beacons?: SceneBeacon[];
  /** data URL of the seed picture, when the world was grown from an image */
  seedImage?: string | null;
}

export interface WorldConfig {
  frameSize: number;   // square capture resolution fed to V (paper uses 64)
  latentDim: number;   // |z|
  rnnSize: number;     // LSTM units in M
  mixtures: number;    // Gaussian mixtures per latent dim in M's MDN head
  actionDim: number;   // |a| = [forward, strafe, turn, look]
  temperature: number; // dream sampling temperature τ
  arena: ArenaSpec;
}

export interface WorldMetrics {
  frames: number;
  rollouts: number;
  vaeSteps: number;
  vaeLoss: number | null;
  rnnSteps: number;
  rnnLoss: number | null;
  generations: number;
  bestReward: number | null;
}

export const EMPTY_METRICS: WorldMetrics = {
  frames: 0,
  rollouts: 0,
  vaeSteps: 0,
  vaeLoss: null,
  rnnSteps: 0,
  rnnLoss: null,
  generations: 0,
  bestReward: null,
};

/** Small deterministic PRNG so a seed always rebuilds the same world. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ["#7dd3fc", "#a78bfa", "#f472b6", "#facc15", "#34d399", "#fb923c"];

export function generateArena(seed: number, count = 26): ArenaSpec {
  const rnd = mulberry32(seed);
  const blocks: ArenaBlock[] = [];
  for (let i = 0; i < count; i++) {
    const w = 1 + rnd() * 3;
    const h = 1 + rnd() * 6;
    const d = 1 + rnd() * 3;
    blocks.push({
      p: [(rnd() - 0.5) * 60, h / 2, (rnd() - 0.5) * 60],
      s: [w, h, d],
      c: PALETTE[Math.floor(rnd() * PALETTE.length)],
    });
  }
  return {
    seed,
    preset: "legacy",
    bounds: 44,
    props: [],
    agents: [],
    beacons: [],
    seedImage: null,
    groundColor: "#0e1428",
    skyColor: "#050813",
    fogColor: "#0a1024",
    blocks,
  };
}

export function defaultWorldConfig(seed = Math.floor(Math.random() * 1e9)): WorldConfig {
  return {
    frameSize: 64,
    latentDim: 32,
    rnnSize: 256,
    mixtures: 5,
    actionDim: 4,
    temperature: 1.0,
    arena: generateArena(seed),
  };
}
