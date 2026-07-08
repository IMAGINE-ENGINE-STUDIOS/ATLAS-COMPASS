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
} from "cesium";
import {
  Ruler, X, MousePointer2, Pentagon, MoveVertical, Trash2, Undo2,
  Check, Eye, EyeOff, Target, ChevronDown, ChevronRight, Pencil,
} from "lucide-react";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  onClose: () => void;
}

type Mode = "distance" | "area" | "height";
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
};

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

  useEffect(() => { saveLedger(ledger); }, [ledger]);

  const verticesRef = useRef<Vertex[]>([]);
  useEffect(() => { verticesRef.current = vertices; }, [vertices]);

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
        if (mode === "height" && prev.length >= 2) return [v];
        return [...prev, v];
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Right-click = undo last vertex (in addition to Backspace)
    handler.setInputAction(() => {
      setVertices((p) => p.slice(0, -1));
    }, ScreenSpaceEventType.RIGHT_CLICK);

    return () => { handler.destroy(); };
  }, [viewerRef, mode, pickPoint]);

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
  useEffect(() => { setVertices([]); }, [mode]);

  // ── DRAFT geometry entities (one per mode; positions via CallbackProperty)
  const draftEntitiesRef = useRef<Entity[]>([]);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const color = Color.fromCssColorString(MODE_COLOR[mode]);

    const ents: Entity[] = [];
    if (mode === "distance") {
      ents.push(viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() =>
            verticesRef.current.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt)), false),
          width: 3,
          material: color,
          arcType: ArcType.GEODESIC,
          depthFailMaterial: color.withAlpha(0.55),
        },
      }));
    } else if (mode === "area") {
      ents.push(viewer.entities.add({
        polygon: {
          hierarchy: new CallbackProperty(() =>
            new PolygonHierarchy(
              verticesRef.current.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt))
            ), false) as any,
          material: color.withAlpha(0.22),
          outline: false,
          height: 0,
        },
      }));
      // Outline as a closed polyline so it renders reliably over 3D tiles.
      ents.push(viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const pts = verticesRef.current.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt));
            return pts.length >= 3 ? [...pts, pts[0]] : pts;
          }, false),
          width: 3,
          material: color,
          arcType: ArcType.GEODESIC,
          depthFailMaterial: color.withAlpha(0.55),
        },
      }));
    } else {
      // height — connector + slant
      ents.push(viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const vs = verticesRef.current;
            if (vs.length < 2) return [];
            const [a, b] = vs;
            const lowAlt = Math.min(a.alt, b.alt);
            const high = a.alt >= b.alt ? a : b;
            const base = Cartesian3.fromDegrees(high.lng, high.lat, lowAlt);
            return [base, Cartesian3.fromDegrees(high.lng, high.lat, high.alt)];
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
            verticesRef.current.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt)), false),
          width: 2,
          material: Color.fromCssColorString("#38bdf8"),
          arcType: ArcType.NONE,
          depthFailMaterial: Color.fromCssColorString("#38bdf8").withAlpha(0.55),
        },
      }));
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
      const pts = m.vertices.map((v) => Cartesian3.fromDegrees(v.lng, v.lat, v.alt));
      if (m.mode === "distance" && pts.length >= 2) {
        ents.push(viewer.entities.add({
          polyline: { positions: pts, width: 2.5, material: color, arcType: ArcType.GEODESIC,
            depthFailMaterial: color.withAlpha(0.5) },
        }));
      } else if (m.mode === "area" && pts.length >= 3) {
        ents.push(viewer.entities.add({
          polygon: { hierarchy: new PolygonHierarchy(pts), material: color.withAlpha(0.18), height: 0 },
        }));
        ents.push(viewer.entities.add({
          polyline: { positions: [...pts, pts[0]], width: 2.5, material: color, arcType: ArcType.GEODESIC,
            depthFailMaterial: color.withAlpha(0.5) },
        }));
      } else if (m.mode === "height" && pts.length === 2) {
        const [a, b] = m.vertices;
        const lowAlt = Math.min(a.alt, b.alt);
        const high = a.alt >= b.alt ? a : b;
        const base = Cartesian3.fromDegrees(high.lng, high.lat, lowAlt);
        ents.push(viewer.entities.add({
          polyline: { positions: [base, Cartesian3.fromDegrees(high.lng, high.lat, high.alt)],
            width: 2.5, material: color, arcType: ArcType.NONE,
            depthFailMaterial: color.withAlpha(0.5) },
        }));
        ents.push(viewer.entities.add({
          polyline: { positions: pts, width: 2, material: Color.fromCssColorString("#38bdf8"),
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
    const need = mode === "area" ? 3 : 2;
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
              x.id === editingId ? { ...x, vertices: newVerts } : x))}
          />
        );
      })()}
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
            <div className="grid grid-cols-3 gap-1.5">
              <ModeButton active={mode === "distance"} onClick={() => setMode("distance")} icon={<MousePointer2 className="w-3 h-3" />} label="Distance" color={MODE_COLOR.distance} />
              <ModeButton active={mode === "area"} onClick={() => setMode("area")} icon={<Pentagon className="w-3 h-3" />} label="Area" color={MODE_COLOR.area} />
              <ModeButton active={mode === "height"} onClick={() => setMode("height")} icon={<MoveVertical className="w-3 h-3" />} label="Height" color={MODE_COLOR.height} />
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

            <div className="flex items-center justify-between text-[10px] text-white/55">
              <span>
                {vertices.length === 0
                  ? mode === "height" ? "Click 2 points (base + top)" : "Click the globe to add points"
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
              disabled={vertices.length < (mode === "area" ? 3 : 2)}
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
  viewerRef, draft, ledger,
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
  draft: { mode: Mode; vertices: Vertex[] };
  ledger: SavedMeasurement[];
}) {
  const nodesRef = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [, tick] = useState(0);
  // We DON'T rerender per frame; the DOM nodes are repositioned imperatively.

  // Flat list of markers: draft first, then each visible saved item.
  const items = useMemo(() => {
    const out: { key: string; index: number; total: number; vertex: Vertex; color: string; kind: "draft" | "saved"; label?: string }[] = [];
    draft.vertices.forEach((v, i) => {
      out.push({ key: `draft:${i}`, index: i + 1, total: draft.vertices.length, vertex: v, color: MODE_COLOR[draft.mode], kind: "draft" });
    });
    ledger.forEach((m) => {
      if (m.hidden) return;
      m.vertices.forEach((v, i) => {
        out.push({ key: `${m.id}:${i}`, index: i + 1, total: m.vertices.length, vertex: v, color: MODE_COLOR[m.mode], kind: "saved", label: i === 0 ? m.label : undefined });
      });
    });
    return out;
  }, [draft, ledger]);

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
          const world = Cartesian3.fromDegrees(it.vertex.lng, it.vertex.lat, it.vertex.alt);
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
  item, units, onToggle, onDelete, onFocus, onRename,
}: {
  item: SavedMeasurement;
  units: Units;
  onToggle: () => void;
  onDelete: () => void;
  onFocus: () => void;
  onRename: (label: string) => void;
}) {
  const color = MODE_COLOR[item.mode];
  const m = computeMeasurements(item.mode, item.vertices);
  const summary = shortLabel(item.mode, m, units);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.label || summary);

  return (
    <div
      className="group rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] p-2 flex items-center gap-2 transition-colors"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { onRename(name.trim() || summary); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-full bg-transparent text-[11px] font-semibold outline-none border-b border-white/20"
          />
        ) : (
          <button onDoubleClick={() => setEditing(true)} className="text-left w-full">
            <div className="text-[11px] font-semibold truncate" style={{ color }}>
              {item.label || summary}
            </div>
            <div className="text-[9px] text-white/45 uppercase tracking-wider">
              {item.mode} · {item.vertices.length} pts
            </div>
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
        <button onClick={onFocus} title="Focus" className="p-1 rounded hover:bg-white/10 text-white/70">
          <Target className="w-3 h-3" />
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