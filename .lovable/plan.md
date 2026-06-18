## Animation library + galleries

A unified clip library for characters (built-in clips + curated URL packs + user uploads) and a parametric/preset gallery for object animations, surfaced through both a full-screen modal and an inline inspector panel.

### Note on "100 character animations"

True 100 free hosted humanoid clips are scarce — Mixamo requires auth, Sketchfab CC0 is per-file. The system is built to scale to any number, and seeded with **~100 named entries** drawn from:

- ~14 built-in Xbot clips (already in the default rig).
- ~25 curated three.js / Khronos sample rig clips (RobotExpressive, Soldier, CesiumMan, BrainStem, Fox).
- ~60 catalogued "slots" (named + tagged + categorised: combat, dance, idle variants, locomotion, social, parkour, sit/sleep, gestures) that resolve to a user-uploaded `.glb` matching the tag. Until uploaded, those tiles show an "Upload to enable" CTA — no broken fetches.

The user can drop a Mixamo zip / a single retargeted `.glb` and the library auto-fills matching slots by name. We can grow to literal 100 working clips by re-pointing the URL field to any hosted file the user provides.

### 1. New files

```text
src/lib/
├── characterAnimationLibrary.ts    # 100-entry catalog (name, tag, source, url, category)
├── objectAnimationPresets.ts       # 30+ procedural + parametric track factories
└── animationRetarget.ts            # Map clip bone names → active rig (Mixamo ↔ standard humanoid)

src/components/level/
├── animations/
│   ├── CharacterAnimationGallery.tsx   # Modal grid + live preview
│   ├── ObjectAnimationGallery.tsx      # Modal grid + parametric tab
│   ├── AnimationGalleryButton.tsx      # Toolbar trigger (opens modal)
│   ├── InlineAnimationPicker.tsx       # Inspector-embedded compact picker
│   ├── ClipPreviewTile.tsx             # Mini WebGL preview canvas per tile
│   └── PresetPreviewTile.tsx           # Wireframe cube playing a preset
└── upload/CharacterClipUpload.tsx      # .glb drop zone, extracts + names clips
```

### 2. Library schema

```ts
// characterAnimationLibrary.ts
export type ClipCategory =
  | "idle" | "locomotion" | "jump" | "combat" | "dance"
  | "social" | "gesture" | "sit" | "sleep" | "death" | "parkour" | "work";

export interface CharacterClipEntry {
  id: string;
  name: string;                 // "Sword Slash 02"
  category: ClipCategory;
  tags: string[];               // ["combat", "right-handed", "loop"]
  source: "builtin" | "url" | "user" | "slot";
  /** glb URL containing the clip. */
  url?: string;
  /** Exact clip name inside the glb. If omitted, takes the first clip. */
  clipName?: string;
  /** Tag used by the upload matcher to auto-fill the slot. */
  slotTag?: string;
  /** True if it should loop seamlessly. */
  loop: boolean;
  /** Suggested playback speed multiplier. */
  defaultSpeed?: number;
}

export const CHARACTER_ANIMATION_LIBRARY: CharacterClipEntry[]; // ~100 entries
```

### 3. Object preset schema

```ts
// objectAnimationPresets.ts
export interface ObjectPresetParam {
  key: string; label: string;
  type: "number" | "axis" | "easing";
  min?: number; max?: number; step?: number; default: any;
}

export interface ObjectAnimationPreset {
  id: string;
  name: string;
  category: "transform" | "scale" | "color" | "compound";
  description: string;
  params: ObjectPresetParam[];
  /** Returns an AnimationTrack ready to push into scene.animations. */
  build: (targetId: string, params: Record<string, any>) => AnimationTrack;
  /** Cheap thumb spec for static tile (icon + axis arrows). */
  thumb: { icon: string; arrows?: ("x"|"y"|"z")[] };
}
```

Ships with ~30 presets across:
- **Transform**: Spin (X/Y/Z), Orbit, Bob, Swing, Sway, Shake, Levitate.
- **Scale**: Pulse, Pop-in, Breathe, Bounce-in, Squash & stretch.
- **Color**: (Not yet — would require new color keyframe support; flagged as future.)
- **Compound**: Hover-spin, Float-in (slide + fade-via-scale), Conveyor loop, Drift.

