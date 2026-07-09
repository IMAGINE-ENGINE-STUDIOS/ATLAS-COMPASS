/**
 * MeasureToolPanel
 * ----------------
 * Ultra-precise on-globe measurement toolkit with a persistent ledger.
 *
 * Modes:
 *   - "distance": multi-segment geodesic polyline (great-circle arcs).
 *   - "area":     geodesic polygon, area via spherical excess (WGS84 R̄).
 *   - "height":   Δaltitude between 2 points (from photoreal mesh / globe).
 *
 * Rendering:
 *   - Numbered glass-pill markers are HTML overlay nodes positioned each
 *     frame in scene.postRender (same technique as AtlasTagsOverlay).
 *   - Lines / polygons use Cesium Entity API with CallbackProperty so
 *     geometry updates as vertices change without rebuilding entities.
 *
 * Ledger:
 *   - "Finish" commits the current draft to a persistent ledger (localStorage).
 *   - Each saved measurement can be hidden/shown, focused (fly to), deleted.
 *   - Draft and saved geometry render simultaneously.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Viewer, Entity } from "cesium";
import {
  Cartesian3,
  Cartographic,
  Color,
  EllipsoidGeodesic,
  Math as CesiumMath,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CallbackProperty,
  SceneTransforms,
  BoundingSphere,
  HeadingPitchRange,
  defined,
  ArcType,
  PolylineDashMaterialProperty,
} from "cesium";
import {
  Ruler, X, MousePointer2, Pentagon, MoveVertical, Trash2, Undo2,
  Check, Eye, EyeOff, Target, ChevronDown, ChevronRight, Pencil, Redo2,
  Sun,
} from "lucide-react";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  onClose: () => void;
}

type Mode = "distance" | "area" | "height" | "roof";
type Units = "metric" | "imperial";

interface Vertex { lng: number; lat: number; alt: number }
interface SavedMeasurement {
  id: string;
  mode: Mode;
  vertices: Vertex[];
  createdAt: number;
  hidden?: boolean;
  label?: string;
}

const WGS84_MEAN_RADIUS = 6371008.8;
const LEDGER_KEY = "atlas.measure.ledger.v1";
const MODE_COLOR: Record<Mode, string> = {
  distance: "#38bdf8",
  area: "#a78bfa",
  height: "#fbbf24",
  roof: "#f97316",
};
const RENDER_LIFT_METERS = 0.85;
// Draft (per-frame CallbackProperty) sampling — keep tiny to avoid stalls.
const DRAFT_SAMPLE_STEP_METERS = 120;
const DRAFT_SAMPLE_MAX_STEPS = 6;
// Saved (built once) sampling — can afford more detail.
const SAVED_SAMPLE_STEP_METERS = 25;
const SAVED_SAMPLE_MAX_STEPS = 40;

// ── Geometry helpers (hoisted; referenced by Cesium CallbackProperty
// closures which run every render tick — must exist at module top level).
function withCursor(vs: Vertex[], cursor: Vertex | null, cap = Infinity): Vertex[] {
  if (!cursor || vs.length === 0) return vs;
  const out = [...vs, cursor];
  return out.length > cap ? out.slice(0, cap) : out;
}
function haversine(a: Vertex, b: Vertex): number {
  const R = WGS84_MEAN_RADIUS;
  const φ1 = CesiumMath.toRadians(a.lat), φ2 = CesiumMath.toRadians(b.lat);
  const dφ = φ2 - φ1;
  const dλ = CesiumMath.toRadians(b.lng - a.lng);
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function bearingDeg(a: Vertex, b: Vertex): number {
  const φ1 = CesiumMath.toRadians(a.lat), φ2 = CesiumMath.toRadians(b.lat);
  const dλ = CesiumMath.toRadians(b.lng - a.lng);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (CesiumMath.toDegrees(Math.atan2(y, x)) + 360) % 360;
}
function destinationPoint(from: Vertex, bearingDegrees: number, distanceMeters: number): Vertex {
  const R = WGS84_MEAN_RADIUS;
  const δ = distanceMeters / R;
  const θ = CesiumMath.toRadians(bearingDegrees);
  const φ1 = CesiumMath.toRadians(from.lat);
  const λ1 = CesiumMath.toRadians(from.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
                             Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lng: ((CesiumMath.toDegrees(λ2) + 540) % 360) - 180, lat: CesiumMath.toDegrees(φ2), alt: from.alt };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Find the *visible mesh* ground beneath a picked point.
 * The picked point is usually the TOP of a building/object; sampling directly
 * under it returns the roof (mesh is opaque above ground). We ring-sample
 * around the click and take the LOWEST returned height — that's ground
 * next to the object. Falls back to terrain, then to the pick's own alt.
 * Called only on click (never per-frame) so `sampleHeight` cost is fine.
 */
function sampleGroundBeneath(viewer: Viewer | null | undefined, top: Vertex): number {
  if (!viewer || viewer.isDestroyed()) return top.alt;
  const scene: any = viewer.scene;
  const R = WGS84_MEAN_RADIUS;
  const metersToDegLat = (m: number) => (m / R) * (180 / Math.PI);
  const metersToDegLng = (m: number, lat: number) =>
    (m / (R * Math.cos(CesiumMath.toRadians(lat)))) * (180 / Math.PI);

  const candidates: number[] = [];
  // Ring radii in metres — small (right beside object) and larger (open ground).
  const radii = [4, 10, 22];
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  for (const r of radii) {
    const dLat = metersToDegLat(r);
    const dLng = metersToDegLng(r, top.lat);
    for (const a of angles) {
      const rad = CesiumMath.toRadians(a);
      const lat = top.lat + Math.cos(rad) * dLat;
      const lng = top.lng + Math.sin(rad) * dLng;
      const carto = Cartographic.fromDegrees(lng, lat, top.alt + 50);
      // Prefer sampleHeight (samples visible mesh incl. Photorealistic 3D Tiles).
      try {
        if (scene.sampleHeightSupported && typeof scene.sampleHeight === "function") {
          const h = scene.sampleHeight(carto);
          if (finiteNumber(h)) { candidates.push(h); continue; }
        }
      } catch {}
      // Fallback: clampToHeight on a point above the surface.
      try {
        if (typeof scene.clampToHeight === "function") {
          const cart = scene.clampToHeight(Cartesian3.fromDegrees(lng, lat, top.alt + 100));
          if (defined(cart)) {
            const c = Cartographic.fromCartesian(cart);
            if (finiteNumber(c.height)) { candidates.push(c.height); continue; }
          }
        }
      } catch {}
      // Terrain fallback.
      try {
        const th = viewer.scene.globe.getHeight(Cartographic.fromDegrees(lng, lat));
        if (finiteNumber(th)) candidates.push(th);
      } catch {}
    }
  }
  if (candidates.length === 0) return top.alt;
  // Ground = lowest surrounding surface (never above the pick itself).
  const low = Math.min(...candidates);
  return Math.min(low, top.alt);
}

function requestSceneRender(viewer: Viewer | null | undefined) {
  try { if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender(); } catch {}
}

