/**
 * useActiveLevelManifest
 * ----------------------
 * Tracks which Atlas level placement currently owns the camera (i.e. the
 * camera is inside the placement's manifest volume) and returns its
 * manifest plus the merged rule-set. Atlas systems (audio mix, weather,
 * locomotion, camera clamp, lighting) subscribe and apply overrides only
 * while a level is active, restoring globals on exit.
 *
 * This hook is intentionally read-only — applying the rules is the
 * responsibility of each subsystem.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isInsideVolume, type LevelManifest } from "./levelManifest";

export interface CameraSample {
  lng: number;
  lat: number;
  altM: number;
}

interface ManifestRow {
  placementId: string;
  manifest: LevelManifest;
}

/**
 * @param sampleCamera  function returning the current camera lng/lat/alt
 *                      (called on a poll interval — keeps the hook framework
 *                      agnostic; works for Cesium, R3F, anything).
 * @param pollMs        poll interval, default 500ms.
 */
export function useActiveLevelManifest(
  sampleCamera: () => CameraSample | null,
  pollMs = 500,
): { active: LevelManifest | null; placementId: string | null } {
  const [rows, setRows] = useState<ManifestRow[]>([]);
  const [active, setActive] = useState<ManifestRow | null>(null);
  const sampleRef = useRef(sampleCamera);
  sampleRef.current = sampleCamera;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("atlas_level_placements")
        .select("id, manifest_snapshot")
        .not("manifest_snapshot", "is", null);
      if (cancelled) return;
      const next: ManifestRow[] = [];
      for (const r of data ?? []) {
        const m = (r as any).manifest_snapshot as LevelManifest | null;
        if (m && m.volume) next.push({ placementId: (r as any).id as string, manifest: m });
      }
      setRows(next);
    };
    load();
    const onRefresh = () => load();
    window.addEventListener("atlas-level-placements-refresh", onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("atlas-level-placements-refresh", onRefresh);
    };
  }, []);

  useEffect(() => {
    if (rows.length === 0) {
      setActive(null);
      return;
    }
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const c = sampleRef.current();
      if (c) {
        const hit = rows.find((r) => isInsideVolume(r.manifest.volume, c.lng, c.lat, c.altM));
        setActive((prev) => {
          if (prev?.placementId === hit?.placementId) return prev;
          return hit ?? null;
        });
      }
    };
    tick();
    const id = window.setInterval(tick, pollMs);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [rows, pollMs]);

  return useMemo(
    () => ({ active: active?.manifest ?? null, placementId: active?.placementId ?? null }),
    [active],
  );
}