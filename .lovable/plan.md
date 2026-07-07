# Top-bar polish: conditional alarm bell, camera icon sizing, expose brush

Three small, scoped UI changes to the Atlas top-right icon widget in `src/pages/SpaceshipPage.tsx` and two of its children.

## 1. Alarm bell only appears when there's something to alarm about

`src/components/atlas/tileIntel/NotificationsBell.tsx`

- On mount, in addition to the existing fetch of the last 20 `tile_intel_events`, also count active `tile_intel_rules` (`enabled = true`).
- Add a realtime channel on `tile_intel_rules` so the count updates when rules are created, toggled, or deleted (the existing events channel already keeps the events list live).
- Early-return `null` from the component when there are **zero enabled rules AND zero events**. As soon as the user creates an alarm rule or an event fires, the bell fades back in.

## 2. Camera icon sized to match the other top-bar icons

`src/components/atlas/AtlasScreenshotMenu.tsx`

The other buttons in the top-right pill use `GlyphIcon`, which renders at `w-6 h-6 sm:w-7 sm:h-7`. The custom `ScreenshotIcon` is currently `w-3.5 h-3.5`, so the camera looks noticeably smaller than its neighbors.

- Bump `ScreenshotIcon` to `w-6 h-6 sm:w-7 sm:h-7` (and the `Loader2` spinner it swaps with).
- Reduce the wrapping button's padding from `p-1.5 sm:p-1` to `p-1` so the larger glyph sits flush with the layers, fullscreen, and brush buttons instead of enlarging the pill.
- Keep the chevron gallery toggle unchanged.

## 3. Expose the Tile Brush next to the camera

`src/pages/SpaceshipPage.tsx`

The Tile Brush toggle currently lives only inside the Atlas Console dropdown (around line 5436). It's the most-used tool, so surface it directly in the top pill.

- Insert the existing brush `<button>` (same handler, same `GlyphIcon name="brush"`, same active state) between `<AtlasScreenshotMenu>` and `<NotificationsBell>` at line ~5390.
- Leave the duplicate copy inside the Atlas Console so all-tools users still find it there.
- No behavior change — same `setBrushMode` / `setBrushPanelOpen` toggle.

## Result

Top-right pill order becomes: **Layers · Fullscreen · Camera · Brush · Bell (only if alarms) · SOS** with all glyphs at the same visual weight.

## Out of scope

- No changes to the Atlas Console dropdown itself.
- No new alarm functionality — bell visibility only.
- No restyle of the pill background or borders.
