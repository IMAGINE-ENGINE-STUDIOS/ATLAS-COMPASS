import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportInputs, ReportComputed } from "./types";
import { panelById, inverterById } from "./catalogs";
import { compassLabel } from "./solarModel";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export async function exportSolarReportPdf(
  inputs: ReportInputs,
  computed: ReportComputed,
  address: string | null,
  thumbnailDataUrl: string | null,
): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = M;
  const panel = panelById(inputs.system.panelId);
  const inverter = inverterById(inputs.system.inverterId);
  const g = inputs.geometry;

  // ── Header ──
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.text("Solar Installation Proposal", M, 42);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(200, 220, 240);
  doc.text(new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), M, 60);
  doc.setFontSize(8).setTextColor(140, 170, 200);
  doc.text("Generated using NASA POWER climatology + SunCalc solar geometry", M, 74);
  y = 110;
  doc.setTextColor(20, 20, 20);

  // ── Site ──
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("1. Site & Roof", M, y); y += 14;
  doc.setFont("helvetica", "normal").setFontSize(10);
  if (address) { doc.text(doc.splitTextToSize(address, W - M * 2), M, y); y += 22; }
  doc.text(`Coordinates: ${g.centroid.lat.toFixed(5)}, ${g.centroid.lng.toFixed(5)} · elev ${g.centroid.alt.toFixed(0)} m`, M, y); y += 14;
  if (thumbnailDataUrl) {
    try { doc.addImage(thumbnailDataUrl, "PNG", M, y, 240, 140); } catch {}
  }
  autoTable(doc, {
    startY: y,
    margin: { left: M + 260 },
    tableWidth: W - M * 2 - 260,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    head: [["Roof metric", "Value"]],
    body: [
      ["Slant area", `${g.slantAreaM2.toFixed(1)} m²`],
      ["Footprint (planar)", `${g.planarAreaM2.toFixed(1)} m²`],
      ["Perimeter", `${g.perimeterM.toFixed(1)} m`],
      ["Tilt (measured)", `${g.tiltDeg.toFixed(1)}°`],
      ["Optimal tilt (≈ |lat|)", `${computed.system.optimalTiltDeg.toFixed(1)}°`],
      ["Azimuth", `${g.azimuthDeg.toFixed(0)}° (${compassLabel(g.azimuthDeg)})`],
    ],
  });
  y = Math.max(y + 150, (doc as any).lastAutoTable?.finalY + 10 || y + 150);

  // ── Resource ──
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("2. Solar Resource", M, y); y += 6;
  doc.setFont("helvetica", "normal").setFontSize(9);
  const src = computed.resource.source === "nasa-power" ? "NASA POWER climatology" : "Fallback climatology (NASA unreachable)";
  doc.setTextColor(80, 80, 80);
  doc.text(`Source: ${src} · Annual avg GHI ${computed.resource.annualGhi.toFixed(2)} kWh/m²/day`, M, y + 12);
  doc.setTextColor(20, 20, 20);
  autoTable(doc, {
    startY: y + 20,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3, halign: "right" },
    headStyles: { fillColor: [30, 41, 59], halign: "center" },
    head: [["Month", ...MONTHS]],
    body: [
      ["GHI kWh/m²/day", ...computed.resource.ghiKwhM2Day.map((v) => (Number.isFinite(v) ? v.toFixed(2) : "—"))],
      ["DNI kWh/m²/day", ...computed.resource.dniKwhM2Day.map((v) => (Number.isFinite(v) ? v.toFixed(2) : "—"))],
      ["Temp °C", ...computed.resource.tempC.map((v) => (Number.isFinite(v) ? v.toFixed(1) : "—"))],
      ["Panel-plane kWh/m²/day", ...computed.production.planeOfArrayKwhM2Day.map((v) => v.toFixed(2))],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // ── Sun Path ──
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    head: [["Solar noon", "Sun elev.", "Sun azimuth", "Daylight"]],
    body: computed.sunPath.map((s) => [
      s.label,
      `${s.solarNoonElevationDeg.toFixed(1)}°`,
      `${s.solarNoonAzimuthDeg.toFixed(0)}° (${compassLabel(s.solarNoonAzimuthDeg)})`,
      `${s.daylightHours.toFixed(1)} h`,
    ]),
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  if (y > 700) { doc.addPage(); y = M; }

  // ── System ──
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("3. System Design", M, y); y += 8;
  autoTable(doc, {
    startY: y + 4,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    head: [["Component", "Selection", "Detail"]],
    body: [
      ["Solar panel", `${panel.brand} ${panel.model}`, `${panel.wattage} W · ${(panel.efficiency * 100).toFixed(1)}% eff · ${panel.warrantyYears} yr warranty`],
      ["Panels", `${computed.system.panelCount}`, `${computed.system.usableAreaM2.toFixed(1)} m² usable of ${g.slantAreaM2.toFixed(1)} m² slant`],
      ["DC size", `${computed.system.dcKw.toFixed(2)} kWp`, `${(computed.system.dcKw * 1000).toFixed(0)} W total`],
      ["Inverter", `${inverter.brand} ${inverter.model}`, `${inverter.kind} · ${inverter.ratedKw} kW · ${(inverter.efficiency * 100).toFixed(1)}% eff`],
      ["AC size", `${computed.system.acKw.toFixed(2)} kW`, `DC:AC ratio ${computed.system.dcAcRatio.toFixed(2)}`],
      ["String layout", `${computed.system.stringsSuggested} string(s)`, `${computed.system.panelsPerString} panels/string`],
      ...(inputs.system.addPowerwall ? [["Battery", "Tesla Powerwall 3", "13.5 kWh · 11.5 kW continuous"]] : []),
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // ── Production ──
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("4. Energy Production", M, y); y += 8;
  autoTable(doc, {
    startY: y + 4,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3, halign: "right" },
    headStyles: { fillColor: [30, 41, 59], halign: "center" },
    head: [["Month", ...MONTHS, "Total"]],
    body: [["kWh", ...computed.production.monthlyKwh.map((v) => v.toFixed(0)), computed.production.annualKwh.toFixed(0)]],
  });
  y = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`Year-1 generation: ${computed.production.annualKwh.toFixed(0)} kWh · Specific yield: ${computed.production.specificYield.toFixed(0)} kWh/kWp`, M, y);
  y += 12;
  doc.text(`25-year total (with 0.5%/yr degradation): ${computed.production.year25Kwh.reduce((s, x) => s + x, 0).toFixed(0)} kWh`, M, y);
  y += 16;

  if (y > 650) { doc.addPage(); y = M; }

  // ── Financials ──
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("5. Financials", M, y); y += 8;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: inputs.financials.currency, maximumFractionDigits: 0 });
  autoTable(doc, {
    startY: y + 4,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    head: [["Line item", "Amount"]],
    body: [
      [`Gross installed cost @ ${fmt(inputs.financials.pricePerWattInstalled)}/W`, fmt(computed.financials.grossCostUsd)],
      [`Federal ITC (${(inputs.financials.itcPercent * 100).toFixed(0)}%)`, `− ${fmt(computed.financials.itcCreditUsd)}`],
      ["Net cost", fmt(computed.financials.netCostUsd)],
      ["Year-1 savings", fmt(computed.financials.year1SavingsUsd)],
      ["Simple payback", `${computed.financials.simplePaybackYears.toFixed(1)} years`],
      ["25-yr lifetime savings", fmt(computed.financials.lifetimeSavingsUsd)],
      ["LCOE", `${fmt(computed.financials.lcoeUsdPerKwh)}/kWh`],
      [`Monthly loan payment (${inputs.financials.loanTermYears} yr @ ${(inputs.financials.loanApr * 100).toFixed(2)}% APR)`, fmt(computed.financials.monthlyLoanPaymentUsd)],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // ── Impact ──
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("6. Environmental Impact (25 yr)", M, y); y += 8;
  autoTable(doc, {
    startY: y + 4,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    head: [["Metric", "Value"]],
    body: [
      ["CO₂ avoided", `${computed.impact.lifetimeCo2AvoidedT.toFixed(1)} t`],
      ["Equivalent trees planted", `${computed.impact.equivalentTreesPlanted.toFixed(0)}`],
      ["Equivalent cars off road (25 yr)", `${computed.impact.equivalentCarsOffRoad.toFixed(1)}`],
      ["Homes powered per year", `${computed.impact.equivalentHomesPowered.toFixed(2)}`],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // ── Assumptions ──
  if (y > 680) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("Assumptions & Disclaimers", M, y); y += 12;
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(80, 80, 80);
  const notes = [
    `Usable roof fraction: ${(inputs.system.usableRoofFraction * 100).toFixed(0)}% · Performance ratio: ${(inputs.system.performanceRatio * 100).toFixed(0)}%`,
    `Grid emission factor: ${inputs.gridEmissionKgPerKwh.toFixed(2)} kgCO₂/kWh (IEA world avg)`,
    `Utility rate: ${fmt(inputs.financials.utilityRatePerKwh)}/kWh · Escalator: ${(inputs.financials.rateEscalator * 100).toFixed(1)}%/yr`,
    `Solar resource data: ${src} · Sun geometry: SunCalc (NOAA solar equations)`,
    `Shading, snow, per-panel string routing, and precise setback losses are NOT modeled — a site survey is required for a firm quote.`,
    `Prepared as a technical estimate. Final pricing, permitting, and interconnection must be validated by a licensed installer.`,
  ];
  notes.forEach((n) => { const lines = doc.splitTextToSize(n, W - M * 2); doc.text(lines, M, y); y += lines.length * 10 + 2; });

  doc.save(`solar-report-${g.centroid.lat.toFixed(3)}_${g.centroid.lng.toFixed(3)}.pdf`);
}

export function copySummaryToClipboard(inputs: ReportInputs, computed: ReportComputed, address: string | null): Promise<void> {
  const g = inputs.geometry;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: inputs.financials.currency, maximumFractionDigits: 0 });
  const md = `# Solar Report

**Location:** ${address ?? `${g.centroid.lat.toFixed(4)}, ${g.centroid.lng.toFixed(4)}`}
**Roof:** ${g.slantAreaM2.toFixed(1)} m² slant · ${g.tiltDeg.toFixed(1)}° tilt · azimuth ${g.azimuthDeg.toFixed(0)}° (${compassLabel(g.azimuthDeg)})

## System
- **${computed.system.panelCount} × ${panelById(inputs.system.panelId).brand} ${panelById(inputs.system.panelId).model}** (${computed.system.dcKw.toFixed(2)} kWp DC)
- Inverter: ${inverterById(inputs.system.inverterId).brand} ${inverterById(inputs.system.inverterId).model}

## Production
- Year-1: **${computed.production.annualKwh.toFixed(0)} kWh** (${computed.production.specificYield.toFixed(0)} kWh/kWp)
- 25-yr total: ${computed.production.year25Kwh.reduce((s, x) => s + x, 0).toFixed(0)} kWh

## Financials
- Gross: ${fmt(computed.financials.grossCostUsd)} · Net after ITC: **${fmt(computed.financials.netCostUsd)}**
- Payback: ${computed.financials.simplePaybackYears.toFixed(1)} yr · 25-yr savings: ${fmt(computed.financials.lifetimeSavingsUsd)}

## Impact
- CO₂ avoided: ${computed.impact.lifetimeCo2AvoidedT.toFixed(1)} t · ${computed.impact.equivalentTreesPlanted.toFixed(0)} trees equivalent

_Data: ${computed.resource.source === "nasa-power" ? "NASA POWER" : "fallback climatology"} · SunCalc · generated ${new Date().toISOString().slice(0, 10)}_
`;
  return navigator.clipboard.writeText(md);
}