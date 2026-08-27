/**
 * Visibility-aware polling.
 *
 * Atlas has ~15 independent `setInterval` feeds (news, quakes, cameras,
 * ephemeris, sky readouts, traffic). They kept firing — and kept forcing React
 * commits and Cesium re-renders — while the tab was in the background or the
 * owning panel was closed, stealing frames from whatever the user was doing.
 *
 * `useAtlasPoll` runs the callback on a shared cadence that:
 *   - pauses entirely when `document.hidden`
 *   - pauses when `enabled` is false (panel closed)
 *   - fires once immediately on (re)activation so data is never stale
 *
 * Behaviour while visible is identical to a plain interval.
 */
import { useEffect, useRef } from "react";

export function useAtlasPoll(
  fn: () => void,
  intervalMs: number,
  enabled: boolean = true,
  opts: { immediate?: boolean } = {},
) {
  const cbRef = useRef(fn);
  cbRef.current = fn;
  const immediate = opts.immediate !== false;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let timer: number | null = null;

    const stop = () => {
      if (timer !== null) { window.clearInterval(timer); timer = null; }
    };
    const start = (runNow: boolean) => {
      stop();
      if (runNow) { try { cbRef.current(); } catch {} }
      timer = window.setInterval(() => { try { cbRef.current(); } catch {} }, intervalMs);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start(true);
    };

    if (!document.hidden) start(immediate);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, immediate]);
}

/** Imperative variant for non-React callers. Returns a stop function. */
export function scheduleVisiblePoll(fn: () => void, intervalMs: number): () => void {
  let timer: number | null = null;
  const stop = () => { if (timer !== null) { window.clearInterval(timer); timer = null; } };
  const start = () => {
    stop();
    timer = window.setInterval(() => { try { fn(); } catch {} }, intervalMs);
  };
  const onVis = () => { if (document.hidden) stop(); else { try { fn(); } catch {} start(); } };
  if (!document.hidden) start();
  document.addEventListener("visibilitychange", onVis);
  return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
}
