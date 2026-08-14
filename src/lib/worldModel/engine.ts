/**
 * World Model Engine — orchestrates V, M and C in the browser.
 *
 * Everything here runs on real data: frames are read back from the live WebGL
 * viewport, latents come from a VAE trained on those frames, and the dream is
 * produced purely by the MDN-RNN with the renderer switched off.
 */
import * as tf from "@tensorflow/tfjs";
import { Vae } from "./vae";
import { MdnRnn, type RnnState } from "./mdnrnn";
import { SepCmaEs } from "./cmaes";
import type { WorldConfig } from "./types";

export interface Rollout {
  /** Flat RGB bytes per frame, frameSize*frameSize*3. */
  frames: Uint8Array[];
  actions: Float32Array[];
}

export interface TrainProgress {
  step: number;
  total: number;
  loss: number;
  extra?: Record<string, number>;
}

const MAX_FRAMES = 3000;

export class Controller {
  readonly inputDim: number;
  readonly actionDim: number;
  params: Float64Array;

  constructor(inputDim: number, actionDim: number, params?: Float64Array) {
    this.inputDim = inputDim;
    this.actionDim = actionDim;
    this.params = params ?? new Float64Array(actionDim * (inputDim + 1));
  }

  static paramCount(inputDim: number, actionDim: number) {
    return actionDim * (inputDim + 1);
  }

  /** a = tanh(W [z ; h] + b) — a single linear layer, as in the paper. */
  act(input: Float32Array | Float64Array): Float32Array {
    const out = new Float32Array(this.actionDim);
    const n = this.inputDim;
    for (let a = 0; a < this.actionDim; a++) {
      let sum = this.params[a * (n + 1) + n];
      for (let i = 0; i < n; i++) sum += this.params[a * (n + 1) + i] * input[i];
      out[a] = Math.tanh(sum);
    }
    return out;
  }
}

export class WorldModelEngine {
  config: WorldConfig;
  vae: Vae;
  rnn: MdnRnn;
  rollouts: Rollout[] = [];
  private current: Rollout | null = null;
  private latentCache: Float32Array[] | null = null;
  controller: Controller;
  vaeTrained = false;
  rnnTrained = false;
  vaeSteps = 0;
  rnnSteps = 0;
  lastVaeLoss: number | null = null;
  lastRnnLoss: number | null = null;
  vaeLossHistory: number[] = [];
  rnnLossHistory: number[] = [];
  generations = 0;
  bestReward: number | null = null;
  abortFlag = false;

  constructor(config: WorldConfig) {
    this.config = config;
    this.vae = new Vae({ frameSize: config.frameSize, latentDim: config.latentDim });
    this.rnn = new MdnRnn({
      latentDim: config.latentDim,
      actionDim: config.actionDim,
      rnnSize: config.rnnSize,
      mixtures: config.mixtures,
    });
    this.controller = new Controller(config.latentDim + config.rnnSize, config.actionDim);
  }

  /* ---------------- rollout capture ---------------- */

  beginRollout() {
    this.current = { frames: [], actions: [] };
    this.rollouts.push(this.current);
  }

  endRollout() {
    if (this.current && this.current.frames.length < 4) {
      this.rollouts = this.rollouts.filter((r) => r !== this.current);
    }
    this.current = null;
  }

  get frameCount(): number {
    return this.rollouts.reduce((n, r) => n + r.frames.length, 0);
  }

  pushFrame(rgb: Uint8Array, action: Float32Array) {
    if (!this.current) this.beginRollout();
    if (this.frameCount >= MAX_FRAMES) return;
    this.current!.frames.push(rgb);
    this.current!.actions.push(action.slice());
    this.latentCache = null;
  }

  /* ---------------- V: the autoencoder ---------------- */

  private frameBatch(indices: Array<[number, number]>): tf.Tensor4D {
    const s = this.config.frameSize;
    const per = s * s * 3;
    const buf = new Float32Array(indices.length * per);
    indices.forEach(([r, f], i) => {
      const src = this.rollouts[r].frames[f];
      for (let k = 0; k < per; k++) buf[i * per + k] = src[k] / 255;
    });
    return tf.tensor4d(buf, [indices.length, s, s, 3]);
  }

