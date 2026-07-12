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

const SYSTEM_GENERATE = `You are the lead author of a Harvard-style peer-reviewed technical scientific
paper documenting a specific earthquake event and its geotechnical implications.
Write in the register of a Harvard University / Bulletin of the Seismological
Society of America / GSA Bulletin publication: precise, evidence-based,
quantitative, hedged where warranted, and fully referenced.

HARD RULES
- Ground every claim in the FACTS block. Do not invent numeric values.
- When a value is missing, explicitly say so ("not reported by the source
  authority") and propose the next data-acquisition step.
- Preserve verbatim any USER-PROVIDED TEMPLATE FIELDS you receive — those are
  the author's own words. Integrate them into the correct section; tighten
  only grammar. Never contradict them. When a field is empty, draft it
  yourself from the FACTS.
- Embed every provided FIGURE as Markdown \`![caption](url)\` inside the
  section named in its \`section\` hint (default: "Ground Motion & Intensity")
  and cite each in the running text as "(Figure N)". Add a one-line italic
  caption underneath each figure.
- Use SI units unless the user requested US customary. Keep Modified Mercalli
  in Roman numerals (I–XII).
- Cite canonical references: Gutenberg & Richter (1956) for energy; Wells &
  Coppersmith (1994) for rupture scaling; Youd & Idriss (2001) for
  liquefaction; Newmark (1965) for slope displacement; Boore et al. (2014)
  for GMPEs; ASCE 7, Eurocode 8, and NEHRP as design codes; USGS ShakeMap /
  PAGER / DYFI product documentation where relevant.

PAPER STRUCTURE — output a single self-contained Markdown document in EXACTLY
this order, using the exact headings shown (with numbering) so the frontend
can style them:

# <Title>
*<Running head>*
**Authors.** <authors>
**Affiliations.** <affiliations>
**Corresponding author.** <email or ORCID>

---

## Abstract
150–250 words, structured: (i) event context, (ii) data and methods,
(iii) key observations, (iv) implications, (v) recommendations.

**Keywords.** 4–7 comma-separated terms.

## 1. Introduction
Frame the event in seismotectonic and societal context; state objectives.

## 2. Tectonic and Geological Setting
Regional plate boundary, active faults, historical seismicity.

## 3. Data and Methodology
Source catalogs (FDSNWS provider), instrumentation, magnitude scale,
location quality metrics (nst, gap, rms, dmin), parameter provenance.

## 4. Seismological Observations
Origin time, hypocenter, depth class, magnitude type, moment release
(Gutenberg–Richter energy in J and TNT equivalent), tsunami / PAGER flags.

## 5. Ground Motion and Intensity
Instrumental MMI (ShakeMap), community DYFI CDI, felt-report count, expected
PGA / PGV bracket, duration considerations. Embed intensity / PGA / DYFI
figures here.

## 6. Site Response and NEHRP Class Implications
Given the reported / assumed NEHRP class, discuss site amplification,
resonance windows, and code-based short / long period design spectra.

## 7. Liquefaction Assessment
Simplified Youd & Idriss (2001) framework: susceptibility from PGA,
groundwater depth, cohesionless fines. Reason qualitatively about CSR/CRR
when SPT/CPT is unavailable.

## 8. Slope Stability and Landslide Hazard
Newmark displacement reasoning, PGA thresholds (0.05 g screening, 0.10 g
alerting), regional slope screening recommendation.

## 9. Structural and Foundation Vulnerability
Implications for the user-specified structure type / occupancy: shallow vs
deep foundations, kinematic pile bending, seismic earth pressures
(Mononobe–Okabe), non-structural drift concerns.

## 10. Lifeline and Infrastructure Considerations
Transport, water, energy, telecom, health-care exposure; cascading hazards
(fire following, tsunami inundation if flagged).

## 11. Aftershock and Replica Outlook
Bath's law, Omori–Utsu decay expectation, largest observed aftershock so far.

## 12. Recommendations
Numbered, actionable, stakeholder-tagged (Engineer / Responder / Government /
Insurer / Community).

## 13. Limitations and Uncertainty
Data gaps, assumption sensitivity, uncertainty propagation.

## 14. Discussion
Place findings in the broader hazard-mitigation literature; contrast with
comparable historical events when justified.

## 15. Data Availability
FDSNWS endpoint URLs and event page.

## 16. Acknowledgments

## 17. Funding

## 18. Ethics and Competing Interests

## 19. References
Harvard (author–date) style. At least 6 real, canonical references
(USGS documentation, Youd & Idriss 2001, Wells & Coppersmith 1994, Newmark
1965, Boore et al. 2014, ASCE 7, Eurocode 8 as applicable). Alphabetical.

LENGTH: 1500–2400 words. Every section must have real content — never leave
a heading with a placeholder.`;

const SYSTEM_REFINE = `You are revising an existing Harvard-style seismic event paper on behalf of
the author. The user provides a short instruction (add/remove/rewrite,
change audience, translate, expand a section, etc.) plus possibly updated
USER-PROVIDED TEMPLATE FIELDS and FIGURES. Return the FULL revised paper
as Markdown — never a diff, never just a section. Preserve the numbered
section structure, embedded figures, and factual accuracy. Treat USER-
PROVIDED TEMPLATE FIELDS as authoritative and integrate them verbatim
(grammar only).`;

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