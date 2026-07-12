/**
 * QuakeReportModal
 * ----------------
 * Full seismic event report opened when a user clicks a quake tag.
 *
 * Sections:
 *  1. Header — magnitude, place, epicenter, depth, tsunami/alert flags
 *  2. Summary + Intensity — Modified Mercalli estimate, energy release,
 *     tectonic significance, felt-report count when available
 *  3. Impact assessment — PAGER-style narrative from USGS products
 *  4. Deep Geotechnical Analysis — templated report structure covering
 *     site conditions, ground motion, liquefaction, slope stability,
 *     structural response, foundation implications, and recommendations
 *  5. Aftershock / replicas ledger — nearby events within 500 km loaded
 *     from the FDSNWS query proxy; downloadable as CSV
 *  6. Seismographic phase data — arrival picks and station list from the
 *     USGS detail feed (phase-data product), when the event is on USGS
 *
 * The document template is exportable to Markdown so field engineers can
 * drop it straight into a report or share it downstream.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Download, ExternalLink, Loader2, Waves, Activity, FileText, Layers, MapPin, Gauge, Sparkles, Send, RefreshCw, FolderOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import type { QuakeTag } from "./QuakeTagsOverlay";
import QuakeEventLibrary from "./QuakeEventLibrary";
import type { QuakeInstitution } from "./quakeInstitutions";

interface Props {
  quake: QuakeTag;
  /** Data-source ID from the panel, e.g. "usgs" / "emsc" / "iris". */
  source: string;
  onClose: () => void;
  /** Called when a user picks an institution to tune the main panel to. */
  onTuneSource?: (institution: QuakeInstitution) => void;
}

interface AfterEvent {
  id: string;
  mag: number;
  place: string;
  time: number;
  lat: number;
  lng: number;
  depthKm: number;
  distanceKm: number;
}

