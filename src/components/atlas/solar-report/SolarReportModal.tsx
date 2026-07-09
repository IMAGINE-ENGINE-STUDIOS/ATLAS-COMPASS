import { useEffect, useMemo, useRef, useState } from "react";
import type { Viewer } from "cesium";
import { X, Download, Copy, MapPin, Sun, Zap, DollarSign, Leaf, FileText, Info, Loader2, Move } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { PANEL_CATALOG, INVERTER_CATALOG, panelById, inverterById } from "./catalogs";
import { computeReport, compassLabel, estimateRoofAzimuth } from "./solarModel";
import { fetchNasaPower, reverseGeocode, computeSunPath } from "./api";
import { exportSolarReportPdf, copySummaryToClipboard } from "./exportPdf";
import type {
  ReportInputs, ReportComputed, RoofGeometry, FinancialInputs, SystemInputs, NasaPowerMonthly, SunPathSample,
} from "./types";

interface Props {
  viewer: Viewer | null;
  roof: {
    slantAreaM2: number;
    planarAreaM2: number;
    perimeterM: number;
    tiltDeg: number;
    vertices: Array<{ lng: number; lat: number; alt: number }>;
  };
  onClose: () => void;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
type SectionId = "site" | "resource" | "system" | "production" | "financials" | "impact" | "assumptions";

const SECTIONS: Array<{ id: SectionId; label: string; icon: any }> = [
  { id: "site",        label: "Site & Roof",         icon: MapPin },
  { id: "resource",    label: "Solar Resource",      icon: Sun },
  { id: "system",      label: "System Design",       icon: Zap },
  { id: "production",  label: "Production",          icon: FileText },
  { id: "financials",  label: "Financials",          icon: DollarSign },
  { id: "impact",      label: "Environmental",       icon: Leaf },
  { id: "assumptions", label: "Assumptions",         icon: Info },
];

export default function SolarReportModal({ viewer, roof, onClose }: Props) {
  // ── Draggable window ────────────────────────────────────────────────
  const [pos, setPos] = useState({ x: 60, y: 40 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({ x: dragRef.current.ox + (e.clientX - dragRef.current.startX), y: dragRef.current.oy + (e.clientY - dragRef.current.startY) });
  };
  const onDragEnd = () => { dragRef.current = null; };

  // ── Geometry derived from the roof ──────────────────────────────────
  const geometry: RoofGeometry = useMemo(() => {
    const centroid = roof.vertices.reduce(
      (acc, v) => ({ lat: acc.lat + v.lat, lng: acc.lng + v.lng, alt: acc.alt + v.alt }),
      { lat: 0, lng: 0, alt: 0 },
    );
    const n = Math.max(1, roof.vertices.length);
    return {
      slantAreaM2: roof.slantAreaM2,
      planarAreaM2: roof.planarAreaM2,
      perimeterM: roof.perimeterM,
      tiltDeg: roof.tiltDeg,
      azimuthDeg: estimateRoofAzimuth(roof.vertices),
      centroid: { lat: centroid.lat / n, lng: centroid.lng / n, alt: centroid.alt / n },
    };
  }, [roof]);

  // ── Real data fetches ──────────────────────────────────────────────
  const [resource, setResource] = useState<NasaPowerMonthly | null>(null);
  const [sunPath, setSunPath] = useState<SunPathSample[] | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [r, addr] = await Promise.all([
        fetchNasaPower(geometry.centroid.lat, geometry.centroid.lng),
        reverseGeocode(geometry.centroid.lat, geometry.centroid.lng),
      ]);
      if (!alive) return;
      setResource(r);
      setAddress(addr);
      setSunPath(computeSunPath(geometry.centroid.lat, geometry.centroid.lng));
      // Capture Cesium canvas as thumbnail (best-effort).
      try {
        if (viewer?.scene) {
          viewer.scene.render();
          const canvas = viewer.scene.canvas;
          setThumb(canvas.toDataURL("image/png"));
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [geometry.centroid.lat, geometry.centroid.lng, viewer]);

  // ── Editable inputs ────────────────────────────────────────────────
  const [system, setSystem] = useState<SystemInputs>({
    panelId: "tesla-425",
    inverterId: "enphase-iq8m",
    usableRoofFraction: 0.72,
    performanceRatio: 0.80,
    addPowerwall: false,
  });
  const [financials, setFinancials] = useState<FinancialInputs>({
    currency: "USD",
    pricePerWattInstalled: 2.75,
    utilityRatePerKwh: 0.16,
    rateEscalator: 0.03,
    itcPercent: 0.30,
    loanApr: 0.069,
    loanTermYears: 20,
    monthlyBillUsd: 180,
  });

  const inputs: ReportInputs = useMemo(() => ({
    address: address ?? undefined,
    geometry,
    system,
    financials,
    gridEmissionKgPerKwh: 0.40,
  }), [address, geometry, system, financials]);

  const computed: ReportComputed | null = useMemo(() => {
    if (!resource || !sunPath) return null;
    return computeReport(inputs, resource, sunPath);
  }, [inputs, resource, sunPath]);

  const [active, setActive] = useState<SectionId>("site");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExport = async () => {
    if (!computed) return;
    setExporting(true);
    try { await exportSolarReportPdf(inputs, computed, address, thumb); }
    finally { setExporting(false); }
  };
  const handleCopy = async () => {
    if (!computed) return;
    await copySummaryToClipboard(inputs, computed, address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        className="pointer-events-auto absolute rounded-2xl border border-white/15 bg-slate-950/95 backdrop-blur-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
        style={{ left: pos.x, top: pos.y, width: "min(1180px, calc(100vw - 80px))", height: "min(760px, calc(100vh - 60px))" }}
      >
        {/* Title bar (drag handle) */}
        <div
          className="flex items-center justify-between px-4 h-11 border-b border-white/10 bg-gradient-to-b from-white/[0.08] to-transparent cursor-move select-none"
          onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd}
        >
          <div className="flex items-center gap-2">
            <Move className="w-3.5 h-3.5 text-white/40" />
            <Sun className="w-4 h-4 text-orange-300" />
            <div className="text-[12px] font-bold uppercase tracking-widest text-white/90">Solar Installation Report</div>
            {loading && <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin" />}
            {resource?.source === "fallback" && (
              <span className="ml-2 text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-400/40 text-amber-100 px-2 py-0.5 rounded">
                Fallback climatology
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-white/70">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid grid-cols-[180px_1fr_300px]">
          {/* Left nav */}
          <div className="border-r border-white/10 p-2 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button
                key={s.id} onClick={() => setActive(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 mb-0.5 transition-colors ${active === s.id ? "bg-orange-500/20 text-orange-100" : "text-white/60 hover:bg-white/[0.05]"}`}
              >
                <s.icon className="w-3.5 h-3.5" />{s.label}
              </button>
            ))}
          </div>

          {/* Center preview */}
          <div className="overflow-y-auto p-6 text-white/85">
            {!computed ? (
              <div className="h-full flex items-center justify-center text-white/60 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Fetching NASA POWER climatology…
              </div>
            ) : (
              <ReportBody active={active} inputs={inputs} computed={computed} address={address} thumb={thumb} />
            )}
          </div>

          {/* Right inputs */}
          <div className="border-l border-white/10 p-4 overflow-y-auto space-y-4 text-[11px]">
            <SidebarLabel>Panel</SidebarLabel>
            <select value={system.panelId} onChange={(e) => setSystem({ ...system, panelId: e.target.value })} className={selectCls}>
              {PANEL_CATALOG.map((p) => <option key={p.id} value={p.id}>{p.brand} {p.model}</option>)}
            </select>
            <SidebarLabel>Inverter</SidebarLabel>
            <select value={system.inverterId} onChange={(e) => setSystem({ ...system, inverterId: e.target.value })} className={selectCls}>
              {INVERTER_CATALOG.map((p) => <option key={p.id} value={p.id}>{p.brand} {p.model}</option>)}
            </select>

            <SidebarLabel>Usable roof %</SidebarLabel>
            <Slider value={system.usableRoofFraction} min={0.4} max={0.9} step={0.01}
              onChange={(v) => setSystem({ ...system, usableRoofFraction: v })}
              format={(v) => `${(v * 100).toFixed(0)}%`} />

            <SidebarLabel>Performance ratio</SidebarLabel>
            <Slider value={system.performanceRatio} min={0.6} max={0.9} step={0.01}
              onChange={(v) => setSystem({ ...system, performanceRatio: v })}
              format={(v) => `${(v * 100).toFixed(0)}%`} />

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={system.addPowerwall} onChange={(e) => setSystem({ ...system, addPowerwall: e.target.checked })} />
              <span className="text-white/80">Add Tesla Powerwall 3</span>
            </label>

            <div className="border-t border-white/10 pt-3 space-y-3">
              <SidebarLabel>Financials</SidebarLabel>
              <NumInput label="$/W installed" value={financials.pricePerWattInstalled} step={0.05}
                onChange={(v) => setFinancials({ ...financials, pricePerWattInstalled: v })} />
              <NumInput label="Utility rate $/kWh" value={financials.utilityRatePerKwh} step={0.01}
                onChange={(v) => setFinancials({ ...financials, utilityRatePerKwh: v })} />
              <NumInput label="Rate escalator %/yr" value={financials.rateEscalator * 100} step={0.5}
                onChange={(v) => setFinancials({ ...financials, rateEscalator: v / 100 })} />
              <NumInput label="ITC %" value={financials.itcPercent * 100} step={5}
                onChange={(v) => setFinancials({ ...financials, itcPercent: v / 100 })} />
              <NumInput label="Loan APR %" value={financials.loanApr * 100} step={0.1}
                onChange={(v) => setFinancials({ ...financials, loanApr: v / 100 })} />
              <NumInput label="Loan term (yr)" value={financials.loanTermYears} step={1}
                onChange={(v) => setFinancials({ ...financials, loanTermYears: v })} />
              <NumInput label="Monthly bill $" value={financials.monthlyBillUsd ?? 0} step={5}
                onChange={(v) => setFinancials({ ...financials, monthlyBillUsd: v })} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 border-t border-white/10 bg-white/[0.03] px-4 flex items-center justify-between">
          <div className="text-[10px] text-white/50 uppercase tracking-widest">
            {computed ? `${computed.system.panelCount} panels · ${computed.system.dcKw.toFixed(2)} kWp · ${computed.production.annualKwh.toFixed(0)} kWh/yr` : "Computing…"}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} disabled={!computed}
              className="h-8 px-3 rounded-md border border-white/15 bg-white/[0.05] hover:bg-white/[0.10] text-white/85 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40">
              <Copy className="w-3.5 h-3.5" /> {copied ? "Copied" : "Copy summary"}
            </button>
            <button onClick={handleExport} disabled={!computed || exporting}
              className="h-8 px-4 rounded-md border border-orange-300 bg-gradient-to-b from-orange-500/40 to-orange-500/20 hover:from-orange-500/60 hover:to-orange-500/30 text-orange-50 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section body ────────────────────────────────────────────────────────
function ReportBody({ active, inputs, computed, address, thumb }: {
  active: SectionId; inputs: ReportInputs; computed: ReportComputed; address: string | null; thumb: string | null;
}) {
  const g = inputs.geometry;
  const panel = panelById(inputs.system.panelId);
  const inverter = inverterById(inputs.system.inverterId);
  const fmtC = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: inputs.financials.currency, maximumFractionDigits: 0 });

  if (active === "site") {
    const optimal = computed.system.optimalTiltDeg;
    const tiltDelta = Math.abs(g.tiltDeg - optimal);
    const tiltStatus = tiltDelta < 5 ? "excellent" : tiltDelta < 15 ? "acceptable" : "suboptimal";
    const tiltColor = tiltDelta < 5 ? "text-emerald-300" : tiltDelta < 15 ? "text-amber-300" : "text-rose-300";
    return (
      <Section title="Site & Roof">
        <div className="grid grid-cols-[240px_1fr] gap-6">
          {thumb && <img src={thumb} alt="roof" className="rounded-lg border border-white/10 aspect-[4/3] object-cover" />}
          <div className="space-y-3">
            {address && <div className="text-[13px] text-white/90">{address}</div>}
            <div className="text-[11px] text-white/60">
              {g.centroid.lat.toFixed(5)}, {g.centroid.lng.toFixed(5)} · {g.centroid.alt.toFixed(0)} m elevation
            </div>
            <MetricGrid items={[
              { label: "Slant area", value: `${g.slantAreaM2.toFixed(1)} m²` },
              { label: "Footprint", value: `${g.planarAreaM2.toFixed(1)} m²` },
              { label: "Perimeter", value: `${g.perimeterM.toFixed(1)} m` },
              { label: "Tilt", value: `${g.tiltDeg.toFixed(1)}°` },
              { label: "Optimal tilt", value: `${optimal.toFixed(1)}°` },
              { label: "Azimuth", value: `${g.azimuthDeg.toFixed(0)}° ${compassLabel(g.azimuthDeg)}` },
            ]} />
            <div className={`text-[11px] ${tiltColor}`}>Tilt vs optimal: {tiltStatus} (Δ {tiltDelta.toFixed(1)}°)</div>
          </div>
        </div>
      </Section>
    );
  }

  if (active === "resource") {
    const data = computed.resource.ghiKwhM2Day.map((v, i) => ({
      month: MONTHS[i],
      GHI: Number.isFinite(v) ? +v.toFixed(2) : 0,
      POA: +computed.production.planeOfArrayKwhM2Day[i].toFixed(2),
    }));
    return (
      <Section title="Solar Resource" subtitle={`${computed.resource.source === "nasa-power" ? "NASA POWER climatology" : "Fallback"} · annual avg GHI ${computed.resource.annualGhi.toFixed(2)} kWh/m²/day`}>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" fontSize={10} />
              <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} unit=" kWh/m²/d" width={80} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", fontSize: 11 }} />
              <Bar dataKey="GHI" fill="#f97316" />
              <Bar dataKey="POA" fill="#fbbf24" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {computed.sunPath.map((s) => (
            <div key={s.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] text-orange-200/70 uppercase tracking-wider">{s.label}</div>
              <div className="text-white/85 text-[13px] mt-1">Sun {s.solarNoonElevationDeg.toFixed(1)}° elev @ noon</div>
              <div className="text-white/60 text-[11px]">Az {s.solarNoonAzimuthDeg.toFixed(0)}° · {s.daylightHours.toFixed(1)} h daylight</div>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (active === "system") {
    return (
      <Section title="System Design">
        <MetricGrid items={[
          { label: "Panels", value: `${computed.system.panelCount}` },
          { label: "DC size", value: `${computed.system.dcKw.toFixed(2)} kWp` },
          { label: "AC size", value: `${computed.system.acKw.toFixed(2)} kW` },
          { label: "DC:AC ratio", value: computed.system.dcAcRatio.toFixed(2) },
          { label: "Strings", value: `${computed.system.stringsSuggested}` },
          { label: "Panels/string", value: `${computed.system.panelsPerString}` },
        ]} />
        <div className="mt-4 grid grid-cols-2 gap-4">
          <SpecCard title="Panel" brand={panel.brand} model={panel.model}
            rows={[["Wattage", `${panel.wattage} W`], ["Efficiency", `${(panel.efficiency * 100).toFixed(1)}%`], ["Area", `${panel.areaM2.toFixed(2)} m²`], ["Warranty", `${panel.warrantyYears} yr`]]} />
          <SpecCard title="Inverter" brand={inverter.brand} model={inverter.model}
            rows={[["Type", inverter.kind], ["Rated", `${inverter.ratedKw} kW`], ["Efficiency", `${(inverter.efficiency * 100).toFixed(1)}%`], ["Warranty", `${inverter.warrantyYears} yr`]]} />
        </div>
        {inputs.system.addPowerwall && (
          <div className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-500/5 p-3 text-[11px] text-emerald-100">
            <div className="font-bold uppercase tracking-wider text-emerald-200 mb-1">Battery add-on</div>
            Tesla Powerwall 3 — 13.5 kWh · 11.5 kW continuous. Recommended for whole-home backup.
          </div>
        )}
      </Section>
    );
  }

  if (active === "production") {
    const monthly = computed.production.monthlyKwh.map((v, i) => ({ month: MONTHS[i], kWh: Math.round(v) }));
    const degrade = computed.production.year25Kwh.map((v, i) => ({ year: i + 1, kWh: Math.round(v) }));
    return (
      <Section title="Energy Production" subtitle={`Year-1: ${computed.production.annualKwh.toFixed(0)} kWh · ${computed.production.specificYield.toFixed(0)} kWh/kWp`}>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={monthly}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" fontSize={10} />
              <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} width={60} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", fontSize: 11 }} />
              <Bar dataKey="kWh">
                {monthly.map((_, i) => <Cell key={i} fill={`hsl(${30 + i * 3}, 90%, ${50 + Math.sin(i / 2) * 10}%)`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-6">
          <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1">25-year degradation (−0.5%/yr)</div>
          <div className="h-40">
            <ResponsiveContainer>
              <LineChart data={degrade}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" fontSize={10} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} width={60} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", fontSize: 11 }} />
                <Line type="monotone" dataKey="kWh" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        {computed.production.offsetPercent !== undefined && (
          <div className="mt-4 text-[12px] text-emerald-200">
            Estimated utility offset: <b>{computed.production.offsetPercent.toFixed(0)}%</b> of your monthly bill.
          </div>
        )}
      </Section>
    );
  }

  if (active === "financials") {
    return (
      <Section title="Financials">
        <MetricGrid items={[
          { label: "Gross cost", value: fmtC(computed.financials.grossCostUsd) },
          { label: "ITC credit", value: `− ${fmtC(computed.financials.itcCreditUsd)}`, tone: "good" },
          { label: "Net cost", value: fmtC(computed.financials.netCostUsd) },
          { label: "Simple payback", value: `${computed.financials.simplePaybackYears.toFixed(1)} yr` },
          { label: "25-yr savings", value: fmtC(computed.financials.lifetimeSavingsUsd), tone: "good" },
          { label: "LCOE", value: `${fmtC(computed.financials.lcoeUsdPerKwh)}/kWh` },
          { label: "Loan payment", value: `${fmtC(computed.financials.monthlyLoanPaymentUsd)}/mo` },
          { label: "Year-1 savings", value: fmtC(computed.financials.year1SavingsUsd) },
        ]} />
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/70">
          Monthly loan payment ({fmtC(computed.financials.monthlyLoanPaymentUsd)}) vs monthly bill savings (
          {fmtC(computed.financials.year1SavingsUsd / 12)}) —
          {" "}
          {computed.financials.year1SavingsUsd / 12 >= computed.financials.monthlyLoanPaymentUsd
            ? <span className="text-emerald-300 font-bold">cash-flow positive from month 1.</span>
            : <span className="text-amber-300 font-bold">breakeven improves as utility rates escalate.</span>}
        </div>
      </Section>
    );
  }

  if (active === "impact") {
    return (
      <Section title="Environmental Impact (25 yr)">
        <MetricGrid items={[
          { label: "CO₂ avoided", value: `${computed.impact.lifetimeCo2AvoidedT.toFixed(1)} t` },
          { label: "Trees planted (eq)", value: computed.impact.equivalentTreesPlanted.toFixed(0) },
          { label: "Cars off road (eq)", value: computed.impact.equivalentCarsOffRoad.toFixed(1) },
          { label: "Homes powered/yr", value: computed.impact.equivalentHomesPowered.toFixed(2) },
        ]} />
      </Section>
    );
  }

  // assumptions
  return (
    <Section title="Assumptions & Disclaimers">
      <ul className="list-disc pl-5 space-y-2 text-[11px] text-white/70">
        <li>Usable roof fraction: {(inputs.system.usableRoofFraction * 100).toFixed(0)}% (setbacks, obstructions, dormers, code clearances).</li>
        <li>Performance ratio: {(inputs.system.performanceRatio * 100).toFixed(0)}% (soiling, wiring losses, inverter, temperature).</li>
        <li>Panel-plane irradiance derived from GHI with an isotropic sky tilt correction; azimuth derate up to 30% for due-north (northern hemisphere) or due-south (southern) orientations.</li>
        <li>Grid emission factor: {inputs.gridEmissionKgPerKwh.toFixed(2)} kgCO₂/kWh (IEA world avg 2023). Adjust for your region.</li>
        <li>Degradation: 0.5% per year for 25 years (typical Tier-1 module warranty curve).</li>
        <li>Financials use the values in the right sidebar. Utility rate escalator, ITC, and loan terms are user-editable.</li>
        <li><b>Not modeled:</b> shading from neighboring structures/trees, precise snow losses, per-string DC losses, site-specific interconnection costs, and permitting fees.</li>
        <li>Data sources: <b>NASA POWER</b> monthly climatology (GHI/DNI/DIF/T2M/Kt), <b>SunCalc</b> for solar geometry, <b>Nominatim</b> for reverse geocoding.</li>
        <li>This report is a technical estimate. A licensed installer must perform a site survey for a firm quote and interconnection design.</li>
      </ul>
    </Section>
  );
}

// ── Small UI primitives ────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[18px] font-bold text-white/95">{title}</h2>
      {subtitle && <div className="text-[11px] text-white/55 mb-4 mt-0.5">{subtitle}</div>}
      <div className={subtitle ? "" : "mt-4"}>{children}</div>
    </div>
  );
}
function MetricGrid({ items }: { items: Array<{ label: string; value: string; tone?: "good" | "warn" }> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-white/50">{it.label}</div>
          <div className={`text-[15px] font-bold mt-0.5 tabular-nums ${it.tone === "good" ? "text-emerald-200" : it.tone === "warn" ? "text-amber-200" : "text-white/95"}`}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}
function SpecCard({ title, brand, model, rows }: { title: string; brand: string; model: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[9px] uppercase tracking-wider text-orange-200/70">{title}</div>
      <div className="text-white/95 font-bold text-[13px]">{brand}</div>
      <div className="text-white/70 text-[11px] mb-2">{model}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
        {rows.map(([k, v]) => (<><span className="text-white/50">{k}</span><span className="text-white/85 text-right tabular-nums">{v}</span></>))}
      </div>
    </div>
  );
}
function SidebarLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] uppercase tracking-widest text-white/50 mt-1">{children}</div>;
}
const selectCls = "w-full h-8 rounded-md bg-white/[0.05] border border-white/15 text-white/90 text-[11px] px-2 outline-none focus:border-orange-300/50";
function NumInput({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="text-[9px] uppercase tracking-widest text-white/50">{label}</div>
      <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full h-7 rounded-md bg-white/[0.05] border border-white/15 text-white/90 text-[11px] px-2 outline-none focus:border-orange-300/50 tabular-nums" />
    </label>
  );
}
function Slider({ value, min, max, step, onChange, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/70 tabular-nums">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-orange-400" />
    </div>
  );
}