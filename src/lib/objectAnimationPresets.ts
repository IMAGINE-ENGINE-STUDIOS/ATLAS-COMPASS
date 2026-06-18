/**
 * Object animation preset library.
 *
 * Each preset is a tiny factory that, given a target object id + parameters,
 * returns a JSON-serialisable `AnimationTrack` ready to push into
 * `scene.animations`. The existing animation runtime already interpolates
 * position / rotation / scale keyframes — these presets just bake the right
 * shape of keyframes for common motions (spin, bob, pulse, swing, etc.).
 *
 * Two consumption modes:
 *   - Quick presets: call `preset.build(targetId, preset.defaults())` → done.
 *   - Parametric:    drive each `param` from sliders and call `build()` live
 *                    to preview while the user tweaks.
 */

import type { AnimationTrack, Vec3 } from "./levelTypes";
import { newId } from "./levelTypes";

export type AxisKey = "x" | "y" | "z";

export interface ObjectPresetParam {
  key: string;
  label: string;
  type: "number" | "axis" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
}

export interface ObjectAnimationPreset {
  id: string;
  name: string;
  category: "transform" | "scale" | "compound";
  description: string;
  params: ObjectPresetParam[];
  /** Builds a fresh AnimationTrack. `basePosition` / `baseRotation` / `baseScale`
   *  let the caller anchor the motion to the object's current transform. */
  build: (
    targetId: string,
    params: Record<string, any>,
    base: { position: Vec3; rotation: Vec3; scale: Vec3 },
  ) => AnimationTrack;
  thumb: { icon: string; arrows?: AxisKey[] };
}

// ---------- helpers ----------------------------------------------------------

const axisVec = (axis: AxisKey, amount: number): Vec3 =>
  axis === "x" ? [amount, 0, 0] : axis === "y" ? [0, amount, 0] : [0, 0, amount];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

const track = (
  targetId: string,
  name: string,
  duration: number,
  loop: boolean,
  keyframes: AnimationTrack["keyframes"],
): AnimationTrack => ({
  id: newId("anim"),
  name,
  targetId,
  duration,
  loop,
  keyframes,
});

// ---------- presets ----------------------------------------------------------

