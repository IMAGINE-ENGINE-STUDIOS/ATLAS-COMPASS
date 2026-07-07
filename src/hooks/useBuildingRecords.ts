/**
 * useBuildingRecords
 * ------------------
 * CRUD + ledger helpers for the OSM Buildings ledger.
 * All writes are scoped to `auth.uid()` via RLS; the hook additionally
 * appends a row to `building_ledger` on every meaningful change so the
 * per-building history is preserved.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  BuildingCardRecord,
  BuildingLedgerEntry,
  BuildingLedgerKind,
  PickedBuilding,
} from "@/types/BuildingCardRecord";
import { estimatePopulation } from "@/types/BuildingCardRecord";

const BUCKET = "building-models";
const SIGNED_TTL_SEC = 60 * 60 * 8;

export function useBuildingRecords() {
  const [records, setRecords] = useState<Record<string, BuildingCardRecord>>({});
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setUserId(data.user?.id ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Load every record owned by the current user. */
  const loadMine = useCallback(async () => {
    if (!userId) {
      setRecords({});
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("building_records")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) {
      console.warn("[useBuildingRecords] load failed", error);
      setLoading(false);
      return;
    }
    const map: Record<string, BuildingCardRecord> = {};
    for (const row of (data ?? []) as BuildingCardRecord[]) {
      map[row.osm_id] = row;
    }
    if (mountedRef.current) setRecords(map);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  /** Fetch or lazily create a record for a picked building. */
  const ensureRecord = useCallback(
    async (picked: PickedBuilding): Promise<BuildingCardRecord | null> => {
      if (!userId) return null;
      const existing = records[picked.osm_id];
      if (existing) return existing;
      const est =
        picked.est_population ??
        estimatePopulation({
          levels: picked.levels ?? null,
          footprint_m2: picked.footprint_m2 ?? null,
          building_kind: picked.building_kind ?? null,
        });
      const insert = {
        user_id: userId,
        osm_id: picked.osm_id,
        lat: picked.lat,
        lng: picked.lng,
        name: picked.name ?? null,
        address: picked.address ?? null,
        building_kind: picked.building_kind ?? null,
        levels: picked.levels ?? null,
        footprint_m2: picked.footprint_m2 ?? null,
        est_population: est,
        raw: picked.raw ?? {},
      } as never;
      const { data, error } = await supabase
        .from("building_records")
        .upsert(insert, { onConflict: "user_id,osm_id" })
        .select("*")
        .single();
      if (error) {
        console.warn("[useBuildingRecords] ensure failed", error);
        return null;
      }
      const row = data as BuildingCardRecord;
      setRecords((prev) => ({ ...prev, [row.osm_id]: row }));
      appendLedger(row.id, "import", "Building added to ledger", { osm_id: row.osm_id });
      return row;
    },
    [records, userId],
  );

  const appendLedger = useCallback(
    async (
      recordId: string,
      kind: BuildingLedgerKind,
      message: string | null,
      payload: Record<string, unknown> = {},
    ) => {
      if (!userId) return;
      await supabase.from("building_ledger").insert({
        record_id: recordId,
        user_id: userId,
        kind,
        message,
        payload: payload as never,
      } as never);
    },
    [userId],
  );

  const patchRecord = useCallback(
    async (
      osmId: string,
      patch: Partial<BuildingCardRecord>,
      ledger?: { kind: BuildingLedgerKind; message?: string; payload?: Record<string, unknown> },
    ) => {
      const current = records[osmId];
      if (!current) return null;
      const { data, error } = await supabase
        .from("building_records")
        .update(patch as never)
        .eq("id", current.id)
        .select("*")
        .single();
      if (error) {
        console.warn("[useBuildingRecords] patch failed", error);
        return null;
      }
      const row = data as BuildingCardRecord;
      setRecords((prev) => ({ ...prev, [row.osm_id]: row }));
      if (ledger) {
        appendLedger(row.id, ledger.kind, ledger.message ?? null, ledger.payload ?? {});
      }
      return row;
    },
    [records, appendLedger],
  );

  /** List ledger entries for a given record. */
  const listLedger = useCallback(
    async (recordId: string): Promise<BuildingLedgerEntry[]> => {
      const { data, error } = await supabase
        .from("building_ledger")
        .select("*")
        .eq("record_id", recordId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.warn("[useBuildingRecords] ledger failed", error);
        return [];
      }
      return (data ?? []) as BuildingLedgerEntry[];
    },
    [],
  );

  /** Upload a GLB file to storage and store the path on the record. */
  const uploadReplacementModel = useCallback(
    async (osmId: string, file: File): Promise<BuildingCardRecord | null> => {
      if (!userId) return null;
      const current = records[osmId];
      if (!current) return null;
      const ext = file.name.split(".").pop()?.toLowerCase() || "glb";
      const path = `${userId}/${current.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || "model/gltf-binary" });
      if (upErr) {
        console.warn("[useBuildingRecords] upload failed", upErr);
        return null;
      }
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_TTL_SEC);
      return await patchRecord(
        osmId,
        { replacement_glb_path: path, replacement_glb_url: signed?.signedUrl ?? null },
        {
          kind: "model",
          message: `Replaced with model: ${file.name}`,
          payload: { file: file.name, size: file.size },
        },
      );
    },
    [records, userId, patchRecord],
  );

  const clearReplacementModel = useCallback(
    async (osmId: string) => {
      const current = records[osmId];
      if (!current) return null;
      if (current.replacement_glb_path) {
        try {
          await supabase.storage.from(BUCKET).remove([current.replacement_glb_path]);
        } catch (e) {
          console.warn("[useBuildingRecords] remove failed", e);
        }
      }
      return await patchRecord(
        osmId,
        { replacement_glb_path: null, replacement_glb_url: null },
        { kind: "model", message: "Removed replacement model" },
      );
    },
    [records, patchRecord],
  );

  return {
    userId,
    loading,
    records,
    loadMine,
    ensureRecord,
    patchRecord,
    appendLedger,
    listLedger,
    uploadReplacementModel,
    clearReplacementModel,
  };
}

export type UseBuildingRecords = ReturnType<typeof useBuildingRecords>;