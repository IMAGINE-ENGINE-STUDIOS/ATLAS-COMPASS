/**
 * USGSEarthquakesPanel
 * --------------------
 * Full USGS earthquake search dataset integrated into Atlas Earth.
 *
 * Mirrors the search UI at https://earthquake.usgs.gov/earthquakes/search/:
 *  - Date range (start / end, defaults to last 7 days)
 *  - Magnitude range (min / max)
 *  - Optional bounding box ("Use current view")
 *  - Result limit + order (newest / largest)
 *
 * Renders the returned events as Cesium `PointGraphics` entities on the
 * globe:
 *  - Size scales with magnitude
 *  - Color from cool (green, small) → hot (red, major)
 *  - Click any dot / list row: flies to the event and opens the USGS
 *    event page in the info box.
 *
 * All work happens on the Cesium viewer that Atlas already has mounted —
 * no separate map, no extra WebGL context. The panel is a lightweight
 * glassmorphic pill and unmounts cleanly (removes every entity it added).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Loader2, MapPin, ExternalLink, Crosshair } from "lucide-react";
import {
  Cartesian3,
  Cartographic,
  Color,
  HeightReference,
  NearFarScalar,
  Rectangle,
  Math as CesiumMath,
  type Viewer,
  type Entity,
} from "cesium";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  onClose: () => void;
}

type OrderBy = "time" | "time-asc" | "magnitude" | "magnitude-asc";

interface QuakeFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    updated: number;
    tsunami: 0 | 1;
    url: string;
    title: string;
    alert?: string | null;
  };
  geometry: { type: "Point"; coordinates: [number, number, number] };
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// Magnitude → RGB. Approximates the color ramp on the USGS map so the
// visual mapping is familiar to seismologists.
function magColor(mag: number): Color {
  if (mag >= 7) return Color.fromCssColorString("#b91c1c"); // red-700
  if (mag >= 6) return Color.fromCssColorString("#ef4444"); // red-500
  if (mag >= 5) return Color.fromCssColorString("#f97316"); // orange-500
  if (mag >= 4) return Color.fromCssColorString("#f59e0b"); // amber-500
  if (mag >= 3) return Color.fromCssColorString("#facc15"); // yellow-400
  if (mag >= 2) return Color.fromCssColorString("#84cc16"); // lime-500
  return Color.fromCssColorString("#22c55e");               // green-500
}
function magPixelSize(mag: number): number {
  // Rough log-scaled pixel size: M2 ~ 6 px, M5 ~ 14 px, M8 ~ 28 px.
  const m = Math.max(0, mag);
  return Math.max(4, Math.min(32, 4 + m * 3.2));
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + "Z";
  } catch { return String(ms); }
}

/** Read the current camera's ground bounding box in degrees. */
function currentViewBbox(viewer: Viewer | null): {
  minLat: number; maxLat: number; minLon: number; maxLon: number;
} | null {
  if (!viewer || viewer.isDestroyed()) return null;
  try {
    const rect = viewer.camera.computeViewRectangle();
    if (!rect) return null;
    return {
      minLon: CesiumMath.toDegrees(rect.west),
      minLat: CesiumMath.toDegrees(rect.south),
      maxLon: CesiumMath.toDegrees(rect.east),
      maxLat: CesiumMath.toDegrees(rect.north),
    };
  } catch { return null; }
}

