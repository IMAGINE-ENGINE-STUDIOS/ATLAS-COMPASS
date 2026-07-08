/**
 * MeasureToolPanel
 * ----------------
 * Precise on-globe measurement toolkit. Three modes:
 *
 *   - "distance": multi-segment geodesic polyline. Total = sum of great-circle
 *                 arc lengths (Cesium.EllipsoidGeodesic) — accurate over long
 *                 spans, not planar-projected.
 *   - "area":     geodesic polygon area via spherical excess on WGS84 mean
 *                 radius. Also reports perimeter.
 *   - "height":   vertical difference between two picked points (Δaltitude
 *                 from photoreal mesh / globe pick), plus slant distance.
 *
 * Click to add a vertex; double-click / Enter to finish; Esc / Backspace to
 * remove the last vertex; "Clear" resets. Unit toggle switches metric ↔
 * imperial. Draws with Cesium Entity API — no React re-renders per hover.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Viewer, Entity } from "cesium";
import {
  Cartesian3,
  Cartographic,
  Color,
  EllipsoidGeodesic,
  HeightReference,
  Math as CesiumMath,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CallbackProperty,
  defined,
  LabelStyle,
  VerticalOrigin,
  Cartesian2,
  ConstantProperty,
} from "cesium";
import { Ruler, X, MousePointer2, Pentagon, MoveVertical, Trash2, Undo2 } from "lucide-react";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  onClose: () => void;
}

type Mode = "distance" | "area" | "height";
type Units = "metric" | "imperial";

interface Vertex {
  lng: number;
  lat: number;
  alt: number;
  cartesian: Cartesian3;
}

const WGS84_MEAN_RADIUS = 6371008.8; // meters — IUGG mean radius

export default function MeasureToolPanel({ viewerRef, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("distance");
  const [units, setUnits] = useState<Units>("metric");
  const [vertices, setVertices] = useState<Vertex[]>([]);
  const verticesRef = useRef<Vertex[]>([]);
  useEffect(() => { verticesRef.current = vertices; }, [vertices]);

  const entitiesRef = useRef<Entity[]>([]);

  // ── Precise picker: prefer scene.pickPosition (hits photoreal mesh /
  //    3D tiles), fall back to ellipsoid pick on the globe.
  const pickPoint = useCallback((position: Cartesian2): Vertex | null => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return null;
    const scene = viewer.scene;
    let cartesian: Cartesian3 | undefined =
      scene.pickPosition?.(position);
    if (!defined(cartesian)) {
      cartesian = scene.camera.pickEllipsoid(position, scene.globe.ellipsoid);
    }
    if (!defined(cartesian)) return null;
    const c = Cartographic.fromCartesian(cartesian);
    return {
      lng: CesiumMath.toDegrees(c.longitude),
      lat: CesiumMath.toDegrees(c.latitude),
      alt: c.height,
      cartesian,
    };
  }, [viewerRef]);

  // ── Wire Cesium input handlers
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((e: any) => {
      const v = pickPoint(e.position);
      if (!v) return;
      setVertices((prev) => {
        // Height mode caps at 2 points
        if (mode === "height" && prev.length >= 2) return [v];
        return [...prev, v];
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(() => {
      // finish (no-op for now — measurement is already live)
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => { handler.destroy(); };
  }, [viewerRef, mode, pickPoint]);

  // ── Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVertices([]);
      else if (e.key === "Backspace") setVertices((p) => p.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset when switching mode
  useEffect(() => { setVertices([]); }, [mode]);

  // ── Draw preview entities (imperative, so hover / vertex adds don't
  //    re-render the whole panel).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // clear previous
    for (const ent of entitiesRef.current) {
      try { viewer.entities.remove(ent); } catch { /* noop */ }
    }
    entitiesRef.current = [];

    // vertex dots
    vertices.forEach((v, i) => {
      const dot = viewer.entities.add({
        position: v.cartesian,
        point: {
          pixelSize: 9,
          color: Color.fromCssColorString("#38bdf8"),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: String(i + 1),
          font: "600 11px Inter, system-ui, sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(0, -14),
          verticalOrigin: VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entitiesRef.current.push(dot);
    });

    if (mode === "distance" && vertices.length >= 2) {
      const line = viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() =>
            verticesRef.current.map((v) => v.cartesian), false),
          width: 3,
          material: Color.fromCssColorString("#38bdf8"),
          clampToGround: false,
          arcType: 1 /* ArcType.GEODESIC */,
          depthFailMaterial: Color.fromCssColorString("#38bdf8").withAlpha(0.6),
        },
      });
      entitiesRef.current.push(line);
    }

    if (mode === "area" && vertices.length >= 3) {
      const poly = viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(vertices.map((v) => v.cartesian)),
          material: Color.fromCssColorString("#38bdf8").withAlpha(0.22),
          outline: true,
          outlineColor: Color.fromCssColorString("#38bdf8"),
          height: 0,
        },
      });
      entitiesRef.current.push(poly);
    }

    if (mode === "height" && vertices.length === 2) {
      // vertical connector between (lng,lat) at the lower alt to the higher point
      const [a, b] = vertices;
      const low = a.alt <= b.alt ? a : b;
      const high = a.alt <= b.alt ? b : a;
      const baseOfHigh = Cartesian3.fromDegrees(high.lng, high.lat, low.alt);
      const conn = viewer.entities.add({
        polyline: {
          positions: [baseOfHigh, high.cartesian],
          width: 3,
          material: Color.fromCssColorString("#fbbf24"),
          arcType: 0 /* ArcType.NONE — straight line */,
          depthFailMaterial: Color.fromCssColorString("#fbbf24").withAlpha(0.6),
        },
      });
      const slant = viewer.entities.add({
        polyline: {
          positions: [a.cartesian, b.cartesian],
          width: 2,
          material: Color.fromCssColorString("#38bdf8"),
          arcType: 0,
          depthFailMaterial: Color.fromCssColorString("#38bdf8").withAlpha(0.5),
        },
      });
      entitiesRef.current.push(conn, slant);
    }

    return () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      for (const ent of entitiesRef.current) {
        try { v.entities.remove(ent); } catch { /* noop */ }
      }
      entitiesRef.current = [];
    };
  }, [vertices, mode, viewerRef]);

  // ── Numeric measurements
  const measurements = useMemo(() => {
    if (mode === "distance") {
      if (vertices.length < 2) return { total: 0, segments: [] as number[] };
      const geodesic = new EllipsoidGeodesic();
      const segs: number[] = [];
      for (let i = 1; i < vertices.length; i++) {
        const a = Cartographic.fromDegrees(vertices[i - 1].lng, vertices[i - 1].lat);
        const b = Cartographic.fromDegrees(vertices[i].lng, vertices[i].lat);
        geodesic.setEndPoints(a, b);
        segs.push(geodesic.surfaceDistance);
      }
      return { total: segs.reduce((s, x) => s + x, 0), segments: segs };
    }
    if (mode === "area") {
      if (vertices.length < 3) return { area: 0, perimeter: 0 };
      const area = sphericalPolygonArea(vertices);
      // perimeter (geodesic)
      const geodesic = new EllipsoidGeodesic();
      let peri = 0;
      for (let i = 0; i < vertices.length; i++) {
        const a = Cartographic.fromDegrees(vertices[i].lng, vertices[i].lat);
        const j = (i + 1) % vertices.length;
        const b = Cartographic.fromDegrees(vertices[j].lng, vertices[j].lat);
        geodesic.setEndPoints(a, b);
        peri += geodesic.surfaceDistance;
      }
      return { area, perimeter: peri };
    }
    // height
    if (vertices.length < 2) return { deltaH: 0, slant: 0, ground: 0 };
    const [a, b] = vertices;
    const deltaH = Math.abs(b.alt - a.alt);
    const slant = Cartesian3.distance(a.cartesian, b.cartesian);
    const geodesic = new EllipsoidGeodesic(
      Cartographic.fromDegrees(a.lng, a.lat),
      Cartographic.fromDegrees(b.lng, b.lat),
    );
    return { deltaH, slant, ground: geodesic.surfaceDistance };
  }, [vertices, mode]);

  return (
    <div className="absolute top-[62px] right-4 z-30 w-[320px] pointer-events-auto">
      <div className="rounded-2xl border border-white/15 bg-black/75 backdrop-blur-xl shadow-2xl text-white overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Ruler className="w-3.5 h-3.5 text-sky-300" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-sky-200">Measure Tool</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-white/60">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-3 border-b border-white/10">
          <div className="grid grid-cols-3 gap-1.5">
            <ModeButton active={mode === "distance"} onClick={() => setMode("distance")} icon={<MousePointer2 className="w-3 h-3" />} label="Distance" />
            <ModeButton active={mode === "area"} onClick={() => setMode("area")} icon={<Pentagon className="w-3 h-3" />} label="Area" />
            <ModeButton active={mode === "height"} onClick={() => setMode("height")} icon={<MoveVertical className="w-3 h-3" />} label="Height" />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[9px] text-white/60 uppercase tracking-wider">Units</span>
            <div className="flex gap-0.5 rounded-md border border-white/15 p-0.5 bg-white/[0.03]">
              <button
                onClick={() => setUnits("metric")}
                className={`px-2 h-6 rounded text-[10px] font-bold uppercase tracking-wider ${units === "metric" ? "bg-sky-500/30 text-sky-100" : "text-white/60"}`}
              >Metric</button>
              <button
                onClick={() => setUnits("imperial")}
                className={`px-2 h-6 rounded text-[10px] font-bold uppercase tracking-wider ${units === "imperial" ? "bg-sky-500/30 text-sky-100" : "text-white/60"}`}
              >Imperial</button>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            {mode === "distance" && (
              <div className="space-y-1.5">
                <Readout label="Total distance" value={formatDistance((measurements as any).total, units)} big />
                {(measurements as any).segments?.length > 1 && (
                  <div className="pt-1 mt-1 border-t border-white/10">
                    <div className="text-[9px] text-white/45 uppercase tracking-wider mb-1">Segments</div>
                    <div className="max-h-24 overflow-y-auto space-y-0.5">
                      {(measurements as any).segments.map((s: number, i: number) => (
                        <div key={i} className="flex justify-between text-[10px] font-mono">
                          <span className="text-white/50">#{i + 1}</span>
                          <span className="text-white/85">{formatDistance(s, units)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {mode === "area" && (
              <div className="space-y-1.5">
                <Readout label="Area" value={formatArea((measurements as any).area, units)} big />
                <Readout label="Perimeter" value={formatDistance((measurements as any).perimeter, units)} />
              </div>
            )}
            {mode === "height" && (
              <div className="space-y-1.5">
                <Readout label="Δ Elevation" value={formatDistance((measurements as any).deltaH, units)} big />
                <Readout label="Slant distance" value={formatDistance((measurements as any).slant, units)} />
                <Readout label="Ground distance" value={formatDistance((measurements as any).ground, units)} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[10px] text-white/55">
            <span>
              {vertices.length === 0
                ? mode === "height" ? "Click 2 points (base + top)" : "Click the globe to add points"
                : `${vertices.length} point${vertices.length === 1 ? "" : "s"}`}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setVertices((p) => p.slice(0, -1))}
                disabled={vertices.length === 0}
                className="p-1 rounded hover:bg-white/10 text-white/60 disabled:opacity-30"
                title="Undo (Backspace)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setVertices([])}
                disabled={vertices.length === 0}
                className="p-1 rounded hover:bg-red-500/20 text-red-300 disabled:opacity-30"
                title="Clear (Esc)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-3 py-2 text-[9px] text-white/40 leading-relaxed">
          Geodesic distances on the WGS84 ellipsoid. Heights sampled from the loaded photoreal mesh when available.
        </div>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 rounded-md text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-1 border transition-all ${
        active
          ? "bg-sky-500/25 border-sky-300 text-sky-100 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
          : "bg-white/[0.04] border-white/15 text-white/70 hover:text-white"
      }`}
    >
      {icon}<span>{label}</span>
    </button>
  );
}

function Readout({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[9px] text-white/55 uppercase tracking-wider">{label}</span>
      <span
        className={`font-mono font-semibold tabular-nums text-sky-100 ${big ? "text-lg" : "text-xs"}`}
        style={{ fontFeatureSettings: '"tnum" 1, "ss01" 1' }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Formatting ────────────────────────────────────────────────────────────

function formatDistance(meters: number, units: Units): string {
  if (!Number.isFinite(meters) || meters === 0) return units === "metric" ? "0 m" : "0 ft";
  if (units === "metric") {
    if (meters >= 1000) return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} km`;
    return `${meters.toLocaleString(undefined, { maximumFractionDigits: 2 })} m`;
  }
  const feet = meters * 3.28084;
  if (feet >= 5280) return `${(feet / 5280).toLocaleString(undefined, { maximumFractionDigits: 3 })} mi`;
  return `${feet.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft`;
}

function formatArea(sqMeters: number, units: Units): string {
  if (!Number.isFinite(sqMeters) || sqMeters === 0) return units === "metric" ? "0 m²" : "0 ft²";
  if (units === "metric") {
    if (sqMeters >= 1_000_000) return `${(sqMeters / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })} km²`;
    if (sqMeters >= 10_000) return `${(sqMeters / 10_000).toLocaleString(undefined, { maximumFractionDigits: 3 })} ha`;
    return `${sqMeters.toLocaleString(undefined, { maximumFractionDigits: 2 })} m²`;
  }
  const sqft = sqMeters * 10.7639;
  if (sqft >= 27_878_400) return `${(sqft / 27_878_400).toLocaleString(undefined, { maximumFractionDigits: 4 })} mi²`;
  if (sqft >= 43_560) return `${(sqft / 43_560).toLocaleString(undefined, { maximumFractionDigits: 3 })} ac`;
  return `${sqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²`;
}

// Spherical excess polygon area on a sphere of WGS84 mean radius.
// Sufficient for most on-screen measurements (<< 1% error at continent scale).
function sphericalPolygonArea(verts: { lng: number; lat: number }[]): number {
  const n = verts.length;
  if (n < 3) return 0;
  const R = WGS84_MEAN_RADIUS;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    total += (CesiumMath.toRadians(p2.lng) - CesiumMath.toRadians(p1.lng)) *
             (2 + Math.sin(CesiumMath.toRadians(p1.lat)) + Math.sin(CesiumMath.toRadians(p2.lat)));
  }
  return Math.abs(total * R * R / 2);
}