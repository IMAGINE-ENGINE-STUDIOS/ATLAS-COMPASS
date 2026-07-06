/**
 * tile-intel-pipeline
 * -------------------
 * Every time a user saves a **rule** or an **action** the client posts here
 * to materialize a small pipeline plan: what triggers it, the ordered steps
 * the platform will run, and an optional AI narration when opted in.
 */
import { corsHeaders } from "../_shared/cors.ts";

interface Body {
  kind: "rule" | "action";
  entity: Record<string, unknown>;
  ai?: boolean;
  model?: string;
}

function planForRule(r: any) {
  const steps = [
    { id: "match",    label: `Match ${r.source_kind} inside ${r.geofence_id ? "geofence" : "any tile"}` },
    { id: "evaluate", label: `Evaluate condition ${r.condition} on threshold` },
    { id: "cooldown", label: `Respect ${r.cooldown_s ?? 300}s cooldown` },
    { id: "emit",     label: "Emit tile_intel_event + realtime notification" },
    { id: "dispatch", label: "Fan out to linked actions (webhook / email / SMS / in-app)" },
  ];
  if (r.ai_assist) steps.push({ id: "ai", label: "AI helper adds narration + risk score" });
  return steps;
}

function planForAction(a: any) {
  const map: Record<string, string> = {
    webhook: "POST payload to the configured webhook URL",
    email:   "Send an email via the configured provider",
    sms:     "Send SMS via GatewayAPI",
    inapp:   "Push a realtime in-app alert to the notifications bell",
  };
  return [
    { id: "trigger",  label: "Wait for a linked rule to fire" },
    { id: "envelope", label: "Build the event envelope (geofence + measurement + severity)" },
    { id: "dispatch", label: map[a.kind] ?? `Dispatch ${a.kind}` },
    { id: "record",   label: "Record delivery + retry on failure" },
  ];
}

async function aiNarrate(entity: any, kind: string, model: string): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are the Tile Intelligence pipeline narrator. In <=60 words, plain English, describe when this pipeline fires, what it will do, and one concrete risk to watch. No bullet points." },
          { role: "user", content: `Kind: ${kind}\nEntity: ${JSON.stringify(entity).slice(0, 1200)}` },
        ],
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const steps = body.kind === "rule" ? planForRule(body.entity) : planForAction(body.entity);
    const summary = body.kind === "rule"
      ? `Rule pipeline · ${steps.length} steps`
      : `Action pipeline · ${steps.length} steps`;
    const wantAi = body.ai || (body.kind === "rule" && (body.entity as any)?.ai_assist);
    const ai = wantAi ? await aiNarrate(body.entity, body.kind, body.model || "google/gemini-3-flash-preview") : null;
    return new Response(JSON.stringify({ pipeline: { steps, summary, ai } }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});