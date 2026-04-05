

## Fix Atlas Search Locality + Store Interaction + Ecommerce Path

### Problems
1. **Search results are not local** -- `searchOverpassBusinesses` uses a hardcoded `radius = 0.45` (~50km) bounding box. If user location (`geoCenter`) is not set, it falls back to New York (40.7128, -74.006), returning stores in NYC regardless of where the user actually is.
2. **Nominatim results are global** -- The Nominatim query has no `viewbox` or `bounded` parameter, so typing "Starbucks" returns results from anywhere in the world instead of prioritizing nearby.
3. **No smart result ordering** -- The search shows sections (Nearby, Businesses, Global Results, Presets) but doesn't prioritize local results intelligently. When no user location exists, it should auto-geolocate first.
4. **No path to ecommerce** -- Clicking a store shows a POI card with Navigate/Delivery but no way to browse the store's products or open an integrated marketplace/ecommerce page.

### Solution

#### 1. Auto-geolocate on first search open
When `searchOpen` is set to `true` and `geoCenter` is null, automatically call `geoLocateUser()`. This ensures all searches have a local anchor point from the start.

#### 2. Fix `searchOverpassBusinesses` locality
- Remove the NYC fallback. If no `geoCenter` and no camera position, trigger geolocation and defer the search.
- Use `geoRadiusKm` setting (user-configurable) instead of hardcoded `0.45` degrees.
- Increase result limit to 30 for better coverage.

#### 3. Geofence Nominatim results
- Add `viewbox` and `bounded=1` parameters to the Nominatim query using the user's `geoCenter` + `geoRadiusKm`:
  ```
  &viewbox={west},{south},{east},{north}&bounded=0
  ```
  Using `bounded=0` still allows global results but ranks local ones higher. For specific business name searches, also add a second unbounded query for worldwide matches, shown in a separate "Global" section.

#### 4. Unified smart result ranking
Refactor the search results display to use a single sorted list with clear priority:
- **Priority 1**: Geofenced businesses from `geoBusinesses` matching the query
- **Priority 2**: Overpass text-search results (nearby businesses by name)
- **Priority 3**: Nominatim local results (addresses/places near user)
- **Priority 4**: Nominatim global results (only if user typed a specific name/address not found locally)
- **Priority 5**: Presets (cities, landmarks) -- only shown when query matches

Remove duplicate section headers when results are empty. Show a "No nearby results, showing global" message when local returns empty but global has matches.

#### 5. Add "Visit Store" / ecommerce action to POI card
- Add a new action button to `POICard.tsx` full-size variant: **"Visit Store"** (shopping bag icon)
- When clicked, navigate to `/marketplace?store={storeName}&lat={lat}&lng={lng}` -- linking to the existing MarketplacePage
- Only show for business-type POIs (shops, supermarkets, restaurants)
- Add an `onVisitStore` callback prop to POICard for custom handling

#### 6. Category filter auto-triggers local search
When a category pill is tapped and `geoCenter` is null, auto-geolocate before fetching. Currently the code does this but there's a race condition -- the `fetchGeofencedBusinesses` may fire before `geoCenter` is set. Fix by awaiting geolocation result.

### Files to modify
- **`src/pages/SpaceshipPage.tsx`** -- Fix search locality logic, auto-geolocation, Nominatim viewbox, result ordering
- **`src/components/POICard.tsx`** -- Add "Visit Store" action button with marketplace navigation

### Technical details
- Nominatim viewbox format: `viewbox=lng_west,lat_south,lng_east,lat_north`
- Haversine-based sorting already exists via `geoHaversine` -- reuse for all result types
- The `geoLocateUser` function returns via callback (async geolocation), so search must be deferred until location resolves -- use a ref flag or promise pattern
- Overpass `"name"~"..."i` regex syntax is valid but can cause 429s; keep the existing sanitization and timeout handling

