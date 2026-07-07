
# OSM Buildings — Global Accuracy + Marquee Selection + Selection Groups

Four separate problems, one integrated toolset. All data stays real (no simulated numbers) and all changes stay inside the existing `AtlasBuildingsOverlay` + `useBuildingRecords` surface plus one new hook and one new table.

---

## 1. Accurate population, everywhere on Earth

Today `estimateBuildingResidents` only knows the US Census 2020 API — outside the US it silently falls back to a per-m² heuristic labeled "Heuristic". Replacement pipeline (real APIs only):

```text
lat, lng ──► pick best available source in this order:
  1. Kontur Population   (global 400 m H3 hex, monthly, free)
       https://data.humdata.org/dataset/kontur-population-dataset
       Query via their tile service or the pre-cached hex we resolve on the edge.
  2. WorldPop 100 m       (global, 2020, free JSON API)
       https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=2020&geojson=...
  3. GHSL 2023            (EU JRC, 100 m raster, WMS + WCS)
  4. US Census 2020       (already wired, kept for the US where it's finer)
  5. Country statistical offices where free APIs exist
       (Venezuela INE, Brazil IBGE, EUROSTAT NUTS-3, Japan e-Stat, India Census 2011)
```

- New edge function `population-lookup` fans out to the sources in order, caches the result per H3 cell for 30 days in a new `population_cache` table, and returns `{ residents_per_km2, source, note }`.
- Building estimate becomes: `footprint_m2 × levels × 0.75 (usable) / m2_per_person(country)` capped by `residents_per_km2 × footprint_km2 × levels`.
- The card's data-source badge shows the actual provider name ("Kontur 2024", "WorldPop 2020", "GHSL 2023", "US Census 2020") instead of "Heuristic".

## 2. More buildings — Venezuela, LatAm, Africa, remote everywhere

Cesium's OSM Buildings tileset is thin outside dense OSM regions. We add three complementary layers, streamed on demand for the current viewport:

- **Google Open Buildings v3** — Africa, South America, South/SE Asia, Caribbean (perfect for Venezuela). Free, CC-BY. Served as vector tiles from their public GCS bucket.
- **Microsoft Global ML Building Footprints** — global, 1.4 B polygons, ODbL. Fetched by country quadkey from the public Azure container.
- **Overture Maps `buildings`** — global, monthly, free. Queried via the public DuckDB / S3 endpoint for the current viewport bbox.

Rendering: convert each source's footprint + height (or a default 6 m when height is missing) into a Cesium `GeoJsonDataSource` with extruded polygons, styled identically to OSM Buildings so the user can't tell them apart. Anything that shows up in native OSM wins — we dedupe by centroid within 3 m.

A new `viewMode` sub-toggle "Extended Buildings" enables the extra layers; off by default so first paint stays cheap.

## 3. Apple-style marquee selection

Replace the long-press → single-click multi-select flow. New tool inside the unified panel:

- Tool button "Marquee" (⌘-drag on Mac, Shift-drag on other keyboards).
- An HTML overlay `div` draws the classic translucent blue rectangle (macOS Finder look — `bg-[hsl(210_100%_50%/0.15)]` fill, `border border-[hsl(210_100%_55%)]`) that follows the mouse.
- On mouse-up we walk every visible `Cesium3DTileFeature` from every buildings tileset (OSM + extended layers), project its centroid to screen space, and add any feature inside the rectangle to the **active selection group**.
- Hold Shift while marquee-dragging to add to the current group. Hold Alt to subtract. Same modifiers Finder uses.
- Escape or click-empty clears the *marquee tool*, not the selection.

## 4. Selection groups — separate cached files, group actions, individual edits

The core UX problem: today there's one flat `Set<string>`, so after coloring group A red the next drag replaces it. New model:

- `SelectionGroup` = `{ id, name, color, osm_ids: string[], created_at, is_public }`.
- New table `building_selection_groups` (per-user; RLS mirrors `building_records`; `is_public` = true lets anyone read the group, matching how the buildings table already publishes).
- The panel shows a stacked list of groups with the group's swatch, count, and actions: rename, recolor (applies to every member), tag, hide, replace-with-model in bulk, export GeoJSON, delete.
- One group is "active" at a time; the marquee (and click-toggle) adds to that group. `+ New group` picks a fresh accent color and makes it active.
- Individual buildings stay editable from `BuildingCard` (unchanged); a per-building edit propagates back to whichever group(s) it belongs to.
- Local IndexedDB cache mirrors every group so re-opening Atlas offline still shows the last state; the server row is the source of truth.

Export: each group can be downloaded as `<group-name>.geojson` (real feature geometry pulled from Overpass for OSM ids, or cached vector-tile geometry for the extended sources) and re-uploaded on the /files page.

---

## Files touched

```text
supabase/migrations/<ts>_selection_groups_and_pop_cache.sql   NEW
supabase/functions/population-lookup/index.ts                 NEW
src/hooks/useBuildingRecords.ts                               EDIT (group helpers)
src/hooks/useSelectionGroups.ts                               NEW
src/components/atlas/AtlasBuildingsOverlay.tsx                EDIT (marquee, groups)
src/components/atlas/MarqueeSelectionLayer.tsx                NEW (blue rectangle)
src/components/atlas/SelectionGroupsPanel.tsx                 NEW
src/components/atlas/ExtendedBuildingsLayer.tsx               NEW (Google/MS/Overture)
src/lib/populationSources.ts                                  NEW (client fallback + edge caller)
src/lib/buildingSources/                                      NEW (source adapters)
```

---

## Suggested build order

1. Selection groups + marquee (biggest UX win, ships without new external data).
2. Population-lookup edge function + global sources (fixes the accuracy complaint).
3. Extended Buildings layer (Google Open Buildings first — that's Venezuela + Africa + LatAm; then MS + Overture).

Say the word and I'll start with step 1. If you'd rather I front-load Venezuela coverage or the marquee first, tell me and I'll reorder.
