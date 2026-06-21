
# Level Manifest & Atlas Package Pipeline

Replace the lightweight "preview vs playable" performance trick with a real **Level Manifest** that ships with every uploaded level, plus a **Level Package** format that consolidates every asset (models, terrain, characters, animations, interactions, audio, code/scripts) into Atlas as a single addressable unit.

## 1. Level Manifest ("manuscript")

A signed JSON document stored on the `levels` row and mirrored into each `atlas_level_placements` row at upload time. It declares the rules that apply inside the **level volume** = level footprint × 10 km vertical column above the ground.

```ts
// src/lib/levelManifest.ts
export interface LevelManifest {
  manifestVersion: 1;
  levelId: string;
  name: string;
  authorId: string;

  // Spatial authority
  volume: {
    shape: "polygon" | "circle";
    points?: [lng, lat][];          // polygon footprint
    center?: [lng, lat]; radiusM?: number;
    ceilingM: 10_000;               // hard 10 km cap
    floorM: number;                 // usually 0, can go negative
  };

  // Rules applied while camera/character is inside volume
  rules: {
    physics:   { gravity: number; airDensity: number; allowFlight: boolean };
    time:      { lockTimeOfDay?: number; timeScale: number };
    weather:   { override?: "clear"|"rain"|"snow"|"fog"; windMps?: number };
    audio:     { ambientBusId?: string; reverbPreset?: string; masterDb: number };
    camera:    { minZoomM: number; maxZoomM: number; allowFreeFly: boolean };
    locomotion:{ defaultMode: "walk"|"drive"|"fly"; allowSwitch: boolean; speedMul: number };
    rendering: { hdriPackId?: string; fogColor?: string; shadowQuality: "off"|"low"|"high" };
    network:   { multiplayer: boolean; maxPlayers: number };
    access:    { visibility: "public"|"unlisted"|"private"; allowEdits: boolean };
  };

  // Pointer to the package
  package: { id: string; version: string; sha256: string; sizeBytes: number };
}
```

A new hook `useActiveLevelManifest(cameraLatLngAlt)` resolves which manifest currently owns the camera and exposes the merged rule-set; Atlas systems (camera, audio, weather, locomotion, Cesium time, R3F lights) subscribe and apply overrides while inside, restoring globals on exit.

## 2. Level Package (.lvlpkg)

One zipped, content-addressed bundle per level version. Layout:

```text
manifest.json                 ← the manuscript above
scene.json                    ← LevelScene (objects, transforms, refs)
models/<sha>.glb              ← every 3D model
terrain/<sha>.{glb,heightmap.bin}
characters/<sha>.glb
animations/<sha>.glb
audio/<sha>.{mp3,ogg,wav}
textures/<sha>.{ktx2,webp,png}
hdri/<sha>.hdr
scripts/<name>.lua|js         ← interaction/behavior code
interactions.json             ← triggers, prompts, teleports
index.json                    ← { kind, sha, originalName, mime, size }[]
```

- Built on **upload to Atlas**, not in the editor. A new edge function `pack-level` (or client worker for size) walks the scene, gathers every referenced asset from current sources (IndexedDB blobs, Supabase storage, scene-embedded data), hashes each file, writes the zip, uploads to a new `level-packages` storage bucket as `levels/<levelId>/<version>.lvlpkg`.
- On Atlas load, a new resolver `useLevelPackage(levelId, version)` streams the package, mounts it into an in-memory virtual FS (`pkgfs://<levelId>/...`), and rewrites scene asset URLs to that VFS so nothing else in the runtime needs to know about packaging.

## 3. Atlas consolidation

- `atlas_level_placements` gains `manifest_id`, `package_id`, `package_version`, `package_sha256`. When a user drops a level onto Atlas, the placement copies the current manifest+package pointer (so future edits don't silently mutate placed levels — they get an "update available" badge instead).
- `LevelInspectorPanel` adds two tabs: **Manuscript** (read-only rules + diff vs editor) and **Package** (file tree, sizes, integrity check).
- `AtlasLevelsR3FOverlay` mounts content from the package VFS instead of fetching individual records. This naturally fixes the perf issue: one fetch, one cache, no per-asset round-trips, easy LRU eviction at the package level.

## 4. New / changed files

- **New**: `src/lib/levelManifest.ts`, `src/lib/levelPackage.ts` (build/read), `src/lib/pkgfs.ts` (virtual FS + URL rewriter), `src/lib/useActiveLevelManifest.ts`, `src/lib/useLevelPackage.ts`, `src/components/level/manifest/ManifestEditor.tsx`, `src/components/atlas/LevelPackageInspector.tsx`, `supabase/functions/pack-level/index.ts`.
- **Changed**: `src/lib/levelTypes.ts` (+manifest, +package refs), `src/lib/useAtlasLevelLayer.ts` (load via package), `src/components/atlas/AtlasLevelsR3FOverlay.tsx`, `src/components/atlas/LevelInspectorPanel.tsx`, `src/pages/AtlasPage.tsx` (rule application bridge), `src/components/level/LevelScene3D.tsx` (read assets from pkgfs when present).
- **Migrations**: add `manifest jsonb`, `package_id text`, `package_version text`, `package_sha256 text`, `package_size_bytes bigint` to `levels`; mirror `manifest_snapshot jsonb`, `package_id`, `package_version`, `package_sha256` on `atlas_level_placements`. New storage bucket `level-packages` (private, owner-scoped RLS).

## 5. Performance outcome

- One HTTP range-fetched `.lvlpkg` per placed level instead of N asset requests.
- Manifest-driven LOD: outside volume → Cesium-only proxy box from manifest footprint; inside volume → stream package and mount full scene.
- Rules cap shadow/HDRI/physics cost per-level so a heavy level can't tank Atlas.

## Open decisions

1. Build packages **client-side in a worker** (fast iteration, no edge cost) or **server-side via `pack-level` edge function** (canonical, signable). Recommendation: server-side, with client fallback for offline editor saves.
2. Scripts/interactions language: keep current JSON behavior graph, or allow sandboxed JS in `scripts/`? Recommendation: JSON-only v1, JS sandbox v2.
3. Should placing a level **pin** to that package version (safe, current proposal) or **always track latest** (live updates, riskier)? Recommendation: pin + "Update available" action in the inspector.
