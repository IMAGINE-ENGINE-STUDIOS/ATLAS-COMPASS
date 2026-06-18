import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { ensureLevelSession, getCurrentUserId } from "./levelSession";

/**
 * Rig Save persistence.
 * ---------------------
 * - "True memory": rows live in `public.rig_saves` keyed by the user's
 *   anonymous-auth uid; RLS scopes reads/writes to that user.
 * - "Cache": last fetched list is mirrored to localStorage so the gallery
 *   shows instantly on reload and stays usable offline. Local writes update
 *   the cache immediately and reconcile with the server response.
 */

export interface BonePose {
  /** Bone name (matches THREE.Object3D.name). */
  n: string;
  /** Local position [x,y,z]. */
  p: [number, number, number];
  /** Local quaternion [x,y,z,w]. */
  q: [number, number, number, number];
  /** Local scale [x,y,z]. */
  s: [number, number, number];
}

export interface RigSave {
  id: string;
  name: string;
  source_label: string | null;
  model_url: string;
  active_clip: string | null;
  speed: number;
  controller_map: Record<string, string | null>;
  pose: BonePose[];
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

export interface RigSaveInput {
  name: string;
  source_label?: string | null;
  model_url: string;
  active_clip?: string | null;
  speed?: number;
  controller_map?: Record<string, string | null>;
  pose?: BonePose[];
  thumbnail?: string | null;
}

const CACHE_KEY = "rig-saves-cache-v1";

/* ----------------------------- cache ------------------------------ */

function readCache(): RigSave[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RigSave[]) : [];
  } catch {
    return [];
  }
}

function writeCache(rows: RigSave[]) {
  if (typeof window === "undefined") return;
  try {
    // Best-effort: thumbnails can be large. If quota fails, strip thumbs.
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    try {
      const lite = rows.map((r) => ({ ...r, thumbnail: null }));
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(lite));
    } catch {
      /* give up — gallery still works from server */
    }
  }
}

export function getCachedRigSaves(): RigSave[] {
  return readCache();
}

/* --------------------------- pose helpers ------------------------- */

export function capturePose(root: THREE.Object3D): BonePose[] {
  const out: BonePose[] = [];
  root.traverse((o) => {
    if (!(o as any).isBone) return;
    out.push({
      n: o.name,
      p: [o.position.x, o.position.y, o.position.z],
      q: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w],
      s: [o.scale.x, o.scale.y, o.scale.z],
    });
  });
  return out;
}

export function applyPose(root: THREE.Object3D, pose: BonePose[]) {
  if (!pose || pose.length === 0) return;
  const byName = new Map<string, BonePose>();
  for (const b of pose) byName.set(b.n, b);
  root.traverse((o) => {
    if (!(o as any).isBone) return;
    const b = byName.get(o.name);
    if (!b) return;
    o.position.set(b.p[0], b.p[1], b.p[2]);
    o.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    o.scale.set(b.s[0], b.s[1], b.s[2]);
  });
  root.updateMatrixWorld(true);
}

/* ---------------------------- CRUD -------------------------------- */

export async function listRigSaves(): Promise<RigSave[]> {
  const userId = await getCurrentUserId().catch(() => null);
  if (!userId) return readCache();
  const { data, error } = await supabase
    .from("rig_saves")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) {
    console.warn("[rigSaves] list failed, using cache", error?.message);
    return readCache();
  }
  const rows = data as unknown as RigSave[];
  writeCache(rows);
  return rows;
}

export async function saveRig(input: RigSaveInput): Promise<RigSave> {
  const userId = await ensureLevelSession();
  if (!userId) throw new Error("Could not create a session to save the rig.");
  const payload = {
    user_id: userId,
    name: input.name,
    source_label: input.source_label ?? null,
    model_url: input.model_url,
    active_clip: input.active_clip ?? null,
    speed: input.speed ?? 1,
    controller_map: input.controller_map ?? {},
    pose: input.pose ?? [],
    thumbnail: input.thumbnail ?? null,
  };
  const { data, error } = await supabase
    .from("rig_saves")
    .insert(payload as any)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Save failed");
  const row = data as unknown as RigSave;
  writeCache([row, ...readCache().filter((r) => r.id !== row.id)]);
  return row;
}

export async function deleteRigSave(id: string): Promise<void> {
  writeCache(readCache().filter((r) => r.id !== id));
  await ensureLevelSession();
  const { error } = await supabase.from("rig_saves").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function renameRigSave(id: string, name: string): Promise<void> {
  writeCache(readCache().map((r) => (r.id === id ? { ...r, name } : r)));
  await ensureLevelSession();
  const { error } = await supabase
    .from("rig_saves")
    .update({ name })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
