/**
 * React binding for the NASA Milky Way skybox.
 *
 * Starts at 4K so the galaxy paints almost immediately, then silently upgrades
 * to 8K once the first faces are live. 16K is opt-in from the UI because the
 * mosaic is ~68 MB.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { applyMilkyWaySkyBox, type SkyResolution } from "./milkyWaySky";

const STORAGE_KEY = "atlas.sky.milkyway";

interface Stored {
  enabled: boolean;
  res: SkyResolution;
}

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Stored>;
      return {
        enabled: p.enabled !== false,
        res: p.res === "8k" || p.res === "16k" ? p.res : "4k",
      };
    }
  } catch {}
  return { enabled: true, res: "4k" };
}

export function useMilkyWaySky(viewer: any) {
  const initial = useRef(readStored());
  const [enabled, setEnabled] = useState(initial.current.enabled);
  const [res, setRes] = useState<SkyResolution>(initial.current.res);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<SkyResolution | null>(null);
  const autoUpgraded = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, res })); } catch {}
  }, [enabled, res]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.() || !enabled) {
      setActive(null);
      return;
    }
    let cancelled = false;
    let restore: (() => void) | null = null;
    setLoading(true);
    setError(null);
    applyMilkyWaySkyBox(viewer, res)
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
  }, [viewer, enabled, res]);

  // One free quality bump: 4K lands fast, 8K arrives a moment later.
  useEffect(() => {
    if (!enabled || autoUpgraded.current || active !== "4k" || res !== "4k") return;
    const t = window.setTimeout(() => {
      autoUpgraded.current = true;
      setRes("8k");
    }, 2500);
    return () => window.clearTimeout(t);
  }, [enabled, active, res]);

  const chooseRes = useCallback((next: SkyResolution) => {
    autoUpgraded.current = true; // an explicit pick wins over the auto bump
    setRes(next);
  }, []);

  return { enabled, setEnabled, res, chooseRes, loading, error, active };
}
