/**
 * Separable (diagonal) CMA-ES — the evolution strategy the paper uses to train
 * the tiny linear controller C. The controller has only a few hundred
 * parameters, so a diagonal covariance is sufficient and runs comfortably in
 * the browser without any external solver.
 */
export interface CmaOptions {
  dim: number;
  popSize?: number;
  sigma?: number;
  seed?: number;
}

export class SepCmaEs {
  readonly dim: number;
  readonly popSize: number;
  private mean: Float64Array;
  private sigma: Float64Array;
  private weights: number[];
  private lr: number;
  generation = 0;

  constructor(o: CmaOptions) {
    this.dim = o.dim;
    this.popSize = o.popSize ?? Math.max(8, 4 + Math.floor(3 * Math.log(o.dim)));
    this.mean = new Float64Array(o.dim);
    this.sigma = new Float64Array(o.dim).fill(o.sigma ?? 0.5);
    const mu = Math.floor(this.popSize / 2);
    const raw = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
    const sum = raw.reduce((a, b) => a + b, 0);
    this.weights = raw.map((w) => w / sum);
    this.lr = 1 / Math.sqrt(o.dim);
  }

  private lastPop: Float64Array[] = [];

  /** Sample a new population of candidate parameter vectors. */
  ask(): Float64Array[] {
    this.lastPop = Array.from({ length: this.popSize }, () => {
      const v = new Float64Array(this.dim);
      for (let i = 0; i < this.dim; i++) v[i] = this.mean[i] + this.sigma[i] * gauss();
      return v;
    });
    return this.lastPop;
  }

  /** Feed rewards back (higher is better) and update mean + per-axis scale. */
  tell(rewards: number[]) {
    const order = rewards
      .map((r, i) => [r, i] as [number, number])
      .sort((a, b) => b[0] - a[0])
      .slice(0, this.weights.length);
    const newMean = new Float64Array(this.dim);
    order.forEach(([, idx], k) => {
      const w = this.weights[k];
      for (let i = 0; i < this.dim; i++) newMean[i] += w * this.lastPop[idx][i];
    });
    // Per-axis step-size adaptation from the elite spread.
    for (let i = 0; i < this.dim; i++) {
      let variance = 0;
      order.forEach(([, idx], k) => {
        const d = this.lastPop[idx][i] - this.mean[i];
        variance += this.weights[k] * d * d;
      });
      const target = Math.sqrt(Math.max(variance, 1e-12));
      this.sigma[i] = Math.max(1e-4, this.sigma[i] * (1 - this.lr) + target * this.lr);
    }
    this.mean = newMean;
    this.generation++;
  }

  best(): Float64Array {
    return this.mean.slice();
  }

  meanSigma(): number {
    let s = 0;
    for (let i = 0; i < this.dim; i++) s += this.sigma[i];
    return s / this.dim;
  }
}

function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
