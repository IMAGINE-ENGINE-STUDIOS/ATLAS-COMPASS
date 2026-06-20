## Goal

Add a universal right-click menu (copy / paste / share / duplicate / delete) that works on the Object Control Bar, Scene Components panel, every gallery card, and the new Files page. Sharing sends any "file" (dynamic object, level, rig save, geometry, terrain entry) to another user by username, tracks recent + frequent recipients, and supports a friends graph. Add a Realtime matchmaking system on Lovable Cloud (not Kubernetes — Postgres + Realtime channels scale horizontally for the targeted concurrency; Kubernetes is not part of the Lovable Cloud platform and will be called out clearly to the user).

## What gets built

### 1. Backend (one migration)

New tables in `public` (with GRANTs + RLS in the same migration):
- `profiles` — `id` (= `auth.users.id`), `username` (citext UNIQUE), `display_name`, `avatar_url`. Auto-created via `handle_new_user()` trigger on `auth.users`.
- `friendships` — `requester_id`, `addressee_id`, `status` (`pending` / `accepted` / `blocked`). UNIQUE(requester, addressee). Symmetric helper view `friends_of(uuid)`.
- `share_recipients_stats` — `owner_id`, `recipient_id`, `last_shared_at`, `share_count`. Drives "recent" + "most common" suggestions.
- `file_shares` — `id`, `sender_id`, `recipient_id`, `kind` (`dynamic_object` | `level` | `rig_save` | `geometry` | `terrain` | `generic`), `source_table`, `source_id`, `payload jsonb` (snapshot so deletes don't orphan), `name`, `thumbnail_url`, `note`, `status` (`pending` / `accepted` / `declined`), `read_at`.
- `match_queue` — `user_id` PK, `mode` text, `skill` int, `region` text, `joined_at`. Realtime-enabled.
- `matches` — `id`, `mode`, `player_ids uuid[]`, `state` (`forming` / `ready` / `closed`), `room_channel`. Realtime-enabled.

Security-definer helpers: `is_friend(a uuid, b uuid)`, `lookup_user_by_username(text)` (returns id + display + avatar only — never email).

RLS highlights:
- `profiles`: world-readable for username search; user updates own row.
- `friendships`: visible to the two parties; insert by requester; update by addressee for accept/decline.
- `file_shares`: visible to sender and recipient only; recipient can update `status`/`read_at`.
- `match_queue` / `matches`: user sees own queue row + matches whose `player_ids` contains `auth.uid()`.

Edge function `matchmaking-tick` (cron-able / invokable): atomically groups queued users by mode + skill bucket + region, writes a `matches` row, deletes queued rows, broadcasts on the `matchmaking` Realtime channel. This is the horizontal-scaling primitive — Postgres handles the queue, Realtime fans out to clients.

### 2. Universal right-click menu

New `src/components/shared/FileContextMenu.tsx` wrapping shadcn `ContextMenu` with items:
- Copy, Cut, Paste, Duplicate
- Share to user… (opens ShareDialog)
- Copy share link
- Rename / Delete (when handler provided)

A lightweight `src/lib/fileClipboard.ts` keeps an in-memory + `localStorage` clipboard of `{kind, payload, sourceId}` so paste works across panels and pages.

Mounted in:
- `ObjectControlBar` (per-object row, plus a global "Paste here")
- `LayersPanel` / Scene Components rows
- Every gallery card (`DynamicObjectGallery`, `TerrainGallery`, rig gallery, levels list) via a tiny `<GalleryCardMenu />` wrapper
- New Files page rows

### 3. Share dialog + user picker

`src/components/sharing/ShareDialog.tsx`:
- Username input with debounced `lookup_user_by_username` RPC
- Tabs: Recent (from `share_recipients_stats` ORDER BY `last_shared_at`), Frequent (ORDER BY `share_count`), Friends
- "Add friend" button next to any user → inserts `friendships` row
- Optional note field; submit inserts `file_shares` and bumps `share_recipients_stats` via RPC `record_share(recipient, kind, source_id, payload, name, thumb, note)`

### 4. New `/files` page

`src/pages/FilesPage.tsx` route, linked from the main nav. Tabs:
- **My Files** — unified list of items the user owns (dynamic objects, levels, rig saves, geometries, terrain entries) pulled from existing tables + local stores. Right-click each row for copy / share / delete.
- **Shared with me** — `file_shares` where `recipient_id = auth.uid()`, with Accept (imports payload into the right store / table) and Decline.
- **Sent** — outbound shares with status.
- **Friends** — manage friend requests.

Realtime subscription to `file_shares` shows a toast + badge when a new share arrives.

### 5. Matchmaking client

`src/lib/matchmaking.ts` exposes `joinQueue({mode, skill, region})`, `leaveQueue()`, and subscribes to the `matchmaking` channel to resolve into a `match` row. A small `MatchmakingPanel` UI added under Files → Play tab as the first surface. Edge function ticks every few seconds (or on insert via trigger calling `pg_net`) so latency stays low.

## Files

**New:** `src/components/shared/FileContextMenu.tsx`, `src/components/shared/GalleryCardMenu.tsx`, `src/components/sharing/ShareDialog.tsx`, `src/components/sharing/UserSearchPicker.tsx`, `src/components/sharing/FriendsList.tsx`, `src/components/matchmaking/MatchmakingPanel.tsx`, `src/lib/fileClipboard.ts`, `src/lib/sharing.ts`, `src/lib/matchmaking.ts`, `src/pages/FilesPage.tsx`, edge function `supabase/functions/matchmaking-tick/index.ts`.

**Edited:** `src/App.tsx` (route), main nav, `ObjectControlBar`, `LayersPanel`, `DynamicObjectGallery`, `TerrainGallery`, `LevelsListPage`, rig gallery — each gets the context-menu wrapper and uses `sharing.ts` for the share action.

## Infra reality check

Lovable Cloud = Supabase (Postgres + Realtime + Edge Functions). It already autoscales the database and fans out Realtime to very high concurrency without you managing pods. Kubernetes isn't a Lovable Cloud primitive, so this plan uses the equivalent scalable primitives instead. If the project later needs custom container workloads, that would have to live on an external provider — call this out, don't fake it.

## Out of scope (call out, don't build)

- Group chat / DMs (only share notes for now)
- File versioning
- Public share-link landing pages (we copy a link string, but full anonymous viewer is deferred)
- Voice / video matchmaking rooms
