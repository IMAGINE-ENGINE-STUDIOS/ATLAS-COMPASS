/**
 * Heatmap configuration + persistence for Tile Intelligence.
 *
 * A heatmap binds a *source* (either an uploaded user dataset or a live GIS
 * feed from `LIVE_GIS_SOURCES`) to a color ramp + rendering params, and can
 * be toggled on/off on the globe. Configs persist to localStorage so they
 * survive reloads without needing a schema migration.
 */
import type { HeatPoint } from "./liveGis";
import { LIVE_GIS_SOURCES, HEAT_RAMPS } from "./liveGis";
import { listDatasets } from "./datasets";
import { supabase } from "@/integrations/supabase/client";

export interface HeatmapConfig {
  id: string;
  name: string;
  source: { kind: "live"; sourceId: string } | { kind: "dataset"; datasetId: string; field?: string };
  ramp: string;
  radius: number;
  opacity: number;
  enabled: boolean;
  createdAt: string;
}

const LS_KEY = "atlas.tileIntel.heatmaps.v1";

export function listHeatmaps(): HeatmapConfig[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

export function saveHeatmaps(list: HeatmapConfig[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* noop */ }
  window.dispatchEvent(new Event("atlas:heatmaps-changed"));
}

export function upsertHeatmap(h: HeatmapConfig): void {
  const list = listHeatmaps();
  const i = list.findIndex((x) => x.id === h.id);
  if (i >= 0) list[i] = h; else list.unshift(h);
  saveHeatmaps(list);
}

export function toggleHeatmap(id: string, on?: boolean): void {
  const list = listHeatmaps().map((h) => h.id === id ? { ...h, enabled: on ?? !h.enabled } : h);
  saveHeatmaps(list);
}

export function deleteHeatmap(id: string): void {
  saveHeatmaps(listHeatmaps().filter((h) => h.id !== id));
}

export function newHeatmap(partial: Partial<HeatmapConfig> & Pick<HeatmapConfig, "name" | "source">): HeatmapConfig {
  return {
    id: crypto.randomUUID(),
    ramp: HEAT_RAMPS[0].id,
    radius: 22,
    opacity: 0.85,
    enabled: true,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

/** Fetch points for a heatmap config — from live source or from the user's uploaded dataset. */
export async function fetchHeatmapPoints(h: HeatmapConfig): Promise<HeatPoint[]> {
  const s = h.source;
  if (s.kind === "live") {
    const src = LIVE_GIS_SOURCES.find((x) => x.id === s.sourceId);
    if (!src) return [];
    return src.fetchPoints();
  }
  const ds = (await listDatasets()).find((d) => d.id === s.datasetId);
  if (!ds?.storage_path) return [];
  const { data, error } = await supabase.storage.from("user-datasets").download(ds.storage_path);
  if (error || !data) return [];
  return parseDatasetPoints(await data.text(), ds.kind, s.field);
}

/** Best-effort parse of GeoJSON/CSV/JSON to `HeatPoint[]`. Ignores unsupported binary formats. */
export function parseDatasetPoints(text: string, kind: string, field?: string): HeatPoint[] {
  if (kind === "geojson" || kind === "json") {
    try {
      const g = JSON.parse(text);
      const feats: any[] = g.features ?? (Array.isArray(g) ? g : []);
      const raw: { lng: number; lat: number; v: number }[] = [];
      for (const f of feats) {
        const c = f.geometry?.coordinates ?? [f.lng ?? f.longitude, f.lat ?? f.latitude];
        if (!Array.isArray(c) || c.length < 2) continue;
        const v = Number(f.properties?.[field ?? "value"] ?? f[field ?? "value"] ?? 1);
        raw.push({ lng: Number(c[0]), lat: Number(c[1]), v: Number.isFinite(v) ? v : 1 });
      }
      const vals = raw.map((r) => r.v); const to01 = normalize(vals);
      return raw.map((r) => ({ lng: r.lng, lat: r.lat, weight: to01(r.v) }));
    } catch { return []; }
  }
  if (kind === "csv") {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const iLat = header.findIndex((h) => ["lat", "latitude", "y"].includes(h));
    const iLon = header.findIndex((h) => ["lng", "lon", "long", "longitude", "x"].includes(h));
    const iVal = field ? header.indexOf(field.toLowerCase()) : header.findIndex((h) => ["value", "weight", "intensity", "count"].includes(h));
    if (iLat < 0 || iLon < 0) return [];
    const raw: { lng: number; lat: number; v: number }[] = [];
    for (const l of lines.slice(1)) {
      const cells = l.split(","); const lat = Number(cells[iLat]); const lng = Number(cells[iLon]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const v = iVal >= 0 ? Number(cells[iVal]) : 1;
      raw.push({ lng, lat, v: Number.isFinite(v) ? v : 1 });
    }
    const to01 = normalize(raw.map((r) => r.v));
    return raw.map((r) => ({ lng: r.lng, lat: r.lat, weight: to01(r.v) }));
  }
  return [];
}

function normalize(values: number[]): (v: number) => number {
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min || 1;
  return (v) => Math.max(0, Math.min(1, (v - min) / range));
}