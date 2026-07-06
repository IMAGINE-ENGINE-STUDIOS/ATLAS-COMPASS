import { supabase } from "@/integrations/supabase/client";

export type SourceKind = "earth_layer" | "storm" | "lightning" | "earthquake" | "dataset" | "osm_building";
export type Condition = "gt" | "lt" | "between" | "enters" | "exits" | "roc";

export interface Rule {
  id: string;
  owner_id: string;
  geofence_id: string | null;
  name: string;
  source_kind: SourceKind;
  source_ref: Record<string, unknown>;
  condition: Condition;
  threshold: Record<string, unknown>;
  cooldown_s: number;
  ai_assist: boolean;
  ai_model: string | null;
  firehose: boolean;
  enabled: boolean;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RuleInput = Omit<Rule, "id" | "owner_id" | "last_fired_at" | "created_at" | "updated_at">;

export async function listRules(geofenceId?: string): Promise<Rule[]> {
  let q = supabase.from("tile_intel_rules").select("*").order("created_at", { ascending: false });
  if (geofenceId) q = q.eq("geofence_id", geofenceId);
  const { data, error } = await q;
  if (error) { console.warn("[rules] list", error); return []; }
  return (data ?? []) as unknown as Rule[];
}

export async function createRule(input: RuleInput): Promise<Rule | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("tile_intel_rules")
    .insert({ ...input, owner_id: u.user.id, source_ref: input.source_ref as any, threshold: input.threshold as any })
    .select().single();
  if (error) { console.warn("[rules] create", error); return null; }
  return data as unknown as Rule;
}

export async function updateRule(id: string, patch: Partial<RuleInput>): Promise<void> {
  const { error } = await supabase.from("tile_intel_rules").update(patch as any).eq("id", id);
  if (error) console.warn("[rules] update", error);
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from("tile_intel_rules").delete().eq("id", id);
  if (error) console.warn("[rules] delete", error);
}

export async function setRuleActions(ruleId: string, actionIds: string[]): Promise<void> {
  await supabase.from("tile_intel_rule_actions").delete().eq("rule_id", ruleId);
  if (actionIds.length === 0) return;
  await supabase.from("tile_intel_rule_actions").insert(actionIds.map((a) => ({ rule_id: ruleId, action_id: a })));
}

export async function listRuleActions(ruleId: string): Promise<string[]> {
  const { data } = await supabase.from("tile_intel_rule_actions").select("action_id").eq("rule_id", ruleId);
  return (data ?? []).map((r: any) => r.action_id);
}