export const OBJECT_ANIMATION_PRESETS: ObjectAnimationPreset[] = [
  // ----- spin / rotate -----
  {
    id: "spin",
    name: "Spin",
    category: "transform",
    description: "Continuous full-turn rotation around the chosen axis.",
    params: [
      { key: "axis",     label: "Axis",     type: "axis",   default: "y" },
      { key: "duration", label: "Duration", type: "number", min: 0.2, max: 20, step: 0.1, default: 4 },
      { key: "turns",    label: "Turns",    type: "number", min: 1, max: 10, step: 1, default: 1 },
    ],
    build: (targetId, p, base) => {
      const axis = (p.axis ?? "y") as AxisKey;
      const duration = Number(p.duration) || 4;
      const turns = Number(p.turns) || 1;
      const total = Math.PI * 2 * turns;
      const halfRot = add(base.rotation, axisVec(axis, total / 2));
      const fullRot = add(base.rotation, axisVec(axis, total));
      return track(targetId, `Spin ${axis.toUpperCase()}`, duration, true, [
        { t: 0,            position: base.position, rotation: base.rotation, scale: base.scale },
        { t: duration / 2, position: base.position, rotation: halfRot,       scale: base.scale },
        { t: duration,     position: base.position, rotation: fullRot,       scale: base.scale },
      ]);
    },
    thumb: { icon: "RotateCw", arrows: ["y"] },
  },

  {
    id: "swing",
    name: "Swing",
    category: "transform",
    description: "Pendulum swing between -angle and +angle on the chosen axis.",
    params: [
      { key: "axis",     label: "Axis",     type: "axis",   default: "z" },
      { key: "angle",    label: "Angle°",   type: "number", min: 5, max: 180, step: 1, default: 30 },
      { key: "duration", label: "Duration", type: "number", min: 0.2, max: 10, step: 0.1, default: 2 },
    ],
    build: (targetId, p, base) => {
      const axis = (p.axis ?? "z") as AxisKey;
      const a = ((Number(p.angle) || 30) * Math.PI) / 180;
      const duration = Number(p.duration) || 2;
      return track(targetId, `Swing ${axis.toUpperCase()}`, duration, true, [
        { t: 0,            position: base.position, rotation: add(base.rotation, axisVec(axis,  a)), scale: base.scale },
        { t: duration / 2, position: base.position, rotation: add(base.rotation, axisVec(axis, -a)), scale: base.scale },
        { t: duration,     position: base.position, rotation: add(base.rotation, axisVec(axis,  a)), scale: base.scale },
      ]);
    },
    thumb: { icon: "MoveDiagonal" },
  },

  {
    id: "sway",
    name: "Sway",
    category: "transform",
    description: "Gentle figure-of-eight rotation (XZ).",
    params: [
      { key: "angle",    label: "Angle°",   type: "number", min: 2, max: 45, step: 1, default: 8 },
      { key: "duration", label: "Duration", type: "number", min: 1, max: 12, step: 0.1, default: 4 },
    ],
    build: (targetId, p, base) => {
      const a = ((Number(p.angle) || 8) * Math.PI) / 180;
      const duration = Number(p.duration) || 4;
      const q = duration / 4;
      return track(targetId, "Sway", duration, true, [
        { t: 0,         position: base.position, rotation: base.rotation,                                scale: base.scale },
        { t: q,         position: base.position, rotation: add(base.rotation, [a, 0,  a]),               scale: base.scale },
        { t: 2 * q,     position: base.position, rotation: add(base.rotation, [0, 0,  0]),               scale: base.scale },
        { t: 3 * q,     position: base.position, rotation: add(base.rotation, [-a, 0, -a]),              scale: base.scale },
        { t: duration,  position: base.position, rotation: base.rotation,                                scale: base.scale },
      ]);
    },
    thumb: { icon: "Waves" },
  },

  // ----- translate -----
  {
    id: "bob",
    name: "Bob (float up/down)",
    category: "transform",
    description: "Smooth vertical bobbing.",
    params: [
      { key: "amplitude", label: "Height",   type: "number", min: 0.05, max: 5, step: 0.05, default: 0.5 },
      { key: "duration",  label: "Duration", type: "number", min: 0.3, max: 10, step: 0.1, default: 2 },
    ],
    build: (targetId, p, base) => {
      const amp = Number(p.amplitude) || 0.5;
      const duration = Number(p.duration) || 2;
      return track(targetId, "Bob", duration, true, [
        { t: 0,            position: base.position,                              rotation: base.rotation, scale: base.scale },
        { t: duration / 2, position: add(base.position, [0, amp, 0]),            rotation: base.rotation, scale: base.scale },
        { t: duration,     position: base.position,                              rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "ArrowUpDown" },
  },

  {
    id: "levitate",
    name: "Levitate",
    category: "transform",
    description: "Rises and holds, slowly drifting in place.",
    params: [
      { key: "height",   label: "Height",   type: "number", min: 0.1, max: 10, step: 0.1, default: 1.2 },
      { key: "duration", label: "Duration", type: "number", min: 1, max: 12, step: 0.1, default: 5 },
    ],
    build: (targetId, p, base) => {
      const h = Number(p.height) || 1.2;
      const duration = Number(p.duration) || 5;
      const drift = h * 0.08;
      return track(targetId, "Levitate", duration, true, [
        { t: 0,            position: base.position,                                     rotation: base.rotation, scale: base.scale },
        { t: duration / 4, position: add(base.position, [0, h, 0]),                     rotation: base.rotation, scale: base.scale },
        { t: duration / 2, position: add(base.position, [drift, h + drift, 0]),         rotation: base.rotation, scale: base.scale },
        { t: (3 * duration) / 4, position: add(base.position, [-drift, h - drift, 0]), rotation: base.rotation, scale: base.scale },
        { t: duration,     position: base.position,                                     rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "ArrowUp" },
  },

  {
    id: "shake",
    name: "Shake",
    category: "transform",
    description: "Rapid jitter — great for impact reactions.",
    params: [
      { key: "amplitude", label: "Amplitude", type: "number", min: 0.01, max: 1, step: 0.01, default: 0.1 },
      { key: "duration",  label: "Duration",  type: "number", min: 0.2, max: 4, step: 0.1, default: 0.6 },
    ],
    build: (targetId, p, base) => {
      const a = Number(p.amplitude) || 0.1;
      const duration = Number(p.duration) || 0.6;
      const steps = 8;
      const kfs: AnimationTrack["keyframes"] = [];
      for (let i = 0; i <= steps; i++) {
        const t = (duration * i) / steps;
        const ox = (Math.random() - 0.5) * 2 * a;
        const oy = (Math.random() - 0.5) * 2 * a;
        const oz = (Math.random() - 0.5) * 2 * a;
        kfs.push({
          t,
          position: i === steps ? base.position : add(base.position, [ox, oy, oz]),
          rotation: base.rotation,
          scale: base.scale,
        });
      }
      return track(targetId, "Shake", duration, true, kfs);
    },
    thumb: { icon: "Vibrate" },
  },

  {
    id: "drift",
    name: "Drift",
    category: "transform",
    description: "Loop a slow horizontal drift around the start point.",
    params: [
      { key: "radius",   label: "Radius",   type: "number", min: 0.1, max: 10, step: 0.1, default: 1 },
      { key: "duration", label: "Duration", type: "number", min: 2, max: 20, step: 0.5, default: 6 },
    ],
    build: (targetId, p, base) => {
      const r = Number(p.radius) || 1;
      const duration = Number(p.duration) || 6;
      return track(targetId, "Drift", duration, true, [
        { t: 0,                  position: base.position,                       rotation: base.rotation, scale: base.scale },
        { t: duration / 4,       position: add(base.position, [r, 0, 0]),       rotation: base.rotation, scale: base.scale },
        { t: duration / 2,       position: add(base.position, [0, 0, r]),       rotation: base.rotation, scale: base.scale },
        { t: (3 * duration) / 4, position: add(base.position, [-r, 0, 0]),      rotation: base.rotation, scale: base.scale },
        { t: duration,           position: base.position,                       rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "Wind" },
  },

  {
    id: "orbit",
    name: "Orbit",
    category: "transform",
    description: "Circles a point on the chosen plane.",
    params: [
      { key: "radius",   label: "Radius",   type: "number", min: 0.2, max: 20, step: 0.1, default: 2 },
      { key: "duration", label: "Duration", type: "number", min: 1, max: 20, step: 0.5, default: 4 },
      { key: "axis",     label: "Up axis",  type: "axis",   default: "y" },
    ],
    build: (targetId, p, base) => {
      const r = Number(p.radius) || 2;
      const duration = Number(p.duration) || 4;
      const axis = (p.axis ?? "y") as AxisKey;
      const steps = 12;
      const kfs: AnimationTrack["keyframes"] = [];
      for (let i = 0; i <= steps; i++) {
        const t = (duration * i) / steps;
        const a = (i / steps) * Math.PI * 2;
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r;
        const off: Vec3 =
          axis === "y" ? [cx, 0, cy]
          : axis === "x" ? [0, cx, cy]
          : [cx, cy, 0];
        kfs.push({
          t,
          position: add(base.position, off),
          rotation: base.rotation,
          scale: base.scale,
        });
      }
      return track(targetId, "Orbit", duration, true, kfs);
    },
    thumb: { icon: "CircleDot" },
  },

  // ----- scale -----
  {
    id: "pulse",
    name: "Pulse",
    category: "scale",
    description: "Scales up and back down like a heartbeat.",
    params: [
      { key: "amount",   label: "Amount",   type: "number", min: 0.05, max: 1, step: 0.05, default: 0.2 },
      { key: "duration", label: "Duration", type: "number", min: 0.2, max: 5, step: 0.1, default: 1 },
    ],
    build: (targetId, p, base) => {
      const a = 1 + (Number(p.amount) || 0.2);
      const duration = Number(p.duration) || 1;
      return track(targetId, "Pulse", duration, true, [
        { t: 0,            position: base.position, rotation: base.rotation, scale: base.scale },
        { t: duration / 2, position: base.position, rotation: base.rotation, scale: mul(base.scale, a) },
        { t: duration,     position: base.position, rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "Heart" },
  },

  {
    id: "breathe",
    name: "Breathe",
    category: "scale",
    description: "Subtle slow scale in/out — alive feel.",
    params: [
      { key: "amount",   label: "Amount",   type: "number", min: 0.02, max: 0.5, step: 0.01, default: 0.06 },
      { key: "duration", label: "Duration", type: "number", min: 1, max: 12, step: 0.5, default: 3 },
    ],
    build: (targetId, p, base) => {
      const a = 1 + (Number(p.amount) || 0.06);
      const duration = Number(p.duration) || 3;
      return track(targetId, "Breathe", duration, true, [
        { t: 0,            position: base.position, rotation: base.rotation, scale: base.scale },
        { t: duration / 2, position: base.position, rotation: base.rotation, scale: mul(base.scale, a) },
        { t: duration,     position: base.position, rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "Activity" },
  },

  {
    id: "pop-in",
    name: "Pop in",
    category: "scale",
    description: "Spawn from zero with a slight overshoot. One-shot.",
    params: [
      { key: "duration", label: "Duration", type: "number", min: 0.2, max: 3, step: 0.05, default: 0.6 },
    ],
    build: (targetId, p, base) => {
      const duration = Number(p.duration) || 0.6;
      return track(targetId, "Pop in", duration, false, [
        { t: 0,                  position: base.position, rotation: base.rotation, scale: [0, 0, 0] },
        { t: duration * 0.7,     position: base.position, rotation: base.rotation, scale: mul(base.scale, 1.15) },
        { t: duration,           position: base.position, rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "Sparkles" },
  },

  {
    id: "squash-stretch",
    name: "Squash & stretch",
    category: "scale",
    description: "Classic cartoon vertical squash then stretch.",
    params: [
      { key: "amount",   label: "Amount",   type: "number", min: 0.05, max: 0.8, step: 0.05, default: 0.3 },
      { key: "duration", label: "Duration", type: "number", min: 0.2, max: 4, step: 0.1, default: 0.7 },
    ],
    build: (targetId, p, base) => {
      const a = Number(p.amount) || 0.3;
      const duration = Number(p.duration) || 0.7;
      const squash: Vec3 = [base.scale[0] * (1 + a), base.scale[1] * (1 - a), base.scale[2] * (1 + a)];
      const stretch: Vec3 = [base.scale[0] * (1 - a / 2), base.scale[1] * (1 + a), base.scale[2] * (1 - a / 2)];
      return track(targetId, "Squash & stretch", duration, true, [
        { t: 0,                position: base.position, rotation: base.rotation, scale: base.scale },
        { t: duration / 3,     position: base.position, rotation: base.rotation, scale: squash },
        { t: (2 * duration) / 3, position: base.position, rotation: base.rotation, scale: stretch },
        { t: duration,         position: base.position, rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "Maximize2" },
  },

  // ----- compound -----
  {
    id: "hover-spin",
    name: "Hover & spin",
    category: "compound",
    description: "Bobs up and down while continuously rotating.",
    params: [
      { key: "height",   label: "Height",   type: "number", min: 0.1, max: 5, step: 0.05, default: 0.4 },
      { key: "duration", label: "Duration", type: "number", min: 1, max: 12, step: 0.5, default: 4 },
    ],
    build: (targetId, p, base) => {
      const h = Number(p.height) || 0.4;
      const duration = Number(p.duration) || 4;
      return track(targetId, "Hover & spin", duration, true, [
        { t: 0,             position: base.position,                  rotation: base.rotation,                        scale: base.scale },
        { t: duration / 4,  position: add(base.position, [0, h, 0]),  rotation: add(base.rotation, [0, Math.PI / 2, 0]), scale: base.scale },
        { t: duration / 2,  position: base.position,                  rotation: add(base.rotation, [0, Math.PI, 0]),  scale: base.scale },
        { t: (3 * duration) / 4, position: add(base.position, [0, h, 0]), rotation: add(base.rotation, [0, 1.5 * Math.PI, 0]), scale: base.scale },
        { t: duration,      position: base.position,                  rotation: add(base.rotation, [0, 2 * Math.PI, 0]), scale: base.scale },
      ]);
    },
    thumb: { icon: "Sparkles" },
  },

  {
    id: "float-in",
    name: "Float in",
    category: "compound",
    description: "Slides in from below + pops to full scale. One-shot.",
    params: [
      { key: "distance", label: "Distance", type: "number", min: 0.5, max: 10, step: 0.1, default: 2 },
      { key: "duration", label: "Duration", type: "number", min: 0.3, max: 3, step: 0.1, default: 0.9 },
    ],
    build: (targetId, p, base) => {
      const d = Number(p.distance) || 2;
      const duration = Number(p.duration) || 0.9;
      return track(targetId, "Float in", duration, false, [
        { t: 0,            position: add(base.position, [0, -d, 0]), rotation: base.rotation, scale: mul(base.scale, 0.4) },
        { t: duration * 0.8, position: base.position,                rotation: base.rotation, scale: mul(base.scale, 1.1) },
        { t: duration,     position: base.position,                  rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "ArrowUpFromLine" },
  },

  {
    id: "conveyor",
    name: "Conveyor loop",
    category: "compound",
    description: "Slides forward and snaps back — endless conveyor.",
    params: [
      { key: "axis",     label: "Axis",     type: "axis",   default: "x" },
      { key: "distance", label: "Distance", type: "number", min: 0.5, max: 20, step: 0.1, default: 4 },
      { key: "duration", label: "Duration", type: "number", min: 1, max: 20, step: 0.5, default: 4 },
    ],
    build: (targetId, p, base) => {
      const axis = (p.axis ?? "x") as AxisKey;
      const d = Number(p.distance) || 4;
      const duration = Number(p.duration) || 4;
      return track(targetId, "Conveyor", duration, true, [
        { t: 0,             position: base.position,                          rotation: base.rotation, scale: base.scale },
        { t: duration - 0.01, position: add(base.position, axisVec(axis, d)), rotation: base.rotation, scale: base.scale },
        { t: duration,      position: base.position,                          rotation: base.rotation, scale: base.scale },
      ]);
    },
    thumb: { icon: "ArrowRight" },
  },

  {
    id: "wobble",
    name: "Wobble",
    category: "compound",
    description: "Lean alternately left/right while bobbing slightly.",
    params: [
      { key: "angle",    label: "Angle°",   type: "number", min: 2, max: 30, step: 1, default: 8 },
      { key: "duration", label: "Duration", type: "number", min: 0.5, max: 6, step: 0.1, default: 1.5 },
    ],
    build: (targetId, p, base) => {
      const a = ((Number(p.angle) || 8) * Math.PI) / 180;
      const duration = Number(p.duration) || 1.5;
      const h = 0.06;
      return track(targetId, "Wobble", duration, true, [
        { t: 0,             position: base.position,                          rotation: base.rotation,                        scale: base.scale },
        { t: duration / 4,  position: add(base.position, [0, h, 0]),          rotation: add(base.rotation, [0, 0, a]),        scale: base.scale },
        { t: duration / 2,  position: base.position,                          rotation: base.rotation,                        scale: base.scale },
        { t: (3 * duration) / 4, position: add(base.position, [0, h, 0]),     rotation: add(base.rotation, [0, 0, -a]),       scale: base.scale },
        { t: duration,      position: base.position,                          rotation: base.rotation,                        scale: base.scale },
      ]);
    },
    thumb: { icon: "Sigma" },
  },
];

export const PRESET_CATEGORIES: { id: ObjectAnimationPreset["category"]; label: string }[] = [
  { id: "transform", label: "Transform" },
  { id: "scale",     label: "Scale" },
  { id: "compound",  label: "Compound" },
];

export function presetDefaults(preset: ObjectAnimationPreset): Record<string, any> {
  return Object.fromEntries(preset.params.map((p) => [p.key, p.default]));
}