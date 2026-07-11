/**
 * Live-propagated lunar orbiter pins.
 *
 * Each orbiter's position updates every ~1s from the shared Keplerian
 * propagator. Selecting a pin opens a live info card showing current
 * sub-selenographic lat/lon and altitude above the Moon.
 */
import { useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Color,
  Ellipsoid,
  LabelStyle,
  VerticalOrigin,
  HeightReference,
  CallbackProperty,
  JulianDate,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";
import {
  LUNAR_ORBITERS,
  propagate,
  inertialToLatLonAlt,
  type OrbitElements,
} from "@/lib/moon/liveOrbits";
import { flyToMoonCoord } from "@/lib/moon/moonNavigation";
import { X, ExternalLink, Satellite } from "lucide-react";

interface Props {
  viewer: any;
}

interface LiveState {
  lat: number;
  lon: number;
  alt: number;
}

export default function LiveOrbits({ viewer }: Props) {
  const [selected, setSelected] = useState<OrbitElements | null>(null);
  const [liveMap, setLiveMap] = useState<Record<string, LiveState>>({});
  const liveMapRef = useRef<Record<string, LiveState>>({});

  // Continuous propagation loop.
  useEffect(() => {
    let raf = 0;
    let lastEmit = 0;
    const tick = () => {
      const now = Date.now();
      LUNAR_ORBITERS.forEach((o) => {
        const p = propagate(o, now);
        const ll = inertialToLatLonAlt(p, now);
        liveMapRef.current[o.id] = ll;
      });
      // Re-render the info card at 2 Hz.
      if (now - lastEmit > 500) {
        lastEmit = now;
        setLiveMap({ ...liveMapRef.current });
        try { viewer?.scene?.requestRender?.(); } catch {}
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewer]);

  // Add Cesium entities (one per orbiter). Position is a CallbackProperty
  // so Cesium re-samples every frame → smooth motion without React churn.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;
    const entities: any[] = [];
    LUNAR_ORBITERS.forEach((o) => {
      const positionCb = new CallbackProperty(() => {
        const now = Date.now();
        const p = propagate(o, now);
        const ll = inertialToLatLonAlt(p, now);
        return Cartesian3.fromDegrees(ll.lon, ll.lat, ll.alt, Ellipsoid.MOON);
      }, false);
      const ent = viewer.entities.add({
        id: `moon-orbit-${o.id}`,
        name: o.name,
        position: positionCb,
        point: {
          pixelSize: 10,
          color: Color.fromCssColorString(o.color),
          outlineColor: Color.WHITE,
          outlineWidth: 1.5,
          heightReference: HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `▲ ${o.name}`,
          font: "500 11px system-ui",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: { x: 10, y: 0 } as any,
          verticalOrigin: VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          showBackground: true,
          backgroundColor: Color.fromCssColorString("rgba(0,0,0,0.55)"),
          backgroundPadding: { x: 6, y: 3 } as any,
        },
        properties: { orbiterId: o.id },
      });
      entities.push(ent);
    });
    return () => {
      entities.forEach((e) => { try { viewer.entities.remove(e); } catch {} });
    };
  }, [viewer]);

  // Click → open info card + fly toward the orbiter's current subpoint.
  useEffect(() => {
    if (!viewer) return;
    const selectOrbiter = (o: OrbitElements) => {
      setSelected(o);
      const ll = liveMapRef.current[o.id];
      if (ll) {
        flyToMoonCoord(viewer, ll.lon, ll.lat, {
          altitude: Math.max(220_000, ll.alt * 2.8),
        });
      }
    };
    const h = new ScreenSpaceEventHandler(viewer.scene.canvas);
    h.setInputAction((e: any) => {
      const picked = viewer.scene.pick(e.position);
      const id = picked?.id?.properties?.orbiterId?.getValue?.();
      if (!id) return;
      const o = LUNAR_ORBITERS.find((x) => x.id === id);
      if (!o) return;
      selectOrbiter(o);
    }, ScreenSpaceEventType.LEFT_CLICK);
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent).detail?.id;
      const o = LUNAR_ORBITERS.find((x) => x.id === id);
      if (o) selectOrbiter(o);
    };
    window.addEventListener("moon:select-orbiter", onSelect as EventListener);
    return () => {
      try { h.destroy(); } catch {}
      window.removeEventListener("moon:select-orbiter", onSelect as EventListener);
    };
  }, [viewer]);

  // Silence unused import warning (JulianDate reserved for a future
  // Horizons-driven exact ephemeris path).
  void JulianDate;

  return (
    <>
      {selected && (() => {
        const ll = liveMap[selected.id];
        return (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[72] w-[360px] max-w-[90vw] rounded-2xl border border-white/15 bg-black/85 backdrop-blur-2xl shadow-2xl text-white animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-start p-3 gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: selected.color + "22", border: `1px solid ${selected.color}66` }}>
                <Satellite size={18} style={{ color: selected.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">{selected.name}</div>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">LIVE</span>
                  <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setSelected(null)}><X size={14} /></button>
                </div>
                <div className="text-[10px] opacity-60 mt-0.5">{selected.agency} · lunar orbit</div>
                <div className="text-[11px] opacity-90 mt-1.5 leading-snug">{selected.description}</div>
                {ll && (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <div className="bg-white/[0.05] rounded p-1.5">
                      <div className="opacity-50 uppercase tracking-wider text-[9px]">Lat</div>
                      <div className="tabular-nums">{ll.lat.toFixed(3)}°</div>
                    </div>
                    <div className="bg-white/[0.05] rounded p-1.5">
                      <div className="opacity-50 uppercase tracking-wider text-[9px]">Lon</div>
                      <div className="tabular-nums">{ll.lon.toFixed(3)}°</div>
                    </div>
                    <div className="bg-white/[0.05] rounded p-1.5">
                      <div className="opacity-50 uppercase tracking-wider text-[9px]">Alt</div>
                      <div className="tabular-nums">{(ll.alt / 1000).toFixed(1)} km</div>
                    </div>
                  </div>
                )}
                <a
                  href={selected.reference}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100 mt-2"
                >
                  <ExternalLink size={10} /> Mission reference
                </a>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}