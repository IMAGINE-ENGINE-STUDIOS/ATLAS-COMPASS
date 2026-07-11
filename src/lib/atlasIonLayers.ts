/**
 * atlasIonLayers
 * ---------------
 * Manages named Cesium ion 3D Tilesets that stream on TOP of whichever base
 * map mode is active (Google Photoreal / Realistic / OSM / Mapbox). This is
 * where Vexcel 3D Cities and the countrywide Japan 3D Buildings (MLIT
 * PLATEAU) live — both are packaged as OGC 3D Tiles and hosted on Cesium ion,
 * so all we need is the ion asset ID + a fly-to helper.
 *
 * NOTE: Vexcel 3D Cities is a curated Cesium ion collection of ~60 metro
 * areas. Each city ships as its own asset ID that the user must first "Add to
 * my assets" from Cesium ion → Asset Depot. We expose a small starter catalog
 * and an "Add by asset ID" input so users can wire additional cities without
 * touching code.
 */
import { Cesium3DTileset, Ion, type Viewer } from "cesium";

export type IonLayerGroup = "vexcel" | "japan" | "custom";

export interface IonLayerEntry {
  id: string;           // stable slug (used as storage key + primitive tag)
  name: string;
  group: IonLayerGroup;
  assetId: number;      // Cesium ion asset ID
  description?: string;
  builtin?: boolean;    // catalog entry (cannot be deleted)
  /**
   * Optional fly-to target so cities can be jumped-to even when the asset ID
   * hasn't been configured yet (Vexcel is per-account) or when the entry
   * shares a countrywide tileset (Japan PLATEAU).
   */
  flyTo?: { lat: number; lng: number; heightM?: number };
  /**
   * When true, this entry cannot stream on its own (assetId placeholder) and
   * the user must supply their own Cesium ion asset ID before enabling. The
   * toggle UI will prompt for one.
   */
  needsAssetId?: boolean;
}

/**
 * Curated starter catalog covering Vexcel 3D Cities (all ~60 metros) and
 * Japan PLATEAU cities. Vexcel metros are per-account on Cesium ion so we
 * ship them with a placeholder `assetId: 0` + `needsAssetId: true`; the UI
 * prompts the user for their ion asset ID on first toggle (persisted as an
 * override — see {@link setAssetIdOverride}). Every entry has a `flyTo` so
 * users can jump the camera even before the tileset is wired.
 */
const JAPAN_COUNTRYWIDE_ASSET = 2602753;

