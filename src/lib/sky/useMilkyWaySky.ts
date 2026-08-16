/**
 * React binding for the all-sky imagery skybox.
 *
 * Settings live in a tiny module store so several panels (Solar system list,
 * Star Gazer) can drive the same skybox without fighting over `scene.skyBox`:
 * exactly one mounted hook instance claims ownership and performs the install.
 *
 * The skybox is OFF by default: the mosaics are 4–68 MB and the cube-map
 * re-projection costs GPU time, so nothing downloads until the user turns it
 * on. Once enabled it starts at 4K; 8K and 16K are explicit picks.
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
        enabled: p.enabled === true,
        res: p.res === "8k" || p.res === "16k" ? p.res : "4k",
        survey: isSkySurveyId(p.survey) ? p.survey : "tycho",
      };
    }
  } catch {}
  return { enabled: false, res: "4k", survey: "tycho" };
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

  const chooseRes = useCallback((next: SkyResolution) => {
    update({ res: next });
  }, []);

  const chooseSurvey = useCallback((next: SkySurveyId) => {
    update({ survey: next, res: next === "tycho" ? state.res : "4k" });
  }, []);

  const setEnabled = useCallback((next: boolean) => update({ enabled: next }), []);

  return { enabled, setEnabled, res, chooseRes, survey, chooseSurvey, loading, error, active };
}
