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
import { X, Search, Loader2, MapPin, ExternalLink, Crosshair, Download, Radio, History, ChevronDown, ChevronUp, Activity } from "lucide-react";
import {
  Color,
  Rectangle,
  Math as CesiumMath,
  type Viewer,
} from "cesium";
import { supabase } from "@/integrations/supabase/client";
import QuakeTagsOverlay, { type QuakeTag } from "./QuakeTagsOverlay";
import QuakeReportModal from "./QuakeReportModal";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  onClose: () => void;
}

type OrderBy = "time" | "time-asc" | "magnitude" | "magnitude-asc";
type Source = "usgs" | "emsc" | "iris" | "isc" | "geofon";
type Preset =
  | "live-hour"
  | "today"
  | "week"
  | "month"
  | "year"
  | "5y"
  | "20y"
  | "significant-1900"
  | "custom";

const SOURCE_LABELS: Record<Source, string> = {
  usgs:   "USGS (NEIC)",
  emsc:   "EMSC (Europe)",
  iris:   "IRIS DMC",
  isc:    "ISC (Reviewed)",
  geofon: "GEOFON / GFZ",
};

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

/**
 * FDSNWS treats a bare `YYYY-MM-DD` as midnight UTC, so passing today's date
 * as `endtime` silently drops every event that happened *today* — the exact
 * reason fresh quakes were missing. Expand the date inputs into explicit UTC
 * timestamps, and push the end bound slightly into the future when the user
 * asked for "up to today" so the newest events are always included.
 */
function toStartStamp(day: string): string {
  return /\d{2}:\d{2}/.test(day) ? day : `${day}T00:00:00`;
}
function toEndStamp(day: string): string {
  if (/\d{2}:\d{2}/.test(day)) return day;
  const endOfDay = new Date(`${day}T23:59:59Z`).getTime();
  const nowPlus = Date.now() + 3_600_000;
  const stamp = Math.min(endOfDay, nowPlus) < Date.now() ? endOfDay : nowPlus;
  return new Date(Math.max(stamp, Math.min(endOfDay, nowPlus))).toISOString().slice(0, 19);
}

