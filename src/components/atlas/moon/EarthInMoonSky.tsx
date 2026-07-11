/**
 * Render Earth as a small textured body in the Moon viewer at the real
 * astronomical distance & direction.
 *
 * Cesium exposes `Simon1994PlanetaryPositions.computeMoonPositionInEarth
 * InertialFrame(time)` — the Moon's position in the Earth ICRF frame. We
 * flip the sign to get Earth's position in a Moon-centred frame at the
 * exact real distance (~356,000 – 407,000 km depending on lunar phase).
 *
 * The result is a real, time-varying position: Earth in the Moon's sky
 * exactly where it would be if you stood on the Moon right now.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cartesian3,
  Color,
  JulianDate,
  CallbackProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Simon1994PlanetaryPositions,
  LabelStyle,
  VerticalOrigin,
} from "cesium";

const EARTH_RADIUS_M = 6_378_137;

interface Props {
  viewer: any;
}

export default function EarthInMoonSky({ viewer }: Props) {
  const navigate = useNavigate();
  const [dist, setDist] = useState<number | null>(null);
  const posRef = useRef<Cartesian3>(new Cartesian3());

  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;

    const computePos = () => {
      const now = JulianDate.now();
      // Moon position in Earth inertial frame.
      const moonInEarth = (Simon1994PlanetaryPositions as any)
        .computeMoonPositionInEarthInertialFrame(now, new Cartesian3());
      // Earth position in Moon-centred frame is the negation.
      Cartesian3.negate(moonInEarth, posRef.current);
      return posRef.current;
    };

    // Initial distance for UI + subsequent frames via callback property.
    computePos();
    setDist(Cartesian3.magnitude(posRef.current));

    const positionCb = new CallbackProperty(() => {
      return computePos();
    }, false);

    const ent = viewer.entities.add({
      id: "moon-earth-body",
      name: "Earth",
      position: positionCb,
      ellipsoid: {
        radii: new Cartesian3(EARTH_RADIUS_M, EARTH_RADIUS_M, EARTH_RADIUS_M),
        material: Color.fromCssColorString("#5aa3ff").withAlpha(0.95),
        outline: true,
        outlineColor: Color.fromCssColorString("#a9d1ff"),
      },
      label: {
        text: "▲ EARTH · tap to travel",
        font: "500 12px system-ui",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: { x: 0, y: -16 } as any,
        verticalOrigin: VerticalOrigin.BOTTOM,
        showBackground: true,
        backgroundColor: Color.fromCssColorString("rgba(0,80,160,0.75)"),
        backgroundPadding: { x: 8, y: 4 } as any,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { earthPortal: true },
    });

    // Update distance readout at 1 Hz.
    const distTimer = setInterval(() => {
      computePos();
      setDist(Cartesian3.magnitude(posRef.current));
    }, 1000);

    // Click Earth → route back to /atlas.
    const h = new ScreenSpaceEventHandler(viewer.scene.canvas);
    h.setInputAction((e: any) => {
      const picked = viewer.scene.pick(e.position);
      if (picked?.id?.properties?.earthPortal?.getValue?.()) {
        navigate("/atlas");
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      clearInterval(distTimer);
      try { h.destroy(); } catch {}
      try { viewer.entities.remove(ent); } catch {}
    };
  }, [viewer, navigate]);

  return (
    <div className="fixed top-3 left-3 z-[70] rounded-full bg-black/60 backdrop-blur-xl border border-white/15 px-3 h-10 flex items-center gap-2 text-[11px] text-white shadow-2xl">
      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <span className="opacity-70">Earth distance</span>
      <span className="tabular-nums font-medium">
        {dist != null ? `${(dist / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km` : "—"}
      </span>
    </div>
  );
}