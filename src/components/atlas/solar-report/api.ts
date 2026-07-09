import type { NasaPowerMonthly, SunPathSample } from "./types";
import SunCalc from "suncalc";

// ── NASA POWER — free, no-key, monthly climatology at any lat/lng ────────
// https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,ALLSKY_KT&community=RE&longitude=...&latitude=...&format=JSON
// Returns kWh/m²/day. Values are keyed by month abbreviations (JAN..DEC) and "ANN".
const MONTH_KEYS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

export async function fetchNasaPower(lat: number, lng: number): Promise<NasaPowerMonthly> {
  const params = new URLSearchParams({
    parameters: "ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,ALLSKY_KT",
    community: "RE",
    longitude: lng.toFixed(4),
    latitude: lat.toFixed(4),
    format: "JSON",
  });
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NASA POWER ${res.status}`);
    const json: any = await res.json();
    const props = json?.properties?.parameter;
    if (!props) throw new Error("NASA POWER: no parameter data");
    const readMonthly = (key: string): number[] => {
      const obj = props[key] ?? {};
      return MONTH_KEYS.map((m) => {
        const v = Number(obj[m]);
        return Number.isFinite(v) && v > -900 ? v : NaN;
      });
    };
    const ghi = readMonthly("ALLSKY_SFC_SW_DWN");
    const dni = readMonthly("ALLSKY_SFC_SW_DNI");
    const dif = readMonthly("ALLSKY_SFC_SW_DIFF");
    const t = readMonthly("T2M");
    const kt = readMonthly("ALLSKY_KT");
    const annualGhi = ghi.filter(Number.isFinite).reduce((s, x) => s + x, 0) / ghi.filter(Number.isFinite).length;
    return {
      ghiKwhM2Day: ghi,
      dniKwhM2Day: dni,
      difKwhM2Day: dif,
      tempC: t,
      clearnessIndex: kt,
      annualGhi,
      source: "nasa-power",
    };
  } catch (err) {
    console.warn("[solar-report] NASA POWER fetch failed — using fallback climatology", err);
    return fallbackClimatology(lat);
  }
}

// Fallback: lat-band PSH table (matches original MeasureToolPanel model).
function fallbackClimatology(lat: number): NasaPowerMonthly {
  const a = Math.abs(lat);
  const annual = a < 20 ? 5.6 : a < 30 ? 5.2 : a < 40 ? 4.6 : a < 50 ? 3.9 : a < 60 ? 3.1 : 2.3;
  // Simple seasonal sine — high summer, low winter, hemisphere-aware.
  const north = lat >= 0;
  const monthly = Array.from({ length: 12 }, (_, m) => {
    // Peak in Jun (m=5) for north, Dec (m=11) for south.
    const phase = north ? (m - 5) : (m - 11);
    const factor = 1 - 0.35 * Math.cos((phase / 12) * 2 * Math.PI);
    return +(annual * factor).toFixed(2);
  });
  return {
    ghiKwhM2Day: monthly,
    dniKwhM2Day: monthly.map((v) => +(v * 0.7).toFixed(2)),
    difKwhM2Day: monthly.map((v) => +(v * 0.3).toFixed(2)),
    tempC: Array(12).fill(15),
    clearnessIndex: Array(12).fill(0.5),
    annualGhi: annual,
    source: "fallback",
  };
}

// ── Reverse geocode (Nominatim) ───────────────────────────────────────────
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!res.ok) return null;
    const j: any = await res.json();
    return j?.display_name ?? null;
  } catch { return null; }
}

// ── Sun path — solstices + equinox at solar noon ─────────────────────────
export function computeSunPath(lat: number, lng: number, year = new Date().getUTCFullYear()): SunPathSample[] {
  const dates: Array<{ label: SunPathSample["label"]; date: Date }> = [
    { label: "Summer solstice", date: new Date(Date.UTC(year, 5, 21, 12)) },
    { label: "Equinox",         date: new Date(Date.UTC(year, 2, 20, 12)) },
    { label: "Winter solstice", date: new Date(Date.UTC(year, 11, 21, 12)) },
  ];
  return dates.map(({ label, date }) => {
    const times = SunCalc.getTimes(date, lat, lng);
    const noon = times.solarNoon;
    const pos = SunCalc.getPosition(noon, lat, lng);
    const sunrisePos = SunCalc.getPosition(times.sunrise, lat, lng);
    const sunsetPos = SunCalc.getPosition(times.sunset, lat, lng);
    const toDeg = (r: number) => (r * 180) / Math.PI;
    // SunCalc azimuth: 0 = south, positive clockwise. Convert to 0..360 from north.
    const az = (r: number) => (toDeg(r) + 180 + 360) % 360;
    const daylight = Math.max(0, (times.sunset.getTime() - times.sunrise.getTime()) / 3_600_000);
    return {
      label,
      date: noon.toISOString(),
      solarNoonElevationDeg: Math.max(0, toDeg(pos.altitude)),
      solarNoonAzimuthDeg: az(pos.azimuth),
      sunriseAzimuthDeg: az(sunrisePos.azimuth),
      sunsetAzimuthDeg: az(sunsetPos.azimuth),
      daylightHours: daylight,
    };
  });
}