// Edge function: quake-report-ai
// ---------------------------------
// Generates or refines a professional consulting-style TECHNICAL SEISMIC
// ASSESSMENT REPORT for a specific earthquake event, modelled on a
// geotechnical engineering consulting report (BME / ASCE style). The
// structure mirrors a real field-consulting deliverable: executive
// summary, project information, purpose, regional context, field
// methods, observations, evaluation, recommendations, limitations,
// closure. Uses the Lovable AI Gateway (google/gemini-2.5-flash).
//
// Modes:
//   mode = "generate" -> author a fresh report from event + params + template
//   mode = "refine"   -> revise the current report using user chat + fields
// Output is a single self-contained Markdown document rendered verbatim
// on the frontend and exportable as .md / print PDF.

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
  siteClass?: string;
  groundwaterM?: number | null;
  structureType?: string;
  exposureUse?: string;
  designCode?: string;
  targetAudience?: string;
  units?: "SI" | "US";
  language?: string;
  extraNotes?: string;
}

/**
 * Editable consulting-report fields. Anything the user has filled is
 * treated as authoritative — the writer must preserve wording verbatim
 * (grammar-only edits). Empty fields are drafted from the event facts.
 */
interface TemplateFields {
  projectTitle?: string;
  clientName?: string;
  clientAddress?: string;
  projectAddress?: string;
  projectNumber?: string;
  reportDate?: string;
  engineerName?: string;
  engineerTitle?: string;
  engineerLicense?: string;
  executiveSummary?: string;
  projectInformation?: string;
  purpose?: string;
  regionalContext?: string;
  fieldMethods?: string;
  observations?: string;
  evaluation?: string;
  recommendations?: string;
  limitations?: string;
  closure?: string;
  attachments?: string;
}

interface Figure {
  caption: string;
  url: string;
  section?: string;
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
    `ENGINEERING PARAMETERS:`,
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

function templateBlock(t: TemplateFields | undefined): string {
  if (!t) return "USER-PROVIDED TEMPLATE FIELDS: (none — draft everything from FACTS)";
  const rows = Object.entries(t)
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => `- ${k}: ${String(v).slice(0, 4000)}`);
  if (!rows.length) return "USER-PROVIDED TEMPLATE FIELDS: (none — draft everything from FACTS)";
  return `USER-PROVIDED TEMPLATE FIELDS (authoritative — integrate verbatim, grammar-only edits):\n${rows.join("\n")}`;
}

function figuresBlock(figs: Figure[] | undefined): string {
  if (!figs?.length) return "FIGURES: (none provided — omit image embeds)";
  return "FIGURES (embed each as ![caption](url) inside the OBSERVATIONS section and reference in prose as \"(Figure N)\"):\n" +
    figs.map((f, i) =>
      `- Figure ${i + 1} | ${f.caption} | ${f.url}`,
    ).join("\n");
}

