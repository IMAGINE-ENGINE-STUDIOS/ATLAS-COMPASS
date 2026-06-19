## Plan

1. **Keep the right inspector in the desktop grid instead of unmounting it**
   - Replace the current `hidden` state for the closed inspector with a zero-width, non-interactive collapsed state.
   - This prevents grid/layout reconciliation from pushing the inspector or canvas outside the viewport.

2. **Make the desktop grid columns viewport-safe**
   - Use `minmax(0, 1fr)` for the canvas column.
   - Keep the inspector column at `320px` when open and `0px` when closed.
   - Ensure the grid container clips overflow so the closed sidebar cannot sit offscreen at 100% zoom.

3. **Add stable sizing to the inspector panel**
   - Add `min-w-0`, `w-[320px]`, and shrink-safe classes when open.
   - Add `w-0 overflow-hidden pointer-events-none` when closed.

4. **Verify the toggle behavior**
   - Open the level editor, close the right inspector with the highlighted toolbar button, reopen it, and confirm it appears fully within the viewport at 100% zoom.