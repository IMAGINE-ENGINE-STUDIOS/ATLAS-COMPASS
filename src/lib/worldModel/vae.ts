/**
 * V — convolutional variational autoencoder.
 *
 * 64x64x3 frame -> 4 strided convs -> (mu, logvar) -> z (latentDim)
 * z -> dense -> 4 transposed convs -> 64x64x3 reconstruction
 *
 * Trained with the reparameterization trick on real pixels captured from the
 * live 3D viewport (Ha & Schmidhuber 2018, §"Learning to see").
 */
import * as tf from "@tensorflow/tfjs";

export interface VaeOptions {
  frameSize: number;
  latentDim: number;
  learningRate?: number;
  beta?: number;
}

export class Vae {
  encoder: tf.LayersModel;
  decoder: tf.LayersModel;
  private opt: tf.Optimizer;
  readonly latentDim: number;
  readonly frameSize: number;
  readonly beta: number;

  constructor(opts: VaeOptions) {
    this.frameSize = opts.frameSize;
    this.latentDim = opts.latentDim;
    this.beta = opts.beta ?? 1;
    this.opt = tf.train.adam(opts.learningRate ?? 1e-3);

    const s = this.frameSize;
    const inp = tf.input({ shape: [s, s, 3] });
    let h: tf.SymbolicTensor = inp;
    for (const f of [32, 64, 128, 256]) {
      h = tf.layers
        .conv2d({ filters: f, kernelSize: 4, strides: 2, padding: "same", activation: "relu" })
        .apply(h) as tf.SymbolicTensor;
    }
    const flat = tf.layers.flatten().apply(h) as tf.SymbolicTensor;
    const mu = tf.layers.dense({ units: this.latentDim, name: "mu" }).apply(flat) as tf.SymbolicTensor;
    const logvar = tf.layers.dense({ units: this.latentDim, name: "logvar" }).apply(flat) as tf.SymbolicTensor;
    this.encoder = tf.model({ inputs: inp, outputs: [mu, logvar] });

    const side = s / 16; // 64 -> 4
    const zin = tf.input({ shape: [this.latentDim] });
    let d: tf.SymbolicTensor = tf.layers
      .dense({ units: side * side * 256, activation: "relu" })
      .apply(zin) as tf.SymbolicTensor;
    d = tf.layers.reshape({ targetShape: [side, side, 256] }).apply(d) as tf.SymbolicTensor;
    for (const f of [128, 64, 32]) {
      d = tf.layers
        .conv2dTranspose({ filters: f, kernelSize: 4, strides: 2, padding: "same", activation: "relu" })
        .apply(d) as tf.SymbolicTensor;
    }
    d = tf.layers
      .conv2dTranspose({ filters: 3, kernelSize: 4, strides: 2, padding: "same", activation: "sigmoid" })
      .apply(d) as tf.SymbolicTensor;
    this.decoder = tf.model({ inputs: zin, outputs: d });
  }

  get paramCount(): number {
    return this.encoder.countParams() + this.decoder.countParams();
  }

  /**
   * One optimizer step on a batch of frames. Returns [total, recon, kl].
   * Readback is asynchronous — a synchronous `dataSync` here stalls the GPU
   * pipeline and freezes the whole tab for the duration of training.
   */
  async trainStep(batch: tf.Tensor4D): Promise<[number, number, number]> {
    let recT: tf.Scalar | null = null;
    let klT: tf.Scalar | null = null;
    const loss = tf.tidy(() => {
      const l = this.opt.minimize(() => {
        const [mu, logvar] = this.encoder.apply(batch) as tf.Tensor[];
        const eps = tf.randomNormal(mu.shape as number[]);
        const z = mu.add(eps.mul(logvar.mul(0.5).exp()));
        const recon = this.decoder.apply(z) as tf.Tensor;
        const pixels = this.frameSize * this.frameSize * 3;
        const reconLoss = tf.losses.meanSquaredError(batch, recon).mul(pixels) as tf.Scalar;
        const klLoss = tf
          .mean(tf.sum(logvar.exp().add(mu.square()).sub(1).sub(logvar), -1))
          .mul(0.5) as tf.Scalar;
        recT = tf.keep(reconLoss.clone());
        klT = tf.keep(klLoss.clone());
        return reconLoss.add(klLoss.mul(this.beta)) as tf.Scalar;
      }, true);
      return l ? (tf.keep(l.clone()) as tf.Scalar) : null;
    });
    const [total, rec, kl] = await Promise.all([
      loss ? loss.data().then((d) => d[0]) : Promise.resolve(NaN),
      recT ? (recT as tf.Scalar).data().then((d) => d[0]) : Promise.resolve(NaN),
      klT ? (klT as tf.Scalar).data().then((d) => d[0]) : Promise.resolve(NaN),
    ]);
    loss?.dispose();
    (recT as tf.Scalar | null)?.dispose();
    (klT as tf.Scalar | null)?.dispose();
    return [total, rec, kl];
  }

  /** Deterministic encode (uses mu, as the paper does for the controller). */
  encode(frames: tf.Tensor4D): tf.Tensor2D {
    return tf.tidy(() => {
      const [mu] = this.encoder.apply(frames) as tf.Tensor[];
      return mu.clone() as tf.Tensor2D;
    });
  }

  decode(z: tf.Tensor2D): tf.Tensor4D {
    return this.decoder.apply(z) as tf.Tensor4D;
  }

  dispose() {
    this.encoder.dispose();
    this.decoder.dispose();
  }
}