// Vexcel 3D Cities catalog — every entry shares the same tileset shape
// (per-account asset). Users add their own ion asset ID once and it is
// remembered across sessions.
const VEXCEL_METROS: Array<{ id: string; name: string; lat: number; lng: number }> = [
  { id: "vexcel-amsterdam",     name: "Amsterdam",       lat: 52.3676, lng: 4.9041 },
  { id: "vexcel-atlanta",       name: "Atlanta",         lat: 33.7490, lng: -84.3880 },
  { id: "vexcel-austin",        name: "Austin",          lat: 30.2672, lng: -97.7431 },
  { id: "vexcel-barcelona",     name: "Barcelona",       lat: 41.3874, lng: 2.1686 },
  { id: "vexcel-berlin",        name: "Berlin",          lat: 52.5200, lng: 13.4050 },
  { id: "vexcel-birmingham",    name: "Birmingham (UK)", lat: 52.4862, lng: -1.8904 },
  { id: "vexcel-boston",        name: "Boston",          lat: 42.3601, lng: -71.0589 },
  { id: "vexcel-brisbane",      name: "Brisbane",        lat: -27.4698, lng: 153.0251 },
  { id: "vexcel-brussels",      name: "Brussels",        lat: 50.8503, lng: 4.3517 },
  { id: "vexcel-charlotte",     name: "Charlotte",       lat: 35.2271, lng: -80.8431 },
  { id: "vexcel-chicago",       name: "Chicago",         lat: 41.8781, lng: -87.6298 },
  { id: "vexcel-columbus",      name: "Columbus",        lat: 39.9612, lng: -82.9988 },
  { id: "vexcel-copenhagen",    name: "Copenhagen",      lat: 55.6761, lng: 12.5683 },
  { id: "vexcel-dallas",        name: "Dallas",          lat: 32.7767, lng: -96.7970 },
  { id: "vexcel-denver",        name: "Denver",          lat: 39.7392, lng: -104.9903 },
  { id: "vexcel-detroit",       name: "Detroit",         lat: 42.3314, lng: -83.0458 },
  { id: "vexcel-dublin",        name: "Dublin",          lat: 53.3498, lng: -6.2603 },
  { id: "vexcel-frankfurt",     name: "Frankfurt",       lat: 50.1109, lng: 8.6821 },
  { id: "vexcel-graz",          name: "Graz",            lat: 47.0707, lng: 15.4395 },
  { id: "vexcel-hamburg",       name: "Hamburg",         lat: 53.5511, lng: 9.9937 },
  { id: "vexcel-helsinki",      name: "Helsinki",        lat: 60.1699, lng: 24.9384 },
  { id: "vexcel-houston",       name: "Houston",         lat: 29.7604, lng: -95.3698 },
  { id: "vexcel-indianapolis",  name: "Indianapolis",    lat: 39.7684, lng: -86.1581 },
  { id: "vexcel-jacksonville",  name: "Jacksonville",    lat: 30.3322, lng: -81.6557 },
  { id: "vexcel-kansas-city",   name: "Kansas City",     lat: 39.0997, lng: -94.5786 },
  { id: "vexcel-las-vegas",     name: "Las Vegas",       lat: 36.1699, lng: -115.1398 },
  { id: "vexcel-leeds",         name: "Leeds",           lat: 53.8008, lng: -1.5491 },
  { id: "vexcel-lisbon",        name: "Lisbon",          lat: 38.7223, lng: -9.1393 },
  { id: "vexcel-liverpool",     name: "Liverpool",       lat: 53.4084, lng: -2.9916 },
  { id: "vexcel-london",        name: "London",          lat: 51.5074, lng: -0.1278 },
  { id: "vexcel-los-angeles",   name: "Los Angeles",     lat: 34.0522, lng: -118.2437 },
  { id: "vexcel-madrid",        name: "Madrid",          lat: 40.4168, lng: -3.7038 },
  { id: "vexcel-manchester",    name: "Manchester",      lat: 53.4808, lng: -2.2426 },
  { id: "vexcel-melbourne",     name: "Melbourne",       lat: -37.8136, lng: 144.9631 },
  { id: "vexcel-mexico-city",   name: "Mexico City",     lat: 19.4326, lng: -99.1332 },
  { id: "vexcel-miami",         name: "Miami",           lat: 25.7617, lng: -80.1918 },
  { id: "vexcel-milan",         name: "Milan",           lat: 45.4642, lng: 9.1900 },
  { id: "vexcel-minneapolis",   name: "Minneapolis",     lat: 44.9778, lng: -93.2650 },
  { id: "vexcel-montreal",      name: "Montréal",        lat: 45.5017, lng: -73.5673 },
  { id: "vexcel-munich",        name: "Munich",          lat: 48.1351, lng: 11.5820 },
  { id: "vexcel-nashville",     name: "Nashville",       lat: 36.1627, lng: -86.7816 },
  { id: "vexcel-new-orleans",   name: "New Orleans",     lat: 29.9511, lng: -90.0715 },
  { id: "vexcel-new-york",      name: "New York",        lat: 40.7128, lng: -74.0060 },
  { id: "vexcel-oslo",          name: "Oslo",            lat: 59.9139, lng: 10.7522 },
  { id: "vexcel-paris",         name: "Paris",           lat: 48.8566, lng: 2.3522 },
  { id: "vexcel-perth",         name: "Perth",           lat: -31.9505, lng: 115.8605 },
  { id: "vexcel-philadelphia",  name: "Philadelphia",    lat: 39.9526, lng: -75.1652 },
  { id: "vexcel-phoenix",       name: "Phoenix",         lat: 33.4484, lng: -112.0740 },
  { id: "vexcel-pittsburgh",    name: "Pittsburgh",      lat: 40.4406, lng: -79.9959 },
  { id: "vexcel-portland",      name: "Portland",        lat: 45.5152, lng: -122.6784 },
  { id: "vexcel-prague",        name: "Prague",          lat: 50.0755, lng: 14.4378 },
  { id: "vexcel-rome",          name: "Rome",            lat: 41.9028, lng: 12.4964 },
  { id: "vexcel-san-antonio",   name: "San Antonio",     lat: 29.4241, lng: -98.4936 },
  { id: "vexcel-san-diego",     name: "San Diego",       lat: 32.7157, lng: -117.1611 },
  { id: "vexcel-san-francisco", name: "San Francisco",   lat: 37.7749, lng: -122.4194 },
  { id: "vexcel-seattle",       name: "Seattle",         lat: 47.6062, lng: -122.3321 },
  { id: "vexcel-stockholm",     name: "Stockholm",       lat: 59.3293, lng: 18.0686 },
  { id: "vexcel-sydney",        name: "Sydney",          lat: -33.8688, lng: 151.2093 },
  { id: "vexcel-toronto",       name: "Toronto",         lat: 43.6532, lng: -79.3832 },
  { id: "vexcel-vancouver",     name: "Vancouver",       lat: 49.2827, lng: -123.1207 },
  { id: "vexcel-vienna",        name: "Vienna",          lat: 48.2082, lng: 16.3738 },
  { id: "vexcel-warsaw",        name: "Warsaw",          lat: 52.2297, lng: 21.0122 },
  { id: "vexcel-washington-dc", name: "Washington DC",   lat: 38.9072, lng: -77.0369 },
  { id: "vexcel-zurich",        name: "Zurich",          lat: 47.3769, lng: 8.5417 },
];

