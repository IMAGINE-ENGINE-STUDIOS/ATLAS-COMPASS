/**
 * BuildingSelectionGroup
 * ----------------------
 * A named, color-coded bag of OSM building ids. Matches
 * `public.building_selection_groups`. Groups are the unit of bulk
 * action in the OSM Buildings tool — pick a bunch with the marquee
 * (Apple-style rubber band), color/tag/hide them together, save,
 * export, or publish for other users. One user can have many groups;
 * a building may belong to more than one group.
 */
export interface BuildingSelectionGroup {
  id: string;
  user_id: string;
  name: string;
  /** CSS hex string, drives the swatch AND the mass-recolor action. */
  color: string;
  osm_ids: string[];
  tag: string | null;
  notes: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/** Rotating palette used for auto-picking a distinct color per new group. */
export const GROUP_PALETTE: string[] = [
  "#38bdf8", // sky
  "#f472b6", // pink
  "#a3e635", // lime
  "#fbbf24", // amber
  "#c084fc", // violet
  "#f87171", // rose
  "#34d399", // emerald
  "#fb923c", // orange
  "#22d3ee", // cyan
  "#fde047", // yellow
];

export function nextGroupColor(existing: string[]): string {
  const used = new Set(existing.map((c) => c.toLowerCase()));
  for (const c of GROUP_PALETTE) if (!used.has(c.toLowerCase())) return c;
  return GROUP_PALETTE[existing.length % GROUP_PALETTE.length];
}