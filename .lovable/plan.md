# Performance & Rendering Modernization Plan

Goal: keep the current "very high level" experience and FPS while letting scenes scale up 10–100×, then unlock a paid **Hardcore Simulation** cloud tier on top. We adapt proven Unreal Engine 5 ideas to what is actually possible in WebGL2 / WebGPU + React Three Fiber, with **no fake claims** (no real "Nanite" or real "Lumen" in the browser — we ship the spirit, not the brand).

---

## 1. What we have today (baseline)

- Renderer: single R3F `<Canvas>` (`LevelScene3D.tsx`), `antialias: true`, `high-performance`, `preserveDrawingBuffer: true`.
- No instancing anywhere (`InstancedMesh` is not used).
- No LOD, no frustum culling beyond three.js default, no occlusion culling, no BVH.
- Every geometry primitive, polygon extrusion, character, trajectory follower is a **separate mesh = separate draw call**.
- `preserveDrawingBuffer: true` forces a CPU readback every frame — measurable FPS cost.
- No FPS budget, no adaptive quality, no telemetry.

This is the honest starting point. Everything below is incremental and measurable.

## 2. Pillars (Unreal-inspired, web-honest)

| UE5 concept | What we actually ship in-browser | Why it works |
|---|---|---|
| Nanite (virtualized geometry) | **Geometry instancing + screen-space LOD + meshopt simplification** | Real wins, zero magic. Nanite proper needs mesh shaders + compute we don't have in WebGL2. |
| Lumen (dynamic GI) | **Baked irradiance probes + SSAO + contact shadows + optional SSR** | Looks "Lumen-ish" at 60fps; no GI lies. |
| Virtual Shadow Maps | **Cascaded shadow maps (CSM) + per-light shadow budget** | Standard, ships today. |
| Mesh shaders / cluster culling | **BVH frustum + occlusion culling (three-mesh-bvh)** | Cuts draw calls before they hit the GPU. |
| Temporal Super Resolution (TSR) | **Render-scale + FXAA/TAA + DPR clamp** | Honest upscaling. |
| World Partition / HLOD | **Tile streaming + proxy meshes for far tiles** | Fits our level system. |
| PSO precaching | **Material/shader warmup pass on level load** | Removes first-frame hitches. |

## 3. Workstreams

### A. Instancing & draw-call reduction (biggest win, ship first)

1. **Auto-instance identical primitives** — group `PrimitiveObject`s by `(shape, material hash)` and render as a single `<instancedMesh>`. Per-instance matrix + per-instance color via `InstancedBufferAttribute`.
2. **Auto-instance identical `ModelObject` URLs** — one GLTF load → `InstancedMesh` per mesh in the asset.
3. **Merge static scenery** — opt-in "static" flag on polygons; on level load, merge them into a single `BufferGeometry` using `BufferGeometryUtils.mergeGeometries`. They become uneditable until "unmerged" in the editor.
4. **Followers on trajectories** become per-instance offsets, not per-object meshes.

Target: **typical city tile from ~2,000 draw calls → < 150**.

### B. Geometry pipeline (Nanite-spirit)

1. Integrate **meshoptimizer** (`meshopt_simplifier`) to auto-generate 3 LODs (100% / 40% / 12% triangles) at import time for `ModelObject` and on extrude for `PolygonObject`.
2. Add a `<LOD>` wrapper that picks LOD by screen-space size, not raw distance — matches Nanite's "1 tri per pixel" intuition.
3. **three-mesh-bvh** on heavy meshes for: raycasts (teleport pick, paint), frustum culling, and future occlusion queries.
4. Per-object **polygon budget** stored in scene metadata so the editor can warn before saving over budget.

### C. Shading & lighting (Lumen-spirit, honest)

1. Standardize on `MeshPhysicalMaterial` with shared `EnvironmentMap` (one PMREM per scene) — already half-there.
2. Add **SSAO** + **contact shadows** post pass (postprocessing lib, conditional on quality tier).
3. **CSM** for the sun (3 cascades, 2k each on High, 1k on Medium, off on Low).
4. **Baked irradiance probes**: author-time bake to spherical harmonics (9 floats per probe), runtime sampled in fragment shader → fake-GI at near-zero cost.
5. Optional **SSR** for water/glass only, hidden behind quality tier.
6. **Material atlas**: deduplicate textures by hash; share `Texture` instances across materials.

### D. Frame-rate governor & adaptive quality

1. Rolling FPS sampler (EWMA over 60 frames) in `LevelScene3D`.
2. Quality tiers: **Low / Medium / High / Ultra**, user-selectable + auto.
3. Auto-tier rules (only when "Auto" is on):
   - FPS < target − 10 for 2 s → step down (drop render-scale → drop shadows → drop SSAO → drop AA).
   - FPS > target + 5 for 10 s and no recent step-down → step up.
