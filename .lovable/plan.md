
## Problem

Network logs show the search currently fails in three ways:

1. Every keystroke triggers a new Overpass request **and** a parallel "geofenced businesses" refetch. Each new run aborts the previous one, so nothing finishes (`signal is aborted without reason` on every Overpass call).
2. Nominatim is called with `bounded=0`, so the viewbox is only a soft hint. For "PUBL" near NYC it returns roads in Romania, Brazil, France — not nearby stores.
3. Overpass is restricted to a tiny bbox (radius 5 km default) **and** to nodes only. Many shops/restaurants are ways or relations and get dropped, so even when it does complete the user sees 0 nearby.

Result: no nearby businesses, parks, or stores ever show up.

## Goal

A single ranked list, **nearest first, unlimited results**, fed entirely by free public OSM APIs (Overpass + Nominatim — no Google, no Yellow Pages, no DB).

## Approach (frontend only, in `src/pages/SpaceshipPage.tsx`)

### 1. One unified search pipeline

Replace the two parallel searches (`searchNominatim` + `searchOverpassBusinesses` + the `fetchGeofencedBusinesses` effect that also fires on radius change) with one function `runUnifiedSearch(query)` that:

- Uses a single `AbortController` stored in a ref; aborts the previous run on each new keystroke.
- Debounces 350 ms; only fires for `query.length >= 2`.
- Resolves the search center once: `geoCenter` → else camera center → else triggers `geoLocateUser()` and bails for this keystroke.

### 2. Nearby-first via Overpass with expanding radius

Run Overpass with `nwr` (nodes + ways + relations, not just nodes), searching `name`, `brand`, and `operator` case-insensitively, across the categories users care about: `shop`, `amenity`, `tourism`, `leisure`, `office`, `healthcare`, `craft`, `historic`.

Use an **expanding radius** loop, stop as soon as we have ≥ 20 hits:

```text
radii = [2, 5, 15, 50, 150]  // km
for r in radii:
  hits = overpass(query, center, r)
  if hits.length >= 20: break
```

Each call uses `[out:json][timeout:25];( ... );out center 200;` and `around:` instead of bbox for true radial search. Distances are computed with haversine, results sorted ascending.

### 3. Farther results via Nominatim

In parallel with the final Overpass call:

- One Nominatim call with `viewbox=...&bounded=1` (hard bound) for in-area address/place hits.
- One Nominatim call **without** viewbox for global fallback, only used after the in-area list is exhausted.

Both feed into the same ranked list and are sorted by haversine distance from the center.

### 4. Single ranked, unlimited list

Replace the current "Nearby / Nearby Businesses / Farther Places" three-section UI and the `Show farther results →` toggle with one scrollable list:

- Sorted strictly by distance (km).
- Each row shows the existing `POICard` (logo, name, one-word service tag, distance).
- No cap. Virtualised scroll is not required — the list lives in a `max-h-[60vh] overflow-y-auto` container that already exists.
- Small inline divider every time the distance bucket crosses a threshold (e.g. `< 1 km`, `< 5 km`, `< 25 km`, `farther`) so the user still feels the "nearest first" structure without us hiding anything.

### 5. Remove the radius-driven geofence prefetch from the search panel

The `useEffect` that calls `fetchGeofencedBusinesses` whenever `geoRadiusKm`, `geoCategory`, `geofencingOpen`, or `searchOpen` changes is what causes the aborted Overpass storms in the logs. Keep that prefetch only for the standalone geofencing panel, not for the search dropdown. The search dropdown drives its own results from `runUnifiedSearch`.

### 6. Empty query → recent + category presets

When the input is empty but the dropdown is open, show the existing `PRESETS` plus a one-shot "what's around me" Overpass call (no name filter, around `geoCenter`, 2 km, top 30 by distance) so the user immediately sees nearby places without typing.

## Files to change

- `src/pages/SpaceshipPage.tsx` — replace `searchNominatim`, `searchOverpassBusinesses`, `handleSearch`, the radius-driven `useEffect`, and the results-rendering JSX in the search dropdown.
- No other files need changes. `POICard` already renders logo + service + distance correctly.

## Out of scope

- No backend, no database (per "nonSQL doesn't matter — simplest that works").
- No Google Places or Yellow Pages integration (per "100% free/public").
- The radius slider stays removed.
