// Edge function: quake-report-ai
// ---------------------------------
// Generates or refines a HARVARD-STYLE scientific technical paper documenting
// a specific earthquake event and its geotechnical implications, from real
// USGS / FDSNWS event data + user-editable template fields + user-selected
// engineering parameters + supporting imagery URLs (ShakeMap, DYFI, PAGER,
// moment tensor). Uses the Lovable AI Gateway (google/gemini-2.5-flash).
//
// Modes:
//   mode = "generate"  -> author a fresh paper from event + params + template
//   mode = "refine"    -> revise the current paper using user chat + fields
// Output is a single self-contained Markdown document that the frontend
// renders and exports verbatim as .md.

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
 * Fully editable template fields. Anything the user has filled in is treated
 * as authoritative — the model must preserve the user's wording verbatim (only
 * light grammar tightening) and place it in the correct paper section. Missing
 * fields are drafted by the model from the event facts.
 */
interface TemplateFields {
  title?: string;
  runningHead?: string;
  authors?: string;
  affiliations?: string;
  correspondingAuthor?: string;
  keywords?: string;
  abstract?: string;
  introduction?: string;
  tectonicSetting?: string;
  methodology?: string;
  observations?: string;
  siteResponse?: string;
  liquefaction?: string;
  slopeStability?: string;
  structural?: string;
  lifelines?: string;
  aftershockOutlook?: string;
  discussion?: string;
  recommendations?: string;
  limitations?: string;
  acknowledgments?: string;
  references?: string;
  fundingStatement?: string;
  dataAvailability?: string;
  ethicsStatement?: string;
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

function templateBlock(t: TemplateFields | undefined): string {
  if (!t) return "USER-PROVIDED TEMPLATE FIELDS: (none — draft everything from FACTS)";
  const rows = Object.entries(t)
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => `- ${k}: ${String(v).slice(0, 4000)}`);
  if (!rows.length) return "USER-PROVIDED TEMPLATE FIELDS: (none — draft everything from FACTS)";
  return `USER-PROVIDED TEMPLATE FIELDS (authoritative — integrate verbatim, only light grammar):\n${rows.join("\n")}`;
}

function figuresBlock(figs: Figure[] | undefined): string {
  if (!figs?.length) return "FIGURES: (none provided — omit image embeds)";
  return "FIGURES (embed each in the named section as ![caption](url) and reference in prose as \"(Figure N)\"):\n" +
    figs.map((f, i) =>
      `- Figure ${i + 1} | section=${f.section ?? "ground-motion"} | ${f.caption} | ${f.url}`,
    ).join("\n");
}

