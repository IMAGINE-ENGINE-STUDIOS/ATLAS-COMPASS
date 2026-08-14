/**
 * The guided pipeline.
 *
 * Everything the World Model Engine needs to learn a world happens in one
 * ordered run: collect experience -> fit V -> fit M -> evolve C -> score the
 * dream. Each stage reports progress so the UI can stay a single button.
 */
import type { WorldModelEngine } from "./engine";

export type StageId = "collect" | "vision" | "dynamics" | "agent" | "evaluate";

export interface Stage {
  id: StageId;
  label: string;
  blurb: string;
}

export const STAGES: Stage[] = [
  { id: "collect", label: "Experience", blurb: "An autonomous explorer drives the world and records frames + actions." },
  { id: "vision", label: "Vision · V", blurb: "A convolutional VAE compresses every frame to a latent vector z." },
  { id: "dynamics", label: "Dynamics · M", blurb: "An MDN-RNN learns p(z' | z, a) — the world's physics in latent space." },
  { id: "agent", label: "Agent · C", blurb: "CMA-ES evolves the controller entirely inside the dream." },
  { id: "evaluate", label: "Score", blurb: "Held-out reconstruction and open-loop dream error." },
];

export interface StageStatus {
  status: "idle" | "running" | "done" | "error";
  progress: number;
  detail: string;
}

export type PipelineState = Record<StageId, StageStatus>;

export const IDLE_PIPELINE: PipelineState = STAGES.reduce((acc, s) => {
  acc[s.id] = { status: "idle", progress: 0, detail: "" };
  return acc;
}, {} as PipelineState);

export interface PipelineOptions {
  targetFrames: number;
  vaeSteps: number;
  vaeBatch: number;
  rnnSteps: number;
  rnnBatch: number;
  seqLen: number;
  generations: number;
  horizon: number;
}

export const PRESETS: Record<"quick" | "standard" | "deep", { label: string; blurb: string; opts: PipelineOptions }> = {
  quick: {
    label: "Quick",
    blurb: "~2 min. Enough to see the loop end-to-end.",
    opts: { targetFrames: 300, vaeSteps: 150, vaeBatch: 16, rnnSteps: 120, rnnBatch: 8, seqLen: 16, generations: 6, horizon: 40 },
  },
  standard: {
    label: "Standard",
    blurb: "~8 min. Recognisable reconstructions and a usable dream.",
    opts: { targetFrames: 900, vaeSteps: 500, vaeBatch: 24, rnnSteps: 400, rnnBatch: 12, seqLen: 24, generations: 14, horizon: 60 },
  },
  deep: {
    label: "Deep",
    blurb: "~30 min. Sharp vision, stable long dreams, stronger controller.",
    opts: { targetFrames: 2200, vaeSteps: 1600, vaeBatch: 32, rnnSteps: 1200, rnnBatch: 16, seqLen: 32, generations: 30, horizon: 90 },
  },
};

/**
 * Autonomous explorer: correlated (Ornstein-Uhlenbeck) noise so motion is
 * smooth rather than jittery, with boundary avoidance and periodic full turns
 * so the camera sees the whole world instead of one wall.
 */
export class ExplorerPolicy {
  private v = new Float32Array(4);
  private t = 0;
  private turnUntil = 0;
  private turnDir = 1;
  constructor(private bounds = 44) {}

  reset() {
    this.v = new Float32Array(4);
    this.t = 0;
    this.turnUntil = 0;
  }