function visibleSurfaceHeight(viewer: Viewer | null | undefined, v: Vertex): number {
  if (!viewer || viewer.isDestroyed()) return v.alt;
  // Only the cheap terrain lookup — sampleHeight / clampToHeight are expensive
  // GPU picks and stall the frame loop when called from CallbackProperty.
  let terrain = v.alt;
  try {
    const globeHeight = viewer.scene.globe.getHeight(Cartographic.fromDegrees(v.lng, v.lat));
    if (finiteNumber(globeHeight)) terrain = globeHeight;
  } catch {}
  return v.alt >= terrain ? v.alt : terrain;
}

function safeRenderVertex(viewer: Viewer | null | undefined, v: Vertex, lift = RENDER_LIFT_METERS): Vertex {
  return { ...v, alt: visibleSurfaceHeight(viewer, v) + lift };
}

function safeCartesian(viewer: Viewer | null | undefined, v: Vertex, lift = RENDER_LIFT_METERS): Cartesian3 {
  const p = safeRenderVertex(viewer, v, lift);
  return Cartesian3.fromDegrees(p.lng, p.lat, p.alt);
}

function interpolateVertex(a: Vertex, b: Vertex, fraction: number): Vertex {
  const geodesic = new EllipsoidGeodesic(
    Cartographic.fromDegrees(a.lng, a.lat),
    Cartographic.fromDegrees(b.lng, b.lat),
  );
  const c = geodesic.interpolateUsingFraction(fraction);
  return {
    lng: CesiumMath.toDegrees(c.longitude),
    lat: CesiumMath.toDegrees(c.latitude),
    alt: a.alt + (b.alt - a.alt) * fraction,
  };
}

function safePolylinePositions(
  viewer: Viewer | null | undefined,
  verts: Vertex[],
  closed = false,
  stepMeters: number = SAVED_SAMPLE_STEP_METERS,
  maxSteps: number = SAVED_SAMPLE_MAX_STEPS,
): Cartesian3[] {
  if (verts.length === 0) return [];
  const source = closed && verts.length > 2 ? [...verts, verts[0]] : verts;
  const out: Cartesian3[] = [];
  for (let i = 0; i < source.length; i++) {
    if (i === 0) {
      out.push(safeCartesian(viewer, source[i]));
      continue;
    }
    const a = source[i - 1];
    const b = source[i];
    const steps = Math.max(1, Math.min(maxSteps, Math.ceil(haversine(a, b) / stepMeters)));
    for (let s = 1; s <= steps; s++) out.push(safeCartesian(viewer, interpolateVertex(a, b, s / steps)));
  }
  return out;
}

// Cheap variant for draft geometry driven by CallbackProperty (runs every frame).
function draftPolylinePositions(
  viewer: Viewer | null | undefined,
  verts: Vertex[],
  closed = false,
): Cartesian3[] {
  return safePolylinePositions(viewer, verts, closed, DRAFT_SAMPLE_STEP_METERS, DRAFT_SAMPLE_MAX_STEPS);
}

function measurementTagVertex(item: SavedMeasurement): Vertex | null {
  const vs = item.vertices;
  if (vs.length === 0) return null;
  if (item.mode === "height" && vs.length >= 2) {
    const [a, b] = vs;
    const high = a.alt >= b.alt ? a : b;
    const low = a.alt >= b.alt ? b : a;
    return { lng: high.lng, lat: high.lat, alt: low.alt + (high.alt - low.alt) * 0.55 };
  }
  if (vs.length === 1) return vs[0];
  const mid = (vs.length - 1) / 2;
  const left = Math.floor(mid);
  const right = Math.ceil(mid);
  if (left === right) return vs[left];
  return interpolateVertex(vs[left], vs[right], mid - left);
}

