// Matchmaking tick: groups queued users into matches.
// Invoked on-demand when a user joins the queue (best-effort) and can also be
// scheduled via pg_cron for steady draining.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SKILL_BUCKET = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const modeFilter: string | undefined = body?.mode;

  let query = supabase
    .from("match_queue")
    .select("user_id, mode, skill, region, party_size, joined_at")
    .order("joined_at", { ascending: true })
    .limit(2000);
  if (modeFilter) query = query.eq("mode", modeFilter);

  const { data: queued, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  type Q = { user_id: string; mode: string; skill: number; region: string; party_size: number; joined_at: string };
  const buckets = new Map<string, Q[]>();
  for (const q of (queued ?? []) as Q[]) {
    const key = `${q.mode}|${q.region}|${Math.floor(q.skill / SKILL_BUCKET)}|${q.party_size}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(q);
  }

  const created: string[] = [];
  for (const [, list] of buckets) {
    while (list.length >= list[0].party_size) {
      const players = list.splice(0, list[0].party_size);
      const ids = players.map((p) => p.user_id);
      const room_channel = `room-${crypto.randomUUID()}`;
      const { data: ins, error: insErr } = await supabase
        .from("matches")
        .insert({
          mode: players[0].mode,
          region: players[0].region,
          player_ids: ids,
          state: "ready",
          room_channel,
        })
        .select("id")
        .single();
      if (insErr) {
        console.warn("insert match failed", insErr.message);
        continue;
      }
      await supabase.from("match_queue").delete().in("user_id", ids);
      created.push(ins!.id as string);
    }
  }

  return new Response(JSON.stringify({ created, remaining: queued?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});