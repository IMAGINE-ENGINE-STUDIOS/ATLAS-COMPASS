import { useEffect, useState } from "react";
import {
  ArcType, Cartesian2, Cartesian3, Color, CallbackProperty, HeadingPitchRange, HeightReference,
  LabelStyle, Math as CesiumMath, ScreenSpaceEventHandler, ScreenSpaceEventType,
  defined, VerticalOrigin, type Viewer,
} from "cesium";
import { supabase } from "@/integrations/supabase/client";
import { snapToLevelTile, DEFAULT_LEVEL_SIZE_M, LEVEL_HEIGHT_M } from "./atlasLevelGeo";

export interface LevelPlacement {
  id: string;
  level_id: string;
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  scale: number;
  /** Feet of editable terrain extending outward from the level's edge.
   *  0 = cut only at the level's own perimeter (no hole beyond it). */
  terrain_expand_feet?: number;
  /** Optional configuration for the surrounding terrain plane
   *  (color / texture / etc.) — mirrors the level editor's SceneTerrain. */
  surrounding_terrain?: any | null;
  levels?: { id: string; name: string; description: string | null } | null;
}

/**
 * Shared mutable set of level placement ids whose cheap green Cesium box
 * should be hidden — populated by AtlasLevelsR3FOverlay once it has mounted
 * the real R3F scene for that placement. Read every frame via
 * CallbackProperty so toggling is instant and doesn't require recreating
 * entities.
 */
export const hiddenLevelIds: Set<string> = new Set();

/** Fired by Cesium pin/box click — overlay listens and starts in-world play. */
export const LEVEL_PLAY_EVENT = "atlas-level-play-request";

/**
 * Loads atlas_level_placements and renders them as Cesium pins.
 * Double-click a pin to open its Level page.
 */
export function useAtlasLevelLayer(
  viewerRef: React.MutableRefObject<Viewer | null>,
  isLoaded: boolean,
  onOpenLevel: (placement: LevelPlacement) => void,
) {
  const [placements, setPlacements] = useState<LevelPlacement[]>([]);

  // load + subscribe
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("atlas_level_placements")
        .select("id,level_id,lat,lng,altitude,heading,scale,terrain_expand_feet,surrounding_terrain,levels(id,name,description)");
      if (!cancelled) setPlacements((data ?? []) as any);
    };
    load();
    const channel = supabase
      .channel("atlas-level-placements")
      .on("postgres_changes", { event: "*", schema: "public", table: "atlas_level_placements" }, load)
      .subscribe();
    const onRefresh = () => load();
    window.addEventListener("atlas-level-placements-refresh", onRefresh);
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.removeEventListener("atlas-level-placements-refresh", onRefresh);
    };
  }, []);

  // render entities + double-click handler
  useEffect(() => {
    if (!isLoaded) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const added: any[] = [];
    for (const p of placements) {
      // Render the cube at the EXACT stored coordinates (no slippy-tile snap)
      // so it appears precisely where the user clicked on the globe.
      const size = DEFAULT_LEVEL_SIZE_M;
      const baseAlt = p.altitude ?? 0;
      const boxHeight = LEVEL_HEIGHT_M;
      const beaconTop = baseAlt + 600;

      // Ultra-low LOD placeholder: a green box drawn directly by Cesium so
      // it shows up the moment the globe loads (before the heavier R3F
      // overlay mounts), and remains as a cheap stand-in when the camera
      // is far away. The full R3F level scene fades in on top once the
      // user gets close (see AtlasLevelsR3FOverlay).
      const boxEnt = viewer.entities.add({
        id: `level-placement-${p.id}-box`,
        position: Cartesian3.fromDegrees(p.lng, p.lat, baseAlt + boxHeight / 2) as any,
        box: {
          dimensions: new Cartesian3(size, size, boxHeight) as any,
          material: Color.fromCssColorString("#34d399").withAlpha(0.55) as any,
          outline: true,
          outlineColor: Color.fromCssColorString("#10b981") as any,
          show: new CallbackProperty(() => !hiddenLevelIds.has(p.id), false) as any,
        } as any,
      });
      (boxEnt as any)._levelPlacement = p;
      added.push(boxEnt);

      // Tall beacon polyline so the cube is spotted from far away.
      const beacon = viewer.entities.add({
        id: `level-placement-${p.id}-beacon`,
        polyline: {
          positions: [
            Cartesian3.fromDegrees(p.lng, p.lat, baseAlt),
            Cartesian3.fromDegrees(p.lng, p.lat, beaconTop),
          ] as any,
          width: 4,
          material: Color.fromCssColorString("#34d399").withAlpha(0.9) as any,
          arcType: ArcType.NONE,
          show: new CallbackProperty(() => !hiddenLevelIds.has(p.id), false) as any,
        } as any,
      });
      (beacon as any)._levelPlacement = p;
      added.push(beacon);

      // Floating label always on top.
      const label = viewer.entities.add({
        id: `level-placement-${p.id}-label`,
        position: Cartesian3.fromDegrees(p.lng, p.lat, beaconTop) as any,
        label: {
          text: `▣ ${p.levels?.name ?? "Level"}`,
          font: "bold 13px Inter, sans-serif",
          pixelOffset: new Cartesian2(0, -8),
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString("rgba(16,185,129,0.85)"),
          heightReference: HeightReference.NONE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        point: {
          pixelSize: 12,
          color: Color.fromCssColorString("#34d399"),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      (label as any)._levelPlacement = p;
      added.push(label);
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    const flyTo = (p: LevelPlacement) => {
      try {
        const center = Cartesian3.fromDegrees(p.lng, p.lat, (p.altitude ?? 0) + LEVEL_HEIGHT_M / 2);
        viewer.camera.flyToBoundingSphere(
          { center, radius: DEFAULT_LEVEL_SIZE_M * 0.9 } as any,
          {
            duration: 1.0,
            offset: new HeadingPitchRange(
              CesiumMath.toRadians(p.heading ?? 0),
              CesiumMath.toRadians(-12),
              DEFAULT_LEVEL_SIZE_M * 1.8,
            ),
          } as any,
        );
      } catch {}
    };

    // Single click → just select (open the inspector panel). No fly-in.
    const onClick = (click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id && (picked.id as any)._levelPlacement) {
        const p = (picked.id as any)._levelPlacement as LevelPlacement;
        onOpenLevel(p);
      }
    };
    // Double click → fly to the level and open the inspector.
    const onDbl = (click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id && (picked.id as any)._levelPlacement) {
        const p = (picked.id as any)._levelPlacement as LevelPlacement;
        flyTo(p);
        onOpenLevel(p);
      }
    };
    handler.setInputAction(onClick, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(onDbl, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      for (const e of added) {
        try { viewer.entities.remove(e); } catch {}
      }
      handler.destroy();
    };
  }, [placements, isLoaded, viewerRef, onOpenLevel]);

  return { placements };
}