4. **Render-scale slider** (0.5×–1.0×) — Vite + three support this trivially via `gl.setPixelRatio` + `setSize`.
5. Drop `preserveDrawingBuffer: true` to false by default; only enable when a screenshot is actively requested.
6. Hard cap DPR at 2 (current devices go to 3+ and silently tank FPS).

### E. Streaming, culling & memory

1. **Tile-based scene streaming**: split levels into spatial tiles; load on demand around the camera; unload far tiles. Reuses existing level persistence.
2. **HLOD proxies**: far tiles render as a single low-poly proxy mesh baked from the tile.
3. **Occlusion culling**: hierarchical Z buffer is not viable on WebGL2; instead use BVH + simple portal/AABB occluders authored in editor.
4. **Texture budget**: KTX2 + Basis transcoder for compressed GPU textures; cap total texture VRAM per quality tier.

### F. Telemetry & developer HUD

1. Built-in overlay (toggle with backtick) showing: FPS, frame ms, draw calls, triangles, programs, textures (MB), JS heap.
2. Per-frame markers via `performance.measure` so we can profile in Chrome.
3. Opt-in anonymous perf telemetry → backend table `perf_samples` (device, gpu, tier, avg fps, p1 fps, scene id). Drives auto-tier defaults.

### G. WebGPU path (future, behind a flag)

1. Add WebGPURenderer detection; when available + flag on, use it for: compute-skinning, larger instance counts, MRT post.
2. Keep WebGL2 path as the supported default for at least 6 months.
3. Honest messaging in UI: "Experimental — your browser may not support it."

### H. Cloud "Hardcore Simulation" tier (monetization)

Real, deliverable services — nothing fake:

1. **Pixel-streamed sessions**: headless three.js / WebGPU running on a GPU VM, streamed to the browser via WebRTC. Unlocks: 10× polygon budget, real path-traced bakes, large crowds, heavy physics.
2. **Offline bakes**:
   - Lightmap / irradiance probe baking (worker queue, returns KTX2 atlas).
   - Mesh simplification & LOD generation at scale.
   - Navmesh + collision cooking.
3. **Crowd / physics simulation server**: Rapier or PhysX-on-server, deterministic, results streamed back.
4. **Asset CDN with transcoding**: upload FBX/OBJ/USD → server returns optimized GLB + KTX2 + LODs.

Pricing surface plugged into existing Stripe/Paddle layer; per-minute for streamed sessions, per-job for bakes.

## 4. Rollout phases

```text
Phase 1 (1–2 wks)  Instancing + merged static + DPR cap + drop preserveDrawingBuffer + HUD
Phase 2 (2 wks)    LOD + meshopt + three-mesh-bvh + render-scale + quality tiers + auto-tier
Phase 3 (2 wks)    CSM + SSAO + contact shadows + PMREM cleanup + KTX2 pipeline
Phase 4 (2 wks)    Tile streaming + HLOD proxies + occluders + texture budget
Phase 5 (2 wks)    Baked irradiance probes + optional SSR + PSO warmup
Phase 6 (ongoing)  WebGPU flag, telemetry-driven tuning
Phase 7            Cloud Hardcore tier: bake service first, then pixel streaming
```

Each phase ships independently and is gated by **measured before/after numbers** on a reference scene. No phase merges if it regresses FPS on the baseline.

## 5. Acceptance criteria (per phase, non-negotiable)

- Reference scene FPS (mid-tier laptop, integrated GPU): **must stay ≥ 60** at default quality.
- p1 frame time must not increase.
- Draw-call count after Phase 1 must drop ≥ 70% on the reference scene.
- No visible regression on existing levels (visual diff via Playwright screenshots at fixed camera).

## 6. Technical details (for engineering)

- Libraries to add: `meshoptimizer`, `three-mesh-bvh`, `postprocessing` (pmndrs), `three-stdlib` (already transitive), `ktx2-loader` setup, optional `@react-three/rapier` later.
- No new heavy runtime deps in the browser bundle beyond the above (~150 KB gz total).
- All new systems live under `src/components/level/perf/` so they are easy to audit and toggle.
- Each system has a kill-switch in `localStorage` for support debugging.
- Cloud services are separate repos / edge functions; the client only talks to them via signed URLs.

## 7. What we explicitly will NOT claim

- Not "Nanite". Not "Lumen". Not "real-time path tracing in the browser".
- No simulated FPS numbers in marketing — only measured.
- No mock GPU features; if WebGPU is off we say so.
