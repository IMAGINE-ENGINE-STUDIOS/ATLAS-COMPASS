/**
 * LevelManifest ("the manuscript")
 * --------------------------------
 * A signed JSON document that travels with every level. It declares the
 * volume the level owns on the planet (footprint × up to 10 km of vertical
 * column) and the rules that apply to physics, time, weather, audio, camera,
 * locomotion, rendering, networking and access whenever the camera /
 * character is inside that volume.
 *
 * The manifest lives on the `levels` row and is snapshotted onto every
 * `atlas_level_placements` row at upload time so a level update never
 * silently mutates a level that's already been dropped onto the Atlas.
 */

export const MANIFEST_VERSION = 1;

/** Hard cap on how far above ground the volume can extend. */
export const LEVEL_VOLUME_CEILING_M = 10_000;

export type LngLat = [number, number];

export interface LevelVolume {
  shape: "polygon" | "circle";
  /** Required when shape === "polygon". WGS84 [lng, lat]. */
  points?: LngLat[];
  /** Required when shape === "circle". */
  center?: LngLat;
  /** Required when shape === "circle". */
  radiusM?: number;
  /** Bottom of the volume in meters (relative to ellipsoid). Usually 0. */
  floorM: number;
  /** Top of the volume in meters. Clamped to LEVEL_VOLUME_CEILING_M. */
  ceilingM: number;
}

export interface LevelRules {
  physics: {
    gravity: number;        // m/s^2
    airDensity: number;     // kg/m^3, 1.225 = sea level Earth
    allowFlight: boolean;
  };
  time: {
    /** 0..24 — when set, time of day is locked to this value inside volume. */
    lockTimeOfDay?: number;
    /** Multiplier on global time scale (1 = realtime). */
    timeScale: number;
  };
  weather: {
    override?: "clear" | "rain" | "snow" | "fog";
    windMps?: number;
  };
  audio: {
    ambientBusId?: string;
    reverbPreset?: "none" | "room" | "hall" | "cave" | "outdoor";
    /** Master attenuation in dB applied while inside (negative = quieter). */
    masterDb: number;
  };
  camera: {
    minZoomM: number;
    maxZoomM: number;
    allowFreeFly: boolean;
  };
  locomotion: {
    defaultMode: "walk" | "drive" | "fly";
    allowSwitch: boolean;
    speedMul: number;
  };
  rendering: {
    hdriPackId?: string;
    fogColor?: string;
    shadowQuality: "off" | "low" | "high";
  };
  network: {
    multiplayer: boolean;
    maxPlayers: number;
  };
  access: {
    visibility: "public" | "unlisted" | "private";
    allowEdits: boolean;
  };
}

export interface LevelPackagePointer {
  /** Stable id of the package (one per level + version). */
  id: string;
  /** Semver-ish version string, e.g. "1.0.0". */
  version: string;
  /** SHA-256 of the .lvlpkg bytes (hex). */
  sha256: string;
  sizeBytes: number;
  /** Storage path inside the `level-packages` bucket. */
  storagePath: string;
}

export interface LevelManifest {
  manifestVersion: typeof MANIFEST_VERSION;
  levelId: string;
  name: string;
  authorId: string;
  createdAt: string; // ISO
  volume: LevelVolume;
  rules: LevelRules;
  /** May be omitted while the manifest is being authored before packing. */
  package?: LevelPackagePointer;
}

/** Sane default rules that match Earth-like behavior. */
export function defaultLevelRules(): LevelRules {
  return {
    physics:    { gravity: 9.81, airDensity: 1.225, allowFlight: false },
    time:       { timeScale: 1 },
    weather:    {},
    audio:      { reverbPreset: "outdoor", masterDb: 0 },
    camera:     { minZoomM: 1, maxZoomM: LEVEL_VOLUME_CEILING_M, allowFreeFly: true },
    locomotion: { defaultMode: "walk", allowSwitch: true, speedMul: 1 },
    rendering:  { shadowQuality: "low" },
    network:    { multiplayer: false, maxPlayers: 1 },
    access:     { visibility: "unlisted", allowEdits: false },
  };
}

/**
 * Build a brand-new manifest for a freshly-uploaded level. The volume
 * defaults to a circular footprint with the requested radius, centered on
 * the placement coordinate, and rises to the 10 km ceiling.
 */
export function buildDefaultManifest(args: {
  levelId: string;
  name: string;
  authorId: string;
  centerLngLat: LngLat;
  radiusM?: number;
}): LevelManifest {
  const radiusM = Math.max(1, args.radiusM ?? 250);
  return {
    manifestVersion: MANIFEST_VERSION,
    levelId: args.levelId,
    name: args.name,
    authorId: args.authorId,
    createdAt: new Date().toISOString(),
    volume: {
      shape: "circle",
      center: args.centerLngLat,
      radiusM,
      floorM: 0,
      ceilingM: LEVEL_VOLUME_CEILING_M,
    },
    rules: defaultLevelRules(),
  };
}

/** Cheap point-in-volume test (lng/lat/alt). */
export function isInsideVolume(
  v: LevelVolume,
  lng: number,
  lat: number,
  altM: number,
): boolean {
  if (altM < v.floorM || altM > Math.min(v.ceilingM, LEVEL_VOLUME_CEILING_M)) return false;
  if (v.shape === "circle" && v.center && v.radiusM) {
    return haversineMeters(v.center[0], v.center[1], lng, lat) <= v.radiusM;
  }
  if (v.shape === "polygon" && v.points && v.points.length >= 3) {
    return pointInPolygon(lng, lat, v.points);
  }
  return false;
}

function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pointInPolygon(lng: number, lat: number, poly: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Lightweight validation — returns an array of human-readable problems.
 * Empty array = manifest is internally consistent.
 */
export function validateManifest(m: LevelManifest): string[] {
  const errs: string[] = [];
  if (m.manifestVersion !== MANIFEST_VERSION) errs.push("Unsupported manifest version.");
  if (!m.levelId) errs.push("Missing levelId.");
  if (m.volume.ceilingM > LEVEL_VOLUME_CEILING_M) errs.push("Volume ceiling exceeds 10 km cap.");
  if (m.volume.ceilingM <= m.volume.floorM) errs.push("Volume ceiling must be above floor.");
  if (m.volume.shape === "circle" && (!m.volume.center || !m.volume.radiusM))
    errs.push("Circular volume requires center and radius.");
  if (m.volume.shape === "polygon" && (!m.volume.points || m.volume.points.length < 3))
    errs.push("Polygon volume needs at least 3 points.");
  if (m.rules.camera.minZoomM > m.rules.camera.maxZoomM)
    errs.push("Camera min zoom must be ≤ max zoom.");
  return errs;
}