// Shared, module-level locomotion state.
//
// The runtime keeps tiny mutable singletons here so independent React subtrees
// (player controller, push-target rigid bodies, interaction prompt UI) can
// read/write without prop drilling and without adding another context that
// rerenders the whole scene every frame.

import * as THREE from "three";

/** Per-pushable-object kinematic state (velocity decays on a friction curve). */
export interface PushableState {
  velocity: THREE.Vector3;
  angularY: number;
  /** World position written every frame (mutates the live three.js Object3D). */
  position: THREE.Vector3;
  /** Mass in kg — heavier objects move less per impulse. */
  mass: number;
}

/** Map of objectId → mutable pushable state. */
export const pushableRegistry = new Map<string, PushableState>();

/** Snapshot of where each object sits in world space (object3d ref). */
export const objectWorldRefs = new Map<string, THREE.Object3D>();

/** Interaction prompt the runtime exposes for the React UI to mirror. */
export interface InteractionPrompt {
  visible: boolean;
  label: string;
  /** "sit" / "use" / "" */
  kind: "" | "sit" | "use";
}

let promptListeners: Array<(p: InteractionPrompt) => void> = [];
let currentPrompt: InteractionPrompt = { visible: false, label: "", kind: "" };

export function setInteractionPrompt(p: InteractionPrompt) {
  if (
    p.visible === currentPrompt.visible &&
    p.label === currentPrompt.label &&
    p.kind === currentPrompt.kind
  ) return;
  currentPrompt = p;
  for (const l of promptListeners) l(p);
}

export function subscribeInteractionPrompt(cb: (p: InteractionPrompt) => void) {
  promptListeners.push(cb);
  cb(currentPrompt);
  return () => {
    promptListeners = promptListeners.filter((l) => l !== cb);
  };
}

/** "E" key pulse for `use`/`sit`. Set true on keydown, consumed by runtime. */
export const inputPulse = { interact: false };