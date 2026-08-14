/**
 * M — MDN-RNN: an LSTM whose head is a mixture density network over the next
 * latent vector, exactly the "predictive model of the future z" from
 * Ha & Schmidhuber 2018.
 *
 * input  [z_t ; a_t]                      (latentDim + actionDim)
 * lstm   h_t
 * head   K x (pi, mu, logSigma) per latent dim
 *
 * Sampling applies the paper's temperature τ: logits are divided by τ and the
 * Gaussian scale is multiplied by sqrt(τ), so a hot dream is more uncertain.
 */
import * as tf from "@tensorflow/tfjs";

export interface MdnRnnOptions {
  latentDim: number;
  actionDim: number;
  rnnSize: number;
  mixtures: number;
  learningRate?: number;
}

export interface RnnState {
  h: tf.Tensor2D;
  c: tf.Tensor2D;
}

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

export class MdnRnn {
  private cell: tf.layers.Layer;
  private rnn: tf.layers.Layer;
  private head: tf.layers.Layer;
  readonly model: tf.LayersModel;
  private opt: tf.Optimizer;
  readonly latentDim: number;
  readonly actionDim: number;
  readonly rnnSize: number;
  readonly mixtures: number;

  constructor(o: MdnRnnOptions) {
    this.latentDim = o.latentDim;
    this.actionDim = o.actionDim;
    this.rnnSize = o.rnnSize;
    this.mixtures = o.mixtures;
    this.opt = tf.train.adam(o.learningRate ?? 1e-3);

    this.cell = tf.layers.lstmCell({ units: o.rnnSize, recurrentInitializer: "glorotUniform" }) as unknown as tf.layers.Layer;
    this.rnn = tf.layers.rnn({ cell: this.cell as never, returnSequences: true });
    this.head = tf.layers.dense({ units: 3 * o.mixtures * o.latentDim });

    const inp = tf.input({ shape: [null, o.latentDim + o.actionDim] });
    const seq = this.rnn.apply(inp) as tf.SymbolicTensor;
    const out = this.head.apply(seq) as tf.SymbolicTensor;
    this.model = tf.model({ inputs: inp, outputs: out });
  }

  get paramCount(): number {
    return this.model.countParams();
  }

  /** Split the raw head output into (logPi, mu, logSigma), each [..., L, K]. */
  private split(raw: tf.Tensor) {
    const shape = raw.shape.slice(0, -1);
    const r = raw.reshape([...shape, this.latentDim, 3 * this.mixtures]);
    const [piLogits, mu, logSigmaRaw] = tf.split(r, 3, -1);
    const logPi = piLogits.sub(tf.logSumExp(piLogits, -1, true));
    const logSigma = tf.clipByValue(logSigmaRaw, -7, 7);
    return { logPi, mu, logSigma };
  }

  /** Negative log-likelihood of the true next latents under the mixture. */
  private nll(raw: tf.Tensor, target: tf.Tensor): tf.Scalar {
    const { logPi, mu, logSigma } = this.split(raw);
    const t = target.expandDims(-1); // [..., L, 1]
    const z = t.sub(mu).div(logSigma.exp());
    const logProb = logPi.sub(logSigma).sub(z.square().mul(0.5)).sub(LOG_SQRT_2PI);
    return tf.neg(tf.mean(tf.logSumExp(logProb, -1))) as tf.Scalar;
  }

  /**
   * One optimizer step. `x` is [B, T, L+A] and `y` is [B, T, L] (the latents
   * shifted one step into the future).
   */
  trainStep(x: tf.Tensor3D, y: tf.Tensor3D): number {
    return tf.tidy(() => {
      const loss = this.opt.minimize(() => {
        const raw = this.model.apply(x) as tf.Tensor;
        return this.nll(raw, y);
      }, true);
      const v = loss ? loss.dataSync()[0] : NaN;
      loss?.dispose();
      return v;
    });
  }

  zeroState(batch = 1): RnnState {
    return {
      h: tf.zeros([batch, this.rnnSize]) as tf.Tensor2D,
      c: tf.zeros([batch, this.rnnSize]) as tf.Tensor2D,
    };
  }

  /**
   * Advance the dream one tick: consume (z, a) plus the recurrent state and
   * sample the next latent from the predicted mixture at temperature τ.
   */
  step(z: tf.Tensor2D, a: tf.Tensor2D, state: RnnState, temperature: number) {
    const out = tf.tidy(() => {
      const x = tf.concat([z, a], 1);
      const res = this.cell.call([x, state.h, state.c], {}) as tf.Tensor[];
      const [o, h2, c2] = res;
      const raw = this.head.apply(o) as tf.Tensor; // [B, 3*K*L]
      const { logPi, mu, logSigma } = this.split(raw);
      const temp = Math.max(0.01, temperature);
      // Sample a mixture component per latent dim, then sample within it.
      const scaledLogits = logPi.div(temp);
      const flatLogits = scaledLogits.reshape([-1, this.mixtures]);
      const pick = tf.multinomial(flatLogits as tf.Tensor2D, 1, undefined, false).reshape([-1, 1]);
      const oneHot = tf.oneHot(pick.reshape([-1]).cast("int32"), this.mixtures);
      const flatMu = mu.reshape([-1, this.mixtures]);
      const flatSigma = logSigma.exp().reshape([-1, this.mixtures]).mul(Math.sqrt(temp));
      const chosenMu = flatMu.mul(oneHot).sum(-1);
      const chosenSigma = flatSigma.mul(oneHot).sum(-1);
      const sample = chosenMu
        .add(tf.randomNormal(chosenMu.shape as number[]).mul(chosenSigma))
        .reshape([z.shape[0], this.latentDim]) as tf.Tensor2D;
      const weights = tf
        .exp(logPi)
        .mean(logPi.shape.length - 2)
        .reshape([-1]) as tf.Tensor1D; // averaged mixture weights, for the HUD
      return [sample, h2.clone(), c2.clone(), weights] as tf.Tensor[];
    });
    state.h.dispose();
    state.c.dispose();
    return {
      z: out[0] as tf.Tensor2D,
      state: { h: out[1] as tf.Tensor2D, c: out[2] as tf.Tensor2D } as RnnState,
      mixtureWeights: out[3] as tf.Tensor1D,
    };
  }

  dispose() {
    this.model.dispose();
  }
}
