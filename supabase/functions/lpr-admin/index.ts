// Atlas-admin-only endpoints for managing access requests.
//   GET  ?action=list_requests           → list pending + recent
//   POST body { action:'approve'|'reject', id, notes? }
//   POST body { action:'set_role', user_id, role, grant }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, serviceClient } from "../_shared/lpr.ts";

async function requireAdmin(authHeader: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { error: "unauthorized" as const, status: 401 };
  const svc = serviceClient();
  const { data: role } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "atlas_admin")
    .maybeSingle();
  if (!role) return { error: "forbidden" as const, status: 403 };
  return { userId: userData.user.id, svc };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const guard = await requireAdmin(authHeader);
  if ("error" in guard) {
    return new Response(JSON.stringify({ error: guard.error }), {
      status: guard.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { svc, userId } = guard;

  if (req.method === "GET") {
    const { data } = await svc
      .from("lpr_access_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return new Response(JSON.stringify({ requests: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  if (body.action === "approve" || body.action === "reject") {
    const status = body.action === "approve" ? "approved" : "rejected";
    const { data: reqRow } = await svc
      .from("lpr_access_requests")
      .update({ status, admin_notes: body.notes ?? null, decided_at: new Date().toISOString(), decided_by: userId })
      .eq("id", body.id)
      .select("*")
      .single();
    if (reqRow && status === "approved") {
      await svc.from("lpr_settings").upsert({
        user_id: reqRow.user_id,
        access_mode: "platform",
        platform_approved: true,
      }, { onConflict: "user_id" });
    } else if (reqRow && status === "rejected") {
      await svc.from("lpr_settings").update({ platform_approved: false }).eq("user_id", reqRow.user_id);
    }
    return new Response(JSON.stringify({ ok: true, request: reqRow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (body.action === "set_role") {
    const { user_id, role, grant } = body;
    if (!user_id || !role) {
      return new Response(JSON.stringify({ error: "user_id and role required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (grant) {
      await svc.from("user_roles").upsert({ user_id, role }, { onConflict: "user_id,role" });
    } else {
      await svc.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "unknown_action" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});