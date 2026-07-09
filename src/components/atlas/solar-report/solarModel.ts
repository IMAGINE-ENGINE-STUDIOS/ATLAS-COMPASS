import type {
  ReportInputs, ReportComputed, ComputedSystem, ComputedProduction,
  ComputedFinancials, ComputedImpact, NasaPowerMonthly, SunPathSample,
} from "./types";
import { panelById, inverterById } from "./catalogs";

const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Tilt-plane irradiance correction from horizontal GHI.
// Simple isotropic sky model — reasonable for early estimates.
// factor(tilt, latDelta) ≈ 1 - 0.35*sin²((tilt - optimal)/2)
// For our purposes, use a smooth Gaussian-like curve peaking at optimal tilt.
function planeOfArrayFactor(monthGhi: number, tiltDeg: number, latAbs: number): number {
  const optimal = latAbs;                       // rule of thumb
  const delta = Math.abs(tiltDeg - optimal);
  // Loss increases with delta; ~2 % per 10°.
  const loss = Math.min(0.25, (delta / 10) * 0.02);
  return monthGhi * (1 - loss);
}

export function computeReport(inputs: ReportInputs, resource: NasaPowerMonthly, sunPath: SunPathSample[]): ReportComputed {
  const panel = panelById(inputs.system.panelId);
  const inverter = inverterById(inputs.system.inverterId);
  const g = inputs.geometry;
  const latAbs = Math.abs(g.centroid.lat);

  // ── System ────────────────────────────────────────────────────────────
  const usableArea = g.slantAreaM2 * inputs.system.usableRoofFraction;
  const panelCount = Math.max(0, Math.floor(usableArea / panel.areaM2));
  const dcKw = (panelCount * panel.wattage) / 1000;
  // AC size: string inverter caps at nearest rated size; micro-inverter = panelCount × rated.
  const acKw = inverter.kind === "micro"
    ? panelCount * inverter.ratedKw
    : Math.min(dcKw / 1.15, inverter.ratedKw * Math.ceil(dcKw / inverter.ratedKw));
  const dcAcRatio = acKw > 0 ? dcKw / acKw : 0;
  const panelsPerString = inverter.kind === "micro" ? 1 : Math.min(panelCount, 12);
  const stringsSuggested = panelsPerString > 0 ? Math.ceil(panelCount / panelsPerString) : 0;

  const system: ComputedSystem = {
    panelCount,
    dcKw,
    acKw,
    dcAcRatio,
    usableAreaM2: usableArea,
    optimalTiltDeg: latAbs,
    tiltDelta: g.tiltDeg - latAbs,
    stringsSuggested,
    panelsPerString,
  };

  // ── Production ────────────────────────────────────────────────────────
  const pr = inputs.system.performanceRatio;
  const planeOfArrayKwhM2Day = resource.ghiKwhM2Day.map((ghi) => planeOfArrayFactor(ghi, g.tiltDeg, latAbs));
  // Azimuth derate — south-facing (northern hemisphere) or north-facing (southern) is best.
  const targetAz = g.centroid.lat >= 0 ? 180 : 0;
  const azDelta = Math.min(180, Math.abs(((g.azimuthDeg - targetAz) + 540) % 360 - 180));
  const azDerate = 1 - Math.min(0.30, (azDelta / 90) * 0.15); // up to 30 % loss for due-north-facing

  const monthlyKwh = planeOfArrayKwhM2Day.map((poaDay, i) => {
    // kWh = area × POA (kWh/m²/day) × efficiency × PR × azimuth × days
    return usableArea * poaDay * panel.efficiency * pr * azDerate * DAYS_IN_MONTH[i];
  });
  const annualKwh = monthlyKwh.reduce((s, x) => s + x, 0);
  const specificYield = dcKw > 0 ? annualKwh / dcKw : 0;

  // 25-year degradation: year 1 = 100 %, then −0.5 %/yr.
  const year25Kwh = Array.from({ length: 25 }, (_, i) => annualKwh * Math.pow(0.995, i));

  const offsetPercent = inputs.financials.monthlyBillUsd && inputs.financials.utilityRatePerKwh > 0
    ? Math.min(200, (annualKwh / ((inputs.financials.monthlyBillUsd * 12) / inputs.financials.utilityRatePerKwh)) * 100)
    : undefined;

  const production: ComputedProduction = {
    monthlyKwh,
    annualKwh,
    specificYield,
    year25Kwh,
    offsetPercent,
    planeOfArrayKwhM2Day,
  };

  // ── Financials ────────────────────────────────────────────────────────
  const grossCost = dcKw * 1000 * inputs.financials.pricePerWattInstalled;
  const itcCredit = grossCost * inputs.financials.itcPercent;
  const netCost = grossCost - itcCredit;
  // 25-year cumulative savings with rate escalator.
  let lifetimeSavings = 0;
  let year1 = 0;
  const rate0 = inputs.financials.utilityRatePerKwh;
  const esc = inputs.financials.rateEscalator;
  year25Kwh.forEach((kwh, i) => {
    const rate = rate0 * Math.pow(1 + esc, i);
    const s = kwh * rate;
    if (i === 0) year1 = s;
    lifetimeSavings += s;
  });
  const simplePayback = year1 > 0 ? netCost / year1 : 0;
  const lcoe = (annualKwh * 25) > 0 ? netCost / (annualKwh * 25 * 0.94 /* avg degradation */) : 0;
  // Loan payment: standard amortization.
  const r = inputs.financials.loanApr / 12;
  const n = inputs.financials.loanTermYears * 12;
  const monthlyLoan = r > 0 && n > 0
    ? (netCost * r) / (1 - Math.pow(1 + r, -n))
    : n > 0 ? netCost / n : 0;

  const financials: ComputedFinancials = {
    grossCostUsd: grossCost,
    itcCreditUsd: itcCredit,
    netCostUsd: netCost,
    simplePaybackYears: simplePayback,
    lifetimeSavingsUsd: lifetimeSavings,
    lcoeUsdPerKwh: lcoe,
    monthlyLoanPaymentUsd: monthlyLoan,
    year1SavingsUsd: year1,
  };

  // ── Impact ────────────────────────────────────────────────────────────
  const totalKwh = year25Kwh.reduce((s, x) => s + x, 0);
  const co2AvoidedKg = totalKwh * inputs.gridEmissionKgPerKwh;
  const impact: ComputedImpact = {
    lifetimeCo2AvoidedT: co2AvoidedKg / 1000,
    // EPA equivalencies (approx): 1 tree ~ 25 kg CO₂/yr for 20 yrs → 500 kg lifetime.
    equivalentTreesPlanted: co2AvoidedKg / 500,
    // Avg US car: 4.6 t CO₂/yr.
    equivalentCarsOffRoad: co2AvoidedKg / (4600 * 25),
    // Avg US home: 10,500 kWh/yr.
    equivalentHomesPowered: annualKwh / 10500,
  };

  return { system, production, financials, impact, resource, sunPath };
}

