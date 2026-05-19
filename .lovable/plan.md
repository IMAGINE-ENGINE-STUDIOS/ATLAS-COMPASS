# Fast Result Engine — Precise, Nearby-First, Map-Exposed

A search experience that loads instantly, prioritizes nearby precision, exposes one-tap category filters (Food, Groceries, Cafés, Shops, etc.), and renders every result as a live pin on the globe synchronized with the dropdown list.

## Goals

1. **Speed**: first useful results in <500ms; never block on slow mirrors.
2. **Precision**: closest-first ranking; exact matches before fuzzy ones.
3. **Map exposure**: every result in the panel = a pin on the globe (hover/click syncs both ways).
4. **Quick templates**: one-tap category chips (Food, Groceries, Cafés, Shops, Pharmacy, Fuel, Hotels, ATMs, Parks).
5. **No slider**, no radius controls — adaptive radius handled internally.

---

## Architecture

```text
┌─ SearchBar ──────────────────────────────────────────┐
│ [🔍 input]  [Food] [Groceries] [Cafés] [Shops] ...   │
└────────┬─────────────────────────────────────────────┘
         │ debounced query / category click
         ▼
┌─ useSearchEngine() hook ─────────────────────────────┐
│  • AbortController per request                       │
│  • Tier 1: in-memory cache (key = q+lat+lng+cat)     │
│  • Tier 2: Overpass (multi-mirror, expanding radius) │
│  • Tier 3: Nominatim bounded + global (fuzzy)        │
│  • Ranking: exact > prefix > fuzzy, then distance    │
└────────┬─────────────────────────────────────────────┘
         │ unifiedResults[]
         ▼
┌─ ResultsPanel ────────┐   ┌─ MapPinsLayer (Cesium) ─┐
│  list, hover = focus  │◄──┤ billboards per result   │
│  click = fly + open   │──►│ hover = highlight       │
└───────────────────────┘   └─────────────────────────┘
```

---

## Components & Files

### New
- `src/hooks/useSearchEngine.ts` — pure data layer (cache, fetchers, ranking, abort).
- `src/lib/search/overpass.ts` — multi-mirror Overpass client with race + failover.
- `src/lib/search/nominatim.ts` — bounded/global Nominatim fetchers.
- `src/lib/search/categories.ts` — category presets (label, icon, OSM filter).
- `src/lib/search/ranking.ts` — exact/prefix/fuzzy + haversine scoring.
- `src/components/atlas/SearchBar.tsx` — input + category chips + status.
- `src/components/atlas/ResultsPanel.tsx` — list with live distance buckets.
- `src/components/atlas/SearchPinsLayer.tsx` — Cesium billboards for results, synced via shared hover/selected state.

### Edited
- `src/pages/SpaceshipPage.tsx` — replace inline search blocks with the new components and hook.

---

## Category Templates (one-tap)

| Chip | Icon | OSM Filter |
|---|---|---|
| Food | UtensilsCrossed | `amenity~"restaurant\|fast_food\|food_court"` |
| Groceries | ShoppingCart | `shop~"supermarket\|convenience\|grocery\|greengrocer\|bakery"` |
| Cafés | Coffee | `amenity=cafe` |
| Shops | Store | `shop` (any) |
| Pharmacy | Stethoscope | `amenity=pharmacy` |
| Fuel | Fuel | `amenity~"fuel\|charging_station"` |
| Hotels | Hotel | `tourism~"hotel\|motel\|hostel\|guest_house"` |
| ATMs | Building2 | `amenity~"atm\|bank"` |
| Parks | Mountain | `leisure~"park\|garden"` |

Category click = empty text + filter active → fires nearby-only Overpass with the filter, no name regex.

---

## Search Pipeline

1. **Trigger**: text input (350ms debounce) OR category chip click (immediate) OR empty input + open dropdown (auto "what's around me").
2. **Resolve center**: cached camera center → POI focus → geoLocateUser fallback.
3. **Cache check**: 60s TTL keyed by `q|cat|lat3|lng3`. Hit → render immediately.
4. **Overpass (parallel mirrors, first to respond wins)**:
   - Mirrors: `overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee`, `overpass.osm.ch`.
   - `Promise.any` with per-mirror timeout (4s).
   - Expanding radius: 1 → 3 → 10 → 30 km, stop at ≥20 hits.
   - Query uses `nwr` + category filter (if chip active) + optional `["name"~q,i]`.
5. **Nominatim in parallel** (only for text queries ≥2 chars): bounded (viewbox+bounded=1) and global, both rate-limited to 1/sec.
6. **Merge & dedupe** by `name|lat3|lng3`.
7. **Rank**:
   - score = `nameMatchTier * 1000 - distanceKm`
   - tiers: exact=3, prefix=2, contains=1, fuzzy=0
   - empty query → pure distance.
8. **Render**: progressive — emit Overpass hits the moment they arrive, then re-sort when Nominatim resolves.

---

## Map Exposure

- `SearchPinsLayer` reads `unifiedResults` and renders a Cesium billboard per item (category icon, color by type).
- Pin click → focus that result in the panel + fly camera.
- Panel item hover → pulse corresponding pin (scale 1.4x via CSS-only billboard property).
- Pins clear when search closes; persisted POIs remain untouched.
- Distance buckets in panel: **Within 1 km**, **Within 5 km**, **Within 25 km**, **Farther**.

---

## UX Details

- **Result row**: icon · name · one-word type tag · distance · address (truncated).
- **Empty input + open**: shows category chips + "Nearby now" list (15 closest places of any kind).
- **Loading**: subtle skeleton rows (no spinner overlay); never blanks the prior results.
- **Error**: small inline "Network busy, retrying…" — never empty if cached results exist.
- **Keyboard**: ↑/↓ to navigate, Enter to fly, Esc to close.

---

## Out of Scope

- No backend, no database, no Google/Yellow Pages, no paid APIs.
- No radius slider.
- No changes to POI saving, marketplace, delivery, or routing flows beyond consuming a selected result.

---

## Acceptance Criteria

- Typing "walmart" near any populated area returns ≥1 nearby Walmart within 800ms (when at least one mirror is reachable).
- Clicking "Groceries" with empty input returns ≥20 grocery stores ranked by distance, all visible as pins on the globe.
- Hovering a result pulses its pin; clicking flies to it.
- If all Overpass mirrors fail, Nominatim global results still render for text queries; category chips show a clear "Mirrors unreachable" inline note instead of going blank.
- No radius slider anywhere in the UI.
