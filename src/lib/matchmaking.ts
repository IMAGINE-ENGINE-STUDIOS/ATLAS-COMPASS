import { supabase } from "@/integrations/supabase/client";

export interface QueueOptions {
  mode: string;
  skill?: number;
  region?: string;
  partySize?: number;
}

export interface MatchRow {
  id: string;
  mode: string;
  region: string;
  player_ids: string[];
  state: "forming" | "ready" | "closed";
  room_channel: string;
}

export async function joinQueue(opts: QueueOptions) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error("Sign in to play");
  await supabase.from("match_queue").upsert({
    user_id: uid,
    mode: opts.mode,
    skill: opts.skill ?? 1000,
    region: opts.region ?? "global",
    party_size: opts.partySize ?? 2,
    joined_at: new Date().toISOString(),
  });
  // Best-effort: kick the matcher immediately so small queues resolve fast.
  supabase.functions.invoke("matchmaking-tick", { body: { mode: opts.mode } }).catch(() => {});
}

export async function leaveQueue() {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  await supabase.from("match_queue").delete().eq("user_id", uid);
}

export function subscribeMyMatches(onMatch: (m: MatchRow) => void) {
  const channel = supabase
    .channel("matchmaking-personal")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "matches" },
      async (payload) => {
        const row = payload.new as MatchRow;
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (uid && row.player_ids?.includes(uid)) onMatch(row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}