// ── Roof geometry helpers ────────────────────────────────────────────────
// Estimate roof azimuth from the ordered vertex list.
// Uses the longest edge of the polygon as the "eave" direction; the roof
// downslope direction is perpendicular to that edge, pointing toward the
// vertex with the lowest altitude.
export function estimateRoofAzimuth(vertices: Array<{ lng: number; lat: number; alt: number }>): number {
  if (vertices.length < 3) return 180;
  // Find longest edge in metres (approx planar).
  let bestLen = 0;
  let bestI = 0;
  const cosLat = Math.cos((vertices[0].lat * Math.PI) / 180);
  const mPerDegLat = 111_320;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const dx = (b.lng - a.lng) * mPerDegLat * cosLat;
    const dy = (b.lat - a.lat) * mPerDegLat;
    const len = Math.hypot(dx, dy);
    if (len > bestLen) { bestLen = len; bestI = i; }
  }
  const a = vertices[bestI];
  const b = vertices[(bestI + 1) % vertices.length];
  const dx = (b.lng - a.lng) * mPerDegLat * cosLat;
  const dy = (b.lat - a.lat) * mPerDegLat;
  // Bearing of edge (0=north, clockwise): atan2(dx, dy)
  const edgeBearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  // Downslope: perpendicular. Pick the perpendicular pointing toward the
  // lowest vertex (roof water shed direction).
  const perp1 = (edgeBearing + 90) % 360;
  const perp2 = (edgeBearing + 270) % 360;
  // Centroid alt vs each candidate direction — pick the one nearest the low vertex.
  const centroidLng = vertices.reduce((s, v) => s + v.lng, 0) / vertices.length;
  const centroidLat = vertices.reduce((s, v) => s + v.lat, 0) / vertices.length;
  const low = vertices.reduce((best, v) => (v.alt < best.alt ? v : best), vertices[0]);
  const ldx = (low.lng - centroidLng) * mPerDegLat * cosLat;
  const ldy = (low.lat - centroidLat) * mPerDegLat;
  const lowBearing = ((Math.atan2(ldx, ldy) * 180) / Math.PI + 360) % 360;
  const d1 = Math.min(Math.abs(perp1 - lowBearing), 360 - Math.abs(perp1 - lowBearing));
  const d2 = Math.min(Math.abs(perp2 - lowBearing), 360 - Math.abs(perp2 - lowBearing));
  return d1 <= d2 ? perp1 : perp2;
}

export function compassLabel(azimuthDeg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(((azimuthDeg % 360) / 22.5)) % 16;
  return dirs[idx];
}