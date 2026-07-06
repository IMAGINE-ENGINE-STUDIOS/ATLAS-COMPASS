import { supabase } from "@/integrations/supabase/client";

export type ActionKind = "in_app" | "webhook" | "email" | "sms" | "pipeline";

export interface TileAction {
  id: string;
  owner_id: string;
  name: string;
  kind: ActionKind;
  config: Record<string, unknown>;
  secret: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type ActionInput = Pick<TileAction, "name" | "kind" | "config" | "enabled"> & { secret?: string | null };

export async function listActions(): Promise<TileAction[]> {
  const { data, error } = await supabase.from("tile_intel_actions").select("*").order("created_at", { ascending: false });
  if (error) { console.warn("[actions] list", error); return []; }
  return (data ?? []) as unknown as TileAction[];
}

export async function createAction(input: ActionInput): Promise<TileAction | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase.from("tile_intel_actions")
    .insert({ ...input, owner_id: u.user.id, config: input.config as any })
    .select().single();
  if (error) { console.warn("[actions] create", error); return null; }
  return data as unknown as TileAction;
}

export async function updateAction(id: string, patch: Partial<ActionInput>): Promise<void> {
  const { error } = await supabase.from("tile_intel_actions").update(patch as any).eq("id", id);
  if (error) console.warn("[actions] update", error);
}

export async function deleteAction(id: string): Promise<void> {
  const { error } = await supabase.from("tile_intel_actions").delete().eq("id", id);
  if (error) console.warn("[actions] delete", error);
}