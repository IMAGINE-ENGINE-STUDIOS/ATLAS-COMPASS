// Types for the comprehensive solar report.
export interface RoofGeometry {
  slantAreaM2: number;
  planarAreaM2: number;
  perimeterM: number;
  tiltDeg: number;
  azimuthDeg: number; // 0 = north, 90 = east, 180 = south, 270 = west
  centroid: { lat: number; lng: number; alt: number };
}

export interface PanelSpec {
  id: string;
  brand: string;
  model: string;
  wattage: number;      // Wp per panel
  areaM2: number;       // physical footprint per panel
  efficiency: number;   // fraction (0–1)
  warrantyYears: number;
  pricePerWatt: number; // $/W indicative retail
}

export interface InverterSpec {
  id: string;
  brand: string;
  model: string;
  kind: "string" | "micro" | "hybrid";
  ratedKw: number;
  efficiency: number;
  warrantyYears: number;
  pricePerWatt: number;
}

export interface NasaPowerMonthly {
  ghiKwhM2Day: number[];   // 12 entries
  dniKwhM2Day: number[];   // 12 entries
  difKwhM2Day: number[];   // 12 entries
  tempC: number[];         // 12 entries
  clearnessIndex: number[];// 12 entries
  annualGhi: number;       // kWh/m²/day average
  source: "nasa-power" | "fallback";
}

export interface SunPathSample {
  label: "Summer solstice" | "Equinox" | "Winter solstice";
  date: string;            // ISO
  solarNoonElevationDeg: number;
  solarNoonAzimuthDeg: number;
  sunriseAzimuthDeg: number;
  sunsetAzimuthDeg: number;
  daylightHours: number;
}

export interface FinancialInputs {
  currency: string;         // e.g. "USD"
  pricePerWattInstalled: number; // $/W, includes BOS + labor + permitting
  utilityRatePerKwh: number;// $/kWh
  rateEscalator: number;    // yearly, e.g. 0.03
  itcPercent: number;       // federal ITC (US default 0.30)
  loanApr: number;          // e.g. 0.069
  loanTermYears: number;
  monthlyBillUsd?: number;  // optional context
}

export interface SystemInputs {
  panelId: string;
  inverterId: string;
  usableRoofFraction: number; // 0.72 default
  performanceRatio: number;   // 0.80 default (soiling, wiring, temp)
  addPowerwall: boolean;
}

export interface ReportInputs {
  address?: string;
  geometry: RoofGeometry;
  system: SystemInputs;
  financials: FinancialInputs;
  gridEmissionKgPerKwh: number; // default 0.40 (IEA world avg)
}

export interface ComputedSystem {
  panelCount: number;
  dcKw: number;
  acKw: number;
  dcAcRatio: number;
  usableAreaM2: number;
  optimalTiltDeg: number;
  tiltDelta: number;           // signed delta from optimal
  stringsSuggested: number;
  panelsPerString: number;
}

export interface ComputedProduction {
  monthlyKwh: number[];   // 12 entries
  annualKwh: number;
  specificYield: number;  // kWh/kWp/year
  year25Kwh: number[];    // year 1..25 with 0.5%/yr degradation
  offsetPercent?: number;
  planeOfArrayKwhM2Day: number[]; // 12 entries — panel-plane irradiance
}

export interface ComputedFinancials {
  grossCostUsd: number;
  itcCreditUsd: number;
  netCostUsd: number;
  simplePaybackYears: number;
  lifetimeSavingsUsd: number;
  lcoeUsdPerKwh: number;
  monthlyLoanPaymentUsd: number;
  year1SavingsUsd: number;
}

export interface ComputedImpact {
  lifetimeCo2AvoidedT: number;
  equivalentTreesPlanted: number;
  equivalentCarsOffRoad: number;
  equivalentHomesPowered: number;
}

export interface ReportComputed {
  system: ComputedSystem;
  production: ComputedProduction;
  financials: ComputedFinancials;
  impact: ComputedImpact;
  resource: NasaPowerMonthly;
  sunPath: SunPathSample[];
}