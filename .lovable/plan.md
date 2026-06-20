## Plan

1. **Reproduce in Atlas with screenshots**
   - Open `/atlas` in the live preview with Playwright.
   - Restore the signed-in session if available.
   - Locate an existing level placement, click it, press/play the level, and capture screenshots before play, after entering play, and after moving/rotating.
   - Record visible symptoms: whether the Play button appears, whether the character is possessed, and whether the level spins around the city block.

2. **Fix the level spinning / play handoff**
   - Keep the level instance anchored to its Atlas/ECEF placement at all times.
   - Remove the cause of spinning from conflicting camera ownership: the R3F playable character camera should not overwrite the Atlas camera while the overlay is being positioned from Cesium.
   - Introduce an Atlas-specific play mode where level runtime/input can activate without replacing the synced Atlas camera transform.

3. **Fix Play starting again**
   - Make the inspector Play action and proximity Play HUD reliably target the selected placement instead of an arbitrary visible placement.
   - Ensure pending play always loads the selected level scene, hides the green placeholder, flies in smoothly, and switches to playing state only once the camera is in range.

4. **Validate with screenshots**
   - Re-run the same Playwright flow.
   - Capture screenshots showing the level anchored in the city before play, the play state active, and the scene remaining stable after camera movement.
   - Check console/runtime errors and report the final observed state.