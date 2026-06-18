// Lightweight atlas tag selection store.
// Tracks user-selected pins (business / POI / marketplace) so they can be
// rendered in gold and always-on-top across the Cesium scene.

export type SelectionKind = "biz" | "poi" | "market";

export interface SelectedTag {
  kind: SelectionKind;
  id: string;          // entity id (e.g. "biz-12345")
  name: string;
  lat: number;
  lng: number;
  category?: string;   // e.g. "restaurant", "shop", "hotel"
  website?: string;
  emoji?: string;
}

const STORAGE_KEY = "atlas_selected_tags";

function load(): Map<string, SelectedTag> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as SelectedTag[];
    return new Map(arr.map(t => [t.id, t]));
  } catch { return new Map(); }
}

function persist(map: Map<string, SelectedTag>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.values()))); } catch {}
}

const state = { map: load() };
const subs = new Set<() => void>();

function emit() { subs.forEach(fn => fn()); }

export function getSelected(): SelectedTag[] { return Array.from(state.map.values()); }
export function isSelected(id: string): boolean { return state.map.has(id); }
export function selectedCount(): number { return state.map.size; }

export function toggleSelected(tag: SelectedTag): boolean {
  if (state.map.has(tag.id)) {
    state.map.delete(tag.id);
    persist(state.map); emit();
    return false;
  }
  state.map.set(tag.id, tag);
  persist(state.map); emit();
  return true;
}

export function clearSelected() {
  if (state.map.size === 0) return;
  state.map.clear();
  persist(state.map); emit();
}

export function subscribeSelection(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Map an OSM amenity/shop value to a model-category id used in palette lookups. */
export function amenityToCategoryId(amenity: string | undefined): string {
  if (!amenity) return "other";
  const a = amenity.toLowerCase();
  if (/restaurant|fast_food|bar|pub|food_court/.test(a)) return "restaurant";
  if (/cafe|coffee/.test(a)) return "cafe";
  if (/hotel|motel|hostel|guest_house/.test(a)) return "hotel";
  if (/fuel|charging_station/.test(a)) return "fuel";
  if (/hospital|pharmacy|clinic|doctor|dentist|health/.test(a)) return "health";
  if (/landmark|monument|attraction/.test(a)) return "landmark";
  return "shop";
}