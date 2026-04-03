

## Fix Atlas Store Discovery + Enhanced POI Widget

### Problems
1. **Stores not appearing on globe** -- The `loadBusinesses` function only runs when `showBusinessIcons` is toggled, and area-caching prevents reloads. When the search panel opens or user geolocates, globe pins don't refresh.
2. **Search not showing nearby businesses** -- The Overpass search uses the camera position (defaulting to NYC) rather than user location; when user types a store name the geofenced query may miss local results.
3. **POICard widget not showing full business info** -- The popup POICard shows minimal data (no phone, website, hours, description). It needs to be a rich, detailed widget.

### Plan

**Step 1: Fix store pin loading to be automatic and reactive**
- When the search panel opens with `geoLocateUser()`, also set `showBusinessIcons = true` and clear `businessLoadedAreaRef` so pins load at the user's location
- After `geoLocateUser` flies the camera, trigger `loadBusinesses()` after a short delay (camera needs to arrive first)
- Add a `moveEnd` camera listener that calls `loadBusinesses()` whenever the camera stops moving (so panning/zooming always shows stores)

**Step 2: Fix search to prioritize nearby results**
- In `searchOverpassBusinesses`, use `geoCenter` (user location) instead of camera position when available, so typing "Starbucks" searches near the user, not near wherever the camera happens to be
- Add distance calculation to Overpass text-search results using Haversine, and sort by proximity
- Only fall back to Nominatim global results when Overpass returns < 3 results (keeping it local-first)

**Step 3: Enhance POICard with rich detail widget**
- Update `POICard.tsx` full-size variant to show:
  - Large emoji icon with gradient background
  - Business name, category badge, open/closed status with pulsing dot
  - Full address with copy-to-clipboard
  - Phone number (clickable `tel:` link) and website (clickable, no Google Maps)
  - Star rating display
  - Distance in bold with "away" label
  - Coordinates in small mono font
  - Action buttons: "Navigate" (flies camera), "Delivery" (opens delivery page with address pre-filled), "Select" (for address autocomplete contexts)
- Add a `description` field to `POIData` interface for brand/type description
- Ensure the card uses `max-w-sm` on desktop and `inset-x-3 bottom-28` on mobile so it never overflows

**Step 4: Auto-populate business metadata**
- In `fetchGeofencedBusinesses` and `loadBusinesses`, extract all available OSM tags: `phone`, `website`, `opening_hours`, `brand`, `cuisine`, `description`
- Map `opening_hours` to a simple `openNow` boolean using basic time parsing (or just flag "24/7" as open)
- Store this enriched data in `geoBusinesses` and `businessDataRef` so the POICard popup gets the full picture

**Step 5: Category filter triggers instant pin refresh**
- When user taps a category pill (Food, Cafe, Fuel, etc.), clear the business entity cache and re-query Overpass with the selected category filter applied to both the globe pins AND the search panel results simultaneously

### Files to modify
- `src/components/POICard.tsx` -- Enhance full-size variant with phone, website, description, delivery action
- `src/pages/SpaceshipPage.tsx` -- Fix store loading reactivity, search locality, camera moveEnd listener, enriched metadata extraction