  private allIndices(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    this.rollouts.forEach((r, ri) => r.frames.forEach((_, fi) => out.push([ri, fi])));
    return out;
  }

  async trainVae(steps: number, batchSize: number, onProgress?: (p: TrainProgress) => void) {
    const pool = this.allIndices();
    if (pool.length < batchSize) throw new Error("Not enough frames — explore the world first.");
    this.abortFlag = false;
    for (let step = 0; step < steps; step++) {
      if (this.abortFlag) break;
      const picks = Array.from({ length: batchSize }, () => pool[(Math.random() * pool.length) | 0]);
      const batch = this.frameBatch(picks);
      const [total, rec, kl] = await this.vae.trainStep(batch);
      batch.dispose();
      this.vaeSteps++;
      this.lastVaeLoss = total;
      this.vaeLossHistory.push(total);
      if (this.vaeLossHistory.length > 400) this.vaeLossHistory.shift();
      onProgress?.({ step: step + 1, total: steps, loss: total, extra: { recon: rec, kl } });
      this.latentCache = null;
      await tf.nextFrame();
    }
    this.vaeTrained = this.vaeSteps > 0;
  }

  /** Encode every captured frame to a latent, cached until new frames arrive. */
  encodeAll(): Float32Array[] {
    if (this.latentCache) return this.latentCache;
    const idx = this.allIndices();
    const out: Float32Array[] = [];
    const chunk = 32;
    for (let i = 0; i < idx.length; i += chunk) {
      const slice = idx.slice(i, i + chunk);
      const batch = this.frameBatch(slice);
      const z = this.vae.encode(batch);
      const data = new Float32Array(z.dataSync() as ArrayLike<number>);
      const L = this.config.latentDim;
      for (let j = 0; j < slice.length; j++) out.push(data.slice(j * L, (j + 1) * L));
      batch.dispose();
      z.dispose();
    }
    this.latentCache = out;
    return out;
  }

  encodeFrame(rgb: Uint8Array): Float32Array {
    const s = this.config.frameSize;
    const per = s * s * 3;
    const buf = new Float32Array(per);
    for (let k = 0; k < per; k++) buf[k] = rgb[k] / 255;
    const t = tf.tensor4d(buf, [1, s, s, 3]);
    const z = this.vae.encode(t);
    const data = new Float32Array(z.dataSync() as ArrayLike<number>);
    t.dispose();
    z.dispose();
    return data.slice();
  }

  /** Paint a latent back to pixels through the decoder. */
  decodeToCanvas(z: Float32Array, canvas: HTMLCanvasElement) {
    const s = this.config.frameSize;
    const px = tf.tidy(() => {
      const zt = tf.tensor2d(z, [1, this.config.latentDim]);
      const out = this.vae.decode(zt).reshape([s, s, 3]);
      return out.mul(255).clipByValue(0, 255).cast("int32").dataSync();
    });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      img.data[i * 4] = px[i * 3] as number;
      img.data[i * 4 + 1] = px[i * 3 + 1] as number;
      img.data[i * 4 + 2] = px[i * 3 + 2] as number;
      img.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement("canvas");
    tmp.width = s;
    tmp.height = s;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  }

  /* ---------------- M: the dynamics model ---------------- */

