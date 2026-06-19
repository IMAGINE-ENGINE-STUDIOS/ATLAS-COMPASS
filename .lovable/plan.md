## Goal

In Play mode, the level becomes a playable scene: a restricted, friendly HUD replaces the editor sidebars, and every object behaves according to a per-object "play behavior" the user authored in Edit mode (grab, push, walk, block, invisible, event). Keys are user-chosen per object (`E`, `7`, etc.).

## What already exists (verified)

- `playing` toggle in `LevelEditorPage.tsx:397`, threaded into `LevelScene3D` (`:1914`).
- `PlayableCharacter.tsx` provides WASD + mouse-look + gravity/collision + `E` interact pulse.
- Per-object `interaction` enum (`"pushable"|"sit"|"use"`) and `actionButtons[]` scaffold already on `BaseObject` (`src/lib/levelTypes.ts:6-66`). No play-mode runtime reads `actionButtons` yet.
- ObjectInspector lives inline at `LevelEditorPage.tsx:2459` and uses shadcn Switch / Select / Input.

## Schema changes — `src/lib/levelTypes.ts`

Replace the narrow `interaction` enum with a structured `playBehavior` block on `BaseObject`. Keep `interaction` as deprecated alias that migrates on read.

```ts
type PlayKey = string; // e.g. "E", "7", "Shift+F"

type PlayBehavior = {
  // collision
  collision: "walkable" | "blocking" | "none"; // walkable=stand on it, blocking=invisible wall, none=ghost
  invisibleInPlay?: boolean;                   // hidden mesh but collision still respected
  // actions (any combination allowed)
  grabbable?:  { key: PlayKey; carryOffset?: Vec3 };       // E to pick up / drop
  pushable?:   { mass?: number; friction?: number };       // walk into it
  event?:      { key: PlayKey; eventId: string; once?: boolean }; // press key while near → emit
  sittable?:   { key: PlayKey };
  usable?:     { key: PlayKey; label?: string };           // generic "use" hook
  // ranges
  interactRadius?: number; // default 2.5m for key-triggered actions
};
```

Add `BaseObject.playBehavior?: PlayBehavior`. Provide a `migrateInteraction(obj)` helper so old saved levels keep working.

## Inspector UI — `LevelEditorPage.tsx` (ObjectInspector, ~line 2459)

New "Play Behavior" collapsible section, shown for all non-character objects (characters keep their own controls):

- **Collision** — Select: Walkable / Blocking / None.
- **Invisible in Play** — Switch.
- **Grabbable** — Switch + `KeyCaptureInput` (label "Press a key…", default `E`).
- **Pushable** — Switch + 2 number inputs (mass, friction).
- **Triggers Event** — Switch + KeyCaptureInput (default `F`) + text Input (event id, e.g. `door_open`).
- **Sittable / Usable** — Switch + KeyCaptureInput each.
- **Interact Radius** — Slider 0.5 – 10 m.

`KeyCaptureInput` = small new component (`src/components/level/KeyCaptureInput.tsx`): focusable button that displays current key, on focus listens for one keydown and stores `"Shift+E"` style string. Avoids the current free-text `+`-split parser. Reused by `InteractionsPanel`.

## Play-mode runtime — new `src/components/level/play/`

1. **`PlayBehaviorRuntime.tsx`** — for each scene object with a `playBehavior`, mounts the needed sub-runtime:
   - `blocking` / `walkable` → tag mesh `userData.__collision` so existing raycaster in `PlayableCharacter.tsx` already picks it up. Add a flag so blocking volumes are excluded from ground-hit but included in horizontal collision.
   - `invisibleInPlay` → set `mesh.visible = false` while `playing`, restore on exit.
   - `pushable` → reuse existing `PushableRuntime`.
   - `grabbable` / `event` / `sittable` / `usable` → register into a new singleton in `locomotionState.ts` (`interactables: Map<id, {key, kind, position, radius, …}>`).

2. **`PlayInputManager.tsx`** — single global keydown listener (mounted only while `playing`). On each press:
   - Find nearest registered interactable whose `key` matches and whose distance ≤ `interactRadius` of the player.
   - Dispatch: grab/drop toggle, push pulse, sit transition, "use" animation, or `emitLevelEvent(eventId)`.
   - Publishes a small reactive event bus (`useLevelEvents()`) so animation tracks / future scripting can subscribe.

3. **Grab carry** — when grabbed, parent the object's group to the player root (or update position each frame to `player + carryOffset`). Release on second key press or on `playing=false`.

## Play HUD — new `src/components/level/play/PlayHUD.tsx`

Rendered as a fixed overlay (outside the R3F canvas) only when `playing`. Replaces the editor's right inspector for the player:

- Top-left: small character chip (name + HP/stamina placeholder, hidden if unused).
- Bottom-center: contextual prompt — "Press **E** to pick up Crate", auto-shown when the nearest interactable's radius is entered. Pulled from the runtime's "current candidate" state.
- Bottom-right: Exit Play button + minimal controls legend (WASD / Mouse / Space).
- Mobile-responsive: on touch viewports, prompts collapse into a single floating action button that shows the bound key/icon and is tappable.
- Editor sidebars (`leftCollapsed`/`rightOpen` panels) auto-hide while `playing` — toolbar shrinks to Play/Pause + Camera + Exit.

## Event system

Lightweight in-memory pub/sub in `locomotionState.ts`:
```ts
emitLevelEvent(id: string, payload?: any)
subscribeLevelEvent(id, cb): unsubscribe
```
Hook future animations/triggers in by listening; for this iteration just log + flash the HUD so authors can confirm wiring.

## Migration & safety

- On `LevelScene3D` load, if `obj.playBehavior` missing but legacy `obj.interaction` set, synthesise a `playBehavior` (e.g. `interaction:"pushable"` → `{collision:"walkable", pushable:{}}`).
- Default for objects with no behavior: `collision:"walkable"` (current implicit behavior). Nothing breaks.
- All edits respect `disabled={!isOwner}` like other inspector fields.

## Files touched

- `src/lib/levelTypes.ts` — schema + migration helper.
- `src/pages/LevelEditorPage.tsx` — new Play Behavior section in `ObjectInspector`; hide editor chrome while `playing`; mount `<PlayHUD/>` and `<PlayBehaviorRuntime/>`.
- `src/components/level/LevelScene3D.tsx` — tag meshes with collision/invisible flags; mount `PlayInputManager` while playing.
- `src/components/level/locomotion/PlayableCharacter.tsx` — small tweak so blocking-only volumes block horizontal but don't act as ground; consume `interactables` for "candidate" detection.
- `src/components/level/locomotion/locomotionState.ts` — interactable registry + event bus.
- New: `src/components/level/play/PlayHUD.tsx`, `PlayBehaviorRuntime.tsx`, `PlayInputManager.tsx`, `src/components/level/KeyCaptureInput.tsx`.

## Out of scope (call out for follow-ups)

- Full scripting language for events (only emit + log for now).
- Inventory UI for multiple grabbed items.
- Networked / multiplayer play.
- Physics engine swap (still custom raycast).

## Verification

Playwright: enter play mode on a level with one object set to `Grabbable E`, one `Blocking`, one `Event key=7 id=test`. Screenshot HUD prompt at proximity, press `E`, screenshot carried object, press `7`, screenshot HUD toast for `test`. Confirm editor sidebars hidden during play and restored on exit.