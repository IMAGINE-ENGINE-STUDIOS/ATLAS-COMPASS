import { useEffect, useState } from "react";
import { Cartesian2, Cartesian3, Color, LabelStyle, ScreenSpaceEventHandler, ScreenSpaceEventType, defined, type Viewer } from "cesium";
import { supabase } from "@/integrations/supabase/client";

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
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // render entities + double-click handler
  useEffect(() => {
    if (!isLoaded) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const added: any[] = [];
    for (const p of placements) {
      const ent = viewer.entities.add({
        id: `level-placement-${p.id}`,
        position: Cartesian3.fromDegrees(p.lng, p.lat, (p.altitude ?? 0) + 0.5),
        point: {
          pixelSize: 14,
          color: Color.fromCssColorString("#3b82f6"),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: `▣ ${p.levels?.name ?? "Level"}`,
          font: "12px Inter, sans-serif",
          pixelOffset: new Cartesian2(0, -22),
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString("rgba(15,23,42,0.85)"),
        },
      });
      (ent as any)._levelPlacement = p;
      added.push(ent);
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