const SYSTEM_GENERATE = `You are the lead author of a concise TECHNICAL SEISMIC
ANALYSIS PAPER — NOT a geopolitical or societal study. The paper is written
for seismologists and geotechnical engineers. Focus is 100 % on: the raw
event data, the seismological analysis of that data, the physical causes,
the observed and expected effects, and evidence-based conclusions.

STYLE — hard requirements
- Register: Bulletin of the Seismological Society of America / GRL.
  Every sentence is technical, quantitative, and citable. NO
  policy/political/geopolitical/economic commentary. NO storytelling.
- Ground every claim in the FACTS block. Never invent numeric values.
  When a value is missing, write "not reported (source: <authority>)".
- Preserve verbatim any USER-PROVIDED TEMPLATE FIELDS. Integrate them into
  the correct section; only tighten grammar. Never contradict them. Empty
  fields → you draft them from FACTS.
- Units: SI unless the user requested US. MMI in Roman numerals I–XII.
- Use canonical author–date citations only when actually relevant to a
  numeric method: Gutenberg & Richter (1956) for radiated energy;
  Kanamori (1977) for Mw; Wells & Coppersmith (1994) for rupture scaling;
  Boore et al. (2014) for GMPEs; Youd & Idriss (2001) for liquefaction
  screening; Newmark (1965) for coseismic slope displacement; Omori (1894)
  / Utsu (1961) for aftershock decay; Båth (1965) for largest-aftershock
  gap; USGS ShakeMap / PAGER / DYFI product docs when their outputs are
  cited. Every in-text citation MUST appear in § 12 References.

FORMATTING — hard requirements
- Use Markdown that renders with GitHub-flavored tables (GFM).
- Between every major section leave ONE blank line. Between every
  paragraph leave ONE blank line. Never wall-of-text.
- Every section that presents parameters MUST use a proper Markdown table
  (pipes and hyphens), NOT bullet lists of key: value pairs. Example
  required tables: § 3 Event parameters, § 3 Location quality metrics,
  § 4 Derived seismological quantities, § 5 Intensity summary, § 7
  Aftershock catalogue summary.
- Every numeric field must include units.
- Embed every provided FIGURE as \`![caption](url)\` inside the section
  named in its \`section\` hint (default: "ground-motion"). Immediately
  after each figure, write an italic caption line: \`*Figure N. <caption>*\`
  and reference it in prose as "(Figure N)".
- Use fenced code blocks for any raw catalogue rows or ASCII plots.

STRUCTURE — output a single self-contained Markdown document in EXACTLY
this order, using the exact headings shown so the frontend can style them.
Do NOT add extra top-level sections and do NOT invent geopolitical
sections.

# <Title>
*<Running head>*

**Authors.** <authors>
**Affiliations.** <affiliations>
**Corresponding author.** <email or ORCID>

---

## Abstract
120–180 words. Structured single paragraph: (i) event, (ii) data, (iii)
key seismological findings with numbers, (iv) engineering-relevant
conclusions. No policy language.

**Keywords.** 4–7 comma-separated terms (all technical).

## 1. Introduction
2 short paragraphs. Purpose of the analysis and the specific technical
questions this paper answers. No societal framing.

## 2. Tectonic Context and Probable Causes
Local plate boundary, regional stress regime, nearest mapped active
faults, and the *physical cause* of this event (e.g. reverse slip on a
subduction interface, intraplate strike-slip). If a moment-tensor figure
is provided, cite it (Figure N).

## 3. Raw Event Data
### 3.1 Event parameters
Render a Markdown table with columns \`Parameter | Value | Unit | Source\`
covering: origin time (UTC), latitude, longitude, depth, magnitude,
magnitude type, network, event id.
### 3.2 Location quality metrics
Render a Markdown table with columns \`Metric | Value | Interpretation\`
covering: number of stations (nst), minimum epicentral distance (dmin,
deg), azimuthal gap (deg), location RMS (s), review status.

## 4. Seismological Analysis
### 4.1 Derived quantities
Render a Markdown table \`Quantity | Formula | Value | Unit\` computing at
least: radiated energy E (Gutenberg & Richter, 1956, log10 E = 4.8 + 1.5 M),
TNT equivalent, expected rupture length (Wells & Coppersmith, 1994),
expected rupture width, expected average slip.
### 4.2 Focal mechanism and rupture model
Discuss the mechanism and stress orientation. Reference the beachball
figure if provided. State clearly what remains uncertain.

## 5. Ground Motion and Intensity
Prose paragraph plus a table \`Metric | Value | Source\` covering:
instrumental MMI (ShakeMap), community CDI (DYFI), felt-report count,
PAGER alert level, tsunami flag, and — where derivable — expected PGA /
PGV brackets from a GMPE (Boore et al., 2014). Embed intensity, PGA,
PGV, DYFI figures here.

## 6. Geotechnical Effects
ONE subsection per relevant hazard, each with a short technical paragraph.
Only include a subsection when the FACTS support it.
### 6.1 Site response (NEHRP class)
### 6.2 Liquefaction potential (Youd & Idriss, 2001)
### 6.3 Coseismic slope displacement (Newmark, 1965)
### 6.4 Fault surface rupture potential

## 7. Aftershock Sequence
Short prose (Båth, 1965; Omori–Utsu decay) plus a Markdown table of the
top 10 replicas so far with columns \`# | UTC time | M | Δ (km) |
Depth (km) | Region\`. If none logged, say so explicitly.

## 8. Effects on the Built Environment
STRICTLY structural / infrastructure engineering effects derivable from
the ground-motion products (not casualty numbers, not policy). Foundations,
non-structural drift, lifelines, cascading physical hazards.

## 9. Conclusions
Numbered list (1., 2., 3., …). Each item is a single, evidence-based
technical conclusion tying an observed number back to a physical cause or
engineering effect. Aim for 4–7 conclusions.

## 10. Limitations and Uncertainty
Bullet list of the specific data gaps and assumption sensitivities in
THIS paper (e.g. "PGA estimated from ShakeMap contours, not station
records"). Keep it short and specific.

## 11. Data Availability
FDSNWS endpoint(s) and the event page URL as inline links.

## 12. References
Harvard (author–date) style, alphabetical. Only include entries actually
cited in the body. Each entry on its own line, format:
\`Author, X.Y. & Other, Z. (YEAR) Title. Journal, vol(iss), pp–pp.\`

LENGTH: 900–1500 words total (this is a focused technical note, not a
monograph). Prefer tables over prose whenever quantitative. Never leave a
heading with a placeholder.`;

const SYSTEM_REFINE = `You are revising an existing TECHNICAL SEISMIC ANALYSIS
PAPER. Return the FULL revised paper as Markdown — never a diff, never
just a section. Preserve the exact numbered section structure defined in
the generator prompt (12 sections), the Markdown tables (GFM), embedded
figures with italic captions, one blank line between paragraphs, and
every citation must remain present in § 12 References. Treat USER-
PROVIDED TEMPLATE FIELDS as authoritative (grammar-only edits). Never
introduce geopolitical, casualty, or policy content unless the FACTS
explicitly support it. Never drop the Markdown tables — if the user asks
to shorten, shrink prose first, keep the tables.`;

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
        content: `Revision request: ${String(instruction || "Improve the report.").slice(0, 2000)}\n\nReturn the FULL revised paper as Markdown, preserving structure and figures.`,
      });
    } else {
      messages.push({ role: "system", content: SYSTEM_GENERATE });
      messages.push({
        role: "user",
        content: `FACTS:\n${facts}\n\n${tmpl}\n\n${figs}\n\nWrite the full Harvard-style scientific paper now. Language: ${params.language ?? "English"}.`,
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