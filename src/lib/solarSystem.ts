import { supabase } from "@/integrations/supabase/client";

export type SolarBodyId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "moon"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

export interface SolarBodyDefinition {
  id: SolarBodyId;
  name: string;
  radiusM: number;
  color: string;
  accent: string;
  texture: "star" | "rock" | "cloud" | "earth" | "moon" | "gas" | "ice" | "mars";
  priority: number;
}

export interface SolarEphemerisVector {
  id: SolarBodyId;
  name: string;
  jd: number;
  xM: number;
  yM: number;
  zM: number;
  vxMS?: number;
  vyMS?: number;
  vzMS?: number;
}

export interface SolarEphemerisResponse {
  source: "NASA/JPL Horizons";
  center: "Earth body center";
  generatedAt: string;
  vectors: SolarEphemerisVector[];
}

export const SOLAR_BODIES: SolarBodyDefinition[] = [
  { id: "sun", name: "Sun", radiusM: 695_700_000, color: "#ffd166", accent: "#fff3a3", texture: "star", priority: 0 },
  { id: "mercury", name: "Mercury", radiusM: 2_439_700, color: "#a7a29a", accent: "#d8d2c6", texture: "rock", priority: 6 },
  { id: "venus", name: "Venus", radiusM: 6_051_800, color: "#d9b46f", accent: "#ffe3a3", texture: "cloud", priority: 5 },
  { id: "earth", name: "Earth", radiusM: 6_378_137, color: "#4da3ff", accent: "#b7e4ff", texture: "earth", priority: 1 },
  { id: "moon", name: "Moon", radiusM: 1_737_400, color: "#b8b1a6", accent: "#f4efe7", texture: "moon", priority: 2 },
  { id: "mars", name: "Mars", radiusM: 3_389_500, color: "#d36b4b", accent: "#ffb18e", texture: "mars", priority: 3 },
  { id: "jupiter", name: "Jupiter", radiusM: 69_911_000, color: "#d9b38c", accent: "#ffe4bf", texture: "gas", priority: 4 },
  { id: "saturn", name: "Saturn", radiusM: 58_232_000, color: "#d8c38f", accent: "#fff0b8", texture: "gas", priority: 7 },
  { id: "uranus", name: "Uranus", radiusM: 25_362_000, color: "#8bd5df", accent: "#d8fbff", texture: "ice", priority: 8 },
  { id: "neptune", name: "Neptune", radiusM: 24_622_000, color: "#4f7dff", accent: "#b5c8ff", texture: "ice", priority: 9 },
];

export const SOLAR_BODY_BY_ID = SOLAR_BODIES.reduce((acc, body) => {
  acc[body.id] = body;
  return acc;
}, {} as Record<SolarBodyId, SolarBodyDefinition>);

let cachedEphemeris: { at: number; data: SolarEphemerisResponse } | null = null;

export async function fetchSolarEphemeris(): Promise<SolarEphemerisResponse> {
  const now = Date.now();
  if (cachedEphemeris && now - cachedEphemeris.at < 120_000) return cachedEphemeris.data;

  const { data, error } = await supabase.functions.invoke<SolarEphemerisResponse>("solar-ephemeris", {
    method: "GET",
  });
  if (error) throw error;
  if (!data?.vectors?.length) throw new Error("No live ephemeris vectors returned");
  cachedEphemeris = { at: now, data };
  return data;
}