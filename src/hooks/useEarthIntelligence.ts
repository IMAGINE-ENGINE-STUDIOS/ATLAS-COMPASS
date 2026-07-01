/**
 * useEarthIntelligence
 * --------------------
 * Central catalog + hook for the Atlas Earth Intelligence layers.
 *
 * Provides:
 *  - `EARTH_LAYERS`: static registry of every raster/tile layer (NASA GIBS,
 *    NOAA GOES, Himawari-9, EOX Sentinel-2 cloudless, Mapzen terrarium,
 *    OpenStreetMap US hillshade). Each entry exposes an URL template plus
 *    metadata (category, format, temporal resolution, attribution).
 *  - `useRainViewerFrames()`: fetches RainViewer radar/satellite frame index
 *    and returns tile URL builders (past + nowcast).
 *  - `useEarthquakes(feed)`: USGS earthquake feed via edge proxy.
 *  - `useLightning(slices, refreshMs)`: Blitzortung strikes via edge proxy.
 *  - `useActiveHurricanes()`: NOAA NHC / ArcGIS active-storm layer trio.
 *
 * All network callers auto-refresh at sensible intervals and cancel on
 * unmount. Nothing is stateful outside of React — safe to mount many
 * consumers.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Layer catalog
// ─────────────────────────────────────────────────────────────────────────────

export type EarthLayerCategory =
  | "imagery"
  | "weather"
  | "temperature"
  | "vegetation"
  | "atmosphere"
  | "cryosphere"
  | "hazards"
  | "nightlights"
  | "elevation";

export type EarthLayerProvider =
  | "NASA GIBS"
  | "NOAA GOES"
  | "Himawari-9"
  | "EOX"
  | "Mapzen/AWS"
  | "OpenStreetMap US"
  | "RainViewer"
  | "USGS"
  | "Blitzortung"
  | "NOAA NHC";

export interface EarthLayerDef {
  id: string;
  label: string;
  provider: EarthLayerProvider;
  category: EarthLayerCategory;
  /** WMTS URL template with `{z}/{y}/{x}` (GIBS uses y,x order) or `{z}/{x}/{y}`. */
  urlTemplate: string;
  /** Tile format for extension substitution. */
  format: "png" | "jpg" | "jpeg";
  /** Whether {date} placeholder should be substituted with a YYYY-MM-DD. */
  temporal: boolean;
  /** Suggested update cadence for UI hints. */
  cadence: "realtime" | "10min" | "hourly" | "daily" | "monthly" | "annual" | "static";
  attribution: string;
  /** Optional max native zoom (Cesium/Leaflet clamps). */
  maxZoom?: number;
}

const GIBS_WMTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/** Build a GIBS WMTS template. */
const gibs = (
  layer: string,
  tileMatrixSet: string,
  format: "png" | "jpg",
  temporal: boolean,
): string =>
  `${GIBS_WMTS}/${layer}/default/${temporal ? "{date}" : ""}${
    temporal ? "/" : ""
  }${tileMatrixSet}/{z}/{y}/{x}.${format}`;

