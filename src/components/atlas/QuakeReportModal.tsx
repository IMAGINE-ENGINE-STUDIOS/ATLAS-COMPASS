/**
 * QuakeReportModal
 * ----------------
 * Professional consulting-style seismic assessment report for a single
 * earthquake event. Atlas UI voice: dark glassmorphic surface, tabular
 * numerals, magnified glyphs, no academic apparatus.
 *
 * Two panes:
 *  - Left: the rendered report (paper canvas). Auto-updates as fields
 *    are edited; a Generate action asks the AI to author the full
 *    consulting deliverable from your inputs + live event data.
 *  - Right: a compact tool rail — Fields, Params, Figures, Refine,
 *    Aftershocks, Library.
 *
 * Export: Markdown download or Print (Save as PDF).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X, Download, ExternalLink, Loader2, MapPin, Sparkles, Send, RefreshCw,
  FolderOpen, Edit3, Image as ImageIcon, MessageSquare, Sliders, Printer,
  Waves, FileText, Building2, ClipboardEdit,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import type { QuakeTag } from "./QuakeTagsOverlay";
import QuakeEventLibrary from "./QuakeEventLibrary";
import type { QuakeInstitution } from "./quakeInstitutions";

interface Props {
  quake: QuakeTag;
  source: string;
  onClose: () => void;
  onTuneSource?: (institution: QuakeInstitution) => void;
}

interface AfterEvent {
  id: string; mag: number; place: string; time: number;
  lat: number; lng: number; depthKm: number; distanceKm: number;
}

interface UsgsDetail {
  properties?: {
    mag?: number; place?: string; time?: number; tz?: number | null;
    felt?: number | null; cdi?: number | null; mmi?: number | null;
    alert?: string | null; tsunami?: 0 | 1; sig?: number | null;
    net?: string; code?: string; ids?: string; sources?: string; types?: string;
    nst?: number | null; dmin?: number | null; rms?: number | null;
    gap?: number | null; magType?: string; type?: string; title?: string;
    products?: any;
  };
}

function romanMMI(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.max(1, Math.min(12, Math.round(v)));
  return ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][n - 1];
}
function mmiLabel(v?: number | null): string {
  if (v == null) return "Not instrumented";
  if (v < 2) return "Not felt"; if (v < 4) return "Weak"; if (v < 5) return "Light";
  if (v < 6) return "Moderate"; if (v < 7) return "Strong"; if (v < 8) return "Very strong";
  if (v < 9) return "Severe"; if (v < 10) return "Violent"; return "Extreme";
}
function energyJoules(mag: number): number { return Math.pow(10, 4.8 + 1.5 * mag); }
function tntEquivalent(joules: number): string {
  const tnt = joules / 4.184e9;
  if (tnt < 1e3) return `${tnt.toFixed(1)} kg TNT`;
  if (tnt < 1e6) return `${(tnt / 1e3).toFixed(1)} t TNT`;
  if (tnt < 1e9) return `${(tnt / 1e6).toFixed(2)} kt TNT`;
  return `${(tnt / 1e9).toFixed(2)} Mt TNT`;
}
function depthClass(km: number): { label: string; note: string } {
  if (km < 70) return { label: "Shallow", note: "Highest damage potential — energy released close to surface." };
  if (km < 300) return { label: "Intermediate", note: "Broader felt area, generally lower peak ground acceleration." };
  return { label: "Deep", note: "Rarely damaging; often associated with subducting slabs." };
}
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371; const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat); const dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function fmtTime(ms: number): string {
  try { return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z"; }
  catch { return String(ms); }
}
function todayISO(): string { return new Date().toISOString().slice(0, 10); }

type TabId = "fields" | "params" | "figures" | "refine" | "replicas" | "library";

export default function QuakeReportModal({ quake, source, onClose, onTuneSource }: Props) {
  const [detail, setDetail] = useState<UsgsDetail | null>(null);
  const [after, setAfter] = useState<AfterEvent[]>([]);
  const [afterLoading, setAfterLoading] = useState(false);

  // Engineering parameters (drive the AI writer)
  const [params, setParams] = useState({
    siteClass: "D",
    groundwaterM: "" as string,
    structureType: "Mid-rise reinforced concrete",
    exposureUse: "Occupancy Category II (standard)",
    designCode: "ASCE 7-22",
    units: "SI" as "SI" | "US",
    language: "en",
    extraNotes: "",
  });

  // Consulting-report editable fields
  const [tmpl, setTmpl] = useState<Record<string, string>>(() => ({
    projectTitle: "",
    clientName: "",
    clientAddress: "",
    projectAddress: "",
    projectNumber: "",
    reportDate: todayISO(),
    engineerName: "",
    engineerTitle: "",
    engineerLicense: "",
    executiveSummary: "",
    projectInformation: "",
    purpose: "",
    regionalContext: "",
    fieldMethods: "",
    observations: "",
    evaluation: "",
    recommendations: "",
    limitations: "",
    closure: "",
    attachments: "",
  }));
  const updateTmpl = useCallback((k: string, v: string) => {
    setTmpl((prev) => ({ ...prev, [k]: v }));
  }, []);

  // Auto-seed the title + project id from the event
  useEffect(() => {
    setTmpl((prev) => ({
      ...prev,
      projectTitle: prev.projectTitle ||
        `Seismic Assessment Report — M${quake.mag?.toFixed?.(1) ?? quake.mag} ${quake.place || "Unnamed Event"}`,
      projectNumber: prev.projectNumber || `SA-${new Date(quake.time).toISOString().slice(2, 10).replace(/-/g, "")}-${(quake.id || "EV").slice(-4).toUpperCase()}`,
    }));
  }, [quake]);

  const [report, setReport] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [tab, setTab] = useState<TabId>("fields");

  // Aftershocks (500 km / 30 days)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setAfterLoading(true);
      try {
        // Full UTC timestamps — a bare date as `endtime` means midnight and
        // would drop same-day aftershocks.
        const start = new Date(quake.time - 24 * 3600 * 1000).toISOString().slice(0, 19);
        const end = new Date(
          Math.min(Date.now() + 3_600_000, quake.time + 30 * 86_400_000),
        ).toISOString().slice(0, 19);
        const base = import.meta.env.VITE_SUPABASE_URL as string;
        const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const q = new URLSearchParams({
          mode: "search", source, starttime: start, endtime: end,
          latitude: quake.lat.toFixed(3), longitude: quake.lng.toFixed(3),
          maxradiuskm: "500", minmagnitude: "1", limit: "500", orderby: "time",
        });
        const r = await fetch(`${base}/functions/v1/earthquake-data?${q}`, {
          headers: { apikey, Authorization: `Bearer ${apikey}` },
        });
        if (!r.ok) throw new Error(`${r.status}`);
        const j = await r.json();
        const rows: AfterEvent[] = (j?.features ?? [])
          .filter((f: any) => f?.id && f.id !== quake.id && f?.geometry?.coordinates?.length === 3)
          .map((f: any) => {
            const [lng, lat, depth] = f.geometry.coordinates;
            return {
              id: f.id, mag: f.properties?.mag ?? 0, place: f.properties?.place ?? "",
              time: f.properties?.time ?? 0, lat, lng, depthKm: depth,
              distanceKm: haversineKm(quake.lat, quake.lng, lat, lng),
            } as AfterEvent;
          })
          .filter((r: AfterEvent) => r.time >= quake.time - 6 * 3600 * 1000);
        if (!cancelled) setAfter(rows);
      } catch { if (!cancelled) setAfter([]); }
      finally { if (!cancelled) setAfterLoading(false); }
    };
    void run();
    return () => { cancelled = true; };
  }, [quake, source]);

  // USGS detail (imagery + phase data)
  useEffect(() => {
    if (source !== "usgs") { setDetail(null); return; }
    let cancelled = false;
    const run = async () => {
      try {
        const m = /eventpage\/([a-z0-9]+)/i.exec(quake.url ?? "");
        const evId = m?.[1] || quake.id;
        const r = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${evId}&format=geojson&includeallmagnitudes=true`);
        if (!r.ok) throw new Error(`${r.status}`);
        const j = await r.json();
        if (!cancelled) setDetail(j);
      } catch { if (!cancelled) setDetail(null); }
    };
    void run();
    return () => { cancelled = true; };
  }, [quake, source]);

  // Extract ShakeMap / DYFI / PAGER / moment-tensor imagery
  const figures = useMemo(() => {
    const out: { caption: string; url: string; section?: string }[] = [];
    const products: any = detail?.properties?.products ?? {};
    const pick = (p: any, ...keys: string[]) => {
      for (const k of keys) { const url = p?.contents?.[k]?.url; if (typeof url === "string") return url; }
      return null;
    };
    const shake = products?.shakemap?.[0];
    const dyfi  = products?.dyfi?.[0];
    const pager = products?.losspager?.[0];
    const mt    = products?.["moment-tensor"]?.[0];
    const shakeIntensity = pick(shake, "download/intensity.jpg", "download/intensity.png");
    if (shakeIntensity) out.push({ caption: "ShakeMap instrumental intensity (MMI) contours.", url: shakeIntensity });
    const shakePga = pick(shake, "download/pga.jpg", "download/pga.png");
    if (shakePga) out.push({ caption: "ShakeMap peak ground acceleration (PGA, %g).", url: shakePga });
    const shakePgv = pick(shake, "download/pgv.jpg", "download/pgv.png");
    if (shakePgv) out.push({ caption: "ShakeMap peak ground velocity (PGV, cm/s).", url: shakePgv });
    const dyfiMap = pick(dyfi, "ciim_geo.jpg", "ciim.jpg");
    if (dyfiMap) out.push({ caption: "Did-You-Feel-It (DYFI) community intensity map.", url: dyfiMap });
    const pagerFatal = pick(pager, "alertfatal.png", "alertfatal_small.png");
    if (pagerFatal) out.push({ caption: "PAGER estimated fatalities distribution.", url: pagerFatal });
    const pagerEcon = pick(pager, "alertecon.png", "alertecon_small.png");
    if (pagerEcon) out.push({ caption: "PAGER estimated economic loss distribution.", url: pagerEcon });
    const mtBeachball = pick(mt, "mechanism.png", "download/mechanism.png");
    if (mtBeachball) out.push({ caption: "Regional moment-tensor focal mechanism.", url: mtBeachball });
    return out;
  }, [detail]);

  const quakePayload = useMemo(() => {
    const p = detail?.properties;
    return {
      id: quake.id, mag: quake.mag ?? 0, place: quake.place ?? "", time: quake.time,
      lat: quake.lat, lng: quake.lng, depthKm: quake.depthKm ?? 0,
      tsunami: quake.tsunami ?? 0, url: quake.url, alert: quake.alert ?? null,
      magType: p?.magType ?? null, mmi: p?.mmi ?? null, cdi: p?.cdi ?? null,
      felt: p?.felt ?? null, nst: p?.nst ?? null, dmin: p?.dmin ?? null,
      rms: p?.rms ?? null, gap: p?.gap ?? null, sig: p?.sig ?? null, net: p?.net ?? null,
    };
  }, [quake, detail]);

  const paramsPayload = useCallback(() => ({
    siteClass: params.siteClass,
    groundwaterM: params.groundwaterM === "" ? null : Number(params.groundwaterM),
    structureType: params.structureType,
    exposureUse: params.exposureUse,
    designCode: params.designCode,
    units: params.units,
    language: params.language,
    extraNotes: params.extraNotes || undefined,
  }), [params]);

  const templatePayload = useCallback(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(tmpl)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  }, [tmpl]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setReportError(null);
    try {
      const { data, error } = await supabase.functions.invoke("quake-report-ai", {
        body: {
          mode: "generate", quake: quakePayload, params: paramsPayload(),
          source, templateFields: templatePayload(), figures,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReport(String(data?.report ?? ""));
      setChat([]);
    } catch (e) {
      setReportError((e as Error).message || "Failed to generate report.");
    } finally { setGenerating(false); }
  }, [quakePayload, paramsPayload, source, templatePayload, figures]);

  const sendChat = useCallback(async (instructionOverride?: string) => {
    const instruction = (instructionOverride ?? chatInput).trim();
    if (!instruction || !report) return;
    setChatSending(true);
    setReportError(null);
    const nextChat = [...chat, { role: "user" as const, content: instruction }];
    setChat(nextChat); setChatInput("");
    try {
      const { data, error } = await supabase.functions.invoke("quake-report-ai", {
        body: {
          mode: "refine", quake: quakePayload, params: paramsPayload(), source,
          previousReport: report, instruction, chatHistory: nextChat.slice(-8),
          templateFields: templatePayload(), figures,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReport(String(data?.report ?? ""));
      setChat([...nextChat, { role: "assistant", content: "Report updated." }]);
    } catch (e) {
      setReportError((e as Error).message || "Refinement failed.");
    } finally { setChatSending(false); }
  }, [chat, chatInput, report, quakePayload, paramsPayload, source, templatePayload, figures]);

  const mag = quake.mag ?? 0;
  const energy = energyJoules(mag);
  const dc = depthClass(quake.depthKm ?? 0);
  const dp = detail?.properties;
  const mmi = dp?.mmi; const cdi = dp?.cdi; const felt = dp?.felt;
  const strongestAfter = useMemo(
    () => after.reduce((a, b) => ((b.mag ?? 0) > (a?.mag ?? 0) ? b : a), null as AfterEvent | null),
    [after],
  );

  // ---- Live preview scaffold (updates as fields are edited) ------------
  const livePreview = useMemo(() => {
    const sec = (n: string, body: string, placeholder: string) =>
      `## ${n}\n\n${(body || "").trim() ? body.trim() : `*${placeholder}*`}\n`;
    const figMd = figures.map((f, i) => `![${f.caption}](${f.url})\n\n*Figure ${i + 1}. ${f.caption}*`).join("\n\n");
    const aftershocksRows = after.slice(0, 10).map((a, i) =>
      `| ${i + 1} | ${fmtTime(a.time)} | ${(a.mag ?? 0).toFixed(1)} | ${a.distanceKm.toFixed(0)} | ${a.depthKm?.toFixed?.(0) ?? a.depthKm} | ${a.place} |`,
    ).join("\n");

    const projectTable = [
      `| Field | Value |`,
      `| --- | --- |`,
      `| Client | ${tmpl.clientName || "*to be assigned*"} |`,
      `| Project address | ${tmpl.projectAddress || "*to be assigned*"} |`,
      `| Project number | ${tmpl.projectNumber || "—"} |`,
      `| Report date | ${tmpl.reportDate || todayISO()} |`,
      `| Event ID | ${quake.id} |`,
      `| Origin time (UTC) | ${fmtTime(quake.time)} |`,
      `| Epicenter | ${quake.lat.toFixed(4)}°, ${quake.lng.toFixed(4)}° |`,
      `| Focal depth | ${quake.depthKm?.toFixed?.(1) ?? quake.depthKm} km (${dc.label}) |`,
      `| Magnitude | M${mag.toFixed(1)} (${dp?.magType ?? "—"}) |`,
      `| Source authority | ${source.toUpperCase()} |`,
      `| Event page | ${quake.url ?? "—"} |`,
    ].join("\n");

    const observationsTable = [
      `| Metric | Value | Source |`,
      `| --- | --- | --- |`,
      `| Instrumental MMI | ${romanMMI(mmi)} — ${mmiLabel(mmi)} | ShakeMap |`,
      `| Community CDI | ${romanMMI(cdi)} | DYFI |`,
      `| Felt reports | ${felt ?? "—"} | DYFI |`,
      `| Tsunami flag | ${quake.tsunami ? "issued" : "none"} | ${source.toUpperCase()} |`,
      `| PAGER alert | ${dp?.alert ?? quake.alert ?? "none"} | PAGER |`,
      `| Radiated energy | ${tntEquivalent(energy)} (${energy.toExponential(2)} J) | Gutenberg–Richter |`,
    ].join("\n");

    return [
      `# ${tmpl.projectTitle || `Seismic Assessment Report — M${mag.toFixed(1)} ${quake.place || "Unnamed Event"}`}`,
      ``,
      `**Prepared for:** ${tmpl.clientName || "*Client name*"}${tmpl.clientAddress ? `\n${tmpl.clientAddress}` : ""}`,
      ``,
      `**Re:** Seismic Assessment Services — M${mag.toFixed(1)} ${quake.place || "Event"}`,
      `${tmpl.projectAddress || "*project address*"}`,
      `**Project No.:** ${tmpl.projectNumber || "—"}`,
      `**Date:** ${tmpl.reportDate || todayISO()}`,
      ``,
      `---`,
      ``,
      sec("Executive Summary", tmpl.executiveSummary,
        `A magnitude ${mag.toFixed(1)} event ruptured ${dc.label.toLowerCase()} crust at ${quake.depthKm?.toFixed?.(1) ?? quake.depthKm} km depth beneath ${quake.place || "the epicentral region"}. ${dc.note} Total radiated energy is on the order of ${tntEquivalent(energy)}. Fill this section to lock a bespoke executive summary — otherwise it will be authored on generate.`),
      sec("1. Project Information", tmpl.projectInformation,
        `Prose paragraph will be authored on generate.`) + `\n${projectTable}\n`,
      sec("2. Purpose", tmpl.purpose,
        `The purpose of this assessment is to characterise the subject seismic event, quantify the expected ground-motion parameters at the project site, and provide engineering recommendations consistent with ${params.designCode}.`),
      sec("3. Regional and Tectonic Context", tmpl.regionalContext,
        `Regional context will be drafted from the FDSNWS event feed and moment-tensor solution when available.`),
      sec("4. Field Data and Methodology", tmpl.fieldMethods,
        `Event parameters were sourced from the ${source.toUpperCase()} authority via the FDSNWS event service. Ground-motion characterisation relies on ShakeMap interpolation of regional strong-motion recordings; felt intensities are drawn from the DYFI community response system.`),
      sec("5. Regional Ground Conditions", "",
        `Assumed NEHRP site class ${params.siteClass}${params.groundwaterM ? `; groundwater depth ${params.groundwaterM} m` : ""}. Structure type: ${params.structureType}. Refine on the Params tab to override defaults.`),
      `## 6. Observations\n\n### 6.1 Event Parameters\n\n${observationsTable}\n`,
      `### 6.2 Ground Motion and Intensity\n\n${(tmpl.observations || "").trim() || "*will be drafted from ShakeMap and DYFI products on generate.*"}\n${figMd ? `\n${figMd}\n` : ""}`,
      `### 6.3 Aftershock Sequence\n\n${after.length === 0
        ? afterLoading ? "*loading aftershock ledger…*" : "*No aftershocks logged in the 500 km / 30 d window.*"
        : `${after.length} aftershocks logged so far${strongestAfter ? `, largest M${(strongestAfter.mag ?? 0).toFixed(1)}` : ""}.\n\n| # | UTC time | M | Δ (km) | Depth (km) | Region |\n| --- | --- | --- | --- | --- | --- |\n${aftershocksRows}`}\n`,
      sec("7. Evaluation", tmpl.evaluation,
        `Hazard screening (site response, liquefaction, coseismic slope displacement, foundation implications, fault surface rupture) will be drafted on generate.`),
      sec("8. Recommendations", tmpl.recommendations,
        `Recommendations will be drafted on generate — populate to lock your own.`),
      sec("9. Report Limitations", tmpl.limitations,
        `This report has been prepared for the exclusive use of ${tmpl.clientName || "the named client"} and their design team for application to the referenced project. PGA and PGV brackets are estimated from ShakeMap contours rather than direct instrument records.`),
      sec("10. Closure", tmpl.closure,
        `If you have questions about the information contained in this Report, please contact the undersigned.`),
      ``,
      `Sincerely,`,
      ``,
      `${tmpl.engineerName || "*Engineer name*"}`,
      `${tmpl.engineerTitle || "*Title*"}`,
      `${tmpl.engineerLicense || "*License / registration no.*"}`,
      ``,
      sec("Attachments", tmpl.attachments,
        `- Vicinity map${figures.length ? `\n- ${figures.map(f => f.caption).join("\n- ")}` : ""}\n- Source authority event page: ${quake.url ?? "—"}`),
    ].join("\n");
  }, [tmpl, figures, quake, mag, mmi, cdi, felt, params, after, afterLoading, strongestAfter, dc, energy, dp, source]);

  const paperMd = report || livePreview;

  const exportMd = useCallback(() => {
    const blob = new Blob([paperMd], { type: "text/markdown" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = `seismic_report_${quake.id}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }, [paperMd, quake.id]);
  const doPrint = useCallback(() => window.print(), []);

  const exportReplicasCsv = useCallback(() => {
    const header = ["id","time_utc","magnitude","distance_km","depth_km","place"];
    const rows = after.map((a) => [
      a.id, new Date(a.time).toISOString(), a.mag, a.distanceKm.toFixed(1),
      a.depthKm, `"${(a.place || "").replace(/"/g, '""')}"`,
    ].join(","));
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = `replicas_${quake.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }, [after, quake.id]);

  const filledCount = Object.values(tmpl).filter((v) => v?.trim()).length;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[1240px] h-[94vh] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/90 backdrop-blur-2xl shadow-[0_30px_120px_-20px_rgba(0,0,0,0.9)] text-white flex flex-col tabular-nums tracking-tight"
      >
        {/* ───── ATLAS-STYLE HEADER ───── */}
        <header className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center gap-3 bg-gradient-to-b from-white/[0.04] to-transparent">
          <div
            className="rounded-2xl flex flex-col items-center justify-center font-mono font-black shrink-0"
            style={{
              width: 56, height: 56,
              background: mag >= 6 ? "#ef4444" : mag >= 4 ? "#f59e0b" : "#84cc16",
              color: "#0b0b0f",
              boxShadow: `0 0 32px ${mag >= 6 ? "#ef4444aa" : mag >= 4 ? "#f59e0baa" : "#84cc16aa"}`,
            }}
          >
            <span className="text-[9px] uppercase tracking-[0.22em] opacity-80 -mb-0.5">Mag</span>
            <span className="text-xl leading-none">{mag.toFixed(1)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.24em] text-white/45">
              <FileText className="w-3.5 h-3.5 text-sky-300" />
              Seismic Assessment · {source.toUpperCase()} feed
            </div>
            <div className="text-sm sm:text-base font-semibold truncate leading-tight mt-0.5">
              {quake.place || "Unknown region"}
            </div>
            <div className="text-[11px] text-white/60 font-mono flex items-center gap-2 flex-wrap mt-0.5">
              <MapPin className="w-3 h-3" />
              {quake.lat.toFixed(3)}°, {quake.lng.toFixed(3)}°
              <span className="text-white/25">·</span>
              {quake.depthKm?.toFixed?.(1) ?? quake.depthKm} km · {dc.label}
              <span className="text-white/25">·</span>
              {fmtTime(quake.time)}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <button onClick={generate} disabled={generating}
              className="h-9 px-3.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-100 text-[11px] font-semibold uppercase tracking-[0.18em] hover:bg-sky-500/30 disabled:opacity-50 flex items-center gap-2 transition">
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : report ? <RefreshCw className="w-3.5 h-3.5" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {generating ? "Generating" : report ? "Regenerate" : "Generate"}
            </button>
            <button onClick={exportMd}
              className="h-9 px-3 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] uppercase tracking-[0.18em] hover:bg-white/10 flex items-center gap-1.5"
              title="Download as Markdown">
              <Download className="w-3.5 h-3.5" /> .md
            </button>
            <button onClick={doPrint}
              className="h-9 w-9 rounded-lg bg-white/[0.05] border border-white/10 hover:bg-white/10 flex items-center justify-center"
              title="Print / Save as PDF">
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* ───── BODY: paper (left) + tool rail (right) ───── */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
          {/* PAPER CANVAS */}
          <div className="min-h-0 overflow-y-auto bg-[#0b0b0f] px-3 sm:px-10 py-6 sm:py-10">
            <article className="mx-auto max-w-[760px] prose prose-invert prose-sm
              prose-headings:font-sans prose-headings:tracking-tight
              prose-h1:text-[24px] prose-h1:leading-tight prose-h1:mb-4 prose-h1:mt-0 prose-h1:text-white prose-h1:border-b prose-h1:border-white/15 prose-h1:pb-4 prose-h1:font-semibold
              prose-h2:text-[11px] prose-h2:uppercase prose-h2:tracking-[0.24em] prose-h2:text-sky-300/90 prose-h2:mt-8 prose-h2:mb-3 prose-h2:font-bold
              prose-h3:text-[10px] prose-h3:uppercase prose-h3:tracking-[0.22em] prose-h3:text-white/70 prose-h3:mt-5 prose-h3:mb-2
              prose-p:text-white/85 prose-p:leading-[1.75] prose-p:my-3
              prose-li:text-white/85 prose-li:my-1.5
              prose-strong:text-white
              prose-em:text-white/50 prose-em:text-[11px]
              prose-a:text-sky-300 hover:prose-a:text-sky-200 prose-a:break-all
              prose-img:rounded-lg prose-img:border prose-img:border-white/15 prose-img:my-5 prose-img:mx-auto prose-img:shadow-2xl
              prose-code:text-emerald-200 prose-code:bg-white/[0.06] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-black/60 prose-pre:border prose-pre:border-white/10 prose-pre:text-[11px]
              prose-hr:border-white/10 prose-hr:my-6 max-w-none">
              {reportError && (
                <div className="not-prose mb-4 text-[11px] text-red-200 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">
                  {reportError}
                </div>
              )}
              {!report && (
                <div className="not-prose mb-5 rounded-xl border border-sky-400/25 bg-sky-500/[0.06] px-4 py-3 text-[11px] text-sky-100/85 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                  <span>
                    Live preview from your fields. Fill any section on the right, then hit <b className="text-sky-200">Generate</b> to have the AI author the full consulting report.
                  </span>
                </div>
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ node, ...props }) => (
                    <div className="not-prose my-5 overflow-x-auto rounded-lg border border-white/10">
                      <table {...props} className="w-full text-[11px] border-collapse" />
                    </div>
                  ),
                  thead: ({ node, ...props }) => <thead {...props} className="bg-white/[0.06] text-sky-100" />,
                  th: ({ node, ...props }) => <th {...props} className="text-left font-semibold uppercase tracking-[0.18em] text-[9px] px-2.5 py-1.5 border-b border-white/10" />,
                  td: ({ node, ...props }) => <td {...props} className="px-2.5 py-1.5 border-b border-white/[0.06] font-mono text-white/85 align-top" />,
                }}
              >{paperMd}</ReactMarkdown>
            </article>
          </div>

          {/* TOOL RAIL */}
          <aside className="min-h-0 flex flex-col border-t md:border-t-0 md:border-l border-white/10 bg-white/[0.02] backdrop-blur-xl">
            {/* tab strip */}
            <div className="grid grid-cols-6 border-b border-white/10 text-[9px] uppercase tracking-[0.18em] bg-black/30">
              {([
                { id: "fields",   icon: ClipboardEdit, label: "Fields",  badge: filledCount || undefined },
                { id: "params",   icon: Sliders,       label: "Params" },
                { id: "figures",  icon: ImageIcon,     label: "Figures", badge: figures.length || undefined },
                { id: "refine",   icon: MessageSquare, label: "Refine",  disabled: !report },
                { id: "replicas", icon: Waves,         label: "Replicas", badge: after.length || undefined },
                { id: "library",  icon: FolderOpen,    label: "Library" },
              ] as { id: TabId; icon: any; label: string; badge?: number; disabled?: boolean }[]).map((t) => {
                const active = tab === t.id;
                const Icon = t.icon;
                return (
                  <button key={t.id}
                    onClick={() => !t.disabled && setTab(t.id)} disabled={t.disabled}
                    className={`px-1 py-2.5 flex flex-col items-center gap-1 border-b-2 transition disabled:opacity-30 ${active ? "border-sky-400 text-sky-200 bg-white/[0.05]" : "border-transparent text-white/45 hover:text-white/90"}`}>
                    <Icon className="w-4 h-4" />
                    <span className="flex items-center gap-1">
                      {t.label}
                      {t.badge != null && <span className="text-[8px] font-mono bg-white/10 rounded px-1">{t.badge}</span>}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* tab content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3.5 text-[12px]">
              {tab === "fields" && (
                <>
                  <PanelTitle icon={ClipboardEdit}>Report fields</PanelTitle>
                  <p className="text-[10px] text-white/50 leading-relaxed">
                    Anything you type is preserved verbatim by the AI writer. Empty fields are drafted automatically from the event data.
                  </p>

                  <FieldGroup title="Cover">
                    <Field label="Project title" value={tmpl.projectTitle} onChange={(v) => updateTmpl("projectTitle", v)} />
                    <div className="grid grid-cols-2 gap-1.5">
                      <Field label="Project no." value={tmpl.projectNumber} onChange={(v) => updateTmpl("projectNumber", v)} />
                      <Field label="Report date" value={tmpl.reportDate} onChange={(v) => updateTmpl("reportDate", v)} type="date" />
                    </div>
                    <Field label="Client name" value={tmpl.clientName} onChange={(v) => updateTmpl("clientName", v)} placeholder="Ms. Jane Doe — ACME Ltd." />
                    <Area label="Client address" value={tmpl.clientAddress} onChange={(v) => updateTmpl("clientAddress", v)} rows={2} placeholder="123 Main St.&#10;City, ST 00000" />
                    <Area label="Project address" value={tmpl.projectAddress} onChange={(v) => updateTmpl("projectAddress", v)} rows={2} />
                  </FieldGroup>

                  <FieldGroup title="Engineer of record">
                    <Field label="Name" value={tmpl.engineerName} onChange={(v) => updateTmpl("engineerName", v)} placeholder="Osciel F. Plaza, P.E." />
                    <div className="grid grid-cols-2 gap-1.5">
                      <Field label="Title" value={tmpl.engineerTitle} onChange={(v) => updateTmpl("engineerTitle", v)} placeholder="President" />
                      <Field label="License" value={tmpl.engineerLicense} onChange={(v) => updateTmpl("engineerLicense", v)} placeholder="FL Reg. No. 73262" />
                    </div>
                  </FieldGroup>

                  <FieldGroup title="Narrative sections">
                    <Area label="Executive Summary" value={tmpl.executiveSummary} onChange={(v) => updateTmpl("executiveSummary", v)} rows={4} />
                    <Area label="1. Project Information" value={tmpl.projectInformation} onChange={(v) => updateTmpl("projectInformation", v)} />
                    <Area label="2. Purpose" value={tmpl.purpose} onChange={(v) => updateTmpl("purpose", v)} />
                    <Area label="3. Regional & Tectonic Context" value={tmpl.regionalContext} onChange={(v) => updateTmpl("regionalContext", v)} />
                    <Area label="4. Field Data & Methodology" value={tmpl.fieldMethods} onChange={(v) => updateTmpl("fieldMethods", v)} />
                    <Area label="6. Ground Motion Observations" value={tmpl.observations} onChange={(v) => updateTmpl("observations", v)} />
                    <Area label="7. Evaluation" value={tmpl.evaluation} onChange={(v) => updateTmpl("evaluation", v)} />
                    <Area label="8. Recommendations" value={tmpl.recommendations} onChange={(v) => updateTmpl("recommendations", v)} />
                    <Area label="9. Report Limitations" value={tmpl.limitations} onChange={(v) => updateTmpl("limitations", v)} rows={2} />
                    <Area label="10. Closure" value={tmpl.closure} onChange={(v) => updateTmpl("closure", v)} rows={2} />
                    <Area label="Attachments" value={tmpl.attachments} onChange={(v) => updateTmpl("attachments", v)} rows={2} />
                  </FieldGroup>

                  <button onClick={generate} disabled={generating}
                    className="w-full h-10 rounded-lg bg-sky-500/25 border border-sky-400/50 text-sky-100 text-[11px] font-semibold uppercase tracking-[0.2em] hover:bg-sky-500/35 disabled:opacity-50 flex items-center justify-center gap-2 sticky bottom-0 backdrop-blur">
                    {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                      : report ? <><Edit3 className="w-4 h-4" /> Regenerate from my edits</>
                      : <><Sparkles className="w-4 h-4" /> Generate full report</>}
                  </button>
                </>
              )}

              {tab === "params" && (
                <>
                  <PanelTitle icon={Sliders}>Engineering parameters</PanelTitle>
                  <div className="grid grid-cols-2 gap-2">
                    <ParamSelect label="Site class (NEHRP)" value={params.siteClass} onChange={(v) => setParams((p) => ({ ...p, siteClass: v }))} options={["A","B","C","D","E","Unknown"]} />
                    <ParamInput label="Groundwater (m)" value={params.groundwaterM} type="number" onChange={(v) => setParams((p) => ({ ...p, groundwaterM: v }))} placeholder="e.g. 3" />
                    <ParamInput label="Structure type" value={params.structureType} onChange={(v) => setParams((p) => ({ ...p, structureType: v }))} />
                    <ParamInput label="Exposure / use" value={params.exposureUse} onChange={(v) => setParams((p) => ({ ...p, exposureUse: v }))} />
                    <ParamInput label="Design code" value={params.designCode} onChange={(v) => setParams((p) => ({ ...p, designCode: v }))} />
                    <ParamSelect label="Units" value={params.units} onChange={(v) => setParams((p) => ({ ...p, units: v as "SI" | "US" }))} options={["SI","US"]} />
                  </div>
                  <textarea value={params.extraNotes} onChange={(e) => setParams((p) => ({ ...p, extraNotes: e.target.value }))} placeholder="Extra constraints or context…" rows={2}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] resize-none focus:outline-none focus:border-sky-400/50" />

                  <PanelTitle icon={FileText}>Live event facts</PanelTitle>
                  <div className="grid grid-cols-1 gap-1.5 text-[11px] font-mono">
                    <KV k="Magnitude type" v={dp?.magType ?? "—"} />
                    <KV k="Network" v={dp?.net ?? source} />
                    <KV k="Instrumental MMI" v={`${romanMMI(mmi)} · ${mmiLabel(mmi)}`} />
                    <KV k="Community CDI" v={romanMMI(cdi)} />
                    <KV k="Felt reports" v={felt ? String(felt) : "—"} />
                    <KV k="Radiated energy" v={`${tntEquivalent(energy)}`} />
                    <KV k="Alert" v={dp?.alert ?? quake.alert ?? "none"} />
                    <KV k="Tsunami" v={quake.tsunami ? "issued" : "none"} />
                    <KV k="Significance" v={dp?.sig != null ? String(dp.sig) : "—"} />
                  </div>
                  {quake.url && (
                    <a href={quake.url} target="_blank" rel="noopener"
                      className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200">
                      Source authority event page <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </>
              )}

              {tab === "figures" && (
                <>
                  <PanelTitle icon={ImageIcon}>Embedded figures ({figures.length})</PanelTitle>
                  {figures.length === 0 ? (
                    <div className="text-[11px] text-white/50 p-3 rounded-lg border border-white/10 bg-white/[0.03] leading-relaxed">
                      No source-authority imagery available. ShakeMap, DYFI, PAGER and moment-tensor products auto-embed here when USGS publishes them for the event.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {figures.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noopener"
                          className="group block rounded-lg overflow-hidden border border-white/10 bg-black/40 hover:border-sky-400/40 transition">
                          <img src={f.url} alt={f.caption} loading="lazy" className="w-full h-24 object-cover group-hover:opacity-90" />
                          <div className="p-1.5 text-[9px] text-white/70 leading-tight">
                            <b className="text-white/90">Fig {i + 1}.</b> {f.caption}
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === "refine" && (
                <>
                  <PanelTitle icon={MessageSquare}>Refine with AI</PanelTitle>
                  {!report ? (
                    <div className="text-[11px] text-white/50 p-3 rounded-lg border border-white/10 bg-white/[0.03]">
                      Generate the report first, then iterate here.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          "Shorter — executive brief",
                          "Add tsunami sub-section",
                          "Rewrite for insurer",
                          "Expand Evaluation",
                          "Translate to Spanish",
                          "More recommendations",
                        ].map((preset) => (
                          <button key={preset} onClick={() => void sendChat(preset)} disabled={chatSending}
                            className="px-2 py-1 rounded-full text-[10px] border border-white/10 bg-white/[0.04] hover:bg-white/10 disabled:opacity-40 transition">
                            {preset}
                          </button>
                        ))}
                      </div>
                      {chat.length > 0 && (
                        <div className="max-h-60 overflow-y-auto space-y-1.5 border border-white/[0.06] rounded-lg p-2 bg-black/30">
                          {chat.map((m, i) => (
                            <div key={i} className={`text-[11px] leading-relaxed ${m.role === "user" ? "text-sky-200" : "text-white/60"}`}>
                              <b>{m.role === "user" ? "You" : "AI"}:</b> {m.content}
                            </div>
                          ))}
                        </div>
                      )}
                      <form onSubmit={(e) => { e.preventDefault(); void sendChat(); }} className="flex items-center gap-2">
                        <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask the AI…" disabled={chatSending}
                          className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-sky-400/50" />
                        <button type="submit" disabled={chatSending || !chatInput.trim()}
                          className="h-9 w-9 rounded-lg bg-sky-500/25 border border-sky-400/40 text-sky-100 hover:bg-sky-500/35 disabled:opacity-40 flex items-center justify-center">
                          {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </form>
                    </>
                  )}
                </>
              )}

              {tab === "replicas" && (
                <>
                  <PanelTitle icon={Waves}>
                    Replicas ({after.length})
                    <button onClick={exportReplicasCsv} disabled={!after.length}
                      className="ml-auto inline-flex items-center gap-1 px-2 h-6 rounded-md bg-white/[0.05] border border-white/10 text-[9px] uppercase tracking-widest hover:bg-white/10 disabled:opacity-40">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </PanelTitle>
                  <div className="text-[10px] text-white/50">500 km radius · 30 days · {source.toUpperCase()}</div>
                  {afterLoading ? (
                    <div className="flex items-center gap-2 text-white/60 text-xs py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                  ) : after.length === 0 ? (
                    <div className="text-[11px] text-white/50 text-center py-3">No aftershocks logged.</div>
                  ) : (
                    <div className="rounded-lg border border-white/10 divide-y divide-white/[0.06]">
                      <div className="grid grid-cols-[46px_1fr_50px_50px] gap-2 px-2 py-1 text-[9px] uppercase tracking-widest text-white/40 bg-white/[0.03] font-mono">
                        <span>Mag</span><span>Time · place</span><span className="text-right">Δkm</span><span className="text-right">Dkm</span>
                      </div>
                      {after.map((a) => (
                        <div key={a.id} className="grid grid-cols-[46px_1fr_50px_50px] gap-2 px-2 py-1 text-[11px] items-center hover:bg-white/[0.04]">
                          <span className="font-mono font-bold" style={{ color: a.mag >= 5 ? "#f97316" : a.mag >= 3 ? "#facc15" : "#84cc16" }}>M{(a.mag ?? 0).toFixed(1)}</span>
                          <span className="min-w-0 truncate">
                            <span className="text-white/60 font-mono">{fmtTime(a.time).slice(5, 16)}</span>
                            <span className="text-white/80"> · {a.place}</span>
                          </span>
                          <span className="text-right font-mono text-white/70">{a.distanceKm.toFixed(0)}</span>
                          <span className="text-right font-mono text-white/70">{a.depthKm?.toFixed?.(0) ?? a.depthKm}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === "library" && (
                <>
                  <PanelTitle icon={Building2}>Event library & institutions</PanelTitle>
                  <QuakeEventLibrary quake={quake} source={source}
                    onTuneSource={(inst) => { onTuneSource?.(inst); onClose(); }} />
                </>
              )}
            </div>

            {/* mobile action bar */}
            <div className="md:hidden border-t border-white/10 bg-black/40 p-2 flex items-center gap-2">
              <button onClick={generate} disabled={generating}
                className="flex-1 h-9 rounded-lg bg-sky-500/25 border border-sky-400/40 text-sky-100 text-[11px] font-semibold uppercase tracking-widest hover:bg-sky-500/35 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generating ? "…" : report ? "Regenerate" : "Generate"}
              </button>
              <button onClick={exportMd} className="h-9 px-3 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] uppercase tracking-widest hover:bg-white/10 flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> .md
              </button>
              <button onClick={doPrint} className="h-9 w-9 rounded-lg bg-white/[0.05] border border-white/10 hover:bg-white/10 flex items-center justify-center" title="Print">
                <Printer className="w-3.5 h-3.5" />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── small styled helpers ────────────────────────────────────────────────

function PanelTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/70 border-b border-white/10 pb-2">
      <Icon className="w-3.5 h-3.5 text-sky-300" />
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 gap-2">
      <span className="text-white/45 shrink-0">{k}</span>
      <span className="text-white/90 truncate text-right">{v}</span>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5">
      <div className="text-[9px] uppercase tracking-[0.22em] text-white/45 font-semibold px-0.5">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-sky-200/70">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="bg-white/[0.05] border border-white/10 rounded-md px-2 py-1.5 text-[11px] focus:outline-none focus:border-sky-400/50" />
    </label>
  );
}

function Area({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-sky-200/70">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="bg-white/[0.05] border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-relaxed resize-y focus:outline-none focus:border-sky-400/50" />
    </label>
  );
}

function ParamSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.18em] text-white/50">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-white/[0.05] border border-white/10 rounded-md px-2 py-1.5 text-[11px] focus:outline-none focus:border-sky-400/50">
        {options.map((o) => <option key={o} value={o} className="bg-neutral-900">{o}</option>)}
      </select>
    </label>
  );
}

function ParamInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.18em] text-white/50">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="bg-white/[0.05] border border-white/10 rounded-md px-2 py-1.5 text-[11px] focus:outline-none focus:border-sky-400/50" />
    </label>
  );
}