import { supabase } from "@/integrations/supabase/client";

export interface AiPreferences {
  model: string;
  background_enabled?: boolean;
}

export const AI_MODELS = [
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (default, fast)" },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (cheap)" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (deep reasoning)" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini" },
  { id: "openai/gpt-5", label: "GPT-5" },
  { id: "openai/gpt-5.4", label: "GPT-5.4 (advanced reasoning)" },
  { id: "openai/gpt-5.5", label: "GPT-5.5 (most capable)" },
] as const;

export const DEFAULT_MODEL = "google/gemini-3-flash-preview";

const LOCAL_KEY = "atlas.ai.prefs.v1";

export async function getAiPreferences(): Promise<AiPreferences> {
  const { data: u } = await supabase.auth.getUser();
  if (u.user) {
    const { data } = await supabase.from("profiles").select("ai_preferences").eq("id", u.user.id).maybeSingle();
    const p = (data as any)?.ai_preferences as AiPreferences | undefined;
    if (p?.model) return p;
  }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { model: DEFAULT_MODEL };
}

export async function setAiPreferences(prefs: AiPreferences): Promise<void> {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs)); } catch { /* noop */ }
  const { data: u } = await supabase.auth.getUser();
  if (u.user) {
    await supabase.from("profiles").update({ ai_preferences: prefs as any }).eq("id", u.user.id);
  }
}