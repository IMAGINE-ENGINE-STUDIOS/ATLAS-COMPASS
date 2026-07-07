import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LPRSettings {
  user_id: string;
  access_mode: "admin" | "platform" | "byok";
  legal_ack_at: string | null;
  byok_api_key: string | null;
  platform_approved: boolean;
  webhook_secret: string;
  daily_request_cap: number;
  requests_today: number;
  requests_reset_at: string;
}

export function useIsAtlasAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "atlas_admin")
        .maybeSingle();
      if (alive) setIsAdmin(!!data);
    })();
    return () => { alive = false; };
  }, []);
  return isAdmin;
}

export function useLPRSettings() {
  const [settings, setSettings] = useState<LPRSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setSettings(null); setLoading(false); return; }
    let { data } = await supabase
      .from("lpr_settings")
      .select("*")
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (!data) {
      const inserted = await supabase
        .from("lpr_settings")
        .insert({ user_id: u.user.id, access_mode: "byok" })
        .select("*")
        .single();
      data = inserted.data as any;
    }
    setSettings((data ?? null) as unknown as LPRSettings | null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = useCallback(async (patch: Partial<LPRSettings>) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { data } = await supabase
      .from("lpr_settings")
      .update(patch as any)
      .eq("user_id", u.user.id)
      .select("*")
      .single();
    if (data) setSettings(data as unknown as LPRSettings);
  }, []);

  return { settings, loading, reload: load, update };
}