Each preset's `build()` produces real `AnimationTrack` keyframes that slot into the existing animation timeline — no new playback engine needed.

### 4. Retargeting (`animationRetarget.ts`)

The active rig may not have identical bone names to a clip's source rig. Strategy:

1. Build a humanoid bone alias table (Mixamo `mixamorigHips` ↔ standard `Hips`, etc.).
2. When applying a clip whose source rig differs, rewrite track names through the alias table before calling `mixer.clipAction(clip).play()`.
3. Skip tracks that don't map and log once per clip (never throw).

This means an Xbot-baked clip can play on any roughly-humanoid Mixamo-export rig the user uploads.

### 5. UI — both modal and inline

`AnimationGalleryButton` lives:
- In the **Character inspector** ("Browse 100 animations" → opens `CharacterAnimationGallery` modal).
- In the **Object inspector** ("Browse presets" → opens `ObjectAnimationGallery` modal).

`InlineAnimationPicker` is a compact searchable list, used inside the same inspectors above-the-fold for quick swaps without leaving the panel.

Modal layout:
```text
┌───────────────────────────────────────────────────────────┐
│  Search [_______________]   Categories  [Idle][Combat]... │
├───────────────────────────────────────────────────────────┤
│  ▢ ▢ ▢ ▢ ▢ ▢          (each tile auto-plays preview)     │
│  ▢ ▢ ▢ ▢ ▢ ▢                                              │
│  ▢ ▢ ▢ ▢ ▢ ▢                                              │
└───────────────────────────────────────────────────────────┘
   [Upload .glb]                       [Apply]   [Cancel]
```

`ClipPreviewTile` mounts a 96×96 R3F canvas with `frameloop="demand"`, loads the clip lazily on viewport intersection (`IntersectionObserver`), plays one loop of the clip on a tiny shared Xbot rig, then unmounts. Hard cap of 6 concurrent previews to keep GPU sane.

`PresetPreviewTile` for object presets renders a single wireframe cube playing the preset's keyframes — pure transform, very cheap.

### 6. Object gallery: presets + parametric tabs

Two tabs inside the same modal:

- **Quick presets**: click → applies with defaults, no further input.
- **Parametric**: pick a preset → live preview updates as the user drags sliders (speed, amplitude, axis, easing, loop). "Apply" commits the generated `AnimationTrack` to `scene.animations` and starts playback.

### 7. Uploads

`CharacterClipUpload` accepts one or many `.glb` files:

1. Parse with `GLTFLoader`, enumerate `gltf.animations`.
2. For each clip name, find a matching `slotTag` entry in the library (case-insensitive substring match). If found, set the slot's `url` + `clipName` for this user session.
3. Unmatched clips become new `source: "user"` entries under category `"work"` (catch-all).
4. Persisted per-level inside `scene.userClipLibrary` (new optional field on `LevelScene`) so uploaded animations survive reloads.

### 8. Wiring into existing systems

- `LevelCharacter.tsx` already plays `obj.currentAnimation`. The gallery's "Apply" simply writes that field — zero playback rewiring.
- Object gallery's "Apply" pushes a new `AnimationTrack` into `scene.animations` and selects it in the animation panel — uses the existing timeline.
- Both galleries respect undo/redo via the normal `setScene` path.

### 9. Performance

- All catalog data is static + tree-shakeable.
- Clip glbs are lazy `useGLTF`'d only when their tile enters the viewport.
- A single shared preview rig is cloned per tile via `SkeletonUtils.clone` — no full re-decoding.
- Modal grids are virtualised via `@tanstack/react-virtual` (already in tree).

### 10. Implementation order

1. Library + object preset module (data only). Verify types compile.
2. `InlineAnimationPicker` swapped into existing inspectors. Ship.
3. Modal `CharacterAnimationGallery` with static thumbs first (no live preview) — usable end-to-end.
4. Object gallery: presets tab → parametric tab.
5. Live preview tiles + intersection-observer gating.
6. Upload + slot matching + per-level persistence.
7. Retargeting pass; verify Xbot clip on a user-uploaded rig.

### Out of scope (call out before building)

- Authoring new clips in-app (keyframe a custom skeleton motion) — separate feature.
- Mixamo OAuth import — requires their API key and ToS review.
- Color/material keyframes for object presets — needs the timeline to support property tracks beyond TRS first.