// Japan PLATEAU city presets — all share the same countrywide asset so
// toggling any one enables the full Japan tileset; the flyTo lets users
// hop between wards without hunting the map manually.
const JAPAN_CITIES: Array<{ id: string; name: string; lat: number; lng: number }> = [
  { id: "japan-tokyo",     name: "Tokyo 23 Wards",  lat: 35.6762, lng: 139.6503 },
  { id: "japan-yokohama",  name: "Yokohama",        lat: 35.4437, lng: 139.6380 },
  { id: "japan-osaka",     name: "Osaka",           lat: 34.6937, lng: 135.5023 },
  { id: "japan-nagoya",    name: "Nagoya",          lat: 35.1815, lng: 136.9066 },
  { id: "japan-sapporo",   name: "Sapporo",         lat: 43.0621, lng: 141.3544 },
  { id: "japan-fukuoka",   name: "Fukuoka",         lat: 33.5904, lng: 130.4017 },
  { id: "japan-kobe",      name: "Kobe",            lat: 34.6901, lng: 135.1955 },
  { id: "japan-kyoto",     name: "Kyoto",           lat: 35.0116, lng: 135.7681 },
  { id: "japan-sendai",    name: "Sendai",          lat: 38.2682, lng: 140.8694 },
  { id: "japan-hiroshima", name: "Hiroshima",       lat: 34.3853, lng: 132.4553 },
  { id: "japan-kawasaki",  name: "Kawasaki",        lat: 35.5308, lng: 139.7029 },
  { id: "japan-saitama",   name: "Saitama",         lat: 35.8617, lng: 139.6455 },
  { id: "japan-chiba",     name: "Chiba",           lat: 35.6074, lng: 140.1065 },
  { id: "japan-shizuoka",  name: "Shizuoka",        lat: 34.9756, lng: 138.3828 },
  { id: "japan-okayama",   name: "Okayama",         lat: 34.6551, lng: 133.9195 },
];