  async trainRnn(steps: number, batchSize: number, seqLen: number, onProgress?: (p: TrainProgress) => void) {
    if (!this.vaeTrained) throw new Error("Train the autoencoder first — M predicts latents, not pixels.");
    const latents = this.encodeAll();
    // Map flat latent index back to (rollout, frame) so sequences never cross
    // an episode boundary.
    const starts: number[] = [];
    let offset = 0;
    const usable: Array<{ base: number; len: number }> = [];
    for (const r of this.rollouts) {
      usable.push({ base: offset, len: r.frames.length });
      offset += r.frames.length;
    }
    for (const u of usable) {
      for (let i = 0; i + seqLen + 1 <= u.len; i++) starts.push(u.base + i);
    }
    if (starts.length < batchSize) throw new Error("Not enough continuous frames — explore for longer.");

    const L = this.config.latentDim;
    const A = this.config.actionDim;
    const flatActions: Float32Array[] = [];
    this.rollouts.forEach((r) => r.actions.forEach((a) => flatActions.push(a)));

    this.abortFlag = false;
    for (let step = 0; step < steps; step++) {
      if (this.abortFlag) break;
      const xs = new Float32Array(batchSize * seqLen * (L + A));
      const ys = new Float32Array(batchSize * seqLen * L);
      for (let b = 0; b < batchSize; b++) {
        const s0 = starts[(Math.random() * starts.length) | 0];
        for (let t = 0; t < seqLen; t++) {
          const zi = latents[s0 + t];
          const ai = flatActions[s0 + t];
          const base = (b * seqLen + t) * (L + A);
          for (let i = 0; i < L; i++) xs[base + i] = zi[i];
          for (let i = 0; i < A; i++) xs[base + L + i] = ai ? ai[i] : 0;
          const yb = (b * seqLen + t) * L;
          const zn = latents[s0 + t + 1];
          for (let i = 0; i < L; i++) ys[yb + i] = zn[i];
        }
      }
      const x = tf.tensor3d(xs, [batchSize, seqLen, L + A]);
      const y = tf.tensor3d(ys, [batchSize, seqLen, L]);
      const loss = await this.rnn.trainStep(x, y);
      x.dispose();
      y.dispose();
      this.rnnSteps++;
      this.lastRnnLoss = loss;
      this.rnnLossHistory.push(loss);
      if (this.rnnLossHistory.length > 400) this.rnnLossHistory.shift();
      onProgress?.({ step: step + 1, total: steps, loss });
      await tf.nextFrame();
    }
    this.rnnTrained = this.rnnSteps > 0;
  }

  /* ---------------- the dream ---------------- */

  newDream(seedLatent?: Float32Array) {
    const L = this.config.latentDim;
    const latents = this.latentCache ?? (this.vaeTrained ? this.encodeAll() : []);
    const z =
      seedLatent ??
      (latents.length ? latents[(Math.random() * latents.length) | 0].slice() : new Float32Array(L));
    return { z, state: this.rnn.zeroState(1) as RnnState };
  }

  /** One tick of the hallucinated world: (z, a) -> z'. */
  dreamStep(
    z: Float32Array,
    action: Float32Array,
    state: RnnState,
    temperature: number,
  ): { z: Float32Array; state: RnnState; hidden: Float32Array; mixtures: Float32Array } {
    const zt = tf.tensor2d(z, [1, this.config.latentDim]);
    const at = tf.tensor2d(action, [1, this.config.actionDim]);
    const res = this.rnn.step(zt, at, state, temperature);
    const zNext = new Float32Array(res.z.dataSync() as ArrayLike<number>);
    const hidden = new Float32Array(res.state.h.dataSync() as ArrayLike<number>);
    const mixtures = new Float32Array(res.mixtureWeights.dataSync() as ArrayLike<number>);
    zt.dispose();
    at.dispose();
    res.z.dispose();
    res.mixtureWeights.dispose();
    return { z: zNext, state: res.state, hidden, mixtures };
  }

  /* ---------------- C: the controller ---------------- */