const SYSTEM_GENERATE = `You are the lead author of a professional TECHNICAL
SEISMIC ASSESSMENT REPORT written in the exact voice, structure and
register of a working geotechnical / civil-engineering consulting
deliverable (think a firm letter-report addressed to a named client:
Executive Summary → Project Information → Purpose → Regional Context →
Field Methods → Observations → Evaluation → Recommendations →
Limitations → Closure → Attachments). The subject is a specific
earthquake event, not a study of policy or society.

VOICE — hard requirements
- First-person plural ("we", "our field team", "it is our opinion that")
  when speaking as the authoring firm; third-person neutral for
  technical description. Formal, restrained, factual.
- Every quantitative claim ties back to the FACTS block. Never invent
  values. When a value is missing, write "not reported (source: <auth>)".
- Preserve verbatim any USER-PROVIDED TEMPLATE FIELDS in the matching
  section; only tighten grammar. Never contradict them. Empty fields →
  you draft them from FACTS.
- Units: SI unless the user requested US. MMI in Roman numerals I–XII.
- No academic citation apparatus (no author-date parentheticals, no
  references list, no "Harvard-style"). When you name a canonical
  method (SPT, Newmark method, ASCE 7, ShakeMap, PAGER, DYFI), name it
  in prose without a citation.

FORMATTING — hard requirements
- GitHub-flavoured Markdown. Tables use pipes and hyphens.
- Between every major section: ONE blank line. Between every paragraph:
  ONE blank line. Never wall-of-text.
- Every section that presents parameters MUST use a proper Markdown
  table, not bullet lists of key:value pairs. Required tables:
  Project Information (client / project / event snapshot),
  Regional Context (nearest tectonic features), Observations
  (event parameters + location quality metrics + intensity summary),
  Evaluation (geotechnical hazard screening matrix), and any
  aftershock summary. Every numeric value carries units.
- Embed every provided FIGURE as \`![caption](url)\` inside § 6
  Observations. Immediately after each figure write an italic caption
  line: \`*Figure N. <caption>*\` and reference in prose as
  "(Figure N)".
- Use fenced code blocks only for raw catalogue rows or ASCII plots.

STRUCTURE — output a single self-contained Markdown document in EXACTLY
this order, using the exact headings shown so the frontend can style
them. Do NOT rename or reorder sections. Do NOT invent geopolitical
sections.

# <Project title>

**Prepared for:** <client name>
<client address>

**Re:** Seismic Assessment Services — <one-line event descriptor>
<project address>
**Project No.:** <project number>
**Date:** <report date>

---

## Executive Summary
3–5 short paragraphs. Open with the event and the questions this
assessment answers. State the principal findings in numeric terms
(magnitude, depth, intensity, distance to key infrastructure). Close
with a bulleted list of "our opinion" statements — the concrete
engineering conclusions that follow from the data (e.g. bearing
capacity, liquefaction screening outcome, aftershock outlook).

## 1. Project Information
One short prose paragraph naming the client, the site, and the event
that triggered this assessment. Immediately follow with a Markdown
table titled *Project & Event Snapshot* with columns
\`Field | Value\` covering: Client, Project address, Project number,
Report date, Event ID, Origin time (UTC), Epicenter, Focal depth,
Magnitude (and type), Source authority, Event page.

## 2. Purpose
2–4 sentences: the specific technical questions this report answers
and the scope of services performed. Consulting register.

## 3. Regional and Tectonic Context
Prose paragraph on the plate-tectonic setting, regional stress
regime, and nearest mapped active faults. If a moment-tensor figure
is available, describe the mechanism (reverse / normal / strike-slip)
in words. Follow with a small table \`Feature | Distance | Notes\`
listing the nearest tectonic features you referenced.

## 4. Field Data and Methodology
Describe the observation network and instrumentation used to
characterise the event (regional broadband stations, ShakeMap
interpolation, DYFI community reports, PAGER exposure model). Note
the source authority (§ SOURCE AUTHORITY) and any data quality
caveats (location RMS, azimuthal gap, number of stations).

## 5. Regional Ground Conditions
If the ENGINEERING PARAMETERS supply a site class / groundwater
depth / structure type, describe the assumed subsurface profile in
prose. If parameters are missing, state the default assumption
(NEHRP D unless overridden) and flag that the user should refine.

## 6. Observations
Sub-sections:
### 6.1 Event Parameters
Markdown table \`Parameter | Value | Unit | Source\` covering origin
time, latitude, longitude, depth, magnitude, magnitude type, network,
event id.
### 6.2 Location Quality
Markdown table \`Metric | Value | Interpretation\` covering nst, dmin
(deg), azimuthal gap (deg), location RMS (s), review status.
### 6.3 Ground Motion and Intensity
Prose paragraph + table \`Metric | Value | Source\` covering
instrumental MMI, community CDI, felt-report count, PAGER alert,
tsunami flag, and — where derivable from ShakeMap contours — expected
PGA / PGV brackets. Embed the provided FIGURES here with italic
captions.
### 6.4 Aftershock Sequence
Short prose plus a Markdown table of up to 10 aftershocks so far
with columns \`# | UTC time | M | Δ (km) | Depth (km) | Region\`. If
none logged, say so explicitly.

## 7. Evaluation
ONE subsection per relevant hazard. Only include a subsection when
the FACTS or PARAMETERS support it. Each subsection is a compact
technical paragraph.
### 7.1 Site Response (NEHRP)
### 7.2 Liquefaction Potential
### 7.3 Coseismic Slope Displacement
### 7.4 Foundation and Structural Implications
### 7.5 Fault Surface Rupture Potential
Close § 7 with a Markdown *Hazard Screening Matrix* table:
\`Hazard | Screening basis | Outcome | Action\`.

## 8. Recommendations
Numbered list (1., 2., 3., …). Each item is a single actionable
engineering recommendation tied to a finding in § 6 or § 7. Aim for
5–9 recommendations. Use consulting register ("It is recommended
that…", "The design team should…").

## 9. Report Limitations
3–5 sentences describing the scope of the services, the data
limitations (e.g. "PGA estimated from ShakeMap contours, not
instrument records"), and the disclaimer that this report is
prepared for the exclusive use of the named client.

## 10. Closure
Two short paragraphs, signed by the engineer.

Sincerely,

<engineer name>
<engineer title>
<engineer license>

## Attachments
Bullet list of the artefacts referenced (Vicinity map, ShakeMap
intensity, DYFI CIIM, PAGER exposure, Moment tensor, Aftershock
ledger, Event page URL). Include the source authority's event page
as an inline link.

LENGTH: 900–1600 words total. Prefer tables over prose for
quantitative content. Never leave a heading with a placeholder.`;