export const ION_LAYER_CATALOG: IonLayerEntry[] = [
  // Japan countrywide master + per-city presets (all reuse master asset).
  {
    id: "japan-3d-buildings",
    name: "Japan 3D Buildings (PLATEAU)",
    group: "japan",
    assetId: JAPAN_COUNTRYWIDE_ASSET,
    description: "MLIT PLATEAU · 23M buildings countrywide",
    builtin: true,
  },
  ...JAPAN_CITIES.map<IonLayerEntry>((c) => ({
    id: c.id,
    name: `Japan — ${c.name}`,
    group: "japan",
    assetId: JAPAN_COUNTRYWIDE_ASSET,
    description: "PLATEAU countrywide · fly-to preset",
    builtin: true,
    flyTo: { lat: c.lat, lng: c.lng, heightM: 2500 },
  })),
  ...VEXCEL_METROS.map<IonLayerEntry>((c) => ({
    id: c.id,
    name: `Vexcel — ${c.name}`,
    group: "vexcel",
    assetId: c.id === "vexcel-graz" ? 2465692 : 0,
    description: c.id === "vexcel-graz"
      ? "Vexcel Data Program sample city"
      : "Vexcel 3D Cities · needs ion asset ID",
    builtin: true,
    flyTo: { lat: c.lat, lng: c.lng, heightM: 2000 },
    needsAssetId: c.id !== "vexcel-graz",
  })),
];

const STORAGE_KEY = "atlas.ionLayers.v2";

interface Persisted {
  enabled: Record<string, boolean>;
  custom: Array<{ id: string; name: string; assetId: number }>;
  /** Per-entry asset ID overrides for placeholder catalog entries. */
  overrides?: Record<string, number>;
}

const loadState = (): Persisted => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: {}, custom: [], overrides: {} };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      enabled: parsed.enabled ?? {},
      custom: parsed.custom ?? [],
      overrides: parsed.overrides ?? {},
    };
  } catch { return { enabled: {}, custom: [], overrides: {} }; }
};

const saveState = (s: Persisted) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
};

export const getAssetIdOverride = (id: string): number | undefined =>
  loadState().overrides?.[id];

export const setAssetIdOverride = (id: string, assetId: number) => {
  const s = loadState();
  s.overrides = { ...(s.overrides ?? {}), [id]: assetId };
  saveState(s);
};

/** Resolve the effective asset ID, applying user override if present. */
export const resolveAssetId = (entry: IonLayerEntry): number =>
  getAssetIdOverride(entry.id) ?? entry.assetId;

export const getIonLayerEnabled = (id: string): boolean =>
  !!loadState().enabled[id];

export const setIonLayerEnabled = (id: string, on: boolean) => {
  const s = loadState();
  s.enabled[id] = on;
  saveState(s);
};

export const listCustomIonLayers = (): IonLayerEntry[] =>
  loadState().custom.map((c) => ({
    id: c.id, name: c.name, assetId: c.assetId, group: "custom",
  }));

export const addCustomIonLayer = (name: string, assetId: number): IonLayerEntry => {
  const s = loadState();
  const id = `custom-${assetId}`;
  if (!s.custom.some((c) => c.id === id)) {
    s.custom.push({ id, name: name || `Ion ${assetId}`, assetId });
    saveState(s);
  }
  return { id, name: name || `Ion ${assetId}`, assetId, group: "custom" };
};

export const removeCustomIonLayer = (id: string) => {
  const s = loadState();
  s.custom = s.custom.filter((c) => c.id !== id);
  delete s.enabled[id];
  saveState(s);
};

export const listAllIonLayers = (): IonLayerEntry[] =>
  [...ION_LAYER_CATALOG, ...listCustomIonLayers()];

/** Registry of live tilesets per viewer, keyed by layer id. */
const bag = (viewer: any): Map<string, Cesium3DTileset> => {
  if (!viewer.__ionCommunityTilesets) viewer.__ionCommunityTilesets = new Map();
  return viewer.__ionCommunityTilesets;
};

