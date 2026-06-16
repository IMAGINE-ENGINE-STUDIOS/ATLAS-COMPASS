# Instant Search Engine with Map Sync

Upgrade the existing Atlas unified search (top bar in `SpaceshipPage.tsx`) so results appear instantly in a dedicated side panel AND as live pins on the globe, covering places/addresses, businesses, and the user's saved POIs.

## What changes

1. **Instant-as-you-type**
   - Drop debounce from current value to ~120 ms and fire on every keystroke ≥ 2 chars.
   - Show partial results as they stream in: local POI matches (synchronous) appear first frame, then Overpass businesses, then Nominatim places — no waiting for the slowest source.
   - Keep the abort-previous-request pattern so stale responses never overwrite newer ones.

2. **New side panel (`SearchResultsPanel`)**
   - Left-anchored glassmorphic panel (~380 px), slides in when search is active, collapsible.
   - Three grouped sections with counts: **Saved POIs**, **Places & Addresses**, **Businesses & Stores**.
   - Each row: icon, name, category/address, distance from viewport center, action buttons (Fly to, Save POI, Route to).
   - Hover row → corresponding pin pulses on globe. Click row → camera flies to it.
   - Empty state per section while that source is still loading (skeleton rows).

3. **Saved POIs as a search source**
   - Read from existing POI store (`mem://features/atlas-poi-system`).
   - Match against POI name, description, tags. Synchronous, so they're always first to render.
   - Tagged with a distinct icon/color so they stand out from OSM results.

4. **Map pin sync**
   - Existing `searchResultEntitiesRef` already renders one pin per result; extend it to:
     - Color-code by source (POI / place / business).
     - Highlight the hovered row's pin (scale + glow).
     - Cluster when > 50 results in view to keep the globe readable.

5. **Top-bar search box**
   - Keep current input; add a small "results: N" badge and a clear (×) button.
   - Pressing Enter focuses the first result; Esc closes panel + clears pins.

## Technical notes

- Files touched: `src/pages/SpaceshipPage.tsx` (wire panel + faster debounce + POI source), new `src/components/atlas/SearchResultsPanel.tsx`, small helper `src/lib/search-rank.ts` for distance + relevance scoring.
- Reuse existing `runUnifiedSearch`, `runOverpassAround`, `runNominatimBounded`; refactor to emit partial results via a callback instead of awaiting `Promise.all`.
- No new backend, no new API keys — uses Overpass + Nominatim + local POI store already in the app, consistent with the real-data constraint.
- Pure CSS animations for panel slide and pin pulse.

## Out of scope
- Live cameras as a search source (can be added later if wanted).
- Server-side search index / Algolia.