  step(dt: number, pose: { x: number; z: number; yaw: number }): Float32Array {
    this.t += dt;
    const theta = 0.9;
    const sigma = 1.5;
    for (let i = 0; i < 4; i++) {
      const drift = -theta * this.v[i] * dt;
      const noise = sigma * Math.sqrt(dt) * gauss();
      this.v[i] = clamp(this.v[i] + drift + noise, -1, 1);
    }
    const a = new Float32Array(4);
    a[0] = clamp(0.55 + this.v[0] * 0.7, -1, 1); // bias forward
    a[1] = this.v[1] * 0.6;
    a[2] = this.v[2] * 0.8;
    a[3] = this.v[3] * 0.25;

    // sweep the scene: a deliberate slow pan every few seconds
    if (this.t > this.turnUntil + 5) {
      this.turnUntil = this.t + 1.6;
      this.turnDir = Math.random() > 0.5 ? 1 : -1;
    }
    if (this.t < this.turnUntil) {
      a[2] = this.turnDir * 0.85;
      a[0] *= 0.25;
    }

    // steer back inside the world before clipping into the boundary
    const margin = this.bounds * 0.8;
    if (Math.abs(pose.x) > margin || Math.abs(pose.z) > margin) {
      const desired = Math.atan2(-pose.x, -pose.z);
      let delta = desired - pose.yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      a[2] = clamp(-delta * 1.4, -1, 1);
      a[0] = 0.8;
    }
    return a;
  }
}

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface PipelineHooks {
  /** Drive the real renderer until `target` frames are recorded. */
  collect: (target: number, onProgress: (frames: number) => void) => Promise<void>;
  onStage: (id: StageId, patch: Partial<StageStatus>) => void;
  onMetrics: () => void;
}

export async function runPipeline(engine: WorldModelEngine, opts: PipelineOptions, hooks: PipelineHooks) {
  const stage = (id: StageId, patch: Partial<StageStatus>) => hooks.onStage(id, patch);

  try {
    /* 1 — experience */
    stage("collect", { status: "running", progress: 0, detail: "autonomous explorer driving" });
    await hooks.collect(opts.targetFrames, (frames) => {
      stage("collect", { progress: Math.min(1, frames / opts.targetFrames), detail: `${frames} frames` });
    });
    if (engine.abortFlag) return;
    stage("collect", { status: "done", progress: 1, detail: `${engine.frameCount} frames · ${engine.rollouts.length} rollouts` });

    /* 2 — vision */
    stage("vision", { status: "running", progress: 0, detail: "fitting the autoencoder" });
    await engine.trainVae(opts.vaeSteps, opts.vaeBatch, (p) => {
      stage("vision", { progress: p.step / p.total, detail: `loss ${p.loss.toFixed(1)}` });
    });
    if (engine.abortFlag) return;
    hooks.onMetrics();
    stage("vision", {
      status: "done",
      progress: 1,
      detail: `loss ${engine.lastVaeLoss?.toFixed(1)}${engine.valLoss != null ? ` · val ${engine.valLoss.toFixed(1)}` : ""}`,
    });

    /* 3 — dynamics */
    stage("dynamics", { status: "running", progress: 0, detail: "learning latent physics" });
    await engine.trainRnn(opts.rnnSteps, opts.rnnBatch, opts.seqLen, (p) => {
      stage("dynamics", { progress: p.step / p.total, detail: `NLL ${p.loss.toFixed(2)}` });
    });
    if (engine.abortFlag) return;
    hooks.onMetrics();
    stage("dynamics", { status: "done", progress: 1, detail: `NLL ${engine.lastRnnLoss?.toFixed(2)}` });

    /* 4 — agent */
    stage("agent", { status: "running", progress: 0, detail: "evolving inside the dream" });
    let g = 0;
    await engine.evolveInDream(opts.generations, opts.horizon, (info) => {
      g = info.generation;
      stage("agent", {
        progress: Math.min(1, g / opts.generations),
        detail: `gen ${g} · best ${info.best.toFixed(2)}`,
      });
    });
    if (engine.abortFlag) return;
    stage("agent", { status: "done", progress: 1, detail: `${g} generations · best ${engine.bestReward?.toFixed(2)}` });

    /* 5 — score */
    stage("evaluate", { status: "running", progress: 0.4, detail: "rolling M open-loop" });
    const err = await engine.evaluateDream(24);
    hooks.onMetrics();
    stage("evaluate", {
      status: "done",
      progress: 1,
      detail: err == null ? "not enough continuous frames" : `dream error ${err.toFixed(3)}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pipeline failed";
    const current = (["collect", "vision", "dynamics", "agent", "evaluate"] as StageId[]).find(
      (id) => id,
    )!;
    stage(current, { status: "error", detail: msg });
    throw e;
  }
}
