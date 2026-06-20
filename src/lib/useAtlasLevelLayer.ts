import { useEffect, useState } from "react";
import {
  ArcType, Cartesian2, Cartesian3, Color, HeightReference, LabelStyle,
  ScreenSpaceEventHandler, ScreenSpaceEventType, defined, VerticalOrigin,
  type Viewer,
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
  levels?: { id: string; name: string; description: string | null } | null;
}

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
        .select("id,level_id,lat,lng,altitude,heading,scale,levels(id,name,description)");
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
      const snap = snapToLevelTile(p.lat, p.lng, DEFAULT_LEVEL_SIZE_M);
      const size = snap.tileSizeM;
      const baseAlt = p.altitude ?? 0;
      const boxHeight = LEVEL_HEIGHT_M;
      const beaconTop = baseAlt + 600;

      // Green translucent volume sized to the tile.
      const boxEnt = viewer.entities.add({
        id: `level-placement-${p.id}`,
        position: Cartesian3.fromDegrees(snap.lng, snap.lat, baseAlt + boxHeight / 2) as any,
        box: {
          dimensions: new Cartesian3(size, size, boxHeight) as any,
          material: Color.fromCssColorString("#10b981").withAlpha(0.45) as any,
          outline: true,
          outlineColor: Color.fromCssColorString("#86efac") as any,
          outlineWidth: 3,
        } as any,
      });
      (boxEnt as any)._levelPlacement = p;
      added.push(boxEnt);

      // Tall beacon polyline so the cube is spotted from far away.
      const beacon = viewer.entities.add({
        id: `level-placement-${p.id}-beacon`,
        polyline: {
          positions: [
            Cartesian3.fromDegrees(snap.lng, snap.lat, baseAlt),
            Cartesian3.fromDegrees(snap.lng, snap.lat, beaconTop),
          ] as any,
          width: 4,
          material: Color.fromCssColorString("#34d399").withAlpha(0.9) as any,
          arcType: ArcType.NONE,
        } as any,
      });
      (beacon as any)._levelPlacement = p;
      added.push(beacon);

      // Floating label always on top.
      const label = viewer.entities.add({
        id: `level-placement-${p.id}-label`,
        position: Cartesian3.fromDegrees(snap.lng, snap.lat, beaconTop) as any,
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
    const onPick = (click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id && (picked.id as any)._levelPlacement) {
        const p = (picked.id as any)._levelPlacement as LevelPlacement;
        // Fly the camera to the placement so the user sees it framed,
        // then hand control back to the host page (which will navigate).
        try {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(p.lng, p.lat, 800),
            duration: 1.0,
          });
        } catch {}
        onOpenLevel(p);
      }
    };
    handler.setInputAction(onPick, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(onPick, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      for (const e of added) {
        try { viewer.entities.remove(e); } catch {}
      }
      handler.destroy();
    };
  }, [placements, isLoaded, viewerRef, onOpenLevel]);

  return { placements };
}