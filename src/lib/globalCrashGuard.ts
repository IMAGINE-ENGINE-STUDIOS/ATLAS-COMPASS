/**
 * Global crash guard — swallows the categories of errors that were
 * hard-reloading the whole app during heavy Cesium/R3F use, and instead
 * logs + recovers in-place. This runs once from `main.tsx`.
 *
 * What we catch:
 *   1. `unhandledrejection` — background fetch aborts, tile stream errors,
 *      cancelled ephemeris polls. These are recoverable by design; leaving
 *      them uncaught surfaces the "app crashed" overlay.
 *   2. `error` on window — non-React runtime errors from library callbacks
 *      (Cesium request queue, R3F tick), same rationale.
 *   3. `webglcontextlost` on any Cesium/R3F canvas — Chromium/mobile GPUs
 *      routinely drop the GL context under memory pressure. Default browser
 *      behavior is to leave the canvas dead. We `preventDefault()` and
 *      request Cesium to re-render on context restore, and R3F auto-
 *      recovers on its own frame loop.
 *   4. `pagehide` / high memory pressure → trim the tile service-worker
 *      cache proactively so we don't fight the OS for RAM.
 *
 * Everything here is best-effort and never throws.
 */

import { memoryPressure } from "./deviceProfile";

const IGNORED_MESSAGE_RE = /(AbortError|The user aborted a request|ResizeObserver loop|ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module)/i;

let installed = false;

export function installGlobalCrashGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const softLog = (label: string, err: unknown) => {
    try {
      // eslint-disable-next-line no-console
      console.warn(`[crashGuard] ${label}:`, err);
    } catch {}
  };

  window.addEventListener("unhandledrejection", (e) => {
    const reason: any = e.reason;
    const msg = reason?.message || String(reason || "");
    if (IGNORED_MESSAGE_RE.test(msg)) {
      e.preventDefault();
      return;
    }
    softLog("unhandledrejection", reason);
    // Prevent the browser's default "unhandled" console overlay + reloader.
    e.preventDefault();
  });

  window.addEventListener("error", (e) => {
    const msg = e.error?.message || e.message || "";
    if (IGNORED_MESSAGE_RE.test(msg)) {
      e.preventDefault();
      return;
    }
    softLog("window.error", e.error || msg);
    // Do not preventDefault here — React's ErrorBoundary still needs to
    // see the error for render-time exceptions.
  });

  // WebGL context loss: attach handlers to every existing/future canvas so
  // the tab doesn't die when the GPU evicts our context. Both R3F and
  // Cesium can re-establish, but only if the default `contextlost` action
  // ("permanent") is suppressed.
  const wireCanvas = (c: HTMLCanvasElement) => {
    if ((c as any).__crashGuardWired) return;
    (c as any).__crashGuardWired = true;
    c.addEventListener("webglcontextlost", (ev) => {
      ev.preventDefault();
      softLog("webglcontextlost — recovering", c);
    }, false);
    c.addEventListener("webglcontextrestored", () => {
      softLog("webglcontextrestored", c);
      // Nudge Cesium to redraw on restore
      try {
        const anyC = c as any;
        anyC.__cesiumViewer?.scene?.requestRender?.();
      } catch {}
    }, false);
  };
  const scanCanvases = () => {
    try { document.querySelectorAll("canvas").forEach((c) => wireCanvas(c as HTMLCanvasElement)); } catch {}
  };
  scanCanvases();
  const mo = new MutationObserver(scanCanvases);
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}

  // Memory-pressure sweeper. If the tab is close to the JS heap limit,
  // ask the service worker to drop half its tile cache so returning
  // Cesium tile downloads have somewhere to live.
  const trimSW = () => {
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "trim", ratio: 0.5 });
    } catch {}
  };
  setInterval(() => {
    const p = memoryPressure();
    if (p > 0.85) {
      softLog(`memory pressure ${(p * 100).toFixed(0)}% — trimming caches`, null);
      trimSW();
    }
  }, 10_000);

  window.addEventListener("pagehide", () => { trimSW(); }, { passive: true });
}
