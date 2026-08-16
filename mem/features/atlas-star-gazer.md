---
name: Atlas Star Gazer
description: Star Gazer tool in the Atlas Console — all-sky telescope surveys (visible/IR/microwave/X-ray/gamma/radio), celestial pointing and telescope FOV zoom
type: feature
---
- Entry point: Atlas Console icon menu → "Sky" (Telescope icon) opens `StarGazerPanel`.
- Imagery: `sky-imagery` edge function serves NASA/SVS Tycho Skymap II plus whitelisted CDS HiPS surveys rendered by hips2fits in equirectangular CAR (DSS2, 2MASS, AllWISE, IRIS, ROSAT RASS, Fermi, H.E.S.S. HGPS, Haslam 408 MHz, Planck HFI, Planck R2 CMB, WMAP W). All real mission data — no synthetic skies.
- Client re-projects the panorama to a Cesium cube-map skybox (`src/lib/sky/milkyWaySky.ts`); survey/res/enabled live in a shared module store (`useMilkyWaySky`) so only one hook instance installs the skybox.
- Pointing/zoom in `src/lib/sky/starTargets.ts`: RA/Dec → ICRF→fixed rotation, camera direction set without moving position; "trek into infinity" is frustum FOV narrowing (75° → 0.05°). FOV is restored when the panel closes.
