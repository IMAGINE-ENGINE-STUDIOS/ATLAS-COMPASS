/**
 * Tiny pub-sub store for the Cesium camera altitude readout.
 *
 * Previously the HUD altitude was React state on the 7k-line SpaceshipPage,
 * so a 4Hz `setCameraAlt` re-rendered the entire page. Now the postRender
 * writer pushes into this module store and only a memoized <CameraAltHUD/>
 * subscribes — the rest of the page never re-renders on camera moves.
 */
import { useEffect, useState } from "react";

let value = 0;
const listeners = new Set<(h: number) => void>();

export function setAtlasCameraAltitude(h: number) {
  if (!isFinite(h)) return;
  if (Math.abs(h - value) < 0.5) return;
  value = h;
  listeners.forEach((l) => l(h));
}

export function getAtlasCameraAltitude() {
  return value;
}

export function useAtlasCameraAltitude() {
  const [h, setH] = useState(value);
  useEffect(() => {
    const listener = (nh: number) => setH(nh);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return h;
}