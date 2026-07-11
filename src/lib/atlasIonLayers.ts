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
import { Cesium3DTileset, type Viewer } from "cesium";

export type IonLayerGroup = "vexcel" | "japan" | "custom";

export interface IonLayerEntry {
  id: string;           // stable slug (used as storage key + primitive tag)
  name: string;
  group: IonLayerGroup;
  assetId: number;      // Cesium ion asset ID
  description?: string;
  builtin?: boolean;    // catalog entry (cannot be deleted)
}

/**
 * Curated starter catalog. Users can Enable / Disable each one; every entry
 * is safe to keep dormant until the user toggles it (nothing loads until
 * `ensureIonLayer` is called).
 *
 * Japan 3D Buildings: MLIT PLATEAU countrywide dataset (~23M buildings).
 * Vexcel 3D Cities:   sample metros — the user swaps to their own ion asset
 *                     IDs once they've subscribed to the desired cities.
 */
export const ION_LAYER_CATALOG: IonLayerEntry[] = [
  {
    id: "japan-3d-buildings",
    name: "Japan 3D Buildings (PLATEAU)",
    group: "japan",
    assetId: 2602753,
    description: "MLIT PLATEAU · 23M buildings across Japan",
    builtin: true,
  },
  {
    id: "vexcel-graz",
    name: "Vexcel 3D — Graz",
    group: "vexcel",
    assetId: 2465692,
    description: "Vexcel Data Program sample city",
    builtin: true,
  },
];

const STORAGE_KEY = "atlas.ionLayers.v1";

interface Persisted {
  enabled: Record<string, boolean>;
  custom: Array<{ id: string; name: string; assetId: number }>;
}

const loadState = (): Persisted => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: {}, custom: [] };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return { enabled: parsed.enabled ?? {}, custom: parsed.custom ?? [] };
  } catch { return { enabled: {}, custom: [] }; }
};

const saveState = (s: Persisted) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
};

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
  const map = bag(viewer);
  let ts = map.get(entry.id) ?? null;
  if (!ts) {
    try {
      ts = await Cesium3DTileset.fromIonAssetId(entry.assetId);
    } catch (err) {
      console.warn(`[atlasIonLayers] asset ${entry.assetId} failed`, err);
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
  const ts = await ensureIonLayer(viewer, entry, true);
  if (!ts) return;
  try { await (viewer as any).flyTo(ts, { duration: 2.5 }); } catch {}
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