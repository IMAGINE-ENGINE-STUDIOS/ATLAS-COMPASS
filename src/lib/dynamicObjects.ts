// Dynamic Objects library.
//
// A "Dynamic Object" is a snapshot of one scene object — or a whole group of
// objects — packaged with everything it needs to be dropped back into any
// future level: geometry / materials / textures, per-object interactions and
// scripts, action buttons, and any scene paths (splines) the object refers
// to. The library has two stores:
//
//   - Local (browser): instant, no auth, per-device. Modeled on
//     `terrainLibrary` — a single localStorage key holding the array.
//   - Cloud: backed by `public.dynamic_objects` so users can keep a private
//     library that syncs across devices, plus a public catalog of presets
//     shared by other users.

import { supabase } from "@/integrations/supabase/client";
import type { SceneObject, ScenePath } from "./levelTypes";
import { newId } from "./levelTypes";

export type DynamicObjectScope = "single" | "group";

export interface DynamicObjectPayload {
  /** "single" = one object, "group" = N objects authored to move together. */
  kind: DynamicObjectScope;
  /** Objects with positions REBASED so the payload origin sits at (0,0,0). */
  objects: SceneObject[];
  /** Any scene paths referenced by `objects[].splineBindings`. */
  scenePaths?: ScenePath[];
  /** When `kind === "group"`, the original group's display name. */
  groupName?: string;
}

export interface DynamicObjectEntry {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: number;
  source: "local" | "cloud";
  /** Cloud only — auth user id. */
  ownerId?: string;
  /** Cloud only — whether the entry is published to the public catalog. */
  isPublic?: boolean;
  /** Data-URL or storage URL for the gallery card thumbnail. */
  thumbnailUrl?: string;
  payload: DynamicObjectPayload;
}

const LS_KEY = "atlas.dynamicObjects.v1";
const LS_KEY_LEGACY = "lovable.dynamicObjects.v1";

// One-time migration off the pre-rename storage key so existing browsers
// keep their locally cached entries.
try {
  const legacy = localStorage.getItem(LS_KEY_LEGACY);
  if (legacy !== null && localStorage.getItem(LS_KEY) === null) {
    localStorage.setItem(LS_KEY, legacy);
  }
  if (legacy !== null) localStorage.removeItem(LS_KEY_LEGACY);
} catch {
  /* storage unavailable (SSR / private mode) — ignore */
}

/* ------------------------------ local store ------------------------------ */

export function loadSavedDynamics(): DynamicObjectEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DynamicObjectEntry[];
  } catch {
    return [];
  }
}

function writeSaved(list: DynamicObjectEntry[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("[dynamicObjects] failed to persist", e);
  }
}

