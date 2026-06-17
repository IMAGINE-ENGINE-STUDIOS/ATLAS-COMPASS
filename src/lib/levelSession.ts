import { supabase } from "@/integrations/supabase/client";

/**
 * Ensures a Supabase session exists so RLS policies referring to auth.uid()
 * succeed. If no session is present we sign in anonymously — each device gets
 * its own user id, so levels remain personal per user.
 */
export async function ensureLevelSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn("[levels] anonymous sign-in failed", error.message);
    return null;
  }
  return anon.session?.user.id ?? anon.user?.id ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}