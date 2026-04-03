

## Address Autocomplete for Delivery Tools

### Problem
All address inputs in Quick Estimate, Batch Quotes, and New Delivery Form are plain text fields with no suggestions. Users must type full addresses manually with no way to search for businesses/stores or pick locations from the Atlas globe.

### Solution
Create a reusable `AddressAutocomplete` component and integrate it across all delivery tools. Two input methods:
1. **Type-ahead autocomplete** -- queries Nominatim (OpenStreetMap) + Overpass API as user types, showing address matches AND business/store names
2. **Pick from Atlas** -- a small globe/pin button opens the Atlas view where user can click a point, and the coordinates are reverse-geocoded back into the address field

### Plan

**Step 1: Create `AddressAutocomplete` component**
- New file: `src/components/delivery/AddressAutocomplete.tsx`
- Debounced input (300ms) that queries two sources in parallel:
  - **Nominatim geocoding** (`nominatim.openstreetmap.org/search`) for street addresses
  - **Overpass API** for businesses/stores matching the query text (within a ~50km radius of user location or last known position)
- Dropdown shows results grouped: "Addresses" section and "Businesses & Stores" section with emoji icons (🍽️, 🛒, ⛽, etc.)
- Each result shows name, full address, and distance if user location is available
- On selection, fills the input with the formatted address and stores lat/lng
- A small 🌍 button on the right opens Atlas in a modal/drawer for point-picking
- Props: `value`, `onChange(address, coords?)`, `placeholder`

**Step 2: Atlas point-picker modal**
- When user clicks the globe icon, open a lightweight dialog with an embedded Cesium viewer (or navigate to `/atlas` with a `?pickMode=true` query param and listen for a postMessage/callback)
- Simpler approach: use a modal with a mini-map powered by Leaflet (lightweight) where user can click to drop a pin, then reverse-geocode via Nominatim
- On confirm, the address and coordinates populate the input field

**Step 3: Integrate into QuickEstimate**
- Replace both plain `<input>` elements (pickup/dropoff) with `<AddressAutocomplete>`

**Step 4: Integrate into BatchQuoteTool**
- Replace all pickup/dropoff `<input>` elements in the batch rows with `<AddressAutocomplete>`

**Step 5: Integrate into NewDeliveryForm**
- Replace pickup and dropoff address inputs in Step 1 ("Addresses") with `<AddressAutocomplete>`

### Technical Details
- Nominatim API: `https://nominatim.openstreetmap.org/search?q={query}&format=json&addressdetails=1&limit=5`
- Overpass API for business search: query `node["name"~"{query}"i]["shop"](bbox)` + amenities within user's approximate area
- User location obtained via `navigator.geolocation` (cached) for proximity sorting and bounding box
- Reverse geocoding for Atlas picks: `https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json`
- Debounce at 300ms, minimum 3 characters before querying
- Dropdown positioned absolutely below input, max-height with scroll, z-50 for layering
- Mobile-friendly: full-width dropdown, touch-friendly tap targets (min 44px height per row)

