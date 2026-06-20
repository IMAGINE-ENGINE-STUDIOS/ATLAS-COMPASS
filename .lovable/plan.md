## Goal

Two related additions to the Level Editor:

1. **Groups** — a way to bind several scene objects together so the editor treats them as one selection unit, and so the Play runtime parents them as a rigid group.
2. **Dynamic Objects** — a new category and gallery (Local + Cloud) for reusable "object presets". A Dynamic Object packages a single object **or** a whole group together with its interactions, scripts, splines, materials, animations, etc., so it can be dropped into any level later.

The save/load controls live inside the existing **Object Control Bar** (the contextual top bar that already appears when something is selected).

---

## 1 · Groups

Schema (`src/lib/levelTypes.ts`)
- New `SceneGroup { id, name, color?, memberIds: string[], locked?, collapsed? }`.
- `LevelScene.groups?: SceneGroup[]`.
- `BaseObject.groupId?: string` — convenience back-pointer, kept in sync.

Editor behaviour (`src/pages/LevelEditorPage.tsx`)
- Selecting any group member auto-extends the selection to **all** members (Alt-click to override and pick the lone object).
- Move / rotate / scale / duplicate / delete / lock / hide operations applied to a group member fan out to every member.
- New "Groups" section in the left Layers / outline panel — collapsible, rename, ungroup, change color chip.
- New `Ctrl+G` shortcut: group current selection. `Ctrl+Shift+G` ungroup.

Runtime parenting (`src/components/level/LevelScene3D.tsx` + new `GroupRuntime.tsx`)
- During Play, for each group with ≥2 members we mount an invisible `THREE.Group` anchored at the centroid and parent the live `objectWorldRefs` of every member into it on play-start. On stop we restore originals. While parented, child splines/physics still drive the parent, so kicking one member moves the whole group.

---

## 2 · Dynamic Object category & gallery

Data model (`src/lib/dynamicObjects.ts` — new)

```
DynamicObjectEntry {
  id, name, description?, tags[], createdAt,
  source: "local" | "cloud" | "builtin",
  ownerId?: string,         // cloud only
  isPublic?: boolean,       // cloud only
  thumbnailUrl?: string,
  payload: {
    kind: "single" | "group",
    objects: SceneObject[],     // relative to payload origin (0,0,0)
    scenePaths?: ScenePath[],   // any spline referenced by splineBindings
    groupName?: string,
  }
}
```

- Local store: `localStorage` key `lovable.dynamicObjects.v1` (mirrors the terrain library API: `loadSavedDynamics`, `saveDynamic`, `deleteDynamic`, `renameDynamic`).
- Cloud store: new table `public.dynamic_objects` on Lovable Cloud with RLS + GRANTs, plus a `dynamic-thumbnails` storage bucket (public). Service uses the existing supabase client.

Cloud schema (migration)
```
create table public.dynamic_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text,
  tags text[] not null default '{}',
  is_public boolean not null default false,
  thumbnail_url text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- GRANTs (authenticated + service_role; anon SELECT only for public rows policy)
-- RLS: SELECT (is_public OR owner_id = auth.uid()), INSERT/UPDATE/DELETE owner_id = auth.uid()
```

UI surfaces
- **Object Control Bar** — add a "Save as Dynamic" split-button. Click opens a small dialog asking:
  - Scope: *Single object* / *Whole group* (auto-defaults based on current selection; disabled when not applicable).
  - Name, description, tags.
  - Destination: *Local only* · *Local + my cloud library* · *Local + cloud + share publicly*.
- **Sidebar Components panel** — new "Dynamic Objects" group alongside the existing categories (Primitives, Polygons, Models, Characters …). Clicking opens the gallery.
- **DynamicObjectGallery** (`src/components/level/dynamics/DynamicObjectGallery.tsx`) — modal modeled on `TerrainGallery` + `CharacterAnimationGallery`, with three tabs:
  - **Local** (browser saves)
  - **My Cloud** (`owner_id = auth.uid()`)
  - **Public** (`is_public = true`, sorted recent)
  Each card has thumbnail, name, tags, "Add to scene", rename (own only), delete (own only), "Publish/Unpublish" toggle for cloud rows you own.
- **Adding to scene**: clone payload objects with fresh ids, offset to current cursor / camera-target, register any referenced `ScenePath`s (rewrite ids), set `groupId` if it was a group.

Thumbnail capture
- When saving, snapshot the selection by drawing an off-screen render of the scene's bounding-box framing using the existing R3F renderer (`gl.toDataURL`). Cloud uploads send the PNG to the `dynamic-thumbnails` bucket; local saves stash the data URL inline.

---

## Technical details

Files added
- `src/lib/dynamicObjects.ts` — types + local store + cloud service
- `src/components/level/dynamics/DynamicObjectGallery.tsx`
- `src/components/level/dynamics/SaveAsDynamicDialog.tsx`
- `src/components/level/GroupRuntime.tsx`

Files edited
- `src/lib/levelTypes.ts` — `SceneGroup`, `LevelScene.groups`, `BaseObject.groupId`
- `src/pages/LevelEditorPage.tsx` — group selection fan-out, Ctrl+G shortcut, Object Control Bar buttons, Components-panel "Dynamic Objects" entry, gallery wiring
- `src/components/level/LevelScene3D.tsx` — mount `GroupRuntime`
- Supabase migration — `dynamic_objects` table, RLS, GRANTs, storage bucket

ASCII overview:

```text
            ┌──────────── Object Control Bar ────────────┐
selection → │ [Move][Rot][Scale]  …  [Group▾] [Save as▾] │
            └────┬──────────────────────────────┬────────┘
                 │                              │
                 ▼                              ▼
           SceneGroup added          SaveAsDynamicDialog
           (members → groupId)       (scope, name, dest)
                                          │
                                          ▼
                              ┌── local store ──┐ ┌── cloud table ──┐
                              │  localStorage   │ │ dynamic_objects │
                              └────────┬────────┘ └────────┬────────┘
                                       └────────┬──────────┘
                                                ▼
                                  DynamicObjectGallery
                                  (Local / Mine / Public)
                                                │
                                                ▼
                                    addObjects(payload→fresh ids)
```

---

## Out of scope (follow-ups)

- Nested groups (groups of groups).
- Versioning / forking of cloud dynamic objects.
- In-gallery search by tag (basic name filter only in v1).
- Animation tracks bundled inside a dynamic object payload (v1 keeps tracks scene-level).
