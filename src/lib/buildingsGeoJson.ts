/**
 * Build a GeoJSON FeatureCollection from a list of OSM building ids
 * plus the local building_records they resolve to. Geometry is fetched
 * from Overpass in a single batched query (way(id1,id2,…);out geom;)
 * so exporting even a 500-building group is one round-trip.
 */
import type { BuildingCardRecord } from "@/types/BuildingCardRecord";

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface BuildingGroupExport {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "Point"; coordinates: [number, number] };
  }>;
}

export async function exportGroupAsGeoJson(
  osmIds: string[],
  records: Record<string, BuildingCardRecord>,
): Promise<BuildingGroupExport> {
  const wayIds = osmIds
    .map((id) => id.replace(/^way\//, ""))
    .filter((id) => /^\d+$/.test(id));

  const geomById = new Map<string, Array<{ lat: number; lon: number }>>();
  const tagsById = new Map<string, Record<string, string>>();

  if (wayIds.length) {
    try {
      const q = `[out:json][timeout:25];way(id:${wayIds.join(",")});out tags geom;`;
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: q,
      });
      if (r.ok) {
        const j = await r.json();
        for (const el of (j.elements ?? []) as OverpassWay[]) {
          if (el.type !== "way") continue;
          if (el.geometry?.length) geomById.set(`way/${el.id}`, el.geometry);
          if (el.tags) tagsById.set(`way/${el.id}`, el.tags);
        }
      }
    } catch (e) {
      console.warn("[exportGroupAsGeoJson] overpass failed", e);
    }
  }

  const features: BuildingGroupExport["features"] = [];
  for (const osmId of osmIds) {
    const rec = records[osmId];
    const geom = geomById.get(osmId);
    const tags = tagsById.get(osmId) ?? {};
    const properties: Record<string, unknown> = {
      osm_id: osmId,
      name: rec?.name ?? tags.name ?? null,
      building: rec?.building_kind ?? tags.building ?? null,
      levels: rec?.levels ?? null,
      color: rec?.color ?? null,
      tag: rec?.tag ?? null,
      notes: rec?.notes ?? null,
      est_population: rec?.est_population ?? null,
      address: rec?.address ?? null,
    };
    if (geom && geom.length >= 3) {
      // Overpass returns [{lat,lon}]; GeoJSON wants [lon,lat] and a closed ring.
      const ring = geom.map((p) => [p.lon, p.lat]) as number[][];
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      features.push({
        type: "Feature",
        properties,
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    } else if (rec?.lat != null && rec?.lng != null) {
      features.push({
        type: "Feature",
        properties,
        geometry: { type: "Point", coordinates: [rec.lng, rec.lat] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export function downloadGeoJson(fc: BuildingGroupExport, filename: string) {
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}