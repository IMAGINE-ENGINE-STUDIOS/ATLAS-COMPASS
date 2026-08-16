/**
 * React binding for the all-sky imagery skybox.
 *
 * Settings live in a tiny module store so several panels (Solar system list,
 * Star Gazer) can drive the same skybox without fighting over `scene.skyBox`:
 * exactly one mounted hook instance claims ownership and performs the install.
 *
 * Tycho starts at 4K so the galaxy paints almost immediately, then silently
 * upgrades to 8K. 16K is opt-in from the UI because the mosaic is ~68 MB.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { applyMilkyWaySkyBox, type SkyResolution } from "./milkyWaySky";
import { isSkySurveyId, type SkySurveyId } from "./skySurveys";

const STORAGE_KEY = "atlas.sky.milkyway";

interface SkyState {
  enabled: boolean;
  res: SkyResolution;
  survey: SkySurveyId;
}

function readStored(): SkyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SkyState>;
      return {
        enabled: p.enabled !== false,
        res: p.res === "8k" || p.res === "16k" ? p.res : "4k",
        survey: isSkySurveyId(p.survey) ? p.survey : "tycho",
      };
    }
  } catch {}
  return { enabled: true, res: "4k", survey: "tycho" };
}

let state: SkyState = readStored();
const listeners = new Set<() => void>();

function update(patch: Partial<SkyState>) {
  state = { ...state, ...patch };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  listeners.forEach((l) => l());
}

/** The hook instance currently allowed to install the skybox. */
let owner: object | null = null;

export function useMilkyWaySky(viewer: any) {
  const [snapshot, setSnapshot] = useState<SkyState>(state);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<SkyResolution | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const token = useRef({});
  const autoUpgraded = useRef(false);

  useEffect(() => {
    const listener = () => setSnapshot(state);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  // Claim the single install slot while this instance has a viewer.
  useEffect(() => {
    if (!viewer) { setIsOwner(false); return; }
    if (!owner) owner = token.current;
    setIsOwner(owner === token.current);
    return () => {
      if (owner === token.current) owner = null;
    };
  }, [viewer]);

  const { enabled, res, survey } = snapshot;

  useEffect(() => {
    if (!isOwner || !viewer || viewer.isDestroyed?.() || !enabled) {
      setActive(null);
      return;
    }
    let cancelled = false;
    let restore: (() => void) | null = null;
    setLoading(true);
    setError(null);
    applyMilkyWaySkyBox(viewer, res, survey)
      .then((undo) => {
        if (cancelled) { undo(); return; }
        restore = undo;
        setActive(res);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? "Sky imagery unavailable");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      restore?.();
    };
  }, [isOwner, viewer, enabled, res, survey]);

  // One free quality bump for the NASA panorama: 4K lands fast, 8K follows.
  useEffect(() => {
    if (!enabled || survey !== "tycho" || autoUpgraded.current || active !== "4k" || res !== "4k") return;
    const t = window.setTimeout(() => {
      autoUpgraded.current = true;
      update({ res: "8k" });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [enabled, active, res, survey]);

  const chooseRes = useCallback((next: SkyResolution) => {
    autoUpgraded.current = true; // an explicit pick wins over the auto bump
    update({ res: next });
  }, []);

  const chooseSurvey = useCallback((next: SkySurveyId) => {
    autoUpgraded.current = true;
    update({ survey: next, res: next === "tycho" ? state.res : "4k" });
  }, []);

  const setEnabled = useCallback((next: boolean) => update({ enabled: next }), []);

  return { enabled, setEnabled, res, chooseRes, survey, chooseSurvey, loading, error, active };
}
