/**
 * useLevelPackage
 * ---------------
 * Streams a level's `.lvlpkg` from the `level-packages` storage bucket,
 * unzips it, mounts the files into pkgfs, and returns the manifest + scene
 * for the caller. The package is cached in-process by storagePath so two
 * components asking for the same level only pay the cost once.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { openAndMountPackage, type OpenedPackage } from "./levelPackage";

type CacheEntry = { promise: Promise<OpenedPackage> };
const CACHE = new Map<string, CacheEntry>();

export function useLevelPackage(storagePath: string | null | undefined): {
  pkg: OpenedPackage | null;
  loading: boolean;
  error: string | null;
} {
  const [pkg, setPkg] = useState<OpenedPackage | null>(null);
  const [loading, setLoading] = useState<boolean>(!!storagePath);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!storagePath) {
      setPkg(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    const ensure = (): Promise<OpenedPackage> => {
      const cached = CACHE.get(storagePath);
      if (cached) return cached.promise;
      const promise = (async () => {
        const { data, error: dlErr } = await supabase.storage
          .from("level-packages")
          .download(storagePath);
        if (dlErr || !data) throw new Error(dlErr?.message ?? "Failed to download package");
        const bytes = new Uint8Array(await data.arrayBuffer());
        return await openAndMountPackage(bytes);
      })();
      CACHE.set(storagePath, { promise });
      promise.catch(() => CACHE.delete(storagePath));
      return promise;
    };

    ensure()
      .then((p) => {
        if (cancelled) return;
        setPkg(p);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message ?? e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  return { pkg, loading, error };
}