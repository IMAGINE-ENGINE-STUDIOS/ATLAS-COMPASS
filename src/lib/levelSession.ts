import { supabase } from "@/integrations/supabase/client";

type EnsureLevelSessionOptions = {
  allowAnonymous?: boolean;
  timeoutMs?: number;
};

const DEFAULT_AUTH_TIMEOUT_MS = 1500;

function getCachedAuthUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const userId = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
      if (typeof userId === "string" && userId.length > 0) return userId;
    }
  } catch (error) {
    console.warn("[levels] cached auth read failed", error);
  }
  return null;
}

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

/**
 * Ensures a Supabase session exists so RLS policies referring to auth.uid()
 * succeed. If no session is present we sign in anonymously — each device gets
 * its own user id, so levels remain personal per user.
 */
export async function ensureLevelSession(options: EnsureLevelSessionOptions = {}): Promise<string | null> {
  const { allowAnonymous = true, timeoutMs = DEFAULT_AUTH_TIMEOUT_MS } = options;
  const cachedUserId = getCachedAuthUserId();
  if (cachedUserId) return cachedUserId;

  const sessionAttempt = supabase.auth.getSession().catch((error) => {
    console.warn("[levels] session read failed", error);
    return { data: { session: null } };
  });
  const { data } = await Promise.race([
    sessionAttempt,
    timeout(timeoutMs, { data: { session: null } }),
  ]);
  if (data.session?.user.id) return data.session.user.id;

  if (!allowAnonymous) return null;

  const anonymousAttempt = supabase.auth.signInAnonymously().catch((error) => ({ data: null, error }));
  const { data: anon, error } = await Promise.race([
    anonymousAttempt,
    timeout(timeoutMs, { data: null, error: new Error("Session creation timed out") }),
  ]);
  if (error) {
    console.warn("[levels] anonymous sign-in failed", error.message);
    return null;
  }
  return anon.session?.user.id ?? anon.user?.id ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const cachedUserId = getCachedAuthUserId();
  if (cachedUserId) return cachedUserId;
  const sessionAttempt = supabase.auth.getSession().catch((error) => {
    console.warn("[levels] current user read failed", error);
    return { data: { session: null } };
  });
  const { data } = await Promise.race([
    sessionAttempt,
    timeout(DEFAULT_AUTH_TIMEOUT_MS, { data: { session: null } }),
  ]);
  return data.session?.user.id ?? null;
}