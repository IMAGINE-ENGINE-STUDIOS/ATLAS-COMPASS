import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cctv, RefreshCw, Loader2, X, MapPin, Radio, Search, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface TrafficCamera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  imageUrl: string;
  source: string;
  streamUrl?: string;
  refreshRate?: number;
  feedVerified?: boolean;
}

export interface CameraBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  getBounds: () => CameraBounds | null;
  onSelectCamera: (camera: TrafficCamera) => void;
  onCamerasLoaded?: (cameras: TrafficCamera[]) => void;
  /** Increment to force a viewport-bounds refetch (e.g. after camera moveEnd). */
  boundsVersion?: number;
}

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-camera-image`;
const VIEWPORT_CAMERA_LIMIT = 120;
const WORLDWIDE_CAMERA_LIMIT = 120;
const THUMBNAIL_PREVIEW_LIMIT = 18;

const DEFAULT_CAMERA_HUBS: CameraBounds[] = [
  { north: 37.90, south: 37.20, east: -121.70, west: -122.65 }, // Bay Area / SF fallback
  { north: 41.00, south: 40.50, east: -73.70, west: -74.30 },   // NYC fallback
  { north: 34.35, south: 33.70, east: -117.70, west: -118.70 }, // LA fallback
  { north: 26.15, south: 25.45, east: -79.90, west: -80.55 },   // Miami fallback
];

// Session cache: keep the last successfully-fetched camera set alive across
// panel closes / remounts so re-opening Intelligence is instant. Mirrors the
// approach used by EarthIntelligenceBar for imagery providers.
interface IntelSessionCache {
  cameras: TrafficCamera[];
  total: number;
  fetchedAt: number;
}
const intelSessionCache: { current: IntelSessionCache | null } = { current: null };

export default function IntelligencePanel({ open, onClose, getBounds, onSelectCamera, onCamerasLoaded, boundsVersion = 0 }: Props) {
  const [cameras, setCameras] = useState<TrafficCamera[]>(() => intelSessionCache.current?.cameras ?? []);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(() => intelSessionCache.current?.total ?? 0);
  const abortRef = useRef<AbortController | null>(null);

  const expandBounds = (b: CameraBounds, minKm = 30): CameraBounds => {
    // Ensure bounds cover at least minKm x minKm (default 30km => 900 km²)
    const centerLat = (b.north + b.south) / 2;
    const centerLng = (b.east + b.west) / 2;
    const halfLat = minKm / 2 / 111;
    const halfLng = minKm / 2 / (111 * Math.max(0.05, Math.cos((centerLat * Math.PI) / 180)));
    const curHalfLat = (b.north - b.south) / 2;
    const curHalfLng = (b.east - b.west) / 2;
    const hLat = Math.max(halfLat, curHalfLat);
    const hLng = Math.max(halfLng, curHalfLng);
    return {
      north: Math.min(90, centerLat + hLat),
      south: Math.max(-90, centerLat - hLat),
      east: Math.min(180, centerLng + hLng),
      west: Math.max(-180, centerLng - hLng),
    };
  };

  const boundsCenter = (b: CameraBounds) => ({
    lat: (b.north + b.south) / 2,
    lng: (b.east + b.west) / 2,
  });

  const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const sortByDistance = (list: TrafficCamera[], b: CameraBounds) => {
    const c = boundsCenter(b);
    return [...list].sort((a, z) => distanceKm(c.lat, c.lng, a.lat, a.lng) - distanceKm(c.lat, c.lng, z.lat, z.lng));
  };

  const invokeCameraPage = async (bounds: CameraBounds, limit: number, cursor: number | undefined, signal: AbortSignal) => {
    const { data, error: fnErr } = await supabase.functions.invoke("traffic-cameras", {
      body: { bounds, cursor, limit },
    });
    if (signal.aborted) return { cameras: [] as TrafficCamera[], total: 0, hasMore: false, nextCursor: undefined as number | undefined };
    if (fnErr) throw fnErr;
    return {
      cameras: (data?.cameras ?? []) as TrafficCamera[],
      total: Number(data?.total ?? 0),
      hasMore: !!data?.hasMore,
      nextCursor: data?.nextCursor as number | undefined,
    };
  };

  const fetchCameras = useCallback(async (worldwide = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const raw = getBounds();
    const bounds: CameraBounds = worldwide
      ? { north: 90, south: -90, east: 180, west: -180 }
      : raw
        ? expandBounds(raw, 30)
        : { north: 90, south: -90, east: 180, west: -180 };

    try {
      let acc: TrafficCamera[] = [];
      let cursor: number | undefined = 0;
      let hasMore = true;
      let safety = 0;
      let lastTotal = 0;
      // Single lightweight page only. The map layer renders these as Cesium
      // entities, so loading hundreds/thousands at once overwhelms tiles + UI.
      const maxPages = 1;
      const pageLimit = worldwide ? WORLDWIDE_CAMERA_LIMIT : VIEWPORT_CAMERA_LIMIT;
      while (hasMore && safety < maxPages && !controller.signal.aborted) {
        const data = await invokeCameraPage(bounds, pageLimit, cursor, controller.signal);
        const page = data.cameras;
        acc.push(...page);
        lastTotal = data.total || acc.length;
        setTotal(lastTotal);
        hasMore = data.hasMore;
        cursor = data.nextCursor;
        safety++;
      }

      if (!worldwide && acc.length === 0 && !controller.signal.aborted) {
        // Relaunch Intelligence with nearby known real camera hubs if the user
        // is over a place with no cached feeds (or the regional cache is cold).
        // This prevents the feature from appearing broken while keeping the
        // map layer capped and fast.
        const origin = boundsCenter(bounds);
        const hubs = [...DEFAULT_CAMERA_HUBS].sort((a, b) => {
          const ca = boundsCenter(a);
          const cb = boundsCenter(b);
          return distanceKm(origin.lat, origin.lng, ca.lat, ca.lng) - distanceKm(origin.lat, origin.lng, cb.lat, cb.lng);
        });
        for (const hub of hubs) {
          const data = await invokeCameraPage(hub, pageLimit, 0, controller.signal);
          if (data.cameras.length > 0) {
            acc = sortByDistance(data.cameras, bounds).slice(0, pageLimit);
            lastTotal = data.total || acc.length;
            setTotal(lastTotal);
            break;
          }
        }
      }

      // Emit ONCE at the end so the Cesium billboard layer is rebuilt a single
      // time instead of after every page.
      if (!controller.signal.aborted) {
        setCameras(acc);
        onCamerasLoaded?.(acc);
        intelSessionCache.current = { cameras: acc, total: lastTotal || acc.length, fetchedAt: Date.now() };
      }
      if (!controller.signal.aborted) {
        if (acc.length === 0) setError("No indexed cameras in this viewport yet. Sync can refresh the live sources.");
        setLoading(false);
      }
    } catch (e: any) {
      if (!controller.signal.aborted) {
        setError(e?.message ?? String(e));
        setLoading(false);
      }
    }
  }, [getBounds]);

  const triggerSync = useCallback(async (worldwide = true) => {
    if (syncing || loading) return;
    setSyncing(true);
    setError(null);
    try {
      await supabase.functions.invoke("sync-cameras", { body: {} });
      await fetchCameras(worldwide);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
    setSyncing(false);
  }, [fetchCameras, loading, syncing]);

  // On open: just load viewport cameras (cheap). Do NOT auto-trigger the
  // upstream sync — that hammers the edge function and then forces a second
  // full reload, freezing Atlas. User can press the Sync button explicitly.
  useEffect(() => {
    if (!open) return;
    fetchCameras(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boundsVersion]);

  const sources = useMemo(() => {
    const m = new Map<string, number>();
    cameras.forEach(c => m.set(c.source, (m.get(c.source) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [cameras]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = cameras.filter(c => {
      if (sourceFilter && c.source !== sourceFilter) return false;
      if (q && !`${c.name} ${c.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) => {
      const score = (cam: TrafficCamera) => {
        if (cam.streamUrl && cam.feedVerified) return 3;
        if (cam.streamUrl) return 2;
        if (cam.feedVerified) return 1;
        return 0;
      };
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });
  }, [cameras, filter, sourceFilter]);

  if (!open) return null;

  return (
    <div className="absolute top-20 right-4 z-30 w-[calc(100vw-2rem)] max-w-[357px]">
      <div className="rounded-xl bg-black/75 backdrop-blur-2xl border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-7rem)]">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-white/[0.06]">
          <div className="w-7 h-7 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <Cctv className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-none">Intelligence</p>
            <p className="text-[10px] text-white/60 mt-0.5">Live traffic cameras · {total.toLocaleString()} indexed</p>
          </div>
          <button onClick={() => fetchCameras(false)} title="Reload viewport cameras"
            className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/[0.06] transition">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/[0.06] transition">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-2.5 py-1.5 border-b border-white/[0.06] flex items-center gap-1.5">
          <div className="flex-1 relative">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search cameras…"
              className="w-full bg-black/40 border border-white/[0.06] rounded-md pl-6 pr-1.5 py-1 text-xs text-white placeholder-white/40 focus:outline-none focus:border-red-500/40"
            />
          </div>
          <button
            onClick={() => triggerSync(false)}
            disabled={syncing}
            title="Sync from upstream DOT/ArcGIS sources"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Globe className="w-2.5 h-2.5" />}
            {syncing ? "Syncing" : "Sync"}
          </button>
        </div>

        {/* Source chips */}
        {sources.length > 0 && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar px-2.5 py-1.5 border-b border-white/[0.06]">
            <button onClick={() => setSourceFilter("")}
              className={`shrink-0 px-1.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition ${
                sourceFilter === ""
                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : "bg-black/40 text-white/60 border border-white/[0.06] hover:text-white"
              }`}>All · {cameras.length}</button>
            {sources.map(([src, n]) => (
              <button key={src} onClick={() => setSourceFilter(src === sourceFilter ? "" : src)}
                className={`shrink-0 px-1.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition ${
                  sourceFilter === src
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : "bg-black/40 text-white/60 border border-white/[0.06] hover:text-white"
                }`}>{src} · {n}</button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1">
          {error && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-md p-1.5">{error}</div>
          )}
          {!error && cameras.length === 0 && !loading && (
            <div className="text-center py-5 text-xs text-white/60">
              No cameras yet. Tap <span className="text-red-300 font-bold">Sync</span> to ingest the live DOT / ArcGIS feeds.
            </div>
          )}
          {loading && cameras.length === 0 && (
            <div className="flex items-center justify-center gap-1.5 py-5 text-xs text-white/70">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" /> Loading cameras…
            </div>
          )}
          {filtered.map((cam, index) => (
            <button
              key={cam.id}
              onClick={() => onSelectCamera(cam)}
              className="w-full text-left flex items-center gap-1.5 p-1.5 rounded-lg bg-black/40 hover:bg-white/[0.06] border border-white/[0.04] hover:border-red-500/20 transition group"
            >
              <div className="w-12 h-9 rounded-md overflow-hidden bg-black/70 border border-white/[0.06] shrink-0 relative">
                {index < THUMBNAIL_PREVIEW_LIMIT ? (
                  <img
                    src={`${PROXY_URL}?url=${encodeURIComponent(cam.imageUrl)}`}
                    alt={cam.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <Cctv className="absolute left-1/2 top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 text-red-300/70" />
                )}
                <span className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{cam.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] uppercase font-mono text-red-300/80">{cam.source}</span>
                  {cam.streamUrl && (
                    <span className="flex items-center gap-0.5 text-[9px] text-emerald-400 font-mono">
                      <Radio className="w-2 h-2" /> LIVE
                    </span>
                  )}
                  <span className="text-[9px] text-white/40 font-mono truncate">
                    {cam.lat.toFixed(3)}, {cam.lng.toFixed(3)}
                  </span>
                </div>
              </div>
              <MapPin className="w-3 h-3 text-white/20 group-hover:text-red-400 transition" />
            </button>
          ))}
          {!loading && filtered.length === 0 && cameras.length > 0 && (
            <div className="text-center py-3 text-[11px] text-white/50">No cameras match the filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}