/** Ensure the tileset is loaded + added to the scene; toggles `show`. */
export const ensureIonLayer = async (
  viewer: Viewer,
  entry: IonLayerEntry,
  visible: boolean,
): Promise<Cesium3DTileset | null> => {
  if (!viewer || (viewer as any).isDestroyed?.()) return null;
  const assetId = resolveAssetId(entry);
  if (!assetId || assetId <= 0) return null;
  const map = bag(viewer);
  let ts = map.get(entry.id) ?? null;
  if (!ts) {
    try {
      ts = await Cesium3DTileset.fromIonAssetId(assetId);
    } catch (err) {
      console.warn(`[atlasIonLayers] asset ${assetId} failed`, err);
      return null;
    }
    if ((viewer as any).isDestroyed?.()) { try { ts.destroy?.(); } catch {} return null; }
    (ts as any).__ionLayerId = entry.id;
    (ts as any).__ionLayerName = entry.name;
    viewer.scene.primitives.add(ts);
    map.set(entry.id, ts);
  }
  ts.show = visible;
  viewer.scene.requestRender?.();
  return ts;
};

export const removeIonLayerPrimitive = (viewer: Viewer, id: string) => {
  const map = bag(viewer);
  const ts = map.get(id);
  if (!ts) return;
  try { viewer.scene.primitives.remove(ts); } catch {}
  map.delete(id);
  viewer.scene.requestRender?.();
};

/** Fly the camera to a layer's bounding sphere. */
export const flyToIonLayer = async (viewer: Viewer, entry: IonLayerEntry) => {
  // Prefer the tileset bounding sphere when available; otherwise fall back to
  // the entry's declared flyTo coords so Vexcel/PLATEAU city presets still
  // navigate the camera even before an asset ID has been supplied.
  const ts = await ensureIonLayer(viewer, entry, true);
  if (ts) {
    try { await (viewer as any).flyTo(ts, { duration: 2.0 }); return; } catch {}
  }
  if (entry.flyTo) {
    try {
      const { Cartesian3 } = await import("cesium");
      const height = entry.flyTo.heightM ?? 2500;
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(entry.flyTo.lng, entry.flyTo.lat, height),
        duration: 2.0,
      });
    } catch {}
  }
};

/**
 * Rehydrate previously enabled layers. Call once after the Cesium viewer
 * exists so users see the same overlays after a reload.
 */
export const restoreEnabledIonLayers = async (viewer: Viewer) => {
  const s = loadState();
  const entries = listAllIonLayers();
  for (const e of entries) {
    if (s.enabled[e.id]) {
      try { await ensureIonLayer(viewer, e, true); } catch {}
    }
  }
};

// ─── Ion asset validation ──────────────────────────────────────────────────
// Confirms that a Cesium ion asset ID is real, that the current access token
// is authorised to read it, and that it is served as a 3D Tileset. Hits the
// ion REST endpoint directly so we don't have to spin up a full tileset in
// the scene just to know if the ID works.

export type IonAssetStatus = "unchecked" | "checking" | "ok" | "error";
export interface IonAssetValidation {
  status: IonAssetStatus;
  checkedAt?: number;
  assetId?: number;
  type?: string;   // "3DTILES" when usable
  name?: string;
  error?: string;
}

const VALIDATION_KEY = "atlas.ionLayers.validation.v1";
const validationMem = new Map<string, IonAssetValidation>();
const validationListeners = new Set<() => void>();

const loadValidationCache = (): Record<string, IonAssetValidation> => {
  try {
    const raw = localStorage.getItem(VALIDATION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, IonAssetValidation>) : {};
  } catch { return {}; }
};
const saveValidationCache = (m: Record<string, IonAssetValidation>) => {
  try { localStorage.setItem(VALIDATION_KEY, JSON.stringify(m)); } catch {}
};
const writeValidation = (id: string, v: IonAssetValidation) => {
  validationMem.set(id, v);
  const cache = loadValidationCache();
  cache[id] = v;
  saveValidationCache(cache);
  validationListeners.forEach((fn) => { try { fn(); } catch {} });
};

/** Subscribe to validation changes (returns unsubscribe). */
export const onIonValidationChange = (fn: () => void): (() => void) => {
  validationListeners.add(fn);
  return () => { validationListeners.delete(fn); };
};

/** Read the last-known validation for an entry (mem or persisted cache). */
export const getIonLayerValidation = (id: string): IonAssetValidation => {
  const cached = validationMem.get(id);
  if (cached) return cached;
  const persisted = loadValidationCache()[id];
  if (persisted) { validationMem.set(id, persisted); return persisted; }
  return { status: "unchecked" };
};