// ── Ledger persistence ────────────────────────────────────────────────────
function loadLedger(): SavedMeasurement[] {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveLedger(items: SavedMeasurement[]) {
  try { localStorage.setItem(LEDGER_KEY, JSON.stringify(items)); } catch {}
}

export default function MeasureToolPanel({ viewerRef, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("distance");
  const [units, setUnits] = useState<Units>(() =>
    (localStorage.getItem("atlas.measure.units") as Units) || "metric");
  useEffect(() => { try { localStorage.setItem("atlas.measure.units", units); } catch {} }, [units]);

  const [vertices, setVertices] = useState<Vertex[]>([]);
  const [ledger, setLedger] = useState<SavedMeasurement[]>(() => loadLedger());
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Height mode: single-click measures top→ground automatically.
  const [heightAutoBase, setHeightAutoBase] = useState<boolean>(() =>
    localStorage.getItem("atlas.measure.heightAutoBase") !== "0");
  useEffect(() => { try { localStorage.setItem("atlas.measure.heightAutoBase", heightAutoBase ? "1" : "0"); } catch {} }, [heightAutoBase]);
  // Undo/redo history for spline point edits (per editing session).
  const [editPast, setEditPast] = useState<Vertex[][]>([]);
  const [editFuture, setEditFuture] = useState<Vertex[][]>([]);
  // Reset history whenever the editing target changes.
  useEffect(() => { setEditPast([]); setEditFuture([]); }, [editingId]);

  useEffect(() => { saveLedger(ledger); }, [ledger]);

  useEffect(() => {
    requestSceneRender(viewerRef.current);
  }, [ledger, viewerRef]);

  const verticesRef = useRef<Vertex[]>([]);
  useEffect(() => { verticesRef.current = vertices; }, [vertices]);

  // ── Auto-commit helpers so drafts never silently vanish.
  // "End Measurement" is optional now: switching mode, closing the panel,
  // or reaching the terminal point count in height mode all save automatically.
  const modeRef = useRef<Mode>(mode);
  const unitsRef = useRef<Units>(units);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { unitsRef.current = units; }, [units]);
  const commitDraftIfValid = useCallback((verts: Vertex[], m: Mode) => {
    const need = (m === "area" || m === "roof") ? 3 : 2;
    if (verts.length < need) return false;
    const item: SavedMeasurement = {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      mode: m,
      vertices: verts,
      createdAt: Date.now(),
      label: shortLabel(m, computeMeasurements(m, verts), unitsRef.current),
    };
    setLedger((prev) => [item, ...prev]);
    return true;
  }, []);

  // ── Live cursor position (world) for rubber-band + guide rails
  const cursorRef = useRef<Vertex | null>(null);
  const [cursorTick, setCursorTick] = useState(0);

  // ── Precise picker
  const pickPoint = useCallback((position: { x: number; y: number }): Vertex | null => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return null;
    const scene = viewer.scene;
    let cartesian: Cartesian3 | undefined = undefined;
    try { cartesian = scene.pickPosition(position as any); } catch { /* noop */ }
    if (!defined(cartesian)) {
      cartesian = scene.camera.pickEllipsoid(position as any, scene.globe.ellipsoid);
    }
    if (!defined(cartesian)) return null;
    const c = Cartographic.fromCartesian(cartesian);
    return {
      lng: CesiumMath.toDegrees(c.longitude),
      lat: CesiumMath.toDegrees(c.latitude),
      alt: c.height,
    };
  }, [viewerRef]);

  // ── Cesium input (rebuilt only when mode changes)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((e: any) => {
      const v = pickPoint(e.position);
      if (!v) return;
      setVertices((prev) => {
        if (mode === "height") {
          // Auto-base: single click gives top + sampled ground → instant height.
          if (heightAutoBase) {
            // Sample the visible mesh AROUND the click to find real ground
            // (sampling directly under the click returns the roof, giving a
            // measurement that passes through the object into the earth).
            const groundAlt = sampleGroundBeneath(viewerRef.current, v);
            const top = v;
            const base: Vertex = { ...v, alt: Math.min(groundAlt, v.alt) };
            const next: Vertex[] = [base, top];
            // Persist immediately so the measurement is not lost.
            queueMicrotask(() => {
              commitDraftIfValid(next, "height");
              setVertices([]);
            });
            return next;
          }
          // Manual mode: click base then top. After the 2nd click, auto-save
          // and reset so the next click begins a fresh measurement instead
          // of silently discarding the previous one.
          if (prev.length >= 2) {
            queueMicrotask(() => setVertices([v]));
            return prev;
          }
          const next = [...prev, v];
          if (next.length === 2) {
            queueMicrotask(() => {
              commitDraftIfValid(next, "height");
              setVertices([]);
            });
          }
          return next;
        }
        return [...prev, v];
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Right-click = undo last vertex (in addition to Backspace)
    handler.setInputAction(() => {
      setVertices((p) => p.slice(0, -1));
    }, ScreenSpaceEventType.RIGHT_CLICK);

    // Track cursor to render rubber-band + symmetry guides while measuring.
    let rafId = 0;
    handler.setInputAction((e: any) => {
      const v = pickPoint(e.endPosition);
      cursorRef.current = v;
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; setCursorTick((n) => n + 1); });
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => { handler.destroy(); };
  }, [viewerRef, mode, pickPoint, heightAutoBase]);

  // Clear cursor when panel closes (unmount) or mode changes
  useEffect(() => { cursorRef.current = null; setCursorTick((n) => n + 1); }, [mode]);

  // ── Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVertices([]);
      else if (e.key === "Backspace") setVertices((p) => p.slice(0, -1));
      else if (e.key === "Enter") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, vertices]);

  // Reset draft when mode changes
  // Reset draft when mode changes — but commit whatever the user had drawn
  // so the work is preserved in the ledger instead of being thrown away.
  useEffect(() => {
    return () => {
      // On mode change (cleanup of previous mode), commit its draft.
      const prevMode = modeRef.current;
      const draft = verticesRef.current;
      if (draft.length > 0) commitDraftIfValid(draft, prevMode);
    };
  }, [mode, commitDraftIfValid]);
  useEffect(() => { setVertices([]); }, [mode]);

  // On panel close (unmount), commit whatever's on screen.
  useEffect(() => {
    return () => {
      const draft = verticesRef.current;
      if (draft.length > 0) commitDraftIfValid(draft, modeRef.current);
    };
  }, [commitDraftIfValid]);

  // ── DRAFT geometry entities (one per mode; positions via CallbackProperty)
  const draftEntitiesRef = useRef<Entity[]>([]);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const color = Color.fromCssColorString(MODE_COLOR[mode]);
    const guideColor = Color.fromCssColorString("#ffffff").withAlpha(0.55);
    const guideDash = () => new PolylineDashMaterialProperty({
      color: guideColor, dashLength: 12,
    });

    const ents: Entity[] = [];
    if (mode === "distance") {
      ents.push(viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() =>
            draftPolylinePositions(viewer, withCursor(verticesRef.current, cursorRef.current)), false),
          width: 3,
          material: color,
          arcType: ArcType.GEODESIC,
          depthFailMaterial: color.withAlpha(0.55),
        },
      }));
    } else if (mode === "area" || mode === "roof") {
      ents.push(viewer.entities.add({
        polygon: {
          hierarchy: new CallbackProperty(() =>
            new PolygonHierarchy(
              withCursor(verticesRef.current, cursorRef.current).map((v) =>
                mode === "roof"
                  // Roof: keep the picked altitude of every vertex — the polygon
                  // is drawn on the actual tilted surface so slant area is real.
                  ? Cartesian3.fromDegrees(v.lng, v.lat, v.alt + RENDER_LIFT_METERS)
                  : safeCartesian(viewer, v))
            ), false) as any,
          material: color.withAlpha(0.22),
          outline: false,
          perPositionHeight: true,
        },
      }));
      // Outline as a closed polyline so it renders reliably over 3D tiles.
      ents.push(viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const vs = withCursor(verticesRef.current, cursorRef.current);
            if (mode === "roof") {
              // Straight line-of-sight edges on the mesh; no geodesic resampling.
              const src = vs.length >= 3 ? [...vs, vs[0]] : vs;
              return src.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt + RENDER_LIFT_METERS));
            }
            return draftPolylinePositions(viewer, vs, vs.length >= 3);
          }, false),
          width: 3,
          material: color,
          arcType: mode === "roof" ? ArcType.NONE : ArcType.GEODESIC,
          depthFailMaterial: color.withAlpha(0.55),
        },
      }));
      // Dashed closing line from cursor → first vertex (area symmetry hint)
      ents.push(viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const vs = verticesRef.current;
            const c = cursorRef.current;
            if (vs.length < 2 || !c) return [];
            return draftPolylinePositions(viewer, [c, vs[0]]);
          }, false),
          width: 2,
          material: guideDash(),
          arcType: ArcType.GEODESIC,
        },
      }));
    } else {
      // height — connector + slant
      ents.push(viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const vs = withCursor(verticesRef.current, cursorRef.current, 2);
            if (vs.length < 2) return [];
            const [a, b] = vs;
            const lowAlt = Math.min(a.alt, b.alt);
            const high = a.alt >= b.alt ? a : b;
            return [
              safeCartesian(viewer, { ...high, alt: lowAlt }),
              safeCartesian(viewer, high),
            ];
          }, false),
          width: 3,
          material: color,
          arcType: ArcType.NONE,
          depthFailMaterial: color.withAlpha(0.55),
        },
      }));
      ents.push(viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() =>
            draftPolylinePositions(viewer, withCursor(verticesRef.current, cursorRef.current, 2)), false),
          width: 2,
          material: Color.fromCssColorString("#38bdf8"),
          arcType: ArcType.NONE,
          depthFailMaterial: Color.fromCssColorString("#38bdf8").withAlpha(0.55),
        },
      }));
    }

    // ── Guide rails from last vertex: continuation, perpendicular, back-ray.
    // Only meaningful for distance/area while user is picking points.
    if (mode === "distance" || mode === "area" || mode === "roof") {
      const makeRay = (offsetDeg: number) => viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const vs = verticesRef.current;
            const c = cursorRef.current;
            if (vs.length < 1 || !c) return [];
            const anchor = vs[vs.length - 1];
            // Bearing: last-segment (if any) else anchor→cursor
            const bearing = vs.length >= 2
              ? bearingDeg(vs[vs.length - 2], anchor)
              : bearingDeg(anchor, c);
            const dist = Math.max(haversine(anchor, c) * 2, 150);
            const dest = destinationPoint(anchor, bearing + offsetDeg, dist);
            return draftPolylinePositions(viewer, [anchor, dest]);
          }, false),
          width: 1.5,
          material: guideDash(),
          arcType: ArcType.GEODESIC,
        },
      });
      ents.push(makeRay(0));    // continuation (symmetry / straight line)
      ents.push(makeRay(90));   // perpendicular right
      ents.push(makeRay(-90));  // perpendicular left
      ents.push(makeRay(180));  // mirror back
    }
    draftEntitiesRef.current = ents;

    return () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      for (const ent of ents) { try { v.entities.remove(ent); } catch {} }
      draftEntitiesRef.current = [];
    };
  }, [mode, viewerRef]);

  // ── SAVED geometry entities (rebuilt when ledger changes)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const ents: Entity[] = [];
    for (const m of ledger) {
      if (m.hidden) continue;
      const color = Color.fromCssColorString(MODE_COLOR[m.mode]);
      const pts = m.vertices.map((v) => safeCartesian(viewer, v));
      if (m.mode === "distance" && pts.length >= 2) {
        ents.push(viewer.entities.add({
          polyline: { positions: safePolylinePositions(viewer, m.vertices), width: 2.5, material: color, arcType: ArcType.GEODESIC,
            depthFailMaterial: color.withAlpha(0.5) },
        }));
      } else if ((m.mode === "area" || m.mode === "roof") && pts.length >= 3) {
        const roof = m.mode === "roof";
        const roofPts = roof
          ? m.vertices.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt + RENDER_LIFT_METERS))
          : pts;
        ents.push(viewer.entities.add({
          polygon: { hierarchy: new PolygonHierarchy(roofPts), material: color.withAlpha(0.18), perPositionHeight: true },
        }));
        ents.push(viewer.entities.add({
          polyline: {
            positions: roof
              ? [...roofPts, roofPts[0]]
              : safePolylinePositions(viewer, m.vertices, true),
            width: 2.5, material: color,
            arcType: roof ? ArcType.NONE : ArcType.GEODESIC,
            depthFailMaterial: color.withAlpha(0.5),
          },
        }));
      } else if (m.mode === "height" && pts.length === 2) {
        const [a, b] = m.vertices;
        const lowAlt = Math.min(a.alt, b.alt);
        const high = a.alt >= b.alt ? a : b;
        ents.push(viewer.entities.add({
          polyline: { positions: [safeCartesian(viewer, { ...high, alt: lowAlt }), safeCartesian(viewer, high)],
            width: 2.5, material: color, arcType: ArcType.NONE,
            depthFailMaterial: color.withAlpha(0.5) },
        }));
        ents.push(viewer.entities.add({
          polyline: { positions: safePolylinePositions(viewer, m.vertices), width: 2, material: Color.fromCssColorString("#38bdf8"),
            arcType: ArcType.NONE,
            depthFailMaterial: Color.fromCssColorString("#38bdf8").withAlpha(0.5) },
        }));
      }
    }
    return () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      for (const ent of ents) { try { v.entities.remove(ent); } catch {} }
    };
  }, [ledger, viewerRef]);

  // ── Numeric readouts for the DRAFT
  const measurements = useMemo(() => computeMeasurements(mode, vertices), [vertices, mode]);

  // ── Finish → push to ledger
  const finish = useCallback(() => {
    const need = (mode === "area" || mode === "roof") ? 3 : 2;
    if (vertices.length < need) return;
    const item: SavedMeasurement = {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      mode,
      vertices,
      createdAt: Date.now(),
      label: shortLabel(mode, computeMeasurements(mode, vertices), units),
    };
    setLedger((prev) => [item, ...prev]);
    setVertices([]);
  }, [mode, vertices, units]);

  // ── Focus a saved measurement (fly camera to fit bounds)
  const focus = useCallback((m: SavedMeasurement) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const pts = m.vertices.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt));
    if (pts.length === 0) return;
    const bs = BoundingSphere.fromPoints(pts);
    viewer.camera.flyToBoundingSphere(bs, {
      duration: 1.2,
      offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), Math.max(bs.radius * 2.5, 500)),
    });
  }, [viewerRef]);

  return (
    <>
      <MeasureMarkersOverlay
        viewerRef={viewerRef}
        draft={{ mode, vertices }}
        ledger={ledger}
        units={units}
      />
      {editingId && (() => {
        const editItem = ledger.find((x) => x.id === editingId);
        if (!editItem || editItem.hidden) return null;
        return (
          <EditHandlesOverlay
            viewerRef={viewerRef}
            item={editItem}
            pickPoint={pickPoint}
            onChange={(newVerts) => setLedger((prev) => prev.map((x) =>
              x.id === editingId
                ? { ...x, vertices: newVerts, label: shortLabel(x.mode, computeMeasurements(x.mode, newVerts), units) }
                : x))}
            onCommit={(prevVerts) => {
              setEditPast((p) => [...p, prevVerts]);
              setEditFuture([]);
            }}
          />
        );
      })()}
      {/* Live cursor label with rubber-band distance while measuring */}
      <CursorMeasureLabel
        viewerRef={viewerRef}
        cursorRef={cursorRef}
        vertices={vertices}
        mode={mode}
        units={units}
        tick={cursorTick}
      />
      <div data-draggable-window className="absolute top-[62px] right-4 z-30 w-[340px] pointer-events-auto">
        <div className="rounded-2xl border border-white/15 bg-black/80 backdrop-blur-xl shadow-2xl text-white overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col max-h-[80vh]">
          <div data-drag-handle className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0 cursor-move select-none">
            <div className="flex items-center gap-2">
              <Ruler className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-[11px] font-bold tracking-widest uppercase text-sky-200">Measure Tool</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 space-y-3 border-b border-white/10 shrink-0">
            <div className="grid grid-cols-2 gap-1.5">
              <ModeButton active={mode === "distance"} onClick={() => setMode("distance")} icon={<MousePointer2 className="w-3 h-3" />} label="Distance" color={MODE_COLOR.distance} />
              <ModeButton active={mode === "area"} onClick={() => setMode("area")} icon={<Pentagon className="w-3 h-3" />} label="Area" color={MODE_COLOR.area} />
              <ModeButton active={mode === "height"} onClick={() => setMode("height")} icon={<MoveVertical className="w-3 h-3" />} label="Height" color={MODE_COLOR.height} />
              <ModeButton active={mode === "roof"} onClick={() => setMode("roof")} icon={<Sun className="w-3 h-3" />} label="Roof / Solar" color={MODE_COLOR.roof} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/60 uppercase tracking-wider">Units</span>
              <div className="flex gap-0.5 rounded-md border border-white/15 p-0.5 bg-white/[0.03]">
                <button onClick={() => setUnits("metric")}
                  className={`px-2 h-6 rounded text-[10px] font-bold uppercase tracking-wider ${units === "metric" ? "bg-sky-500/30 text-sky-100" : "text-white/60"}`}>Metric</button>
                <button onClick={() => setUnits("imperial")}
                  className={`px-2 h-6 rounded text-[10px] font-bold uppercase tracking-wider ${units === "imperial" ? "bg-sky-500/30 text-sky-100" : "text-white/60"}`}>Imperial</button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <ReadoutBlock mode={mode} m={measurements} units={units} />
            </div>

            {mode === "height" && (
              <div className="flex items-center justify-between rounded-md border border-amber-300/25 bg-amber-400/[0.06] px-2.5 py-1.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-amber-200 uppercase tracking-wider">Auto-base</div>
                  <div className="text-[9px] text-white/55 leading-tight">
                    {heightAutoBase ? "One click → top vs ground beneath" : "Click twice (base + top)"}
                  </div>
                </div>
                <button
                  onClick={() => setHeightAutoBase((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${heightAutoBase ? "bg-amber-400/70" : "bg-white/15"}`}
                  title="Toggle single-click height measurement"
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${heightAutoBase ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-white/55">
              <span>
                {vertices.length === 0
                  ? mode === "height"
                    ? (heightAutoBase ? "Click the top of an object — height is measured automatically" : "Click 2 points (base + top)")
                    : mode === "roof"
                      ? "Trace roof corners on the 3D mesh — slant area & solar potential"
                      : "Click the globe to add points"
                  : `${vertices.length} point${vertices.length === 1 ? "" : "s"} · right-click to undo`}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setVertices((p) => p.slice(0, -1))} disabled={vertices.length === 0}
                  className="p-1 rounded hover:bg-white/10 text-white/60 disabled:opacity-30" title="Undo (Backspace)">
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setVertices([])} disabled={vertices.length === 0}
                  className="p-1 rounded hover:bg-red-500/20 text-red-300 disabled:opacity-30" title="Clear (Esc)">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              onClick={finish}
              disabled={vertices.length < ((mode === "area" || mode === "roof") ? 3 : 2)}
              className="w-full h-9 rounded-md text-[11px] font-bold tracking-widest uppercase border border-sky-300 bg-gradient-to-b from-sky-500/40 to-sky-500/20 hover:from-sky-500/55 hover:to-sky-500/30 text-sky-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all"
            >
              <Check className="w-3.5 h-3.5" /> End Measurement
            </button>
          </div>

          {/* Ledger */}
          <div className="flex-1 min-h-0 flex flex-col">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="px-3 py-2 flex items-center justify-between hover:bg-white/[0.03] shrink-0"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/70">
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Saved Measurements
                <span className="text-white/40">({ledger.length})</span>
              </div>
              {ledger.length > 0 && (
                <span
                  className="text-[9px] uppercase tracking-wider text-red-300/70 hover:text-red-300"
                  onClick={(e) => { e.stopPropagation(); if (confirm("Clear all saved measurements?")) setLedger([]); }}
                >Clear all</span>
              )}
            </button>
            {expanded && (
              <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-1">
                {ledger.length === 0 && (
                  <div className="text-[10px] text-white/35 italic px-2 py-3">Finish a measurement to save it here.</div>
                )}
                {ledger.map((m) => (
                  <LedgerRow
                    key={m.id}
                    item={m}
                    units={units}
                    editing={editingId === m.id}
                    onEdit={() => setEditingId((cur) => cur === m.id ? null : m.id)}
                    canUndo={editingId === m.id && editPast.length > 0}
                    canRedo={editingId === m.id && editFuture.length > 0}
                    onUndo={() => {
                      if (editingId !== m.id || editPast.length === 0) return;
                      const prev = editPast[editPast.length - 1];
                      setEditPast((p) => p.slice(0, -1));
                      setEditFuture((f) => [...f, m.vertices]);
                      setLedger((prevL) => prevL.map((x) => x.id === m.id
                        ? { ...x, vertices: prev, label: shortLabel(x.mode, computeMeasurements(x.mode, prev), units) }
                        : x));
                    }}
                    onRedo={() => {
                      if (editingId !== m.id || editFuture.length === 0) return;
                      const next = editFuture[editFuture.length - 1];
                      setEditFuture((f) => f.slice(0, -1));
                      setEditPast((p) => [...p, m.vertices]);
                      setLedger((prevL) => prevL.map((x) => x.id === m.id
                        ? { ...x, vertices: next, label: shortLabel(x.mode, computeMeasurements(x.mode, next), units) }
                        : x));
                    }}
                    onToggle={() => setLedger((prev) => prev.map((x) => x.id === m.id ? { ...x, hidden: !x.hidden } : x))}
                    onDelete={() => { setLedger((prev) => prev.filter((x) => x.id !== m.id)); if (editingId === m.id) setEditingId(null); }}
                    onFocus={() => focus(m)}
                    onRename={(label) => setLedger((prev) => prev.map((x) => x.id === m.id ? { ...x, label } : x))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── HTML overlay for numbered markers (glass-pill style) ──────────────────
function MeasureMarkersOverlay({
  viewerRef, draft, ledger, units,
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
  draft: { mode: Mode; vertices: Vertex[] };
  ledger: SavedMeasurement[];
  units: Units;
}) {
  const nodesRef = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [, tick] = useState(0);
  // We DON'T rerender per frame; the DOM nodes are repositioned imperatively.

  // Flat list of true vertex handles plus a separate measurement tag.
  const items = useMemo(() => {
    const out: { key: string; index?: number; total?: number; vertex: Vertex; color: string; kind: "draft" | "saved" | "tag"; label?: string }[] = [];
    // In height mode, the "base" vertex is auto-derived from the click and
    // sits at ground level (often hidden under geometry). Only surface the
    // TOP vertex as the numbered pin so the visible marker always reads "1".
    const heightVisibleIdx = (vs: Vertex[]) =>
      vs.length >= 2 ? (vs[0].alt >= vs[1].alt ? 0 : 1) : 0;

    if (draft.mode === "height") {
      const idx = heightVisibleIdx(draft.vertices);
      draft.vertices.forEach((v, i) => {
        if (i !== idx) return;
        out.push({ key: `draft:${i}`, index: 1, total: 1, vertex: v, color: MODE_COLOR[draft.mode], kind: "draft" });
      });
    } else {
      draft.vertices.forEach((v, i) => {
        out.push({ key: `draft:${i}`, index: i + 1, total: draft.vertices.length, vertex: v, color: MODE_COLOR[draft.mode], kind: "draft" });
      });
    }
    ledger.forEach((m) => {
      if (m.hidden) return;
      if (m.mode === "height") {
        const idx = heightVisibleIdx(m.vertices);
        m.vertices.forEach((v, i) => {
          if (i !== idx) return;
          out.push({ key: `${m.id}:${i}`, index: 1, total: 1, vertex: v, color: MODE_COLOR[m.mode], kind: "saved" });
        });
      } else {
        m.vertices.forEach((v, i) => {
          out.push({ key: `${m.id}:${i}`, index: i + 1, total: m.vertices.length, vertex: v, color: MODE_COLOR[m.mode], kind: "saved" });
        });
      }
      const tagVertex = measurementTagVertex(m);
      if (tagVertex) {
        out.push({
          key: `${m.id}:tag`,
          vertex: tagVertex,
          color: MODE_COLOR[m.mode],
          kind: "tag",
          label: shortLabel(m.mode, computeMeasurements(m.mode, m.vertices), units),
        });
      }
    });
    return out;
  }, [draft, ledger, units]);

  useLayoutEffect(() => { tick((n) => n + 1); }, [items.length]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const sync = () => {
      if (!viewer || viewer.isDestroyed()) return;
      const camera = viewer.camera;
      const scene = viewer.scene;
      const canvas = scene.canvas;
      const cw = canvas.clientWidth || 0;
      const ch = canvas.clientHeight || 0;
      for (const it of items) {
        const node = nodesRef.current.get(it.key);
        if (!node) continue;
        try {
          const world = safeCartesian(viewer, it.vertex, it.kind === "tag" ? 2.2 : RENDER_LIFT_METERS);
          const toPoint = Cartesian3.subtract(world, camera.positionWC, new Cartesian3());
          if (Cartesian3.dot(toPoint, camera.directionWC) <= 0) { node.style.opacity = "0"; continue; }
          const win = SceneTransforms.worldToWindowCoordinates(scene, world);
          if (!win || win.x < -50 || win.y < -50 || win.x > cw + 50 || win.y > ch + 50) {
            node.style.opacity = "0"; continue;
          }
          node.style.opacity = "1";
          node.style.transform = `translate3d(${Math.round(win.x)}px, ${Math.round(win.y)}px, 0) translate(-50%, -50%)`;
        } catch { node.style.opacity = "0"; }
      }
    };
    sync();
    const remove = viewer.scene.postRender.addEventListener(sync);
    return () => { remove(); };
  }, [viewerRef, items]);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {items.map((it) => (
        <div
          key={it.key}
          ref={(el) => { nodesRef.current.set(it.key, el); }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0 }}
        >
          <div className="relative flex items-center gap-1.5">
            {it.kind !== "tag" && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums backdrop-blur-xl border-2 shadow-lg"
                style={{
                  background: `${it.color}33`,
                  borderColor: it.color,
                  color: "#fff",
                  boxShadow: `0 4px 14px ${it.color}66, 0 0 0 1px ${it.color}55`,
                  fontFeatureSettings: '"tnum" 1, "ss01" 1',
                }}
              >
                {it.index}
              </div>
            )}
            {it.label && (
              <div
                className="backdrop-blur-xl rounded-full px-2 py-0.5 text-[10px] font-mono tabular-nums whitespace-nowrap"
                style={{
                  background: `${it.color}22`,
                  border: `1px solid ${it.color}66`,
                  color: "#fff",
                  boxShadow: `0 4px 14px ${it.color}44`,
                  fontFeatureSettings: '"tnum" 1',
                }}
              >
                {it.label}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Ledger row ────────────────────────────────────────────────────────────
function LedgerRow({
  // (declared above)
  item, units, editing, onEdit, canUndo, canRedo, onUndo, onRedo,
  onToggle, onDelete, onFocus, onRename,
}: {
  item: SavedMeasurement;
  units: Units;
  editing: boolean;
  onEdit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onFocus: () => void;
  onRename: (label: string) => void;
}) {
  const color = MODE_COLOR[item.mode];
  const m = computeMeasurements(item.mode, item.vertices);
  const summary = shortLabel(item.mode, m, units);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(item.label || summary);

  return (
    <div
      className="group rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] p-2 flex items-center gap-2 transition-colors"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { onRename(name.trim() || summary); setRenaming(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-full bg-transparent text-[11px] font-semibold outline-none border-b border-white/20"
          />
        ) : (
          <button onDoubleClick={() => setRenaming(true)} className="text-left w-full">
            <div className="text-[11px] font-semibold truncate" style={{ color }}>
              {summary}
            </div>
            <div className="text-[9px] text-white/45 uppercase tracking-wider">
              {item.mode} · {item.vertices.length} pts{editing ? " · editing" : ""}
            </div>
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
        <button onClick={onFocus} title="Focus" className="p-1 rounded hover:bg-white/10 text-white/70">
          <Target className="w-3 h-3" />
        </button>
        {editing && (
          <>
            <button onClick={onUndo} disabled={!canUndo} title="Undo point move"
              className="p-1 rounded hover:bg-white/10 text-white/70 disabled:opacity-30 disabled:cursor-not-allowed">
              <Undo2 className="w-3 h-3" />
            </button>
            <button onClick={onRedo} disabled={!canRedo} title="Redo point move"
              className="p-1 rounded hover:bg-white/10 text-white/70 disabled:opacity-30 disabled:cursor-not-allowed">
              <Redo2 className="w-3 h-3" />
            </button>
          </>
        )}
        <button onClick={onEdit} title={editing ? "Done editing" : "Edit points"}
          className={`p-1 rounded hover:bg-white/10 ${editing ? "bg-sky-500/25 text-sky-200" : "text-white/70"}`}>
          <Pencil className="w-3 h-3" />
        </button>
        <button onClick={onToggle} title={item.hidden ? "Show" : "Hide"} className="p-1 rounded hover:bg-white/10 text-white/70">
          {item.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
        <button onClick={onDelete} title="Delete" className="p-1 rounded hover:bg-red-500/20 text-red-300">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Readout ───────────────────────────────────────────────────────────────
function ModeButton({ active, onClick, icon, label, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 rounded-md text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-1 border transition-all ${
        active ? "text-white shadow-lg" : "bg-white/[0.04] border-white/15 text-white/70 hover:text-white"
      }`}
      style={active ? {
        background: `${color}33`,
        borderColor: color,
        boxShadow: `0 0 12px ${color}66`,
      } : undefined}
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

function ReadoutBlock({ mode, m, units }: { mode: Mode; m: any; units: Units }) {
  if (mode === "distance") {
    return (
      <div className="space-y-1.5">
        <Readout label="Total distance" value={formatDistance(m.total, units)} big />
        {m.segments?.length > 1 && (
          <div className="pt-1 mt-1 border-t border-white/10">
            <div className="text-[9px] text-white/45 uppercase tracking-wider mb-1">Segments</div>
            <div className="max-h-24 overflow-y-auto space-y-0.5">
              {m.segments.map((s: number, i: number) => (
                <div key={i} className="flex justify-between text-[10px] font-mono">
                  <span className="text-white/50">#{i + 1} → #{i + 2}</span>
                  <span className="text-white/85">{formatDistance(s, units)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  if (mode === "area") {
    return (
      <div className="space-y-1.5">
        <Readout label="Area" value={formatArea(m.area, units)} big />
        <Readout label="Perimeter" value={formatDistance(m.perimeter, units)} />
      </div>
    );
  }
  if (mode === "roof") {
    const s = m.solar || emptySolar();
    return (
      <div className="space-y-1.5">
        <Readout label="Slant area (roof)" value={formatArea(m.slant, units)} big />
        <Readout label="Planar (footprint)" value={formatArea(m.planar, units)} />
        <Readout label="Tilt" value={`${(m.tiltDeg ?? 0).toFixed(1)}°`} />
        <Readout label="Perimeter" value={formatDistance(m.perimeter, units)} />
        <div className="pt-1 mt-1 border-t border-white/10 space-y-1">
          <div className="text-[9px] text-orange-200/80 uppercase tracking-wider mb-0.5">Solar potential</div>
          <Readout label="System size" value={`${s.kWp.toFixed(2)} kWp`} />
          <Readout label="Annual generation" value={`${Math.round(s.annualKWh).toLocaleString()} kWh/yr`} big />
          <Readout label="Peak sun hours" value={`${s.psh.toFixed(1)} h/day`} />
          <Readout label="Panels (≈1.7 m²)" value={`${s.panels}`} />
          <Readout label="CO₂ avoided" value={`${(s.co2Kg / 1000).toFixed(2)} t/yr`} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Readout label="Δ Elevation" value={formatDistance(m.deltaH, units)} big />
      <Readout label="Slant distance" value={formatDistance(m.slant, units)} />
      <Readout label="Ground distance" value={formatDistance(m.ground, units)} />
    </div>
  );
}

// ── Math ──────────────────────────────────────────────────────────────────
function computeMeasurements(mode: Mode, vertices: Vertex[]): any {
  if (mode === "distance") {
    if (vertices.length < 2) return { total: 0, segments: [] as number[] };
    const geodesic = new EllipsoidGeodesic();
    const segs: number[] = [];
    for (let i = 1; i < vertices.length; i++) {
      geodesic.setEndPoints(
        Cartographic.fromDegrees(vertices[i - 1].lng, vertices[i - 1].lat),
        Cartographic.fromDegrees(vertices[i].lng, vertices[i].lat),
      );
      segs.push(geodesic.surfaceDistance);
    }
    return { total: segs.reduce((s, x) => s + x, 0), segments: segs };
  }
  if (mode === "area") {
    if (vertices.length < 3) return { area: 0, perimeter: 0 };
    const geodesic = new EllipsoidGeodesic();
    let peri = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      geodesic.setEndPoints(
        Cartographic.fromDegrees(vertices[i].lng, vertices[i].lat),
        Cartographic.fromDegrees(vertices[j].lng, vertices[j].lat),
      );
      peri += geodesic.surfaceDistance;
    }
    return { area: sphericalPolygonArea(vertices), perimeter: peri };
  }
  if (mode === "roof") {
    if (vertices.length < 3) {
      return { planar: 0, slant: 0, tiltDeg: 0, perimeter: 0, solar: emptySolar() };
    }
    const planar = sphericalPolygonArea(vertices);
    // True 3D roof area — triangle fan from centroid using ECEF positions.
    const carts = vertices.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt));
    const centroid = new Cartesian3(0, 0, 0);
    for (const c of carts) Cartesian3.add(centroid, c, centroid);
    Cartesian3.divideByScalar(centroid, carts.length, centroid);
    let slant = 0;
    for (let i = 0; i < carts.length; i++) {
      const a = carts[i];
      const b = carts[(i + 1) % carts.length];
      const ab = Cartesian3.subtract(a, centroid, new Cartesian3());
      const ac = Cartesian3.subtract(b, centroid, new Cartesian3());
      const cross = Cartesian3.cross(ab, ac, new Cartesian3());
      slant += Cartesian3.magnitude(cross) * 0.5;
    }
    // Perimeter in 3D (true length along the slope).
    let peri = 0;
    for (let i = 0; i < carts.length; i++) {
      peri += Cartesian3.distance(carts[i], carts[(i + 1) % carts.length]);
    }
    // Tilt = angle between roof plane and horizontal, via area ratio.
    const ratio = planar > 0 ? Math.min(1, planar / Math.max(planar, slant)) : 1;
    const tiltDeg = Math.acos(ratio) * 180 / Math.PI;
    // Solar: use mean latitude of vertices.
    const meanLat = vertices.reduce((s, v) => s + v.lat, 0) / vertices.length;
    const solar = solarPotential(slant, meanLat, tiltDeg);
    return { planar, slant, tiltDeg, perimeter: peri, solar };
  }
  if (vertices.length < 2) return { deltaH: 0, slant: 0, ground: 0 };
  const [a, b] = vertices;
  const ac = Cartesian3.fromDegrees(a.lng, a.lat, a.alt);
  const bc = Cartesian3.fromDegrees(b.lng, b.lat, b.alt);
  const geodesic = new EllipsoidGeodesic(
    Cartographic.fromDegrees(a.lng, a.lat),
    Cartographic.fromDegrees(b.lng, b.lat),
  );
  return { deltaH: Math.abs(b.alt - a.alt), slant: Cartesian3.distance(ac, bc), ground: geodesic.surfaceDistance };
}

function shortLabel(mode: Mode, m: any, units: Units): string {
  if (mode === "distance") return formatDistance(m.total, units);
  if (mode === "area") return formatArea(m.area, units);
  if (mode === "roof") return `${formatArea(m.slant, units)} · ${(m.solar?.annualKWh ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh/yr`;
  return `Δ ${formatDistance(m.deltaH, units)}`;
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

// ── Solar potential ────────────────────────────────────────────────────────
// Simple, transparent PV yield model for early-stage roof qualification.
// Inputs: roof slant area (m²), latitude (deg), tilt (deg).
// Assumptions (industry rules of thumb):
//   • Peak Sun Hours (PSH) interpolated by |lat| — global tilt-optimised avg.
//   • Usable roof fraction 70 % (setbacks, obstructions, azimuth losses).
//   • Module efficiency 20 % → 200 Wp per m² of module.
//   • Performance ratio 0.80 (inverter, wiring, soiling, temperature).
//   • Grid emission factor 0.40 kgCO₂/kWh (world avg, IEA 2023).
// Tilt sanity: north/south hemispheres — no orientation input yet, so we
// apply a mild derate above 45° tilt (steep roofs collect less unless
// azimuth is optimal).
export interface SolarEstimate {
  psh: number;         // peak sun hours per day (kWh/m²/day)
  usableArea: number;  // m² after 70 % fill factor
  kWp: number;         // installed peak DC power
  annualKWh: number;   // net yearly generation
  panels: number;      // module count (1.7 m² each)
  co2Kg: number;       // CO₂ avoided per year (kg)
}
function emptySolar(): SolarEstimate {
  return { psh: 0, usableArea: 0, kWp: 0, annualKWh: 0, panels: 0, co2Kg: 0 };
}
function pshForLatitude(lat: number): number {
  const a = Math.abs(lat);
  if (a < 20) return 5.6;
  if (a < 30) return 5.2;
  if (a < 40) return 4.6;
  if (a < 50) return 3.9;
  if (a < 60) return 3.1;
  return 2.3;
}
function solarPotential(slantAreaM2: number, lat: number, tiltDeg: number): SolarEstimate {
  if (!Number.isFinite(slantAreaM2) || slantAreaM2 <= 0) return emptySolar();
  const psh = pshForLatitude(lat);
  const usableArea = slantAreaM2 * 0.70;
  const kWp = usableArea * 0.20;                        // 200 Wp / m²
  const tiltDerate = tiltDeg > 45 ? Math.max(0.75, 1 - (tiltDeg - 45) / 90) : 1;
  const annualKWh = kWp * psh * 365 * 0.80 * tiltDerate;
  const panels = Math.max(0, Math.floor(usableArea / 1.7));
  const co2Kg = annualKWh * 0.40;
  return { psh, usableArea, kWp, annualKWh, panels, co2Kg };
}

// ── Live cursor label: floating pill anchored to the pointer with live
// distance from the last vertex to the cursor while measuring.
function CursorMeasureLabel({
  viewerRef, cursorRef, vertices, mode, units, tick,
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
  cursorRef: React.MutableRefObject<Vertex | null>;
  vertices: Vertex[];
  mode: Mode;
  units: Units;
  tick: number;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const sync = () => {
      const node = nodeRef.current;
      if (!node) return;
      const c = cursorRef.current;
      if (!c || vertices.length === 0) { node.style.opacity = "0"; return; }
      try {
        const world = Cartesian3.fromDegrees(c.lng, c.lat, c.alt);
        const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
        if (!win) { node.style.opacity = "0"; return; }
        node.style.opacity = "1";
        node.style.transform = `translate3d(${Math.round(win.x + 14)}px, ${Math.round(win.y - 14)}px, 0)`;
      } catch { node.style.opacity = "0"; }
    };
    sync();
    const remove = viewer.scene.postRender.addEventListener(sync);
    return () => { remove(); };
  }, [viewerRef, cursorRef, vertices, tick]);

  const c = cursorRef.current;
  if (!c || vertices.length === 0) return null;
  const last = vertices[vertices.length - 1];
  const segDist = haversine(last, c);
  const brg = bearingDeg(last, c);
  let primary = formatDistance(segDist, units);
  let secondary = `${brg.toFixed(1)}°`;
  if (mode === "area" && vertices.length >= 2) {
    // Show live polygon area including cursor
    const area = sphericalPolygonArea([...vertices, c]);
    primary = formatArea(area, units);
    secondary = `+${formatDistance(segDist, units)}`;
  } else if (mode === "distance" && vertices.length >= 1) {
    const geodesic = new EllipsoidGeodesic();
    let total = 0;
    for (let i = 1; i < vertices.length; i++) {
      geodesic.setEndPoints(
        Cartographic.fromDegrees(vertices[i - 1].lng, vertices[i - 1].lat),
        Cartographic.fromDegrees(vertices[i].lng, vertices[i].lat));
      total += geodesic.surfaceDistance;
    }
    total += segDist;
    secondary = `Σ ${formatDistance(total, units)}`;
  }
  const color = MODE_COLOR[mode];
  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div
        ref={nodeRef}
        className="absolute left-0 top-0 will-change-transform"
        style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0 }}
      >
        <div
          className="backdrop-blur-xl rounded-lg px-2 py-1 text-[10px] font-mono tabular-nums whitespace-nowrap shadow-lg"
          style={{
            background: "rgba(0,0,0,0.72)",
            border: `1px solid ${color}88`,
            color: "#fff",
            fontFeatureSettings: '"tnum" 1, "ss01" 1',
            boxShadow: `0 4px 14px ${color}55`,
          }}
        >
          <div className="font-bold text-[11px]" style={{ color }}>{primary}</div>
          <div className="text-white/60 text-[9px]">{secondary}</div>
        </div>
      </div>
    </div>
  );
}

// ── Edit handles overlay: draggable circles at each vertex of a saved item ─
function EditHandlesOverlay({
  viewerRef, item, pickPoint, onChange, onCommit,
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
  item: SavedMeasurement;
  pickPoint: (position: { x: number; y: number }) => Vertex | null;
  onChange: (vertices: Vertex[]) => void;
  onCommit?: (prevVertices: Vertex[]) => void;
}) {
  const nodesRef = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const vertsRef = useRef<Vertex[]>(item.vertices);
  useEffect(() => { vertsRef.current = item.vertices; }, [item.vertices]);
  const color = MODE_COLOR[item.mode];

  // Position handles each frame.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const sync = () => {
      if (!viewer || viewer.isDestroyed()) return;
      const scene = viewer.scene;
      const canvas = scene.canvas;
      const cw = canvas.clientWidth || 0;
      const ch = canvas.clientHeight || 0;
      const camera = viewer.camera;
      vertsRef.current.forEach((v, i) => {
        const node = nodesRef.current.get(i);
        if (!node) return;
        try {
          const world = safeCartesian(viewer, v, 2.4);
          const toPoint = Cartesian3.subtract(world, camera.positionWC, new Cartesian3());
          if (Cartesian3.dot(toPoint, camera.directionWC) <= 0) { node.style.opacity = "0"; return; }
          const win = SceneTransforms.worldToWindowCoordinates(scene, world);
          if (!win || win.x < -50 || win.y < -50 || win.x > cw + 50 || win.y > ch + 50) {
            node.style.opacity = "0"; return;
          }
          node.style.opacity = "1";
          node.style.transform = `translate3d(${Math.round(win.x)}px, ${Math.round(win.y)}px, 0) translate(-50%, -50%)`;
        } catch { node.style.opacity = "0"; }
      });
    };
    sync();
    const remove = viewer.scene.postRender.addEventListener(sync);
    return () => { remove(); };
  }, [viewerRef, item.vertices]);

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const canvas = viewer.scene.canvas;
    // Disable camera controls while dragging
    const controller = viewer.scene.screenSpaceCameraController;
    const prevEnabled = controller.enableInputs;
    controller.enableInputs = false;
    // Snapshot for undo history (before this drag mutates anything)
    const snapshot = vertsRef.current.slice();
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      const v = pickPoint({ x, y });
      if (!v) return;
      const next = vertsRef.current.slice();
      next[index] = v;
      vertsRef.current = next;
      moved = true;
      onChange(next);
      requestSceneRender(viewer);
    };
    const onUp = () => {
      controller.enableInputs = prevEnabled;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (moved) onCommit?.(snapshot);
      requestSceneRender(viewer);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {item.vertices.map((_, i) => (
        <div
          key={i}
          ref={(el) => { nodesRef.current.set(i, el); }}
          onPointerDown={startDrag(i)}
          className="absolute left-0 top-0 pointer-events-auto cursor-grab active:cursor-grabbing"
          style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0, touchAction: "none" }}
        >
          <div
            className="w-4 h-4 rounded-full border-2 shadow-lg ring-2 ring-white/70"
            style={{
              background: color,
              borderColor: "#fff",
              boxShadow: `0 0 0 3px ${color}55, 0 4px 14px ${color}88`,
            }}
          />
        </div>
      ))}
    </div>
  );
}