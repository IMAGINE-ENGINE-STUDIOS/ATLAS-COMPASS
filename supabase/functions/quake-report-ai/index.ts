// Edge function: quake-report-ai
// ---------------------------------
// Generates or refines a full geotechnical / seismic event report from real
// USGS event data + user-selected engineering parameters. Uses the Lovable
// AI Gateway (google/gemini-2.5-flash by default). Supports two modes:
//   mode = "generate"  -> author a fresh report from event + params
//   mode = "refine"    -> take the current report + a user chat instruction
//                         and return a revised full report
// All output is a single markdown document — the frontend renders it and
// exports it verbatim as .md.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuakeInput {
  id: string;
  mag: number;
  place: string;
  time: number;
  lat: number;
  lng: number;
  depthKm: number;
  tsunami?: 0 | 1;
  url?: string;
  alert?: string | null;
  magType?: string | null;
  mmi?: number | null;
  cdi?: number | null;
  felt?: number | null;
  nst?: number | null;
  dmin?: number | null;
  rms?: number | null;
  gap?: number | null;
  sig?: number | null;
  net?: string | null;
}

interface Params {
  siteClass?: string;       // A/B/C/D/E per NEHRP
  groundwaterM?: number | null;
  structureType?: string;
  exposureUse?: string;
  designCode?: string;
  targetAudience?: string;  // engineer | responder | public
  units?: "SI" | "US";
  language?: string;        // en, es, ...
  extraNotes?: string;
}

function fmtTime(ms: number) {
  try { return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z"; }
  catch { return String(ms); }
}

function buildFacts(q: QuakeInput, p: Params, source: string): string {
  return [
    `EVENT ID: ${q.id}`,
    `SOURCE AUTHORITY: ${source.toUpperCase()}`,
    `ORIGIN TIME (UTC): ${fmtTime(q.time)}`,
    `EPICENTER: ${q.lat.toFixed(4)}°, ${q.lng.toFixed(4)}°`,
    `PLACE: ${q.place || "unknown"}`,
    `MAGNITUDE: ${q.mag} (${q.magType ?? "unknown scale"})`,
    `FOCAL DEPTH: ${q.depthKm} km`,
    `TSUNAMI FLAG: ${q.tsunami ? "issued" : "none"}`,
    `PAGER ALERT: ${q.alert ?? "none"}`,
    `INSTRUMENTAL MMI: ${q.mmi ?? "not instrumented"}`,
    `COMMUNITY DYFI (CDI): ${q.cdi ?? "n/a"} across ${q.felt ?? 0} felt reports`,
    `STATIONS USED: ${q.nst ?? "n/a"}`,
    `MIN DISTANCE (deg): ${q.dmin ?? "n/a"}`,
    `LOCATION RMS (s): ${q.rms ?? "n/a"}`,
    `AZIMUTHAL GAP (deg): ${q.gap ?? "n/a"}`,
    `SIGNIFICANCE SCORE: ${q.sig ?? "n/a"}`,
    `NETWORK: ${q.net ?? source}`,
    `EVENT PAGE: ${q.url ?? ""}`,
    ``,
    `SELECTED ENGINEERING PARAMETERS:`,
    `- Site class (NEHRP): ${p.siteClass ?? "unknown — assume D (default)"}`,
    `- Groundwater depth (m): ${p.groundwaterM ?? "unknown"}`,
    `- Structure type: ${p.structureType ?? "not specified"}`,
    `- Exposure / use: ${p.exposureUse ?? "not specified"}`,
    `- Design code reference: ${p.designCode ?? "ASCE 7 / IBC (assumed)"}`,
    `- Units: ${p.units ?? "SI"}`,
    `- Target audience: ${p.targetAudience ?? "engineer"}`,
    p.extraNotes ? `- Extra notes: ${p.extraNotes}` : ``,
  ].filter(Boolean).join("\n");
}

const SYSTEM_GENERATE = `You are a senior geotechnical / seismic hazards engineer producing a rigorous
event report for a specific earthquake. Ground every statement in the FACTS block
the user provides. Do not invent numbers; when a value is missing, say so and
state the assumption or recommended next step. Use the Modified Mercalli scale
(I–XII), Gutenberg–Richter energy relation (log10 E = 4.8 + 1.5 M), NEHRP site
classes (A–E), and standard practice references (ASCE 7, EN 1998, Youd & Idriss
2001 for liquefaction, Newmark for slope displacement) as appropriate. Output a
single self-contained Markdown document with the following sections, exactly in
this order and using \`##\` for each:

1. Executive Summary
2. Event Metadata
3. Tectonic Setting & Source Mechanism
4. Ground Motion Characterisation
5. Site Response & NEHRP Class Implications
6. Liquefaction Assessment
7. Slope Stability & Landslide Hazard
8. Structural & Foundation Implications
9. Lifeline & Infrastructure Considerations
10. Aftershock / Replica Outlook
11. Recommendations & Next Actions
12. Data Provenance & Caveats

Keep the tone professional but readable. Every section must have real content —
never leave a heading with a placeholder. Length: 900–1500 words.`;

const SYSTEM_REFINE = `You are revising an existing seismic event report on behalf of the user.
The user will give a short instruction (add/remove/rewrite something, change
audience, translate, expand a section, etc.). Return the FULL revised report
as Markdown — never a diff, never just the changed section. Preserve section
numbering and factual accuracy. Keep every fact traceable to the FACTS block.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const {
      mode = "generate",
      quake,
      params = {},
      source = "usgs",
      previousReport = "",
      instruction = "",
      chatHistory = [],
    } = body as {
      mode?: "generate" | "refine";
      quake: QuakeInput;
      params?: Params;
      source?: string;
      previousReport?: string;
      instruction?: string;
      chatHistory?: { role: "user" | "assistant"; content: string }[];
    };

    if (!quake || typeof quake.mag !== "number" || typeof quake.lat !== "number") {
      return new Response(JSON.stringify({ error: "Missing or invalid `quake` payload." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const facts = buildFacts(quake, params, source);
    const messages: { role: string; content: string }[] = [];

    if (mode === "refine") {
      messages.push({ role: "system", content: SYSTEM_REFINE });
      messages.push({ role: "user", content: `FACTS:\n${facts}` });
      if (previousReport) {
        messages.push({ role: "assistant", content: previousReport });
      }
      for (const m of chatHistory.slice(-8)) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          messages.push({ role: m.role, content: m.content.slice(0, 4000) });
        }
      }
      messages.push({
        role: "user",
        content: `Revision request: ${String(instruction || "Improve the report.").slice(0, 2000)}\n\nReturn the FULL revised report as Markdown.`,
      });
    } else {
      messages.push({ role: "system", content: SYSTEM_GENERATE });
      messages.push({
        role: "user",
        content: `FACTS:\n${facts}\n\nWrite the full report now. Language: ${params.language ?? "English"}.`,
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!resp.ok) {
      const status = resp.status;
      const msg = status === 429
        ? "Rate limit exceeded. Please try again shortly."
        : status === 402
          ? "AI credits exhausted. Please add credits."
          : `AI gateway error: ${status}`;
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const report = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});