// One-shot seeder: loads the bundled multilingual hazard keyword dictionary.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import keywords from "../_shared/hazardKeywords.json" with { type: "json" };

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Row {
  hazard: string;
  lang: string;
  lang_name: string;
  keyword: string;
  normalized: string;
  is_primary: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // The dictionary is public, static and inserted idempotently, so the very
    // first bootstrap of an empty table needs no auth. Any later re-seed does.
    const { count: existing } = await admin
      .from("hazard_keywords")
      .select("id", { count: "exact", head: true });

    if ((existing ?? 0) > 0) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
      const { data: userData, error: authError } = await admin.auth.getUser(authHeader.slice(7));
      if (authError || !userData.user) return json({ error: "Authentication required" }, 401);
      const { data: role } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "atlas_admin")
        .maybeSingle();
      if (!role) return json({ error: "Admin access required" }, 403);
    }

    const rows = keywords as Row[];
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const { error } = await admin
        .from("hazard_keywords")
        .upsert(chunk, { onConflict: "normalized,hazard", ignoreDuplicates: true });
      if (error) {
        console.error(`Seed chunk ${i} failed:`, error.message);
        return json({ error: "Seed failed", details: error.message, inserted }, 500);
      }
      inserted += chunk.length;
    }

    const { count } = await admin
      .from("hazard_keywords")
      .select("id", { count: "exact", head: true });

    return json({ ok: true, processed: inserted, total_in_table: count });
  } catch (err) {
    console.error("seed-hazard-keywords error:", err);
    return json({ error: String(err) }, 500);
  }
});