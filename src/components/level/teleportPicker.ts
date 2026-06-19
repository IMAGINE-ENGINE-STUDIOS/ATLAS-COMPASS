// Simple shared store for "pick a teleport destination in the 3D scene".
// The InteractionsPanel calls `requestTeleportPick(...)` to enter picking mode;
// the TeleportPickerOverlay (mounted inside the R3F scene) listens, draws a
// glowing gold cursor on the world surface / objects under the mouse, and on
// click resolves the request with either an absolute position or the id of the
// object that was hit.

import type { Vec3 } from "@/lib/levelTypes";

export type TeleportPickResult = {
  point: Vec3;
  objectId?: string;
};

type Listener = (active: boolean) => void;

let active = false;
let resolver: ((r: TeleportPickResult | null) => void) | null = null;
const listeners = new Set<Listener>();

export function isTeleportPickActive() {
  return active;
}

export function subscribeTeleportPick(fn: Listener) {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((l) => l(active));
}

export function requestTeleportPick(): Promise<TeleportPickResult | null> {
  // Cancel any in-flight request.
  if (resolver) resolver(null);
  return new Promise((resolve) => {
    resolver = resolve;
    active = true;
    notify();
  });
}

export function resolveTeleportPick(r: TeleportPickResult | null) {
  const fn = resolver;
  resolver = null;
  active = false;
  notify();
  fn?.(r);
}

export function cancelTeleportPick() {
  resolveTeleportPick(null);
}