# Atlas Performance & Reliability Fix Plan

Deep audit complete. Found one **critical proxy bug** causing the 400 errors you're seeing now, plus a stack of high-impact perf issues. Proposed plan focuses on the highest-leverage fixes only — no churn for its own sake.

## The error you're seeing right now

URLs like `…/google-3d-tiles/datasets/CgIYAQ/files/datasets/CgIYAQ/files/<tile>.glb` → **HTTP 400**.

Cause: `supabase/functions/google-3d-tiles/index.ts` rewrites child URIs as **relative** paths (`datasets/CgIYAQ/files/…`). Cesium resolves them against the parent JSON's base directory, which is already `…/google-3d-tiles/datasets/CgIYAQ/files/`, so the segment gets duplicated at every nesting level. Tiles fail, missing geometry, retries spike network.

## Plan (10 fixes, prioritized)

### Critical
1. **Fix the proxy path rewrite** (`supabase/functions/google-3d-tiles/index.ts`) — emit absolute proxy URLs (`${origin}/functions/v1/google-3d-tiles/…`) instead of relative ones. Stops every nested-tileset 400. *S*
2. **Throttle the per-frame React state update** in `SpaceshipPage.tsx` (`viewer.scene.postRender` → `setCameraAlt`). Currently re-renders the 6.8k-line page at 60Hz. Cap to ~4Hz + prev-value guard. Biggest single FPS win. *S*

### High
3. **Re-enable `requestRenderMode` after first tileset loads** in `SpaceshipPage.tsx:2236`. Right now Cesium renders continuously forever, even when idle — huge GPU/battery drain. *S*
4. **Fix play-mode stale-closure effect** (`SpaceshipPage.tsx:765–955`): remove `levelPlacements` from deps, read via ref. Today, placing a level while playing permanently locks Explore mode at boosted SSE/cache values. *S*
5. **Stop double OSM tileset instantiation** (`SpaceshipPage.tsx:2288–2338`). On Ion failure, two OSM building tilesets get added; one leaks until viewer destroy. Gate with `_osmTileset` check. *S*
6. **Batch `clampPinToSurface`** in groups of 10–20 instead of firing 500 concurrent `sampleHeightMostDetailed` walks of the tile tree. Eliminates the IntelligencePanel/marketplace spike. *M*
7. **Null out `viewerRef` in `atlasWorldScheduler` on unmount** + cancel rAF. Module-level ref currently pins the Cesium Viewer (hundreds of MB of WebGL) after navigation/HMR. *S*
8. **Make virtual-camera prefetch safe** (`SpaceshipPage.tsx:847–863`): wrap setView/render/restore in `try/finally`; prefer `tileset.preloadWhenHidden` + `requestRender` over hijacking the user's camera every 4s. *M*

### Medium (cheap wins)
9. **Optimize `AtlasTagsOverlay` per-frame work** — skip `worldToWindowCoordinates` for clusters that didn't move or are off-screen; debounce the O(n²) cluster recompute (already on `moveEnd`, add a spatial bucket). *M*
10. **Pause `useAtlasKeyboardNav` rAF loop when no keys are held** — currently wakes the CPU 60×/sec permanently. *S*

## Out of scope for this pass (documented, not done)
- Redundancies: triplicated haversine, dual escape-key listeners, ModelLabelsOverlay vs AtlasTagsOverlay overlap, unbounded `pinCanvasCache` / `goldenPinCache` (LRU later).
- `openLevelPackage` sync unzip on main thread (move to worker once package usage grows).
- `IntelligencePanel.fetchCameras` missing dep (low-risk today, but worth a follow-up).

## Expected outcome
- Google 3D mode stops 400-spamming and actually streams nested tiles.
- Idle FPS / battery: massive improvement (fixes #2, #3, #10).
- No more permanent SSE lock after playing (#4) and no leaked viewer between page nav (#7).
- Smoother behavior with many pins / intelligence syncs (#6, #9).

Approve to switch to build mode and I'll ship fixes 1–10 in that order, verifying #1 in the console after deploy.