/** Named presets → (start, end, minMag). Historic + live coverage. */
function applyPreset(p: Preset): { start: string; end: string; min: number; limit: number } | null {
  const end = isoToday();
  switch (p) {
    case "live-hour":         return { start: isoDaysAgo(1),      end, min: 0,   limit: 500 };
    case "today":             return { start: isoDaysAgo(1),      end, min: 1,   limit: 1000 };
    case "week":              return { start: isoDaysAgo(7),      end, min: 2.5, limit: 2000 };
    case "month":             return { start: isoDaysAgo(30),     end, min: 3.5, limit: 3000 };
    case "year":              return { start: isoDaysAgo(365),    end, min: 4.5, limit: 5000 };
    case "5y":                return { start: isoDaysAgo(365*5),  end, min: 5.5, limit: 8000 };
    case "20y":               return { start: isoDaysAgo(365*20), end, min: 6,   limit: 12000 };
    case "significant-1900":  return { start: "1900-01-01",       end, min: 7,   limit: 20000 };
    default: return null;
  }
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
  // Detect mobile once so the widget can start collapsed and dock to the
  // bottom instead of covering the map.
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const [minimized, setMinimized] = useState<boolean>(isMobile);
  const [source, setSource] = useState<Source>("usgs");
  const [preset, setPreset] = useState<Preset>("week");
  const [liveMode, setLiveMode] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<string>(() => isoDaysAgo(7));
  const [endTime, setEndTime] = useState<string>(() => isoToday());
  const [minMag, setMinMag] = useState<number>(2.5);
  const [maxMag, setMaxMag] = useState<number>(10);
  const [useBbox, setUseBbox] = useState<boolean>(false);
  const [limit, setLimit] = useState<number>(2000);
  const [orderBy, setOrderBy] = useState<OrderBy>("time");

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<QuakeFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportQuake, setReportQuake] = useState<QuakeTag | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Kept as a no-op so existing effect cleanups stay unchanged; tag rendering
  // is now handled by the React overlay, which unmounts on its own.
  const clearEntities = useCallback(() => {}, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const q = new URLSearchParams();
      q.set("mode", "search");
      q.set("source", source);
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
    } catch (e) {
      if ((e as any)?.name === "AbortError") return;
      setError(String((e as Error).message ?? e));
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [source, startTime, endTime, minMag, maxMag, limit, orderBy, useBbox, viewerRef, clearEntities]);

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
    } catch { /* noop */ }
  }, [viewerRef]);

  // Convert the raw FDSNWS features into the compact tag shape the
  // overlay + modal expect. Memoized so identity is stable across renders.
  const tags = useMemo<QuakeTag[]>(() => features.map((f) => {
    const [lng, lat, depth] = f.geometry.coordinates;
    return {
      id: f.id,
      mag: f.properties.mag ?? 0,
      place: f.properties.place ?? "",
      time: f.properties.time,
      lat, lng, depthKm: depth,
      tsunami: f.properties.tsunami ?? 0,
      url: f.properties.url,
      alert: f.properties.alert ?? null,
    };
  }), [features]);

  const openReport = useCallback((q: QuakeTag) => {
    setSelectedId(q.id);
    setReportQuake(q);
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      try {
        viewer.camera.flyTo({
          destination: Rectangle.fromDegrees(q.lng - 1.5, q.lat - 1.5, q.lng + 1.5, q.lat + 1.5),
          duration: 1.0,
        });
      } catch { /* noop */ }
    }
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

  // Live mode: re-poll every 60 s while enabled.
  useEffect(() => {
    if (!liveMode) return;
    const id = window.setInterval(() => { void runSearch(); }, 60_000);
    return () => window.clearInterval(id);
  }, [liveMode, runSearch]);

  // Applying a preset updates all inputs, then triggers a search.
  const onPreset = useCallback((p: Preset) => {
    setPreset(p);
    const cfg = applyPreset(p);
    if (!cfg) return;
    setStartTime(cfg.start);
    setEndTime(cfg.end);
    setMinMag(cfg.min);
    setLimit(cfg.limit);
  }, []);

  // Re-run search when a preset changes state above.
  useEffect(() => {
    if (preset === "custom") return;
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, source]);

  // ---- Export helpers -----------------------------------------------------
  const downloadBlob = (name: string, mime: string, data: string) => {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const exportGeoJSON = useCallback(() => {
    const fc = { type: "FeatureCollection", features };
    downloadBlob(`quakes_${source}_${startTime}_${endTime}.geojson`,
      "application/geo+json", JSON.stringify(fc, null, 2));
  }, [features, source, startTime, endTime]);
  const exportCSV = useCallback(() => {
    const header = ["id","time_utc","magnitude","place","longitude","latitude","depth_km","tsunami","alert","url"];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = features.map((f) => {
      const [lon, lat, depth] = f.geometry.coordinates;
      return [
        f.id, new Date(f.properties.time).toISOString(),
        f.properties.mag ?? "", f.properties.place ?? "",
        lon, lat, depth, f.properties.tsunami ?? 0,
        f.properties.alert ?? "", f.properties.url,
      ].map(esc).join(",");
    });
    downloadBlob(`quakes_${source}_${startTime}_${endTime}.csv`,
      "text/csv", [header.join(","), ...rows].join("\n"));
  }, [features, source, startTime, endTime]);

  const summary = useMemo(() => {
    if (!features.length) return null;
    const mags = features
      .map((f) => f.properties.mag ?? 0)
      .filter((m) => Number.isFinite(m));
    const max = mags.length ? Math.max(...mags) : 0;
    return { count: features.length, max: max.toFixed(1) };
  }, [features]);

  return (
    <>
      <QuakeTagsOverlay
        viewer={viewerRef.current}
        quakes={tags}
        selectedId={selectedId}
        onSelect={openReport}
      />
      {reportQuake && (
        <QuakeReportModal
          quake={reportQuake}
          source={source}
          onClose={() => setReportQuake(null)}
          onTuneSource={(inst) => {
            if (inst.fdsnSource) setSource(inst.fdsnSource);
          }}
        />
      )}
      {/* Compact floating legend chip — always visible so users can decode
          the map dots even when the full panel is collapsed. Docks above
          the mobile toolbar and stays out of the way on desktop. */}
      {minimized && (
        <div className="fixed z-[69] left-1/2 -translate-x-1/2 bottom-20 sm:bottom-4 sm:left-4 sm:translate-x-0 pointer-events-none">
          <div className="pointer-events-auto rounded-full border border-white/10 bg-black/60 backdrop-blur-xl px-3 py-1.5 flex items-center gap-2 shadow-2xl">
            <div className="flex items-center gap-1">
              {[2, 4, 6, 8].map((m) => (
                <span key={m} className="rounded-full" style={{
                  width: Math.max(6, magPixelSize(m) * 0.55),
                  height: Math.max(6, magPixelSize(m) * 0.55),
                  background: magColor(m).toCssColorString(),
                }}/>
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-widest text-white/60 font-mono">M2 → M8</span>
          </div>
        </div>
      )}

      <div
        className={
          minimized
            // Minimized: bottom-docked pill on mobile, top-right on desktop.
            ? "draggable-window fixed z-[70] bottom-4 right-4 sm:top-24 sm:bottom-auto rounded-full border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl text-white pointer-events-auto"
            // Expanded: bottom sheet on mobile, right rail on desktop.
            : "draggable-window fixed z-[70] left-2 right-2 bottom-2 sm:left-auto sm:right-4 sm:top-24 sm:bottom-auto sm:w-[360px] max-w-[96vw] sm:max-w-[92vw] max-h-[62vh] sm:max-h-[75vh] flex flex-col rounded-2xl border border-white/10 bg-black/75 backdrop-blur-xl shadow-2xl text-white pointer-events-auto"
        }
        style={{ overscrollBehavior: "contain" }}
      >
        {minimized ? (
          <div className="flex items-center gap-2 pl-3 pr-1 py-1.5">
            <button
              onClick={() => setMinimized(false)}
              className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold"
              title="Open seismic panel"
            >
              <div className={`w-2 h-2 rounded-full bg-red-400 ${liveMode ? "animate-pulse" : ""} shadow-[0_0_10px_rgba(248,113,113,0.9)]`} />
              <Activity className="w-3.5 h-3.5" />
              <span>{summary?.count ?? 0} quakes</span>
              {summary && <span className="text-white/60">· M {summary.max}</span>}
              <ChevronUp className="w-3.5 h-3.5 text-white/70" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10"
              aria-label="Close earthquake search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
      <div className="draggable-window-handle flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.9)]" />
          <div className="text-[11px] font-bold uppercase tracking-widest">Seismic Intelligence</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1 rounded hover:bg-white/10"
            aria-label="Minimize panel"
            title="Minimize to keep map visible"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
            aria-label="Close earthquake search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto">
        {/* Data source + live toggle */}
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Data center</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
              title="Institutional seismic authority (FDSNWS)"
            >
              {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setLiveMode((v) => !v)}
            className={`h-8 px-2 rounded-md border text-[10px] uppercase tracking-widest flex items-center gap-1 ${
              liveMode
                ? "bg-red-500/25 border-red-400/60 text-red-100 animate-pulse"
                : "bg-white/[0.05] border-white/10 text-white/70 hover:bg-white/10"
            }`}
            title="Auto-refresh every 60 seconds"
          >
            <Radio className="w-3 h-3" /> {liveMode ? "Live" : "Live off"}
          </button>
        </div>

        {/* Preset chips: cover full historic range */}
        <div className="flex flex-wrap gap-1">
          {([
            ["live-hour",        "Live 24h"],
            ["today",            "Today"],
            ["week",             "7 days"],
            ["month",            "30 days"],
            ["year",             "1 yr"],
            ["5y",               "5 yr"],
            ["20y",              "20 yr"],
            ["significant-1900", "M7+ since 1900"],
          ] as [Preset, string][]).map(([p, label]) => (
            <button
              key={p}
              onClick={() => onPreset(p)}
              className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest border ${
                preset === p
                  ? "bg-red-500/25 border-red-400/60 text-red-100"
                  : "bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/10"
              }`}
            >
              {p === "significant-1900" ? <History className="w-3 h-3 inline -mt-0.5 mr-1" /> : null}
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Start (UTC)</span>
            <input
              type="date"
              value={startTime}
              onChange={(e) => { setStartTime(e.target.value); setPreset("custom"); }}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">End (UTC)</span>
            <input
              type="date"
              value={endTime}
              onChange={(e) => { setEndTime(e.target.value); setPreset("custom"); }}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Min magnitude</span>
            <input
              type="number" step={0.1} min={-2} max={10}
              value={minMag}
              onChange={(e) => { setMinMag(Number(e.target.value)); setPreset("custom"); }}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Max magnitude</span>
            <input
              type="number" step={0.1} min={-2} max={10}
              value={maxMag}
              onChange={(e) => { setMaxMag(Number(e.target.value)); setPreset("custom"); }}
              className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60">Limit</span>
            <input
              type="number" step={100} min={1} max={20000}
              value={limit}
              onChange={(e) => { setLimit(Math.max(1, Math.min(20000, Number(e.target.value) | 0))); setPreset("custom"); }}
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
            {loading ? "Searching…" : "Search"}
          </button>
          <button
            onClick={exportCSV}
            disabled={!features.length}
            title="Export current results as CSV"
            className="h-8 px-2 rounded-md bg-white/[0.05] border border-white/10 text-[10px] uppercase tracking-widest text-white/70 hover:bg-white/10 disabled:opacity-40 flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
          <button
            onClick={exportGeoJSON}
            disabled={!features.length}
            title="Export current results as GeoJSON"
            className="h-8 px-2 rounded-md bg-white/[0.05] border border-white/10 text-[10px] uppercase tracking-widest text-white/70 hover:bg-white/10 disabled:opacity-40 flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> GeoJSON
          </button>
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

        {/* Magnitude legend: color ramp + size scale, keyed to the map. */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/60 mb-1.5">
            <span>Magnitude scale</span>
            <a
              href="https://earthquake.usgs.gov/learn/topics/mag-intensity/"
              target="_blank" rel="noopener"
              className="text-white/50 hover:text-white/80 flex items-center gap-1"
            >
              guide <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <div className="flex items-end justify-between gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((m) => (
              <div key={m} className="flex flex-col items-center gap-1 flex-1">
                <span
                  className="rounded-full"
                  style={{
                    width: magPixelSize(m),
                    height: magPixelSize(m),
                    background: magColor(m).toCssColorString(),
                    boxShadow: `0 0 6px ${magColor(m).withAlpha(0.7).toCssColorString()}`,
                  }}
                />
                <span className="text-[9px] text-white/60 font-mono">M{m}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full" style={{
            background: "linear-gradient(90deg,#22c55e 0%,#84cc16 15%,#facc15 30%,#f59e0b 50%,#f97316 65%,#ef4444 82%,#b91c1c 100%)",
          }} />
          <div className="flex justify-between text-[9px] text-white/50 mt-0.5 font-mono">
            <span>Micro</span><span>Minor</span><span>Light</span><span>Moderate</span><span>Strong</span><span>Major</span><span>Great</span>
          </div>
        </div>

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
        Source: {SOURCE_LABELS[source]} · FDSNWS event API {liveMode ? "· live" : ""}
      </div>
          </>
        )}
      </div>
    </>
  );
}
