// Streaming AI chat & forecast for Tile Intelligence.
// Uses the user's selected model via the managed AI gateway.
// Body: { model?: string, mode?: "chat"|"forecast", messages?: [...], context?: {...} }
import { corsHeaders } from "../_shared/cors.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });

  const { model = DEFAULT_MODEL, mode = "chat", messages = [], context = null } = await req.json();

  const system = mode === "forecast"
    ? "You are an Earth-intelligence forecaster. Given recent samples and a geofence, produce a compact JSON forecast: {summary, next_24h:[{t,value,confidence}], risks:[...]}. Numeric where possible; keep prose short."
    : "You are Atlas Tile Intelligence assistant. You help the user reason about geofences, rules, live feeds (storms, lightning, earthquakes), and their uploaded datasets. Answer concisely using markdown.";

  const chatMessages = [
    { role: "system", content: system },
    ...(context ? [{ role: "system", content: `Context:\n${JSON.stringify(context).slice(0, 6000)}` }] : []),
    ...messages,
  ];

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": LOVABLE_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, messages: chatMessages, stream: true }),
  });

  if (!r.ok) {
    const text = await r.text();
    return new Response(JSON.stringify({ error: "gateway", status: r.status, details: text }), { status: r.status, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  return new Response(r.body, {
    headers: { ...corsHeaders, "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
});