/**
 * Ping the Cesium ion REST endpoint to check the asset resolves and is
 * accessible with the current access token. Result is cached in localStorage
 * so we don't hammer the API on every render.
 */
export const validateIonLayer = async (
  entry: IonLayerEntry,
  opts: { force?: boolean } = {},
): Promise<IonAssetValidation> => {
  const assetId = resolveAssetId(entry);
  if (!assetId || assetId <= 0) {
    const v: IonAssetValidation = { status: "error", error: "No asset ID configured", checkedAt: Date.now() };
    writeValidation(entry.id, v);
    return v;
  }
  // Re-use recent successful checks (24h) unless forced.
  const existing = getIonLayerValidation(entry.id);
  if (
    !opts.force &&
    existing.status === "ok" &&
    existing.assetId === assetId &&
    existing.checkedAt &&
    Date.now() - existing.checkedAt < 24 * 60 * 60 * 1000
  ) {
    return existing;
  }

  writeValidation(entry.id, { status: "checking", assetId });
  const token = Ion.defaultAccessToken;
  if (!token) {
    const v: IonAssetValidation = {
      status: "error",
      error: "No Cesium ion access token set",
      assetId,
      checkedAt: Date.now(),
    };
    writeValidation(entry.id, v);
    return v;
  }
  try {
    const res = await fetch(
      `https://api.cesium.com/v1/assets/${assetId}/endpoint?access_token=${encodeURIComponent(token)}`,
      { method: "GET" },
    );
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      let msg = res.status === 404
        ? "Asset not found — check the ID"
        : res.status === 401 || res.status === 403
          ? "Not authorised — add this asset to your Cesium ion account (Asset Depot → Add to my assets)"
          : `HTTP ${res.status}`;
      if (bodyText && bodyText.length < 200) msg += ` · ${bodyText}`;
      const v: IonAssetValidation = { status: "error", error: msg, assetId, checkedAt: Date.now() };
      writeValidation(entry.id, v);
      return v;
    }
    const data = await res.json().catch(() => ({} as any));
    const type: string | undefined = data?.type;
    if (type && type !== "3DTILES") {
      const v: IonAssetValidation = {
        status: "error",
        error: `Asset type is ${type}, not 3DTILES`,
        assetId,
        type,
        checkedAt: Date.now(),
      };
      writeValidation(entry.id, v);
      return v;
    }
    const v: IonAssetValidation = {
      status: "ok",
      assetId,
      type: type ?? "3DTILES",
      name: data?.name,
      checkedAt: Date.now(),
    };
    writeValidation(entry.id, v);
    return v;
  } catch (err: any) {
    const v: IonAssetValidation = {
      status: "error",
      error: err?.message || "Network error contacting Cesium ion",
      assetId,
      checkedAt: Date.now(),
    };
    writeValidation(entry.id, v);
    return v;
  }
};

/** Validate every currently-enabled layer in parallel. */
export const validateEnabledIonLayers = async (): Promise<IonAssetValidation[]> => {
  const s = loadState();
  const entries = listAllIonLayers().filter((e) => s.enabled[e.id]);
  return Promise.all(entries.map((e) => validateIonLayer(e, { force: true })));
};

/** True if every currently-enabled layer has a cached OK validation. */
export const areAllEnabledIonLayersValid = (): boolean => {
  const s = loadState();
  const entries = listAllIonLayers().filter((e) => s.enabled[e.id]);
  if (entries.length === 0) return true;
  return entries.every((e) => getIonLayerValidation(e.id).status === "ok");
};

/** Snapshot of validation problems for enabled layers (empty when clean). */
export const listEnabledIonLayerIssues = (): Array<{ entry: IonLayerEntry; validation: IonAssetValidation }> => {
  const s = loadState();
  return listAllIonLayers()
    .filter((e) => s.enabled[e.id])
    .map((entry) => ({ entry, validation: getIonLayerValidation(entry.id) }))
    .filter(({ validation }) => validation.status !== "ok");
};