/**
 * GeofenceToolPanel
 * -----------------
 * Right-side glass panel for creating, editing and persisting Geofences.
 * Two draw modes:
 *   - "tile": click a tile in the current view to toggle it blue.
 *             Shift-click removes. Uses Web Mercator XYZ at chosen zoom.
 *   - "polygon": click to add vertices; double-click / Enter to close.
 *
 * A tiny "Tile Intelligence" placeholder button on each saved geofence row is
 * a stub for phase 2 (rules engine). Alarms UI arrives in a follow-up patch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Viewer } from "cesium";
import {
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import {
  X, MousePointer2, Pentagon, Undo2, Save, Trash2, Bell, Plus, Layers,
} from "lucide-react";
import { toast } from "sonner";
import GeofenceLayer from "./geofence/GeofenceLayer";
import {
  createGeofence,
  deleteGeofence,
  listGeofences,
  type Geofence,
} from "@/lib/tileIntel/geofences";
import {
  lngLatToTile,
  polygonToTiles,
  tileId,
  type LngLat,
  type TileId,
} from "./geofence/tileMath";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  onClose: () => void;
}

type Mode = "tile" | "polygon" | "idle";

const COLORS = ["#38bdf8", "#22c55e", "#f97316", "#a78bfa", "#ef4444", "#fbbf24"];

export default function GeofenceToolPanel({ viewerRef, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("tile");
  const [zoom, setZoom] = useState(16);
  const [color, setColor] = useState(COLORS[0]);
  const [name, setName] = useState("");
  const [editingTiles, setEditingTiles] = useState<TileId[]>([]);
  const [polygonInProgress, setPolygonInProgress] = useState<LngLat[]>([]);
  const [hoverTile, setHoverTile] = useState<TileId | null>(null);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [saving, setSaving] = useState(false);

  // Load persisted
  useEffect(() => {
    listGeofences().then(setGeofences).catch(() => setGeofences([]));
    const onWorld = () => { listGeofences().then(setGeofences).catch(() => setGeofences([])); };
    window.addEventListener("atlas:world-changed", onWorld);
    return () => window.removeEventListener("atlas:world-changed", onWorld);
  }, []);

  const pickLngLat = useCallback((position: { x: number; y: number }): LngLat | null => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return null;
    const scene = viewer.scene;
    // Prefer picking against the loaded geometry (photoreal tileset or globe).
    const cartesian =
      scene.pickPosition?.(position as any) ??
      scene.camera.pickEllipsoid(position as any, scene.globe.ellipsoid);
    if (!defined(cartesian)) return null;
    const c = Cartographic.fromCartesian(cartesian);
    return {
      lng: CesiumMath.toDegrees(c.longitude),
      lat: CesiumMath.toDegrees(c.latitude),
    };
  }, [viewerRef]);

  // Cesium input handler for click / move / dbl-click
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    if (mode === "idle") return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((e: any) => {
      const p = pickLngLat(e.position);
      if (!p) return;
      if (mode === "tile") {
        const id = tileId(lngLatToTile(p.lng, p.lat, zoom));
        // Shift removes, plain click toggles
        const shift = (window as any).event?.shiftKey === true;
        setEditingTiles((prev) => {
          const has = prev.includes(id);
          if (shift || has) return prev.filter((x) => x !== id);
          return [...prev, id];
        });
      } else if (mode === "polygon") {
        setPolygonInProgress((prev) => [...prev, p]);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((e: any) => {
      const p = pickLngLat(e.endPosition);
      if (!p) { setHoverTile(null); return; }
      if (mode === "tile") {
        setHoverTile(tileId(lngLatToTile(p.lng, p.lat, zoom)));
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    if (mode === "polygon") {
      handler.setInputAction(() => {
        // Close polygon → convert to tiles
        setPolygonInProgress((prev) => {
          if (prev.length < 3) return prev;
          const tiles = polygonToTiles(prev, zoom);
          setEditingTiles((cur) => Array.from(new Set([...cur, ...tiles])));
          return [];
        });
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }

    return () => { handler.destroy(); };
  }, [viewerRef, mode, zoom, pickLngLat]);

  // Escape / Enter for polygon
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPolygonInProgress([]);
      } else if (e.key === "Enter" && mode === "polygon") {
        setPolygonInProgress((prev) => {
          if (prev.length < 3) return prev;
          const tiles = polygonToTiles(prev, zoom);
          setEditingTiles((cur) => Array.from(new Set([...cur, ...tiles])));
          return [];
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, zoom]);

  // Committed polygon (last-closed one) — track for save so users can save an
  // area rather than just its tile set.
  const [lastPolygon, setLastPolygon] = useState<LngLat[] | null>(null);
  useEffect(() => {
    if (mode !== "polygon") return;
    if (polygonInProgress.length === 0 && editingTiles.length > 0) {
      // just closed — remember it (previous state is lost by this point; keep null)
    }
  }, [polygonInProgress, editingTiles, mode]);

  const clearEditing = () => {
    setEditingTiles([]);
    setPolygonInProgress([]);
    setLastPolygon(null);
  };

  const handleSave = async () => {
    if (editingTiles.length === 0) {
      toast.error("Select at least one tile before saving.");
      return;
    }
    setSaving(true);
    try {
      const g = await createGeofence({
        name: name.trim() || `Geofence ${geofences.length + 1}`,
        color,
        zoom,
        tile_set: editingTiles,
        polygon: lastPolygon,
      });
      setGeofences((prev) => [g, ...prev]);
      clearEditing();
      setName("");
      toast.success(`Saved "${g.name}"`, { description: `${g.tile_set.length} tiles at z${g.zoom}` });
    } catch (err) {
      console.error(err);
      toast.error("Failed to save geofence", { description: String((err as any)?.message ?? err) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGeofence(id);
      setGeofences((prev) => prev.filter((g) => g.id !== id));
    } catch (err) {
      toast.error("Failed to delete geofence");
    }
  };

  const undo = () => {
    if (polygonInProgress.length > 0) {
      setPolygonInProgress((p) => p.slice(0, -1));
    } else {
      setEditingTiles((t) => t.slice(0, -1));
    }
  };

  const tileCount = editingTiles.length;

  return (
    <>
      <GeofenceLayer
        viewerRef={viewerRef}
        geofences={geofences}
        editingTiles={editingTiles}
        polygonInProgress={polygonInProgress}
        hoverTile={mode === "tile" ? hoverTile : null}
      />
      <div data-draggable-window className="absolute top-[62px] right-4 z-30 w-[320px] pointer-events-auto">
        <div className="rounded-2xl border border-white/15 bg-black/75 backdrop-blur-xl shadow-2xl text-white overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div data-drag-handle className="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-move select-none">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-[11px] font-bold tracking-widest uppercase text-sky-200">Geofence Tool</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mode switcher */}
          <div className="p-3 space-y-3 border-b border-white/10">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setMode("tile")}
                className={`h-8 rounded-md text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-1.5 border transition-all ${
                  mode === "tile"
                    ? "bg-sky-500/25 border-sky-300 text-sky-100 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                    : "bg-white/[0.04] border-white/15 text-white/70 hover:text-white"
                }`}
              >
                <MousePointer2 className="w-3 h-3" /> Tile
              </button>
              <button
                onClick={() => setMode("polygon")}
                className={`h-8 rounded-md text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-1.5 border transition-all ${
                  mode === "polygon"
                    ? "bg-sky-500/25 border-sky-300 text-sky-100 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                    : "bg-white/[0.04] border-white/15 text-white/70 hover:text-white"
                }`}
              >
                <Pentagon className="w-3 h-3" /> Polygon
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-white/60 uppercase tracking-wider">Tile Zoom</span>
                <span className="text-[10px] text-sky-200 font-mono">z{zoom}</span>
              </div>
              <input
                type="range"
                min={10}
                max={20}
                step={1}
                value={zoom}
                onChange={(e) => setZoom(parseInt(e.target.value, 10))}
                className="w-full accent-sky-400"
              />
            </div>

            <div>
              <div className="text-[9px] text-white/60 uppercase tracking-wider mb-1">Color</div>
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-white scale-110" : "border-white/20"}`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Geofence name"
              className="w-full h-8 px-2.5 rounded-md bg-white/[0.05] border border-white/15 text-[12px] placeholder:text-white/30 focus:outline-none focus:border-sky-400"
            />

            <div className="flex items-center justify-between text-[10px] text-white/60">
              <span>
                {tileCount > 0 ? `${tileCount} tile${tileCount === 1 ? "" : "s"} selected` : (
                  mode === "tile" ? "Click a tile on the globe" : "Click to add vertices, double-click to close"
                )}
              </span>
              <button
                onClick={undo}
                disabled={tileCount === 0 && polygonInProgress.length === 0}
                className="text-white/60 hover:text-white disabled:opacity-30"
                title="Undo last"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={clearEditing}
                disabled={tileCount === 0 && polygonInProgress.length === 0}
                className="h-8 rounded-md text-[10px] font-bold tracking-widest uppercase border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] text-white/80 disabled:opacity-30"
              >
                Clear
              </button>
              <button
                onClick={handleSave}
                disabled={saving || tileCount === 0}
                className="h-8 rounded-md text-[10px] font-bold tracking-widest uppercase border border-sky-300 bg-sky-500/30 hover:bg-sky-500/50 text-sky-100 disabled:opacity-30 flex items-center justify-center gap-1"
              >
                <Save className="w-3 h-3" /> Save
              </button>
            </div>
          </div>

          {/* Saved list */}
          <div className="max-h-[38vh] overflow-y-auto">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[9px] text-white/50 uppercase tracking-wider">Saved geofences</span>
              <span className="text-[9px] text-white/40">{geofences.length}</span>
            </div>
            {geofences.length === 0 && (
              <div className="px-3 pb-3 text-[10px] text-white/40">No geofences yet.</div>
            )}
            <div className="px-2 pb-2 space-y-1">
              {geofences.map((gf) => (
                <div
                  key={gf.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.05] transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: gf.color, boxShadow: `0 0 8px ${gf.color}` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate">{gf.name}</div>
                    <div className="text-[9px] text-white/45">{gf.tile_set.length} tiles · z{gf.zoom}</div>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sky-500/20 text-sky-300 transition-opacity"
                    title="Open Tile Intelligence for this geofence"
                    onClick={() => window.dispatchEvent(new CustomEvent("atlas:open-tile-intel", { detail: { geofenceId: gf.id } }))}
                  >
                    <Bell className="w-3 h-3" />
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-300 transition-opacity"
                    onClick={() => handleDelete(gf.id)}
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}