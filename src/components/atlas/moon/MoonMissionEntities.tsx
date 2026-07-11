/**
 * Renders NASA mission catalog entries as Cesium entities on the Moon globe.
 */
import { useEffect } from "react";
import {
  Cartesian3,
  Color,
  HeightReference,
  LabelStyle,
  VerticalOrigin,
  Ellipsoid,
  HeadingPitchRange,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";
import {
  MOON_MISSIONS,
  MISSION_KIND_COLOR,
  type MoonMission,
} from "@/data/moon/missions";

interface Props {
  viewer: any;
  visible: boolean;
  filterKinds: Set<string> | null;
  onSelect?: (m: MoonMission) => void;
}

export default function MoonMissionEntities({
  viewer,
  visible,
  filterKinds,
  onSelect,
}: Props) {
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;

    const entities: any[] = [];

    if (visible) {
      MOON_MISSIONS.forEach((m) => {
        if (filterKinds && filterKinds.size > 0 && !filterKinds.has(m.kind)) return;
        const color = Color.fromCssColorString(MISSION_KIND_COLOR[m.kind]);
        const ent = viewer.entities.add({
          id: `moon-mission-${m.id}`,
          name: m.name,
          position: Cartesian3.fromDegrees(m.lon, m.lat, 0, Ellipsoid.MOON),
          point: {
            pixelSize: m.kind === "crewed_landing" ? 12 : 9,
            color,
            outlineColor: Color.WHITE,
            outlineWidth: 1.5,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: m.name,
            font: "500 12px system-ui",
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: { x: 0, y: -14 } as any,
            verticalOrigin: VerticalOrigin.BOTTOM,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            translucencyByDistance: undefined,
            showBackground: true,
            backgroundColor: Color.fromCssColorString("rgba(0,0,0,0.55)"),
            backgroundPadding: { x: 6, y: 3 } as any,
          },
          properties: { moonMissionId: m.id },
        });
        entities.push(ent);
      });
      viewer.scene.requestRender();
    }

    return () => {
      entities.forEach((e) => {
        try { viewer.entities.remove(e); } catch {}
      });
      try { viewer.scene?.requestRender(); } catch {}
    };
  }, [viewer, visible, filterKinds]);

  // Click handler
  useEffect(() => {
    if (!viewer || !onSelect) return;
    const handler = (e: any) => {
      const picked = viewer.scene.pick(e.position);
      const id = picked?.id?.properties?.moonMissionId?.getValue?.();
      if (!id) return;
      const m = MOON_MISSIONS.find((x) => x.id === id);
      if (m) {
        onSelect(m);
        try {
          viewer.camera.flyToBoundingSphere(
            { center: Cartesian3.fromDegrees(m.lon, m.lat, 0, Ellipsoid.MOON), radius: 20000 } as any,
            { duration: 1.4, offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), 60000) }
          );
        } catch {}
      }
    };
    const h = new ScreenSpaceEventHandler(viewer.scene.canvas);
    h.setInputAction(handler, ScreenSpaceEventType.LEFT_CLICK);
    return () => { try { h.destroy(); } catch {} };
  }, [viewer, onSelect]);

  return null;
}