  /**
   * Evolve the controller inside the dream. The objective is latent-space
   * novelty (intrinsic curiosity): an agent is rewarded for reaching parts of
   * the learned world it has not visited in this episode. It is computed the
   * same way in the dream and in the real scene, so the two numbers are
   * directly comparable.
   */
  async evolveInDream(
    generations: number,
    horizon: number,
    onGen?: (g: { generation: number; best: number; mean: number; sigma: number }) => void,
  ) {
    if (!this.rnnTrained) throw new Error("Train the dynamics model first — the dream needs M.");
    const dim = Controller.paramCount(this.config.latentDim + this.config.rnnSize, this.config.actionDim);
    const es = new SepCmaEs({ dim, popSize: 12, sigma: 0.3 });
    this.abortFlag = false;
    for (let g = 0; g < generations; g++) {
      if (this.abortFlag) break;
      const pop = es.ask();
      const rewards: number[] = [];
      for (const params of pop) {
        rewards.push(this.rolloutInDream(new Controller(this.controller.inputDim, this.config.actionDim, params), horizon));
        await tf.nextFrame();
      }
      es.tell(rewards);
      this.controller = new Controller(this.controller.inputDim, this.config.actionDim, es.best());
      this.generations = es.generation;
      const best = Math.max(...rewards);
      this.bestReward = this.bestReward === null ? best : Math.max(this.bestReward, best);
      onGen?.({
        generation: es.generation,
        best,
        mean: rewards.reduce((a, b) => a + b, 0) / rewards.length,
        sigma: es.meanSigma(),
      });
    }
  }

  private rolloutInDream(controller: Controller, horizon: number): number {
    let { z, state } = this.newDream();
    let hidden: Float32Array = new Float32Array(this.config.rnnSize);
    const visited: Float32Array[] = [z.slice()];
    let reward = 0;
    for (let t = 0; t < horizon; t++) {
      const input = new Float32Array(this.controller.inputDim);
      input.set(z, 0);
      input.set(hidden, z.length);
      const action = controller.act(input);
      const step = this.dreamStep(z, action, state, this.config.temperature);
      z = step.z;
      state = step.state;
      hidden = step.hidden;
      reward += noveltyReward(z, visited);
      visited.push(z.slice());
    }
    state.h.dispose();
    state.c.dispose();
    return reward;
  }

  /** Same objective measured against real encoded frames, for comparison. */
  static realNovelty(z: Float32Array, visited: Float32Array[]): number {
    return noveltyReward(z, visited);
  }

  get paramSummary() {
    return {
      vae: this.vae.paramCount,
      rnn: this.rnn.paramCount,
      controller: this.controller.params.length,
    };
  }

  /* ---------------- persistence ---------------- */

  async save(id: string) {
    await this.vae.encoder.save(`indexeddb://wm-${id}-enc`);
    await this.vae.decoder.save(`indexeddb://wm-${id}-dec`);
    if (this.rnnTrained) await this.rnn.model.save(`indexeddb://wm-${id}-rnn`);
    try {
      window.localStorage.setItem(
        `imagineengine:wm-controller:${id}`,
        JSON.stringify(Array.from(this.controller.params)),
      );
    } catch { /* quota */ }
  }

  async loadWeights(id: string): Promise<boolean> {
    try {
      const enc = await tf.loadLayersModel(`indexeddb://wm-${id}-enc`);
      const dec = await tf.loadLayersModel(`indexeddb://wm-${id}-dec`);
      this.vae.encoder.setWeights(enc.getWeights());
      this.vae.decoder.setWeights(dec.getWeights());
      enc.dispose();
      dec.dispose();
      this.vaeTrained = true;
      try {
        const rnn = await tf.loadLayersModel(`indexeddb://wm-${id}-rnn`);
        this.rnn.model.setWeights(rnn.getWeights());
        rnn.dispose();
        this.rnnTrained = true;
      } catch { /* no dynamics model saved yet */ }
      const raw = window.localStorage.getItem(`imagineengine:wm-controller:${id}`);
      if (raw) this.controller.params = new Float64Array(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  }

  dispose() {
    this.abortFlag = true;
    this.vae.dispose();
    this.rnn.dispose();
  }
}

function noveltyReward(z: Float32Array, visited: Float32Array[]): number {
  let best = Infinity;
  const from = Math.max(0, visited.length - 64);
  for (let i = from; i < visited.length; i++) {
    const v = visited[i];
    let d = 0;
    for (let k = 0; k < z.length; k++) {
      const diff = z[k] - v[k];
      d += diff * diff;
    }
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? Math.sqrt(best) : 0;
}
