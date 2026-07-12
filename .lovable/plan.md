# Geo Realm — Subsurface Layer for Atlas

Bring the level of detail in your reference images (interpreted seismic sections, 3D bathymetry with megasplay/décollement/oceanic crust) into Atlas as a first-class **subsurface mode**, fed by a dedicated **Geo Realm Compiler**.

---

## 1 · Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ATLAS (Cesium)                                             │
│    + Subsurface Mode: transparent Earth, camera dives below │
│    + R3F overlay synced via ECEF matrix for slabs/volumes   │
├─────────────────────────────────────────────────────────────┤
│  GeoRealmProvider (client)                                  │
│    - Loads bundles from CDN + user storage                  │
│    - LOD by camera altitude & focus lat/lon                 │
├─────────────────────────────────────────────────────────────┤
│  Geo Realm Compiler                                         │
│    - Route: /geo-realm  (workbench)                         │
│    - Inline drop zone in Atlas subsurface panel             │
│    - Edge function `geo-realm-compile` orchestrates parse   │
│    - WASM parsers (SEG-Y, NetCDF) in a Web Worker           │
│    - Outputs: glTF meshes + KTX2 textures + manifest JSON   │
├─────────────────────────────────────────────────────────────┤
│  Storage: `geo-realm-bundles` bucket                        │
│  Table:  `geo_realm_bundles` (owner, bbox, layers, url)     │
│  Prefetched: `geo-realm-canonical` public read bucket       │
│    - Bird2003 plates, GEM faults, Slab2 depth grids,        │
│      CRUST1.0 layer stack, S40RTS tomography (KTX2 3D tex)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2 · Data pipeline (real sources only, per your authenticity rule)

| Input file | Parser | Output |
|---|---|---|
| **SEG-Y** (.sgy/.segy) reflection | `segyio-wasm` in worker | Downsampled PNG panel + geo-header JSON → textured plane |
| **NetCDF** slab depth (Slab2) | `netcdfjs` | Depth heightfield → triangulated glTF slab mesh |
| **NetCDF** tomography (S40RTS) | `netcdfjs` | 3D texture packed to KTX2 for volumetric raymarching |
| **GeoJSON** plates / faults | native | Extruded prisms (glTF) in ECEF |
| **ASCII** CRUST1.0 | native | Per-cell layer thickness → stacked concentric shells |
| **GeoTIFF** bathymetry (GEBCO) | `geotiff.js` | Heightmap for the surface shell |
| **DXF / DWG** (CAD borings) | Autodesk APS (already integrated) | glTF |

Rejected samples fall back to a clear error toast — no fake output.

---

## 3 · Rendering (max realism = 5)

- **Volumetric mantle**: WebGL2 raymarcher sampling the S40RTS KTX2 texture; Vs perturbation → color ramp (blue slabs / red plumes)
- **Slab meshes**: glTF from Slab2 depth grids, transparent contour bands
- **Crustal shells**: stacked semi-transparent ellipsoid segments (sediment, upper crust, lower crust, mantle lid) with per-cell thickness from CRUST1.0
- **Fault surfaces**: GEM faults triangulated + neon fluorescent stroke (matches your reference styling)
- **Seismic sections**: user-placed vertical planes with the reflection PNG, snapped to real lat/lon/depth, labeled annotations
- **Bathymetry inset**: exaggerated relief tile like your 3D reference image, cropped to camera focus

Perf: LOD by camera altitude, tile-based volume sampling (only 512³ region around focus), off-thread WASM parsing.

---

## 4 · UI

- **Atlas → new "Subsurface" toggle** in the layer rail. When on:
  - Terrain becomes semi-transparent
  - Camera unlocks below sea level
  - New floating panel: "Geo Realm" with layer checkboxes (Plates / Slabs / Crust / Faults / Tomography / My Bundles) and a drop zone
- **`/geo-realm` workbench** (Atlas UI style, glass rail):
  - Left rail: bundle library (canonical + owned)
  - Center: preview canvas (R3F with tilted world section)
  - Right rail: compile queue, layer metadata editor, publish button
- Every mesh clickable → POI-Card widget with metadata (matches your existing pattern)

---

## 5 · Backend

- Table `geo_realm_bundles` (id, owner_id, name, kind, bbox, depth_range, source_meta, manifest_url, layers jsonb, is_public) with the standard GRANT + RLS block
- Storage bucket `geo-realm-bundles` (private, owner read/write)
- Storage bucket `geo-realm-canonical` (public read, admin write) — canonical datasets seeded by an edge function `seed-geo-realm-canonical` I invoke once
- Edge function `geo-realm-compile`: takes an uploaded file, runs the WASM parser server-side when file > worker threshold, writes bundle to storage, records row

---

## 6 · Rollout — 4 shippable milestones

**M1 · Foundation (this pass)**
- Table, buckets, RLS, `/geo-realm` route shell, Atlas Subsurface toggle, transparent-Earth mode, R3F overlay wired to Cesium camera
- Prefetch + render **Bird 2003 plates** and **GEM faults** (small GeoJSONs, no WASM needed)
- Compiler UI skeleton with drop zone (parsers stubbed)

**M2 · Slabs + Crust**
- Slab2 NetCDF parser + glTF mesh generator (edge function)
- CRUST1.0 stacked shells
- Canonical seeder run

**M3 · Seismic sections**
- SEG-Y WASM parser in worker
- Vertical plane placement + annotation tools
- Bathymetry heightmap inset

**M4 · Volumetric tomography**
- S40RTS → KTX2 3D texture pipeline
- Raymarched mantle shader with color ramp + slice controls

---

## 7 · Things I need from you before M1

- Confirm the route name `/geo-realm` (or you'd prefer `/atlas/subsurface`)
- OK to add ~3 client deps: `three-stdlib`, `geotiff`, `netcdfjs`? (SEG-Y stays worker-only, no bundle bloat)
- The canonical datasets are ~40 MB total after compression — OK to store in a public Cloud storage bucket seeded once, or should users trigger the seed themselves from the workbench?

Once you green-light, I'll ship M1 in the next turn — DB migration + Atlas subsurface toggle + `/geo-realm` shell + plates/faults renderer.
