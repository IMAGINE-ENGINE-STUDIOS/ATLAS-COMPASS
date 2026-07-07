/**
 * useSelectionGroups
 * ------------------
 * CRUD + local cache for `building_selection_groups`. One group per
 * "bunch of OSM buildings the user selected together", so marquee A →
 * color red → marquee B → color blue no longer clobbers group A.
 *
 * The hook is intentionally optimistic: local state updates immediately,
 * Supabase writes trail in the background. If the write fails we roll
 * back and toast.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  nextGroupColor,
  type BuildingSelectionGroup,
} from "@/types/BuildingSelectionGroup";
import { toast } from "sonner";

const LOCAL_ACTIVE_KEY = "atlas.buildings.activeGroupId";

export function useSelectionGroups() {
  const [groups, setGroups] = useState<BuildingSelectionGroup[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(LOCAL_ACTIVE_KEY); } catch { return null; }
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
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
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    try {
      if (id) localStorage.setItem(LOCAL_ACTIVE_KEY, id);
      else localStorage.removeItem(LOCAL_ACTIVE_KEY);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!userId) { setGroups([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("building_selection_groups")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      console.warn("[useSelectionGroups] load failed", error);
      return;
    }
    const rows = (data ?? []) as BuildingSelectionGroup[];
    if (mounted.current) setGroups(rows);
    // If no active group is stored, pick the last-updated one.
    if (!activeId && rows.length) {
      const latest = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
      setActiveId(latest.id);
    }
  }, [userId, activeId, setActiveId]);

  useEffect(() => { load(); }, [load]);

  const activeGroup = groups.find((g) => g.id === activeId) ?? null;

  const createGroup = useCallback(
    async (name?: string): Promise<BuildingSelectionGroup | null> => {
      if (!userId) {
        toast.error("Sign in to save selection groups");
        return null;
      }
      const color = nextGroupColor(groups.map((g) => g.color));
      const finalName = name?.trim() || `Group ${groups.length + 1}`;
      const { data, error } = await supabase
        .from("building_selection_groups")
        .insert({ user_id: userId, name: finalName, color, osm_ids: [] } as never)
        .select("*")
        .single();
      if (error) {
        console.warn("[useSelectionGroups] create failed", error);
        toast.error("Could not create group");
        return null;
      }
      const row = data as BuildingSelectionGroup;
      setGroups((prev) => [...prev, row]);
      setActiveId(row.id);
      return row;
    },
    [userId, groups, setActiveId],
  );

  const updateGroup = useCallback(
    async (id: string, patch: Partial<BuildingSelectionGroup>) => {
      // Snapshot the prior row via the functional setter so we always see the
      // latest state (the memoized `groups` closure can be stale right after
      // createGroup → updateGroup calls in the same tick).
      let prev: BuildingSelectionGroup | undefined;
      setGroups((cur) => {
        prev = cur.find((g) => g.id === id);
        return prev ? cur.map((g) => (g.id === id ? { ...g, ...patch } : g)) : cur;
      });
      const { data, error } = await supabase
        .from("building_selection_groups")
        .update(patch as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        console.warn("[useSelectionGroups] update failed", error);
        if (prev) setGroups((cur) => cur.map((g) => (g.id === id ? prev! : g)));
        toast.error("Save failed — rolled back");
        return null;
      }
      const row = data as BuildingSelectionGroup;
      setGroups((cur) => cur.map((g) => (g.id === id ? row : g)));
      return row;
    },
    [],
  );

  const deleteGroup = useCallback(
    async (id: string) => {
      const prev = groups;
      setGroups((cur) => cur.filter((g) => g.id !== id));
      if (activeId === id) setActiveId(prev.find((g) => g.id !== id)?.id ?? null);
      const { error } = await supabase.from("building_selection_groups").delete().eq("id", id);
      if (error) {
        console.warn("[useSelectionGroups] delete failed", error);
        setGroups(prev);
        toast.error("Delete failed");
      }
    },
    [groups, activeId, setActiveId],
  );

  /** Add ids to a group without duplicating. */
  const addToGroup = useCallback(
    async (id: string, ids: string[]) => {
      // Read the latest osm_ids straight from Supabase to avoid a stale
      // closure clobbering a freshly-created group with an empty array.
      const { data, error } = await supabase
        .from("building_selection_groups")
        .select("osm_ids")
        .eq("id", id)
        .single();
      if (error || !data) return;
      const current: string[] = (data as any).osm_ids ?? [];
      const merged = Array.from(new Set([...current, ...ids]));
      if (merged.length === current.length) return;
      await updateGroup(id, { osm_ids: merged });
    },
    [updateGroup],
  );

  const removeFromGroup = useCallback(
    async (id: string, ids: string[]) => {
      const { data, error } = await supabase
        .from("building_selection_groups")
        .select("osm_ids")
        .eq("id", id)
        .single();
      if (error || !data) return;
      const current: string[] = (data as any).osm_ids ?? [];
      const remove = new Set(ids);
      const next = current.filter((x) => !remove.has(x));
      if (next.length === current.length) return;
      await updateGroup(id, { osm_ids: next });
    },
    [updateGroup],
  );

  const toggleInActiveGroup = useCallback(
    async (ids: string[]) => {
      if (!activeGroup) {
        const g = await createGroup();
        if (g) await addToGroup(g.id, ids);
        return;
      }
      const existing = new Set(activeGroup.osm_ids);
      const toRemove = ids.filter((id) => existing.has(id));
      const toAdd = ids.filter((id) => !existing.has(id));
      if (toRemove.length) await removeFromGroup(activeGroup.id, toRemove);
      if (toAdd.length) await addToGroup(activeGroup.id, toAdd);
    },
    [activeGroup, createGroup, addToGroup, removeFromGroup],
  );

  return {
    userId,
    loading,
    groups,
    activeId,
    activeGroup,
    setActiveId,
    createGroup,
    updateGroup,
    deleteGroup,
    addToGroup,
    removeFromGroup,
    toggleInActiveGroup,
    reload: load,
  };
}

export type UseSelectionGroups = ReturnType<typeof useSelectionGroups>;