export default function USGSEarthquakesPanel({ viewerRef, onClose }: Props) {
  const [startTime, setStartTime] = useState<string>(() => isoDaysAgo(7));
  const [endTime, setEndTime] = useState<string>(() => isoToday());
  const [minMag, setMinMag] = useState<number>(2.5);
  const [maxMag, setMaxMag] = useState<number>(10);
  const [useBbox, setUseBbox] = useState<boolean>(false);
  const [limit, setLimit] = useState<number>(500);
  const [orderBy, setOrderBy] = useState<OrderBy>("time");

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<QuakeFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entitiesRef = useRef<Entity[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const clearEntities = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      for (const e of entitiesRef.current) {
        try { viewer.entities.remove(e); } catch { /* noop */ }
      }
    }
    entitiesRef.current = [];
  }, [viewerRef]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const q = new URLSearchParams();
      q.set("mode", "search");
      q.set("starttime", startTime);
      q.set("endtime", endTime);
      q.set("minmagnitude", String(minMag));
      if (maxMag < 10) q.set("maxmagnitude", String(maxMag));
      q.set("limit", String(Math.max(1, Math.min(20000, limit | 0))));
      q.set("orderby", orderBy);
      if (useBbox) {
        const bbox = currentViewBbox(viewerRef.current);
        if (bbox) {
          q.set("minlatitude", bbox.minLat.toFixed(3));
          q.set("maxlatitude", bbox.maxLat.toFixed(3));
          q.set("minlongitude", bbox.minLon.toFixed(3));
          q.set("maxlongitude", bbox.maxLon.toFixed(3));
        }
      }

      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const url = `${base}/functions/v1/earthquake-data?${q.toString()}`;
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const r = await fetch(url, {
        headers: { apikey, Authorization: `Bearer ${apikey}` },
        signal: ac.signal,
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`USGS ${r.status}: ${txt.slice(0, 160)}`);
      }
      const j = await r.json();
      const feats: QuakeFeature[] = (j?.features ?? []).filter(
        (f: any) => f?.geometry?.coordinates?.length === 3,
      );
      setFeatures(feats);

      // Re-render entities on the globe.
      clearEntities();
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        for (const f of feats) {
          const [lon, lat, depthKm] = f.geometry.coordinates;
          const mag = f.properties.mag ?? 0;
          const entity = viewer.entities.add({
            id: `usgs-quake-${f.id}`,
            name: f.properties.title || `M ${mag} — ${f.properties.place ?? ""}`,
            position: Cartesian3.fromDegrees(lon, lat, 0),
            point: {
              pixelSize: magPixelSize(mag),
              color: magColor(mag).withAlpha(0.92),
              outlineColor: Color.WHITE.withAlpha(0.9),
              outlineWidth: 1.2,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              scaleByDistance: new NearFarScalar(1.5e5, 1.6, 1.5e8, 0.55),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            description: `
              <div style="font-family:ui-sans-serif,system-ui;color:#e5e7eb;line-height:1.4">
                <div style="font-size:16px;font-weight:600;margin-bottom:4px">M ${mag?.toFixed?.(1) ?? mag} — ${f.properties.place ?? ""}</div>
                <div style="font-size:12px;color:#a1a1aa">${formatTime(f.properties.time)}</div>
                <div style="font-size:12px;margin-top:6px">Depth: <b>${depthKm?.toFixed?.(1) ?? depthKm} km</b></div>
                ${f.properties.tsunami ? '<div style="color:#f87171;margin-top:6px">⚠ Tsunami flag</div>' : ""}
                <div style="margin-top:10px"><a href="${f.properties.url}" target="_blank" rel="noopener" style="color:#38bdf8">USGS event page ↗</a></div>
              </div>
            `,
          });
          entitiesRef.current.push(entity);
        }
        viewer.scene.requestRender?.();
      }
    } catch (e) {
      if ((e as any)?.name === "AbortError") return;
      setError(String((e as Error).message ?? e));
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [startTime, endTime, minMag, maxMag, limit, orderBy, useBbox, viewerRef, clearEntities]);

  const flyTo = useCallback((f: QuakeFeature) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const [lon, lat] = f.geometry.coordinates;
    setSelectedId(f.id);
    const rect = Rectangle.fromDegrees(lon - 1.5, lat - 1.5, lon + 1.5, lat + 1.5);
    try {
      viewer.camera.flyTo({
        destination: rect,
        duration: 1.2,
      });
      const ent = viewer.entities.getById(`usgs-quake-${f.id}`);
      if (ent) viewer.selectedEntity = ent;
    } catch { /* noop */ }
  }, [viewerRef]);

  // Auto-run once on mount so the panel is immediately useful.
  useEffect(() => {
    void runSearch();
    return () => {
      abortRef.current?.abort();
      clearEntities();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    if (!features.length) return null;
    const mags = features
      .map((f) => f.properties.mag ?? 0)
      .filter((m) => Number.isFinite(m));
    const max = mags.length ? Math.max(...mags) : 0;
    return { count: features.length, max: max.toFixed(1) };
  }, [features]);

  return (
    <div
      className="draggable-window fixed z-[70] top-24 right-4 w-[360px] max-w-[92vw] max-h-[75vh] flex flex-col rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl text-white pointer-events-auto"
      style={{ overscrollBehavior: "contain" }}
    >
      <div className="draggable-window-handle flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.9)]" />
          <div className="text-[11px] font-bold uppercase tracking-widest">USGS Earthquake Search</div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10"
          aria-label="Close earthquake search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Start (UTC)</span>
            <input
              type="date"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">End (UTC)</span>
            <input
              type="date"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Min magnitude</span>
            <input
              type="number" step={0.1} min={-2} max={10}
              value={minMag}
              onChange={(e) => setMinMag(Number(e.target.value))}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Max magnitude</span>
            <input
              type="number" step={0.1} min={-2} max={10}
              value={maxMag}
              onChange={(e) => setMaxMag(Number(e.target.value))}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Limit</span>
            <input
              type="number" step={100} min={1} max={20000}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(20000, Number(e.target.value) | 0)))}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Order by</span>
            <select
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value as OrderBy)}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            >
              <option value="time">Newest first</option>
              <option value="time-asc">Oldest first</option>
              <option value="magnitude">Largest first</option>
              <option value="magnitude-asc">Smallest first</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-white/80 select-none">
          <input
            type="checkbox"
            checked={useBbox}
            onChange={(e) => setUseBbox(e.target.checked)}
            className="accent-red-500"
          />
          <Crosshair className="w-3.5 h-3.5 text-white/60" />
          Restrict to current map view
        </label>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void runSearch()}
            disabled={loading}
            className="flex-1 h-8 px-3 rounded-md bg-red-500/20 border border-red-400/40 text-red-100 text-xs font-bold uppercase tracking-widest hover:bg-red-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {loading ? "Searching…" : "Search USGS"}
          </button>
          <a
            href="https://earthquake.usgs.gov/earthquakes/search/"
            target="_blank" rel="noopener"
            className="h-8 px-2 rounded-md bg-white/[0.05] border border-white/10 text-[10px] uppercase tracking-widest text-white/70 hover:bg-white/10 flex items-center gap-1"
            title="Open the official USGS earthquake search"
          >
            USGS <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {error && (
          <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-400/30 rounded px-2 py-1.5">
            {error}
          </div>
        )}

        {summary && (
          <div className="flex items-center justify-between text-[11px] text-white/70">
            <span>{summary.count} events</span>
            <span>largest M {summary.max}</span>
          </div>
        )}

        <div className="border-t border-white/10 pt-2 space-y-1 max-h-[32vh] overflow-y-auto">
          {features.slice(0, 500).map((f) => {
            const mag = f.properties.mag ?? 0;
            const isSel = selectedId === f.id;
            return (
              <button
                key={f.id}
                onClick={() => flyTo(f)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                  isSel ? "bg-red-500/15 border border-red-400/30" : "hover:bg-white/[0.06] border border-transparent"
                }`}
              >
                <span
                  className="inline-block rounded-full shrink-0"
                  style={{
                    width: Math.min(20, Math.max(6, 4 + mag * 2)),
                    height: Math.min(20, Math.max(6, 4 + mag * 2)),
                    background: `#${magColor(mag).toCssHexString().slice(1)}`,
                    boxShadow: `0 0 8px ${magColor(mag).withAlpha(0.7).toCssColorString()}`,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">
                    <b>M {mag.toFixed(1)}</b> — {f.properties.place ?? "Unknown location"}
                  </div>
                  <div className="text-[10px] text-white/50">{formatTime(f.properties.time)}</div>
                </div>
                <MapPin className="w-3 h-3 text-white/40 shrink-0" />
              </button>
            );
          })}
          {!loading && features.length === 0 && (
            <div className="text-[11px] text-white/50 text-center py-4">
              No events for these filters. Try a wider date range or lower magnitude.
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-white/40">
        Source: earthquake.usgs.gov · FDSNWS event API
      </div>
    </div>
  );
}