const SYSTEM_REFINE = `You are revising an existing TECHNICAL SEISMIC
ASSESSMENT REPORT. Return the FULL revised report as Markdown —
never a diff, never just a section. Preserve the exact 10-section
consulting structure defined in the generator prompt (Executive
Summary + § 1–10 + Attachments), the Markdown tables, embedded
figures with italic captions, one blank line between paragraphs,
and the consulting voice ("we", "our opinion"). Never introduce
academic author-date citations or a "References" section. Treat
USER-PROVIDED TEMPLATE FIELDS as authoritative (grammar-only
edits). Never introduce geopolitical, casualty, or policy content
unless the FACTS explicitly support it. If the user asks to
shorten, shrink prose first — keep the tables.`;

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
      templateFields = {},
      figures = [],
    } = body as {
      mode?: "generate" | "refine";
      quake: QuakeInput;
      params?: Params;
      source?: string;
      previousReport?: string;
      instruction?: string;
      chatHistory?: { role: "user" | "assistant"; content: string }[];
      templateFields?: TemplateFields;
      figures?: Figure[];
    };

    if (!quake || typeof quake.mag !== "number" || typeof quake.lat !== "number") {
      return new Response(JSON.stringify({ error: "Missing or invalid `quake` payload." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const facts = buildFacts(quake, params, source);
    const tmpl = templateBlock(templateFields);
    const figs = figuresBlock(figures);
    const messages: { role: string; content: string }[] = [];

    if (mode === "refine") {
      messages.push({ role: "system", content: SYSTEM_REFINE });
      messages.push({ role: "user", content: `FACTS:\n${facts}\n\n${tmpl}\n\n${figs}` });
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
        content: `Revision request: ${String(instruction || "Improve the report.").slice(0, 2000)}\n\nReturn the FULL revised consulting report as Markdown, preserving structure and figures.`,
      });
    } else {
      messages.push({ role: "system", content: SYSTEM_GENERATE });
      messages.push({
        role: "user",
        content: `FACTS:\n${facts}\n\n${tmpl}\n\n${figs}\n\nWrite the full consulting-style Technical Seismic Assessment Report now. Language: ${params.language ?? "English"}.`,
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