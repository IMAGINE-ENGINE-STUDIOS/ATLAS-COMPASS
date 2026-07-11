/**
 * Atlas MAP import / export glue.
 *
 * - `importMapToAtlas`  reads a MAP file the user picked, creates a `levels`
 *   row from its scene (so all existing renderers + tooling work unchanged),
 *   then drops an `atlas_level_placements` row at the requested lat/lng so
 *   the unified Atlas overlay picks it up.
 * - `exportPlacementAsMap` reads the placement's underlying level scene and
 *   triggers a `.map` download.
 *
 * Keeping the on-disk shape (`MapFile`) decoupled from the DB lets us migrate
 * tables later without churning callers.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  coerceMapFile,
  downloadMap,
  exportMapJson,
  importMapJson,
  looksLikeMapFilename,
  suggestMapFilename,
  type MapAnchor,
  type MapFile,
} from "./mapFile";

export interface ImportTarget {
  lat: number;
  lng: number;
  alt: number;
  world?: "earth" | "moon";
}

export interface ImportResult {
  levelId: string;
  placementId: string;
  name: string;
}

/** Open a hidden <input type=file> and resolve with the picked File, or null. */
export function pickMapFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".map,application/json,application/x-lovable-map+json";
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      if (file && !looksLikeMapFilename(file.name)) {
        // Don't hard-reject — coerceMapFile still tries.
      }
      resolve(file);
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Read a MAP from `file`, persist it as a `levels` row owned by the current
 * user, and create an `atlas_level_placements` row anchored at `target`
 * (overriding the MAP's stored anchor — the user clicked where they want it).
 */
export async function importMapToAtlas(
  file: File,
  target: ImportTarget,
): Promise<ImportResult> {
  const map = await importMapJson(file);
  return persistMap(map, target);
}

/** Same as importMapToAtlas but takes an already-parsed MapFile / raw object. */
export async function importParsedMapToAtlas(
  input: MapFile | unknown,
  target: ImportTarget,
): Promise<ImportResult> {
  const map = coerceMapFile(input);
  return persistMap(map, target);
}

async function persistMap(map: MapFile, target: ImportTarget): Promise<ImportResult> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user?.id) {
    throw new Error("You need to be signed in to import a MAP.");
  }
  const ownerId = userRes.user.id;

  // 1. Insert the scene as a `levels` row. The Atlas renderer loads scenes
  //    by level id, so this keeps the rendering pipeline untouched.
  const { data: levelRow, error: levelErr } = await supabase
    .from("levels")
    .insert({
      owner_id: ownerId,
      name: map.name,
      description: map.description ?? null,
      scene: map.scene as any,
      is_public: false,
    })
    .select("id,name")
    .single();

  if (levelErr || !levelRow) {
    throw new Error(levelErr?.message ?? "Failed to create MAP.");
  }

  // 2. Place it at the user-clicked location. Anchor altitude prefers the
  //    live tile surface (passed in by the caller via `target.alt`).
  const anchor: MapAnchor = {
    ...map.anchor,
    lat: target.lat,
    lng: target.lng,
    alt: target.alt,
  };

  const { data: placement, error: placementErr } = await supabase
    .from("atlas_level_placements")
    .insert({
      owner_id: ownerId,
      level_id: levelRow.id,
      lat: anchor.lat,
      lng: anchor.lng,
      altitude: Math.max(0, anchor.alt),
      heading: anchor.heading ?? 0,
      scale: anchor.scale && anchor.scale > 0 ? anchor.scale : 1,
      world: target.world ?? "earth",
    })
    .select("id")
    .single();

  if (placementErr || !placement) {
    throw new Error(placementErr?.message ?? "Failed to drop MAP on the globe.");
  }

  // Let the Atlas pin layer + R3F overlay refresh immediately.
  window.dispatchEvent(new CustomEvent("atlas-level-placements-refresh"));

  return {
    levelId: levelRow.id,
    placementId: placement.id,
    name: levelRow.name,
  };
}

/**
 * Pull the placement's underlying scene and trigger a `.map` download. The
 * exported file remembers the original level id + the placement's anchor so
 * re-import lands the geometry exactly where it was.
 */
export async function exportPlacementAsMap(args: {
  levelId: string;
  name: string;
  description?: string | null;
  lat: number;
  lng: number;
  altitude?: number;
  heading?: number;
  scale?: number;
}): Promise<void> {
  const { data, error } = await supabase
    .from("levels")
    .select("scene")
    .eq("id", args.levelId)
    .maybeSingle();

  if (error || !data?.scene) {
    throw new Error(error?.message ?? "Couldn't load MAP scene.");
  }

  const blob = exportMapJson({
    name: args.name,
    description: args.description ?? undefined,
    sourceLevelId: args.levelId,
    anchor: {
      lat: args.lat,
      lng: args.lng,
      alt: args.altitude ?? 0,
      heading: args.heading ?? 0,
      scale: args.scale && args.scale > 0 ? args.scale : 1,
    },
    scene: data.scene as any,
  });

  downloadMap(blob, suggestMapFilename(args.name));
}