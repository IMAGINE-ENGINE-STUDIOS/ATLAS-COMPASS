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

/**
 * Virtual axes written by the on-screen mobile controls (joystick + buttons).
 * Additive over keyboard/gamepad in the player controller's sample().
 */
export const mobileAxes: { x: number; z: number; jump: boolean; run: boolean } = {
  x: 0, z: 0, jump: false, run: false,
};

/**
 * Accumulated look deltas from the on-screen touch look pad. Consumed and
 * zeroed each frame by the player controller — same code path as the
 * mouse-move handler so first/third person camera rotation is identical
 * between desktop pointer-lock and mobile touch.
 */
export const mobileLook: { dx: number; dy: number } = { dx: 0, dy: 0 };

/**
 * Set of object ids currently being driven by a trajectory/spline at play
 * time. While an id is in this set, PushableRuntime skips its own physics
 * step (gravity + horizontal collision) so the follower tracks the curve
 * exactly. The TrajectoryRunner adds/removes ids each frame.
 */
export const splineDrivenIds = new Set<string>();

/**
 * All character group transforms in the scene, keyed by object id. Used by
 * the player controller to push NPC characters out of the way on contact.
 */
export const characterRegistry = new Map<string, THREE.Object3D>();

/* ---------------------------------------------------------------- */
/* Play-mode interactables                                          */
/* ---------------------------------------------------------------- */

/**
 * Kinds of key-triggered interactables registered by `PlayBehaviorRuntime`.
 * `pushable` is excluded — pushables run their own physics loop.
 */
export type InteractableKind = "grabbable" | "event" | "sittable" | "usable";

export interface InteractableEntry {
  id: string;            // scene object id
  kind: InteractableKind;
  key: string;           // bound PlayKey, e.g. "E", "Shift+F", "7"
  label: string;         // HUD prompt text — "Pick up Crate", "Open door"
  eventId?: string;      // only when kind === "event"
  radius: number;        // proximity radius (m)
  once?: boolean;        // event: fire at most once per Play session
  object: THREE.Object3D; // live world transform
}

/** Live registry. Keyed by `${id}::${kind}` so an object can have multiple. */
export const interactableRegistry = new Map<string, InteractableEntry>();

export function registerInteractable(entry: InteractableEntry) {
  interactableRegistry.set(`${entry.id}::${entry.kind}`, entry);
}
export function unregisterInteractable(id: string, kind: InteractableKind) {
  interactableRegistry.delete(`${id}::${kind}`);
}

/**
 * Currently-carried object id (driven by `PlayInputManager` for grabbables).
 * Exposed as a singleton so the carry follower can read it from anywhere.
 */
export const carryState: { id: string | null; carryOffset: [number, number, number] } = {
  id: null,
  carryOffset: [0, 1.1, 1.0],
};

/* ---------------------------------------------------------------- */
/* Lightweight Play-mode event bus                                  */
/* ---------------------------------------------------------------- */

type EventCb = (payload?: unknown) => void;
const eventListeners = new Map<string, Set<EventCb>>();
const eventLog: Array<{ id: string; at: number; payload?: unknown }> = [];
let eventLogListeners: Array<(log: typeof eventLog) => void> = [];

export function emitLevelEvent(id: string, payload?: unknown) {
  const subs = eventListeners.get(id);
  if (subs) for (const cb of subs) cb(payload);
  eventLog.unshift({ id, at: performance.now(), payload });
  if (eventLog.length > 12) eventLog.length = 12;
  for (const l of eventLogListeners) l(eventLog);
}
export function subscribeLevelEvent(id: string, cb: EventCb) {
  let set = eventListeners.get(id);
  if (!set) { set = new Set(); eventListeners.set(id, set); }
  set.add(cb);
  return () => { set!.delete(cb); };
}
export function subscribeEventLog(cb: (log: typeof eventLog) => void) {
  eventLogListeners.push(cb);
  cb(eventLog);
  return () => { eventLogListeners = eventLogListeners.filter((l) => l !== cb); };
}
export function clearEventLog() {
  eventLog.length = 0;
  for (const l of eventLogListeners) l(eventLog);
}

/* ---------------------------------------------------------------- */
/* Play-mode HUD candidate (nearest interactable)                   */
/* ---------------------------------------------------------------- */

export interface HudCandidate {
  id: string;
  kind: InteractableKind;
  key: string;
  label: string;
  dist: number;
}
let currentCandidate: HudCandidate | null = null;
let candidateListeners: Array<(c: HudCandidate | null) => void> = [];
export function setHudCandidate(c: HudCandidate | null) {
  const prev = currentCandidate;
  if (prev && c && prev.id === c.id && prev.kind === c.kind && prev.key === c.key) {
    currentCandidate = c; // update dist silently
    return;
  }
  if (!prev && !c) return;
  currentCandidate = c;
  for (const l of candidateListeners) l(c);
}
export function subscribeHudCandidate(cb: (c: HudCandidate | null) => void) {
  candidateListeners.push(cb);
  cb(currentCandidate);
  return () => { candidateListeners = candidateListeners.filter((l) => l !== cb); };
}