interface UsgsDetail {
  properties?: {
    mag?: number;
    place?: string;
    time?: number;
    tz?: number | null;
    felt?: number | null;
    cdi?: number | null;   // DYFI intensity
    mmi?: number | null;   // ShakeMap intensity
    alert?: string | null;
    tsunami?: 0 | 1;
    sig?: number | null;
    net?: string;
    code?: string;
    ids?: string;
    sources?: string;
    types?: string;
    nst?: number | null;
    dmin?: number | null;
    rms?: number | null;
    gap?: number | null;
    magType?: string;
    type?: string;
    title?: string;
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
  if (v < 2) return "Not felt";
  if (v < 4) return "Weak";
  if (v < 5) return "Light";
  if (v < 6) return "Moderate";
  if (v < 7) return "Strong";
  if (v < 8) return "Very strong";
  if (v < 9) return "Severe";
  if (v < 10) return "Violent";
  return "Extreme";
}
function energyJoules(mag: number): number {
  // Gutenberg–Richter: log10 E = 4.8 + 1.5 M  → E in joules
  return Math.pow(10, 4.8 + 1.5 * mag);
}
function tntEquivalent(joules: number): string {
  const tnt = joules / 4.184e9; // kg of TNT
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
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function fmtTime(ms: number): string {
  try { return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z"; }
  catch { return String(ms); }
}

export default function QuakeReportModal({ quake, source, onClose, onTuneSource }: Props) {
  const [detail, setDetail] = useState<UsgsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [after, setAfter] = useState<AfterEvent[]>([]);
  const [afterLoading, setAfterLoading] = useState(false);
  const [tab, setTab] = useState<"summary" | "geotech" | "library" | "ledger" | "phases">("summary");

  // ---- AI report state --------------------------------------------------
  const [params, setParams] = useState({
    siteClass: "D",
    groundwaterM: "" as string,
    structureType: "Mid-rise reinforced concrete",
    exposureUse: "Occupancy Category II (standard)",
    targetAudience: "engineer",
    units: "SI" as "SI" | "US",
    language: "en",
    extraNotes: "",
  });
  const [report, setReport] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  // Aftershocks / replicas from the same source, 500 km radius, 30 days
  // after the mainshock. FDSNWS supports lat/lng/maxradiuskm.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setAfterLoading(true);
      try {
        const start = new Date(quake.time - 24 * 3600 * 1000).toISOString().slice(0, 10);
        const end = new Date(Math.min(Date.now(), quake.time + 30 * 86_400_000)).toISOString().slice(0, 10);
        const base = import.meta.env.VITE_SUPABASE_URL as string;
        const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const q = new URLSearchParams({
          mode: "search",
          source,
          starttime: start,
          endtime: end,
          latitude: quake.lat.toFixed(3),
          longitude: quake.lng.toFixed(3),
          maxradiuskm: "500",
          minmagnitude: "1",
          limit: "500",
          orderby: "time",
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
              id: f.id,
              mag: f.properties?.mag ?? 0,
              place: f.properties?.place ?? "",
              time: f.properties?.time ?? 0,
              lat, lng, depthKm: depth,
              distanceKm: haversineKm(quake.lat, quake.lng, lat, lng),
            } as AfterEvent;
          })
          .filter((r: AfterEvent) => r.time >= quake.time - 6 * 3600 * 1000);
        if (!cancelled) setAfter(rows);
      } catch {
        if (!cancelled) setAfter([]);
      } finally {
        if (!cancelled) setAfterLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [quake, source]);

  // USGS event detail (only meaningful when source=usgs); provides shakemap,
  // dyfi, and phase-data products. Extract event id from the summary URL.
  useEffect(() => {
    if (source !== "usgs") { setDetail(null); return; }
    let cancelled = false;
    const run = async () => {
      setDetailLoading(true);
      try {
        // Summary URL is like https://earthquake.usgs.gov/earthquakes/eventpage/<id>[/executive]
        const m = /eventpage\/([a-z0-9]+)/i.exec(quake.url);
        const evId = m?.[1] || quake.id;
        const r = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${evId}&format=geojson&includeallmagnitudes=true`);
        if (!r.ok) throw new Error(`${r.status}`);
        const j = await r.json();
        if (!cancelled) setDetail(j);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [quake, source]);

  // ---- AI report generation --------------------------------------------
  const quakePayload = useMemo(() => {
    const p = detail?.properties;
    return {
    id: quake.id,
    mag: quake.mag ?? 0,
    place: quake.place ?? "",
    time: quake.time,
    lat: quake.lat,
    lng: quake.lng,
    depthKm: quake.depthKm ?? 0,
    tsunami: quake.tsunami ?? 0,
    url: quake.url,
    alert: quake.alert ?? null,
    magType: p?.magType ?? null,
    mmi: p?.mmi ?? null,
    cdi: p?.cdi ?? null,
    felt: p?.felt ?? null,
    nst: p?.nst ?? null,
    dmin: p?.dmin ?? null,
    rms: p?.rms ?? null,
    gap: p?.gap ?? null,
    sig: p?.sig ?? null,
    net: p?.net ?? null,
    };
  }, [quake, detail]);

  const paramsPayload = useCallback(() => ({
    siteClass: params.siteClass,
    groundwaterM: params.groundwaterM === "" ? null : Number(params.groundwaterM),
    structureType: params.structureType,
    exposureUse: params.exposureUse,
    targetAudience: params.targetAudience,
    units: params.units,
    language: params.language,
    extraNotes: params.extraNotes || undefined,
  }), [params]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setReportError(null);
    try {
      const { data, error } = await supabase.functions.invoke("quake-report-ai", {
        body: {
          mode: "generate",
          quake: quakePayload,
          params: paramsPayload(),
          source,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReport(String(data?.report ?? ""));
      setChat([]);
    } catch (e) {
      setReportError((e as Error).message || "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  }, [quakePayload, paramsPayload, source]);

  const sendChat = useCallback(async (instructionOverride?: string) => {
    const instruction = (instructionOverride ?? chatInput).trim();
    if (!instruction || !report) return;
    setChatSending(true);
    setReportError(null);
    const nextChat = [...chat, { role: "user" as const, content: instruction }];
    setChat(nextChat);
    setChatInput("");
    try {
      const { data, error } = await supabase.functions.invoke("quake-report-ai", {
        body: {
          mode: "refine",
          quake: quakePayload,
          params: paramsPayload(),
          source,
          previousReport: report,
          instruction,
          chatHistory: nextChat.slice(-8),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newReport = String(data?.report ?? "");
      setReport(newReport);
      setChat([...nextChat, { role: "assistant", content: "Report updated." }]);
    } catch (e) {
      setReportError((e as Error).message || "Refinement failed.");
    } finally {
      setChatSending(false);
    }
  }, [chat, chatInput, report, quakePayload, paramsPayload, source]);

  const mag = quake.mag ?? 0;
  const energy = energyJoules(mag);
  const dc = depthClass(quake.depthKm ?? 0);
  const dp = detail?.properties;
  const mmi = dp?.mmi;
  const cdi = dp?.cdi;
  const felt = dp?.felt;

  const totalAftershocks = after.length;
  const strongestAfter = useMemo(
    () => after.reduce((a, b) => ((b.mag ?? 0) > (a?.mag ?? 0) ? b : a), null as AfterEvent | null),
    [after],
  );

  const exportLedgerCsv = useCallback(() => {
    const header = ["id","time_utc","magnitude","distance_km","depth_km","place"];
    const rows = after.map((a) => [
      a.id,
      new Date(a.time).toISOString(),
      a.mag,
      a.distanceKm.toFixed(1),
      a.depthKm,
      `"${(a.place || "").replace(/"/g, '""')}"`,
    ].join(","));
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = `replicas_${quake.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }, [after, quake.id]);

  const exportReportMd = useCallback(() => {
    const md = `# Seismic Event Report — M${mag.toFixed(1)} ${quake.place || ""}

**Event ID:** ${quake.id}
**Origin time (UTC):** ${fmtTime(quake.time)}
**Epicenter:** ${quake.lat.toFixed(4)}°, ${quake.lng.toFixed(4)}°
**Depth:** ${quake.depthKm?.toFixed?.(1) ?? quake.depthKm} km (${dc.label})
**Magnitude type:** ${dp?.magType ?? "—"}
**Tsunami flag:** ${quake.tsunami ? "YES" : "no"}
**PAGER alert:** ${dp?.alert ?? quake.alert ?? "none"}
**Instrumental intensity (MMI):** ${romanMMI(mmi)} — ${mmiLabel(mmi)}
**Community intensity (DYFI):** ${romanMMI(cdi)} ${felt ? `(${felt} reports)` : ""}
**Energy released:** ${energy.toExponential(2)} J (${tntEquivalent(energy)})
**Aftershocks logged (≤500 km, ≤30 d):** ${totalAftershocks}${strongestAfter ? ` — largest M${(strongestAfter.mag ?? 0).toFixed(1)}` : ""}

## 1. Executive Summary
A ${mmiLabel(mmi).toLowerCase()} magnitude ${mag.toFixed(1)} event ruptured ${dc.label.toLowerCase()} crust at ${quake.depthKm?.toFixed?.(1) ?? quake.depthKm} km depth. ${dc.note} Total radiated energy is on the order of ${tntEquivalent(energy)}.

## 2. Site & Tectonic Setting
- Epicentral coordinates: ${quake.lat.toFixed(4)}°, ${quake.lng.toFixed(4)}°
- Focal depth class: ${dc.label}
- Local time zone offset (min from UTC): ${dp?.tz ?? "—"}
- Regional context: verify against nearest plate boundary or active fault map.

## 3. Ground Motion Characterization
- Instrumental MMI (ShakeMap): ${romanMMI(mmi)} — ${mmiLabel(mmi)}
- Reported intensity (DYFI CDI): ${romanMMI(cdi)} (${felt ?? 0} felt reports)
- Expected peak ground acceleration (PGA): derive from ShakeMap contour set.
- Duration of strong shaking: dependent on rupture length and site amplification.

## 4. Geotechnical Considerations
### 4.1 Liquefaction potential
- Susceptible if PGA > 0.10 g and shallow saturated cohesionless soils exist within 15 m of surface.
- Confirm groundwater table, SPT/CPT profile, and fines content prior to design decisions.

### 4.2 Slope stability & landslide hazard
- Screen slopes > 15° within 50 km of epicenter using PGA ≥ 0.05 g contours.
- Consider Newmark displacement analysis for critical slopes.

### 4.3 Foundation & structural implications
- Shallow foundations: check bearing capacity reduction and differential settlement.
- Deep foundations: assess kinematic pile bending and lateral spreading demand.
- Retaining walls: re-evaluate seismic earth pressure (Mononobe–Okabe).

### 4.4 Fault surface rupture
- If focal depth < 15 km and M ≥ 6.5, examine trace maps for potential surface expression.

## 5. Impact & Exposure
- PAGER alert: ${dp?.alert ?? "none"}
- Tsunami flag: ${quake.tsunami ? "issued" : "none"}
- Community response volume: ${felt ?? 0} felt reports
- Significance score (USGS "sig"): ${dp?.sig ?? "—"}

## 6. Aftershock / Replica Sequence (first ${totalAftershocks} logged)
${after.slice(0, 50).map((a, i) =>
  `${(i + 1).toString().padStart(2, " ")}. ${fmtTime(a.time)}  M${(a.mag ?? 0).toFixed(1)}  ${a.distanceKm.toFixed(0)} km  depth ${a.depthKm?.toFixed?.(0) ?? a.depthKm} km  — ${a.place}`,
).join("\n") || "(none logged yet)"}

## 7. Recommendations
- Cross-reference ShakeMap and PAGER products before mobilising response.
- Deploy portable strong-motion units to characterise site response if aftershock sequence remains active (${strongestAfter ? `largest so far M${(strongestAfter.mag ?? 0).toFixed(1)}` : "sequence still developing"}).
- Update local hazard model with focal mechanism when moment tensor solution is released.

---
Generated from ${source.toUpperCase()} FDSNWS event feed via Atlas Seismic Intelligence.
Event page: ${quake.url}
`;
    const blob = new Blob([md], { type: "text/markdown" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `geotech_report_${quake.id}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }, [quake, mag, energy, dc, dp, mmi, cdi, felt, after, totalAftershocks, strongestAfter, source]);

