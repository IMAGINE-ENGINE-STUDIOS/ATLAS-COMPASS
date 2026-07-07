/**
 * US Census 2020 population lookup for a given lat/lng.
 *
 * Data flow (no API key required):
 *   1. Census Geocoder → resolve coordinates to a Census Block GEOID
 *      https://geocoding.geo.census.gov/geocoder/geographies/coordinates
 *   2. Decennial 2020 PL Redistricting API → total population (P1_001N)
 *      and total housing units (H1_001N) for that block
 *      https://api.census.gov/data/2020/dec/pl
 *
 * The block is the finest published unit (~50–200 people). We then
 * apportion residents to a single building using its footprint × levels
 * against an assumed ~90 m² per dwelling unit, multiplied by the block's
 * average household size (people ÷ housing units).
 *
 * Returns null when the point is outside the US or the APIs are unreachable
 * — the caller should fall back to the heuristic estimator.
 */

export interface CensusBlockData {
  geoid: string;
  state: string;
  county: string;
  tract: string;
  block: string;
  population: number;
  housing_units: number;
  household_size: number;
}

export interface BuildingResidentsEstimate {
  residents: number;
  units: number;
  source: "us-census-2020" | "worldpop-2020" | "ghsl-2023" | "heuristic" | "unavailable";
  block?: CensusBlockData;
  note?: string;
}

const RESIDENTIAL_KINDS = new Set([
  "",
  "yes",
  "residential",
  "apartments",
  "house",
  "detached",
  "semidetached_house",
  "terrace",
  "dormitory",
  "hotel",
  "bungalow",
  "cabin",
  "static_caravan",
]);

function isResidential(kind: string | null | undefined): boolean {
  return RESIDENTIAL_KINDS.has((kind ?? "").toLowerCase());
}

/** Resolve a US lat/lng to its Census Block GEOID + 2020 population/housing. */
export async function fetchCensusBlockData(
  lat: number,
  lng: number,
): Promise<CensusBlockData | null> {
  try {
    const geoUrl =
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates` +
      `?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current` +
      `&layers=Blocks&format=json`;
    const gRes = await fetch(geoUrl);
    if (!gRes.ok) return null;
    const gJson = await gRes.json();
    const blocks =
      gJson?.result?.geographies?.["Census Blocks"] ??
      gJson?.result?.geographies?.["2020 Census Blocks"];
    const b = Array.isArray(blocks) ? blocks[0] : null;
    if (!b) return null;

    const state = String(b.STATE ?? b.state ?? "").padStart(2, "0");
    const county = String(b.COUNTY ?? b.county ?? "").padStart(3, "0");
    const tract = String(b.TRACT ?? b.tract ?? "").padStart(6, "0");
    const block = String(b.BLOCK ?? b.block ?? "").padStart(4, "0");
    if (!state || !county || !tract || !block) return null;
    const geoid = `${state}${county}${tract}${block}`;

    const popUrl =
      `https://api.census.gov/data/2020/dec/pl` +
      `?get=P1_001N,H1_001N` +
      `&for=block:${block}` +
      `&in=state:${state}+county:${county}+tract:${tract}`;
    const pRes = await fetch(popUrl);
    if (!pRes.ok) return null;
    const rows = (await pRes.json()) as string[][];
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const [, row] = rows;
    const population = Number(row[0]) || 0;
    const housing_units = Number(row[1]) || 0;
    const household_size = housing_units > 0 ? population / housing_units : 2.5;

    return { geoid, state, county, tract, block, population, housing_units, household_size };
  } catch {
    return null;
  }
}

/**
 * Estimate residents for a single building, preferring US Census 2020 data
 * when available. Non-residential buildings return 0.
 */
export async function estimateBuildingResidents(input: {
  lat: number;
  lng: number;
  levels?: number | null;
  footprint_m2?: number | null;
  building_kind?: string | null;
}): Promise<BuildingResidentsEstimate> {
  const kind = input.building_kind ?? "";
  const residential = isResidential(kind);
  const floors = Math.max(1, Math.floor(input.levels ?? 3));
  const footprint = Math.max(0, input.footprint_m2 ?? 0);

  if (!residential) {
    return { residents: 0, units: 0, source: "heuristic", note: "non-residential" };
  }

  // ~90 m² per dwelling unit (US average interior for a single unit incl. walls/hall).
  const unitFootprint = 90;
  const units = footprint > 0
    ? Math.max(1, Math.round((footprint * floors) / unitFootprint))
    : Math.max(1, floors * 4);

  // Ask the edge function, which chains Census (US) → WorldPop (global)
  // → GHSL (global fallback) and caches results server-side.
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.functions.invoke("population-lookup", {
      body: { lat: input.lat, lng: input.lng },
    });
    const ppl = (data as any)?.residents_per_km2 as number | null | undefined;
    const source = (data as any)?.source as BuildingResidentsEstimate["source"] | undefined;
    const note = (data as any)?.note as string | undefined;
    if (typeof ppl === "number" && ppl > 0 && source) {
      // Building footprint (m²) → km². Assume ~30 % of the block's people
      // actually live in this building's footprint × floors (rest is roads,
      // commerce, empty lots). Cap at 1 unit × household size floor.
      const buildingFootprintKm2 = footprint / 1_000_000;
      const blockShare = Math.max(
        1,
        Math.round(ppl * buildingFootprintKm2 * floors * 0.3),
      );
      // Never exceed our per-unit ceiling (units × 3.5 people).
      const capped = Math.min(blockShare, Math.round(units * 3.5));
      return {
        residents: capped,
        units,
        source,
        note: note ?? undefined,
      };
    }
  } catch (e) {
    console.warn("[estimateBuildingResidents] edge function failed, falling back", e);
  }

  // Heuristic fallback (all providers failed): 35 m² per resident
  const perFloor = footprint > 0 ? Math.max(1, Math.floor(footprint / 35)) : 4;
  return {
    residents: floors * perFloor,
    units,
    source: "heuristic",
    note: "No population source responded — approximate",
  };
}