export const EARTH_LAYERS: readonly EarthLayerDef[] = [
  // ── Imagery ───────────────────────────────────────────────────────────────
  {
    id: "viirs-truecolor",
    label: "VIIRS True Color (daily)",
    provider: "NASA GIBS",
    category: "imagery",
    urlTemplate: gibs("VIIRS_SNPP_CorrectedReflectance_TrueColor", "GoogleMapsCompatible_Level9", "jpg", true),
    format: "jpg",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 9,
  },
  {
    id: "viirs-bands-721",
    label: "VIIRS Bands 7-2-1 (fires/smoke)",
    provider: "NASA GIBS",
    category: "imagery",
    urlTemplate: gibs("VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1", "GoogleMapsCompatible_Level9", "jpg", true),
    format: "jpg",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 9,
  },
  {
    id: "modis-truecolor",
    label: "MODIS Terra True Color",
    provider: "NASA GIBS",
    category: "imagery",
    urlTemplate: gibs("MODIS_Terra_CorrectedReflectance_TrueColor", "GoogleMapsCompatible_Level9", "jpg", true),
    format: "jpg",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 9,
  },
  {
    id: "s2-cloudless-2023",
    label: "Sentinel-2 Cloudless 2023 (10m)",
    provider: "EOX",
    category: "imagery",
    urlTemplate: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg",
    format: "jpg",
    temporal: false,
    cadence: "annual",
    attribution: "Sentinel-2 cloudless © EOX IT Services / ESA",
    maxZoom: 17,
  },

  // ── Geostationary satellites ──────────────────────────────────────────────
  {
    id: "goes-east-geocolor",
    label: "GOES-East GeoColor",
    provider: "NOAA GOES",
    category: "weather",
    urlTemplate: gibs("GOES-East_ABI_GeoColor", "GoogleMapsCompatible_Level7", "png", true),
    format: "png",
    temporal: true,
    cadence: "10min",
    attribution: "NOAA / NASA GIBS",
    maxZoom: 7,
  },
  {
    id: "goes-west-geocolor",
    label: "GOES-West GeoColor",
    provider: "NOAA GOES",
    category: "weather",
    urlTemplate: gibs("GOES-West_ABI_GeoColor", "GoogleMapsCompatible_Level7", "png", true),
    format: "png",
    temporal: true,
    cadence: "10min",
    attribution: "NOAA / NASA GIBS",
    maxZoom: 7,
  },
  {
    id: "goes-east-firetemp",
    label: "GOES-East Fire Temperature",
    provider: "NOAA GOES",
    category: "hazards",
    // Sub-daily layer — use GIBS "default" sentinel so we always resolve to
    // the latest 10-minute frame without knowing the exact timestamp.
    urlTemplate: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_FireTemp/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png",
    format: "png",
    temporal: false,
    cadence: "10min",
    attribution: "NOAA / NASA GIBS",
    maxZoom: 7,
  },
  {
    id: "himawari9-visible",
    label: "Himawari-9 Infrared (Asia-Pacific)",
    provider: "Himawari-9",
    category: "weather",
    urlTemplate: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    format: "png",
    temporal: false,
    cadence: "10min",
    attribution: "JMA / NASA GIBS",
    maxZoom: 6,
  },

  // ── Temperature ───────────────────────────────────────────────────────────
  {
    id: "lst-day",
    label: "Land Surface Temp (day)",
    provider: "NASA GIBS",
    category: "temperature",
    urlTemplate: gibs("MODIS_Terra_L3_Land_Surface_Temp_Daily_Day", "GoogleMapsCompatible_Level7", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 7,
  },
  {
    id: "lst-night",
    label: "Land Surface Temp (night)",
    provider: "NASA GIBS",
    category: "temperature",
    urlTemplate: gibs("MODIS_Terra_L3_Land_Surface_Temp_Daily_Night", "GoogleMapsCompatible_Level7", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 7,
  },
  {
    id: "sst",
    label: "Sea Surface Temperature",
    provider: "NASA GIBS",
    category: "temperature",
    urlTemplate: gibs("GHRSST_L4_MUR_Sea_Surface_Temperature", "GoogleMapsCompatible_Level7", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA JPL / GIBS",
    maxZoom: 7,
  },
  {
    id: "airs-air-temp",
    label: "AIRS Air Temperature",
    provider: "NASA GIBS",
    category: "temperature",
    // Data lag exceeds 1 day; use GIBS "default" sentinel to always fetch
    // the most recent available date rather than a fixed YYYY-MM-DD.
    urlTemplate: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/AIRS_L3_Surface_Air_Temperature_Daily_Day/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    format: "png",
    temporal: false,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 6,
  },

  // ── Vegetation / soil ─────────────────────────────────────────────────────
  {
    id: "ndvi",
    label: "NDVI (8-day)",
    provider: "NASA GIBS",
    category: "vegetation",
    urlTemplate: gibs("MODIS_Terra_NDVI_8Day", "GoogleMapsCompatible_Level9", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 9,
  },
  {
    id: "smap-soil-moisture",
    label: "SMAP Soil Moisture",
    provider: "NASA GIBS",
    category: "vegetation",
    urlTemplate: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/SMAP_L3_Passive_Day_Soil_Moisture/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    format: "png",
    temporal: false,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 6,
  },

  // ── Atmosphere ────────────────────────────────────────────────────────────
  {
    id: "imerg-precip",
    label: "IMERG Precipitation (30min)",
    provider: "NASA GIBS",
    category: "weather",
    urlTemplate: gibs("IMERG_Precipitation_Rate", "GoogleMapsCompatible_Level6", "png", true),
    format: "png",
    temporal: true,
    cadence: "10min",
    attribution: "NASA GSFC / GIBS",
    maxZoom: 6,
  },
  {
    id: "aerosol-optical-depth",
    label: "Aerosol Optical Depth",
    provider: "NASA GIBS",
    category: "atmosphere",
    urlTemplate: gibs("MODIS_Combined_Value_Added_AOD", "GoogleMapsCompatible_Level6", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 6,
  },
  {
    id: "omi-aerosol-index",
    label: "OMI UV Aerosol Index",
    provider: "NASA GIBS",
    category: "atmosphere",
    urlTemplate: gibs("OMI_Aerosol_Index", "GoogleMapsCompatible_Level6", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 6,
  },
  {
    id: "ceres-solar",
    label: "MODIS Cloud Fraction (day)",
    provider: "NASA GIBS",
    category: "atmosphere",
    // CERES layers were retired from the WMTS "best" endpoint. Cloud fraction
    // is a comparable atmospheric quicklook that renders reliably.
    urlTemplate: gibs("MODIS_Terra_Cloud_Fraction_Day", "GoogleMapsCompatible_Level6", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 6,
  },

  // ── Hazards ───────────────────────────────────────────────────────────────
  {
    id: "flood-3day",
    label: "MODIS 3-Day Floods",
    provider: "NASA GIBS",
    category: "hazards",
    urlTemplate: gibs("MODIS_Combined_Flood_3-Day", "GoogleMapsCompatible_Level9", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 9,
  },

  // ── Cryosphere ────────────────────────────────────────────────────────────
  {
    id: "snow-ndsi",
    label: "Snow Cover NDSI",
    provider: "NASA GIBS",
    category: "cryosphere",
    urlTemplate: gibs("MODIS_Terra_NDSI_Snow_Cover", "GoogleMapsCompatible_Level8", "png", true),
    format: "png",
    temporal: true,
    cadence: "daily",
    attribution: "NASA EOSDIS GIBS",
    maxZoom: 8,
  },

  // ── Night lights ──────────────────────────────────────────────────────────
  {
    id: "black-marble",
    label: "Black Marble (night lights)",
    provider: "NASA GIBS",
    category: "nightlights",
    urlTemplate: gibs("VIIRS_Black_Marble", "GoogleMapsCompatible_Level8", "png", false),
    format: "png",
    temporal: false,
    cadence: "annual",
    attribution: "NASA Black Marble / GIBS",
    maxZoom: 8,
  },

  // ── Elevation / relief ────────────────────────────────────────────────────
  {
    id: "terrarium",
    label: "Terrarium DEM (Mapzen)",
    provider: "Mapzen/AWS",
    category: "elevation",
    urlTemplate: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    format: "png",
    temporal: false,
    cadence: "static",
    attribution: "Mapzen / ALOS AW3D30 (AWS Open Data)",
    maxZoom: 15,
  },
  {
    id: "hillshade",
    label: "OSM US Hillshade",
    provider: "OpenStreetMap US",
    category: "elevation",
    urlTemplate: "https://tiles.openstreetmap.us/raster/hillshade/{z}/{x}/{y}.jpg",
    format: "jpg",
    temporal: false,
    cadence: "static",
    attribution: "OpenStreetMap US · ALOS AW3D30",
    maxZoom: 15,
  },
] as const;

/** Substitute `{date}` in a GIBS template with a YYYY-MM-DD string. */
export function buildEarthLayerUrl(layer: EarthLayerDef, date?: Date | string): string {
  if (!layer.temporal) return layer.urlTemplate;
  const d = typeof date === "string" ? date : formatIsoDate(date ?? mostRecentGibsDate());
  return layer.urlTemplate.replace("{date}", d);
}

/** GIBS temporal layers usually lag ~1 day. */
export function mostRecentGibsDate(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function formatIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RainViewer (radar / infrared)
// ─────────────────────────────────────────────────────────────────────────────

export interface RainViewerFrame {
  /** UNIX epoch seconds. */
  time: number;
  /** Path used to build tile URLs. */
  path: string;
}

export interface RainViewerIndex {
  host: string;
  radar: { past: RainViewerFrame[]; nowcast: RainViewerFrame[] };
  satellite: { infrared: RainViewerFrame[] };
  /** Build a radar tile URL for a frame. */
  radarTileUrl(frame: RainViewerFrame, opts?: { color?: number; smooth?: 0 | 1; snow?: 0 | 1; size?: 256 | 512 }): string;
  /** Build an infrared satellite tile URL for a frame. */
  satelliteTileUrl(frame: RainViewerFrame, opts?: { color?: number; size?: 256 | 512 }): string;
}

export function useRainViewerFrames(refreshMs = 5 * 60_000) {
  const [index, setIndex] = useState<RainViewerIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`RainViewer ${r.status}`);
        const j = await r.json();
        if (!alive) return;
        const host: string = j.host ?? "https://tilecache.rainviewer.com";
        const radar = {
          past: (j.radar?.past ?? []) as RainViewerFrame[],
          nowcast: (j.radar?.nowcast ?? []) as RainViewerFrame[],
        };
        const satellite = {
          infrared: (j.satellite?.infrared ?? []) as RainViewerFrame[],
        };
        setIndex({
          host,
          radar,
          satellite,
          radarTileUrl(frame, opts) {
            const color = opts?.color ?? 1;
            const smooth = opts?.smooth ?? 1;
            const snow = opts?.snow ?? 1;
            const size = opts?.size ?? 256;
            return `${host}${frame.path}/${size}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`;
          },
          satelliteTileUrl(frame, opts) {
            const color = opts?.color ?? 0;
            const size = opts?.size ?? 256;
            return `${host}${frame.path}/${size}/{z}/{x}/{y}/${color}/0_0.png`;
          },
        });
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setError(String((e as Error).message ?? e));
        setLoading(false);
      }
    };
    void load();
    const t = window.setInterval(load, refreshMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [refreshMs]);

  return { index, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// USGS earthquakes (via edge proxy)
// ─────────────────────────────────────────────────────────────────────────────

export type QuakeFeed =
  | "significant_hour" | "significant_day" | "significant_week" | "significant_month"
  | "4.5_hour" | "4.5_day" | "4.5_week" | "4.5_month"
  | "2.5_hour" | "2.5_day" | "2.5_week" | "2.5_month"
  | "1.0_hour" | "1.0_day" | "1.0_week" | "1.0_month"
  | "all_hour"  | "all_day"  | "all_week"  | "all_month";

export interface EarthquakeFeature {
  id: string;
  type: "Feature";
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    updated: number;
    tsunami: 0 | 1;
    alert: string | null;
    url: string;
    title: string;
  };
  geometry: { type: "Point"; coordinates: [number, number, number] };
}

export function useEarthquakes(feed: QuakeFeed = "2.5_day", refreshMs = 60_000) {
  const [features, setFeatures] = useState<EarthquakeFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data, error: err } = await supabase.functions.invoke("earthquake-data", {
          body: null,
          method: "GET" as any,
          // supabase-js appends query params via URL — fall back to fetch when needed.
        });
        // supabase.functions.invoke does not accept query params directly; use raw URL when feed != default.
        if (err) throw err;
        if (!alive) return;
        const feats = (data as any)?.features ?? [];
        setFeatures(feats);
        setLoading(false);
      } catch (_e) {
        // Fallback: direct edge URL with feed query param.
        try {
          const projectRef = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ?? "";
          const url = projectRef
            ? `https://${projectRef}.functions.supabase.co/earthquake-data?feed=${encodeURIComponent(feed)}`
            : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/earthquake-data?feed=${encodeURIComponent(feed)}`;
          const r = await fetch(url, {
            headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
          });
          const j = await r.json();
          if (!alive) return;
          setFeatures(j?.features ?? []);
          setLoading(false);
        } catch (e2) {
          if (!alive) return;
          setError(String((e2 as Error).message ?? e2));
          setLoading(false);
        }
      }
    };
    void load();
    const t = window.setInterval(load, refreshMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [feed, refreshMs]);

  return { features, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Blitzortung lightning (via edge proxy)
// ─────────────────────────────────────────────────────────────────────────────

export interface LightningStrike {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { time?: number; [k: string]: unknown };
}

export function useLightning(slices?: number[], refreshMs = 30_000) {
  const key = useMemo(() => (slices ?? [0,1,2,3,4,5,6,7,8,9]).join(","), [slices]);
  const [features, setFeatures] = useState<LightningStrike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lightning-data?slices=${encodeURIComponent(key)}`;
        const r = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
        });
        if (!r.ok) throw new Error(`edge ${r.status}`);
        const j = await r.json();
        if (!alive) return;
        setFeatures((j?.features ?? []) as LightningStrike[]);
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setError(String((e as Error).message ?? e));
        setLoading(false);
      }
    };
    void load();
    const t = window.setInterval(load, refreshMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [key, refreshMs]);

  return { features, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOAA NHC active hurricanes (ArcGIS FeatureServer)
// ─────────────────────────────────────────────────────────────────────────────

const NHC_BASE =
  "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer";

export interface HurricaneData {
  positions: any;
  tracks: any;
  cones: any;
}

export function useActiveHurricanes(refreshMs = 5 * 60_000) {
  const [data, setData] = useState<HurricaneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const q = "where=1%3D1&outFields=*&f=geojson";
      try {
        const [positions, tracks, cones] = await Promise.all([
          fetch(`${NHC_BASE}/0/query?${q}`, { signal: ac.signal }).then((r) => r.json()),
          fetch(`${NHC_BASE}/2/query?${q}`, { signal: ac.signal }).then((r) => r.json()),
          fetch(`${NHC_BASE}/4/query?${q}`, { signal: ac.signal }).then((r) => r.json()),
        ]);
        if (!alive) return;
        setData({ positions, tracks, cones });
        setLoading(false);
      } catch (e) {
        if (!alive || (e as any)?.name === "AbortError") return;
        setError(String((e as Error).message ?? e));
        setLoading(false);
      }
    };
    void load();
    const t = window.setInterval(load, refreshMs);
    return () => {
      alive = false;
      window.clearInterval(t);
      abortRef.current?.abort();
    };
  }, [refreshMs]);

  return { data, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined convenience hook
// ─────────────────────────────────────────────────────────────────────────────

export function useEarthIntelligence() {
  const rain = useRainViewerFrames();
  const quakes = useEarthquakes("2.5_day");
  const lightning = useLightning();
  const hurricanes = useActiveHurricanes();
  return { layers: EARTH_LAYERS, rain, quakes, lightning, hurricanes };
}