  const phases = useMemo(() => {
    const pd = dp?.products?.["phase-data"]?.[0];
    const props = pd?.properties ?? {};
    return {
      nst: props["num-stations-used"] ?? dp?.nst ?? null,
      minDist: props["minimum-distance"] ?? dp?.dmin ?? null,
      rms: props["standard-error"] ?? dp?.rms ?? null,
      gap: props["azimuthal-gap"] ?? dp?.gap ?? null,
      review: props["review-status"] ?? null,
      magSource: props["magnitude-source"] ?? null,
      updateTime: pd?.updateTime ?? null,
    };
  }, [dp]);

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[720px] max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 backdrop-blur-2xl shadow-2xl text-white flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-start gap-3">
          <div
            className="rounded-full flex items-center justify-center font-mono font-bold text-sm shrink-0"
            style={{
              width: 44, height: 44,
              background: mag >= 6 ? "#ef4444" : mag >= 4 ? "#f59e0b" : "#84cc16",
              color: "#0b0b0f",
              boxShadow: `0 0 24px ${mag >= 6 ? "#ef4444aa" : mag >= 4 ? "#f59e0baa" : "#84cc16aa"}`,
            }}
          >
            {mag.toFixed(1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold truncate">{quake.place || "Unknown region"}</div>
            <div className="text-[11px] text-white/60 font-mono flex items-center gap-2 flex-wrap">
              <MapPin className="w-3 h-3" />
              {quake.lat.toFixed(3)}°, {quake.lng.toFixed(3)}° · depth {quake.depthKm?.toFixed?.(1) ?? quake.depthKm} km
              <span className="text-white/40">·</span>
              {fmtTime(quake.time)}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-white/10">
          {([
            ["summary", "Summary", Gauge],
            ["geotech", "AI Report", Sparkles],
            ["library", "Library", FolderOpen],
            ["ledger",  `Replicas${after.length ? " · " + after.length : ""}`, Waves],
            ["phases",  "Phase data", Activity],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-2.5 py-1.5 text-[10px] uppercase tracking-widest rounded-t-md flex items-center gap-1 border-b-2 ${
                tab === id
                  ? "border-red-400 text-white bg-white/[0.05]"
                  : "border-transparent text-white/60 hover:text-white/90 hover:bg-white/[0.03]"
              }`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto text-sm">
          {tab === "summary" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Depth class" value={dc.label} tone={dc.label === "Shallow" ? "hot" : "cool"} />
                <Stat label="Energy" value={tntEquivalent(energy)} tone="warn" />
                <Stat label="Instrumental MMI" value={`${romanMMI(mmi)} · ${mmiLabel(mmi)}`} />
                <Stat label="Felt reports" value={felt ? String(felt) : "—"} />
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[13px] leading-relaxed">
                A <b>{mmiLabel(mmi).toLowerCase()}</b> magnitude <b>{mag.toFixed(1)}</b> event ruptured
                {" "}<b>{dc.label.toLowerCase()}</b> crust at <b>{quake.depthKm?.toFixed?.(1) ?? quake.depthKm} km</b> depth.
                {" "}{dc.note} Radiated energy is on the order of <b>{tntEquivalent(energy)}</b>
                {" "}({energy.toExponential(2)} J).
                {quake.tsunami ? " A tsunami flag was raised by the source authority." : ""}
                {dp?.alert && dp.alert !== "green" ? ` PAGER alert level: ${dp.alert.toUpperCase()}.` : ""}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-white/70">
                <KV k="Magnitude type" v={dp?.magType ?? "—"} />
                <KV k="Event type" v={dp?.type ?? "earthquake"} />
                <KV k="Network" v={dp?.net ?? source} />
                <KV k="Significance" v={dp?.sig != null ? String(dp.sig) : "—"} />
                <KV k="Community CDI" v={romanMMI(cdi)} />
                <KV k="Alert" v={dp?.alert ?? quake.alert ?? "none"} />
              </div>
              <a
                href={quake.url}
                target="_blank" rel="noopener"
                className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
              >
                Open source authority event page <ExternalLink className="w-3 h-3" />
              </a>
            </>
          )}

          {tab === "geotech" && (
            <div className="space-y-3 text-[13px] leading-relaxed">
              {/* Engineering parameters — feed the AI generator */}
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Report parameters
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ParamSelect label="Site class (NEHRP)" value={params.siteClass}
                    onChange={(v) => setParams((p) => ({ ...p, siteClass: v }))}
                    options={["A","B","C","D","E","Unknown"]} />
                  <ParamInput label="Groundwater (m)" value={params.groundwaterM} type="number"
                    onChange={(v) => setParams((p) => ({ ...p, groundwaterM: v }))} placeholder="e.g. 3" />
                  <ParamInput label="Structure type" value={params.structureType}
                    onChange={(v) => setParams((p) => ({ ...p, structureType: v }))} placeholder="e.g. Steel MRF" />
                  <ParamInput label="Exposure / use" value={params.exposureUse}
                    onChange={(v) => setParams((p) => ({ ...p, exposureUse: v }))} placeholder="Occupancy IV, hospital…" />
                  <ParamSelect label="Audience" value={params.targetAudience}
                    onChange={(v) => setParams((p) => ({ ...p, targetAudience: v }))}
                    options={["engineer","responder","public","insurer","government"]} />
                  <ParamSelect label="Units" value={params.units}
                    onChange={(v) => setParams((p) => ({ ...p, units: v as "SI" | "US" }))}
                    options={["SI","US"]} />
                </div>
                <textarea
                  value={params.extraNotes}
                  onChange={(e) => setParams((p) => ({ ...p, extraNotes: e.target.value }))}
                  placeholder="Extra context or constraints (optional)…"
                  className="w-full bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-[11px] resize-none"
                  rows={2}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="flex-1 h-8 px-3 rounded-md bg-sky-500/20 border border-sky-400/40 text-sky-100 text-[11px] font-bold uppercase tracking-widest hover:bg-sky-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {generating
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                      : report
                        ? <><RefreshCw className="w-3.5 h-3.5" /> Regenerate report</>
                        : <><Sparkles className="w-3.5 h-3.5" /> Generate full report with AI</>}
                  </button>
                  {report && (
                    <button
                      onClick={() => {
                        const blob = new Blob([report], { type: "text/markdown" });
                        const u = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = u; a.download = `quake_report_${quake.id}.md`;
                        document.body.appendChild(a); a.click(); a.remove();
                        setTimeout(() => URL.revokeObjectURL(u), 1000);
                      }}
                      className="h-8 px-2 rounded-md bg-white/[0.05] border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/10 flex items-center gap-1"
                      title="Download the AI report as Markdown"
                    >
                      <Download className="w-3 h-3" /> .md
                    </button>
                  )}
                </div>
                {reportError && (
                  <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-400/30 rounded px-2 py-1">
                    {reportError}
                  </div>
                )}
              </div>

              {/* Generated report — real markdown */}
              {report ? (
                <div className="rounded-lg border border-white/10 bg-black/40 p-3 max-h-[46vh] overflow-y-auto">
                  <div className="prose prose-invert prose-sm max-w-none prose-headings:text-red-200 prose-headings:font-bold prose-h2:text-[13px] prose-h2:uppercase prose-h2:tracking-widest prose-h2:mt-3 prose-h2:mb-1 prose-p:text-white/85 prose-li:text-white/85 prose-strong:text-white">
                    <ReactMarkdown>{report}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-white/50 border border-dashed border-white/10 rounded-lg p-4 text-center">
                  No report yet. Set the parameters above and click <b>Generate</b> — the AI agent will author a full geotechnical / seismic report from this event's real data.
                </div>
              )}

              {/* AI chat refinement */}
              {report && (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Customize with AI
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[
                      "Make it shorter (executive brief)",
                      "Rewrite for the public",
                      "Add a dedicated tsunami section",
                      "Translate to Spanish",
                      "Add lifeline/utilities impact detail",
                      "Focus on insurance loss estimation",
                    ].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => void sendChat(preset)}
                        disabled={chatSending}
                        className="px-2 py-0.5 rounded-full text-[10px] border border-white/10 bg-white/[0.04] hover:bg-white/10 disabled:opacity-40"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  {chat.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-1 border border-white/[0.06] rounded p-2 bg-black/30">
                      {chat.map((m, i) => (
                        <div key={i} className={`text-[11px] ${m.role === "user" ? "text-sky-200" : "text-white/60"}`}>
                          <b>{m.role === "user" ? "You" : "AI"}:</b> {m.content}
                        </div>
                      ))}
                    </div>
                  )}
                  <form
                    onSubmit={(e) => { e.preventDefault(); void sendChat(); }}
                    className="flex items-center gap-2"
                  >
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask the AI to change the report…"
                      disabled={chatSending}
                      className="flex-1 bg-white/[0.05] border border-white/10 rounded px-2 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={chatSending || !chatInput.trim()}
                      className="h-8 px-2 rounded-md bg-sky-500/20 border border-sky-400/40 text-sky-100 text-[11px] hover:bg-sky-500/30 disabled:opacity-40 flex items-center gap-1"
                    >
                      {chatSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </button>
                  </form>
                </div>
              )}

              {/* Static template export fallback — still available */}
              <button
                onClick={exportReportMd}
                className="inline-flex items-center gap-1.5 px-3 h-7 rounded-md bg-white/[0.04] border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/10"
                title="Export the deterministic template report (no AI)"
              >
                <FileText className="w-3 h-3" /> Export template only (.md)
              </button>
            </div>
          )}

          {tab === "ledger" && (
            null
          )}
          {tab === "library" && (
            <QuakeEventLibrary quake={quake} source={source} onTuneSource={(inst) => { onTuneSource?.(inst); onClose(); }} />
          )}
          {tab === "ledger" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-widest text-white/60">
                  Aftershocks / replicas — 500 km radius · 30 days
                </div>
                <button
                  onClick={exportLedgerCsv}
                  disabled={!after.length}
                  className="inline-flex items-center gap-1 px-2 h-7 rounded-md bg-white/[0.05] border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/10 disabled:opacity-40"
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
              </div>
              {afterLoading ? (
                <div className="flex items-center gap-2 text-white/60 text-xs py-4">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading replicas…
                </div>
              ) : after.length === 0 ? (
                <div className="text-[11px] text-white/50 text-center py-4">
                  No aftershocks logged in this window.
                </div>
              ) : (
                <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/[0.06]">
                  <div className="grid grid-cols-[52px_1fr_60px_60px] gap-2 px-2 py-1 text-[9px] uppercase tracking-widest text-white/40 bg-white/[0.03] font-mono">
                    <span>Mag</span><span>Time · place</span><span className="text-right">Dist km</span><span className="text-right">Depth km</span>
                  </div>
                  {after.map((a) => (
                    <div key={a.id} className="grid grid-cols-[52px_1fr_60px_60px] gap-2 px-2 py-1.5 text-[11px] items-center hover:bg-white/[0.04]">
                      <span className="font-mono font-bold" style={{ color: a.mag >= 5 ? "#f97316" : a.mag >= 3 ? "#facc15" : "#84cc16" }}>
                        M{(a.mag ?? 0).toFixed(1)}
                      </span>
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
            </div>
          )}

          {tab === "phases" && (
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-widest text-white/60">
                Seismographic raw parameters
              </div>
              {source !== "usgs" ? (
                <div className="text-[11px] text-white/50 p-3 rounded border border-white/10 bg-white/[0.03]">
                  Phase-data products are only exposed by the USGS NEIC catalog. Re-open this event with the USGS source selected to view station picks and location quality.
                </div>
              ) : detailLoading ? (
                <div className="flex items-center gap-2 text-white/60 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading phase data…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-white/70">
                  <KV k="Stations used" v={phases.nst != null ? String(phases.nst) : "—"} />
                  <KV k="Minimum distance (°)" v={phases.minDist != null ? String(phases.minDist) : "—"} />
                  <KV k="Location RMS (s)" v={phases.rms != null ? String(phases.rms) : "—"} />
                  <KV k="Azimuthal gap (°)" v={phases.gap != null ? String(phases.gap) : "—"} />
                  <KV k="Review status" v={String(phases.review ?? "—")} />
                  <KV k="Magnitude source" v={String(phases.magSource ?? "—")} />
                </div>
              )}
              <a
                href={quake.url}
                target="_blank" rel="noopener"
                className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
              >
                Full waveform archive on source authority <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "hot" | "cool" | "warn" }) {
  const color = tone === "hot" ? "#ef4444" : tone === "warn" ? "#f59e0b" : "#22d3ee";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-white/50">{label}</div>
      <div className="text-xs font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1">
      <span className="text-white/50">{k}</span>
      <span className="text-white/90 truncate max-w-[60%] text-right">{v}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-red-300/80 font-bold mb-1">{title}</div>
      <div className="text-white/85">{children}</div>
    </div>
  );
}
function ParamSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-widest text-white/50">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-[11px]">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function ParamInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-widest text-white/50">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-[11px]" />
    </label>
  );
}