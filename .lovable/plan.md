## Plan

1. **Stop automatic store loading**
   - Keep stores off by default.
   - Opening the search bar should not trigger a broad background store scan.
   - Stores load only when the user selects a category filter or types a search.

2. **Fix the category filter click path**
   - Make every category button directly call the instant loader, including repeated clicks on the same category.
   - Avoid relying on React state timing for the selected category; pass the clicked category directly into the fetch.
   - Keep the results panel open and show loading while fetching.

3. **Replace the failing category Overpass query format**
   - The current `nwr[...](around:...)` category query is returning no usable results in Manhattan.
   - Rewrite the filter query to use explicit `node`, `way`, and `relation` blocks with correct Overpass syntax for `around` searches.
   - Use the same corrected query path for category pins and search results.

4. **Make pins reliably visible**
   - Add fetched stores to both the left results panel and the Cesium map immediately.
   - Keep store pins above depth with ground clamp, but fall back to normal coordinate placement if clamping fails.
   - Clear old store pins before rendering the new selected category.

5. **Improve empty/failure behavior**
   - If Overpass returns zero or is rate-limited, automatically fall back to bounded Nominatim category searches.
   - Keep the loading state accurate and leave an empty result panel only after both sources fail.

6. **Verify in Manhattan**
   - Test Food, Café, Grocery, and Shops around Manhattan/Times Square.
   - Confirm the result count updates and visible map pins are created only after category selection or a text search.