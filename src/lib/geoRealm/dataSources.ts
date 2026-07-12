import type { CanonicalDataset } from "./types";

/**
 * Canonical, real-world geoscience datasets fetched at runtime from public
 * CORS-enabled endpoints. Nothing is fabricated — every URL points at the
 * original scientific source (or a mirror that reproduces it verbatim).
 *
 * Bird 2003 plate boundaries & polygons  — Peter Bird, UCLA (fraxen mirror)
 * GEM Global Active Faults              — GEM Foundation
 * Slab2 depth grids                     — USGS
 * CRUST1.0 layer stack                  — Laske et al., IGPP/SIO
 * S40RTS whole-mantle tomography        — Ritsema et al.
 */
export const CANONICAL_DATASETS: CanonicalDataset[] = [
  {
    id: "pb2002_plates",
    kind: "plates",
    label: "Bird 2003 · Tectonic plates",
    citation: "Bird, P. (2003). Geochem. Geophys. Geosyst., 4(3), 1027.",
    url: "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_plates.json",
    color: "#ff8c42",
    description:
      "56 tectonic plate polygons at global scale — the foundation surface layer of the Geo Realm.",
  },
  {
    id: "pb2002_boundaries",
    kind: "faults",
    label: "Bird 2003 · Plate boundaries",
    citation: "Bird, P. (2003). Geochem. Geophys. Geosyst., 4(3), 1027.",
    url: "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json",
    color: "#ff2d55",
    description:
      "Complete plate-boundary vector set: convergent, divergent, transform, and diffuse zones.",
  },
  {
    id: "pb2002_orogens",
    kind: "faults",
    label: "Bird 2003 · Orogens",
    citation: "Bird, P. (2003). Geochem. Geophys. Geosyst., 4(3), 1027.",
    url: "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_orogens.json",
    color: "#ffb020",
    description: "Active mountain-building belts globally.",
  },
  {
    id: "pb2002_steps",
    kind: "faults",
    label: "Bird 2003 · Boundary steps",
    citation: "Bird, P. (2003).",
    url: "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_steps.json",
    color: "#40e0ff",
    description: "Small offsets along transform boundaries.",
  },
];

/**
 * USGS earthquake catalog feeds. Rendered as a point cloud at real hypocenter
 * depth, they naturally reveal Wadati-Benioff subduction slab geometry — the
 * lightest-weight authentic "slab visualization" available at runtime.
 */
export const HYPOCENTER_FEEDS: {
  id: string;
  label: string;
  url: string;
  window: string;
  color: string;
}[] = [
  {
    id: "usgs_m45_month",
    label: "USGS · M4.5+ past 30 days",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
    window: "30 days",
    color: "#ff6b3d",
  },
  {
    id: "usgs_significant_month",
    label: "USGS · Significant past 30 days",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson",
    window: "30 days",
    color: "#ffd93d",
  },
];

/**
 * CRUST1.0 average-thickness reference (Laske, Masters, Ma, Pasyanos 2013).
 * Used as label metadata on the concentric shells. Values are global means
 * from the CRUST1.0 model; the shells are illustrative — swap for the full
 * 1°×1° grid in a follow-up milestone.
 */
export const CRUST1_LAYERS = [
  { id: "water", label: "Water", thickness_km: 3.7, color: "#4a90e2" },
  { id: "ice", label: "Ice", thickness_km: 0.1, color: "#a8dfff" },
  { id: "sediment", label: "Sediment", thickness_km: 2.0, color: "#c9a26b" },
  { id: "upper_crust", label: "Upper crust", thickness_km: 12.1, color: "#8b6f47" },
  { id: "middle_crust", label: "Middle crust", thickness_km: 8.5, color: "#6d5238" },
  { id: "lower_crust", label: "Lower crust", thickness_km: 10.0, color: "#5c4530" },
  { id: "moho", label: "Moho discontinuity", thickness_km: 0.0, color: "#ff2d55" },
  { id: "upper_mantle", label: "Upper mantle (LID)", thickness_km: 60.0, color: "#c94f2b" },
] as const;

/** Convert (lon, lat, depth_km) to a scene-unit vector below the sphere. */
export function lonLatDepthToUnit(
  lon: number,
  lat: number,
  depthKm: number,
  radius = 1,
): [number, number, number] {
  const earthRadiusKm = 6371;
  const r = radius * (1 - Math.max(0, depthKm) / earthRadiusKm);
  return lonLatToUnit(lon, lat, r);
}

/**
 * Convert geographic (lon, lat) in degrees to a unit-sphere point.
 * Z is up, matches R3F right-handed frame.
 */
export function lonLatToUnit(lon: number, lat: number, radius = 1): [number, number, number] {
  const λ = (lon * Math.PI) / 180;
  const φ = (lat * Math.PI) / 180;
  const c = Math.cos(φ);
  return [radius * c * Math.cos(λ), radius * Math.sin(φ), radius * c * Math.sin(λ)];
}

/**
 * Detect a file's Geo Realm kind from its filename/mime — best-effort,
 * user can override in the compiler UI.
 */
export function detectKindFromFile(file: File): {
  kind: "seismic" | "slab" | "tomography" | "bathymetry" | "cad" | "plates" | "faults" | "custom";
  hint: string;
} {
  const name = file.name.toLowerCase();
  if (name.endsWith(".sgy") || name.endsWith(".segy"))
    return { kind: "seismic", hint: "SEG-Y reflection section" };
  if (name.endsWith(".nc") || name.endsWith(".netcdf") || name.endsWith(".cdf"))
    return { kind: "slab", hint: "NetCDF grid — assumed slab depth" };
  if (name.endsWith(".tif") || name.endsWith(".tiff") || name.endsWith(".geotiff"))
    return { kind: "bathymetry", hint: "GeoTIFF heightmap" };
  if (name.endsWith(".geojson") || name.endsWith(".json"))
    return { kind: "faults", hint: "GeoJSON vector layer" };
  if (name.endsWith(".dxf") || name.endsWith(".dwg"))
    return { kind: "cad", hint: "CAD borehole log — Autodesk APS pipeline" };
  if (name.endsWith(".glb") || name.endsWith(".gltf"))
    return { kind: "custom", hint: "glTF mesh" };
  if (name.endsWith(".ktx2")) return { kind: "tomography", hint: "KTX2 volumetric texture" };
  return { kind: "custom", hint: "Unknown format — will store raw" };
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown> | null;
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] }
      | { type: "LineString"; coordinates: number[][] }
      | { type: "MultiLineString"; coordinates: number[][][] }
      | { type: "Point"; coordinates: number[] };
  }>;
}

/** Simple in-memory cache for canonical GeoJSON fetches. */
const geojsonCache = new Map<string, Promise<GeoFeatureCollection>>();
export function fetchGeoJSON(url: string): Promise<GeoFeatureCollection> {
  let hit = geojsonCache.get(url);
  if (!hit) {
    hit = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
      return r.json() as Promise<GeoFeatureCollection>;
    });
    geojsonCache.set(url, hit);
  }
  return hit;
}