export function saveDynamicLocal(
  input: Omit<DynamicObjectEntry, "id" | "createdAt" | "source">,
): DynamicObjectEntry {
  const entry: DynamicObjectEntry = {
    ...input,
    id: `dyn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    source: "local",
  };
  const list = loadSavedDynamics();
  list.unshift(entry);
  writeSaved(list);
  return entry;
}

export function deleteDynamicLocal(id: string) {
  writeSaved(loadSavedDynamics().filter((p) => p.id !== id));
}

export function renameDynamicLocal(id: string, name: string) {
  writeSaved(
    loadSavedDynamics().map((p) =>
      p.id === id ? { ...p, name: name.trim() || p.name } : p,
    ),
  );
}

/* ------------------------------ cloud store ------------------------------ */

function rowToEntry(row: any): DynamicObjectEntry {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    tags: row.tags ?? [],
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    source: "cloud",
    ownerId: row.owner_id ?? undefined,
    isPublic: !!row.is_public,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    payload: row.payload,
  };
}

export async function listMyCloudDynamics(): Promise<DynamicObjectEntry[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("dynamic_objects")
    .select("*")
    .eq("owner_id", uid)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[dynamicObjects] listMine failed", error);
    return [];
  }
  return (data ?? []).map(rowToEntry);
}

export async function listPublicDynamics(limit = 60): Promise<DynamicObjectEntry[]> {
  const { data, error } = await supabase
    .from("dynamic_objects")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[dynamicObjects] listPublic failed", error);
    return [];
  }
  return (data ?? []).map(rowToEntry);
}

export async function saveDynamicCloud(input: {
  name: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  thumbnailUrl?: string;
  payload: DynamicObjectPayload;
}): Promise<DynamicObjectEntry | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) {
    throw new Error("Sign in to save Dynamic Objects to your cloud library.");
  }
  const { data, error } = await supabase
    .from("dynamic_objects")
    .insert({
      owner_id: uid,
      name: input.name,
      description: input.description ?? null,
      tags: input.tags ?? [],
      is_public: !!input.isPublic,
      thumbnail_url: input.thumbnailUrl ?? null,
      payload: input.payload as any,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[dynamicObjects] saveCloud failed", error);
    throw error;
  }
  return rowToEntry(data);
}

export async function setDynamicCloudPublic(id: string, isPublic: boolean) {
  const { error } = await supabase
    .from("dynamic_objects")
    .update({ is_public: isPublic })
    .eq("id", id);
  if (error) throw error;
}

export async function renameDynamicCloud(id: string, name: string) {
  const { error } = await supabase
    .from("dynamic_objects")
    .update({ name })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDynamicCloud(id: string) {
  const { error } = await supabase.from("dynamic_objects").delete().eq("id", id);
  if (error) throw error;
}

/* ----------------------------- payload helpers ---------------------------- */

/**
 * Compute the centroid (XYZ midpoint) of the given objects' world positions.
 * Used as the payload origin when packing a dynamic.
 */
export function centroid(objs: SceneObject[]): [number, number, number] {
  if (objs.length === 0) return [0, 0, 0];
  let x = 0, y = 0, z = 0;
  for (const o of objs) { x += o.position[0]; y += o.position[1]; z += o.position[2]; }
  return [x / objs.length, y / objs.length, z / objs.length];
}

/**
 * Pack a payload: rebases each object so the centroid lives at (0,0,0), strips
 * cloud-specific ids that don't survive across levels, and pulls along any
 * referenced scene paths.
 */
export function packPayload(
  scope: DynamicObjectScope,
  objects: SceneObject[],
  allPaths: ScenePath[],
  groupName?: string,
): DynamicObjectPayload {
  const c = centroid(objects);
  const referencedPathIds = new Set<string>();
  const rebased: SceneObject[] = objects.map((o) => {
    const clone: any = structuredClone(o);
    clone.position = [o.position[0] - c[0], o.position[1] - c[1], o.position[2] - c[2]];
    for (const b of clone.splineBindings ?? []) {
      if (b.pathId) referencedPathIds.add(b.pathId);
    }
    return clone as SceneObject;
  });
  const paths = allPaths.filter((p) => referencedPathIds.has(p.id));
  return { kind: scope, objects: rebased, scenePaths: paths, groupName };
}

/**
 * Materialise a saved payload back into a list of fresh scene objects (with
 * regenerated ids) anchored at `anchor`. Re-keys spline bindings + group ids
 * so the spawn doesn't collide with whatever is already in the scene.
 * Returns the spawned objects and any new scene paths to register.
 */
export function instantiatePayload(
  payload: DynamicObjectPayload,
  anchor: [number, number, number],
): { objects: SceneObject[]; paths: ScenePath[]; groupId?: string } {
  const idMap = new Map<string, string>();
  for (const o of payload.objects) idMap.set(o.id, newId("obj"));
  const pathIdMap = new Map<string, string>();
  for (const p of payload.scenePaths ?? []) pathIdMap.set(p.id, newId("path"));
  const groupId = payload.kind === "group" ? newId("grp") : undefined;
  const out: SceneObject[] = payload.objects.map((src) => {
    const clone: any = structuredClone(src);
    clone.id = idMap.get(src.id)!;
    clone.position = [
      src.position[0] + anchor[0],
      src.position[1] + anchor[1],
      src.position[2] + anchor[2],
    ];
    if (groupId) clone.groupId = groupId;
    if (Array.isArray(clone.splineBindings)) {
      clone.splineBindings = clone.splineBindings.map((b: any) => ({
        ...b,
        id: newId("bind"),
        pathId: pathIdMap.get(b.pathId) ?? b.pathId,
      }));
    }
    // Drop layerId so the new objects fall into the user's current layer.
    delete clone.layerId;
    return clone as SceneObject;
  });
  const paths: ScenePath[] = (payload.scenePaths ?? []).map((p) => ({
    ...structuredClone(p),
    id: pathIdMap.get(p.id)!,
  }));
  return { objects: out, paths, groupId };
}