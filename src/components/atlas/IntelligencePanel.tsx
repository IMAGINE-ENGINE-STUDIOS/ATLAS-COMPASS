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
}

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-camera-image`;

export default function IntelligencePanel({ open, onClose, getBounds, onSelectCamera }: Props) {
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
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
      const acc: TrafficCamera[] = [];
      let cursor: number | undefined = 0;
      let hasMore = true;
      let safety = 0;
      while (hasMore && safety < 20 && !controller.signal.aborted) {
        const { data, error: fnErr } = await supabase.functions.invoke("traffic-cameras", {
          body: { bounds, cursor, limit: 1000 },
        });
        if (fnErr) throw fnErr;
        const page = (data?.cameras ?? []) as TrafficCamera[];
        acc.push(...page);
        setCameras([...acc]);
        setTotal(data?.total ?? acc.length);
        hasMore = !!data?.hasMore;
        cursor = data?.nextCursor;
        safety++;
      }
      if (!controller.signal.aborted) setLoading(false);
    } catch (e: any) {
      if (!controller.signal.aborted) {
        setError(e?.message ?? String(e));
        setLoading(false);
      }
    }
  }, [getBounds]);

  const triggerSync = useCallback(async (worldwide = true) => {
    setSyncing(true);
    setError(null);
    try {
      await supabase.functions.invoke("sync-cameras", { body: {} });
      await fetchCameras(worldwide);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
    setSyncing(false);
  }, [fetchCameras]);

  // Auto-sync + load viewport cameras when opened
  useEffect(() => {
    if (!open) return;
    (async () => {
      // Show viewport cameras immediately (≥900 km² around camera)
      await fetchCameras(false);
      // Then sync upstream feeds and refresh viewport
      setSyncing(true);
      try {
        await supabase.functions.invoke("sync-cameras", { body: {} });
        await fetchCameras(false);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
      setSyncing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sources = useMemo(() => {
    const m = new Map<string, number>();
    cameras.forEach(c => m.set(c.source, (m.get(c.source) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [cameras]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return cameras.filter(c => {
      if (sourceFilter && c.source !== sourceFilter) return false;
      if (q && !`${c.name} ${c.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cameras, filter, sourceFilter]);

  if (!open) return null;

  return (
    <div className="absolute top-20 right-4 z-30 w-[calc(100vw-2rem)] max-w-[420px]">
      <div className="rounded-2xl bg-black/75 backdrop-blur-2xl border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-7rem)]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <Cctv className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-none">Intelligence</p>
            <p className="text-[10px] text-white/60 mt-0.5">Live traffic cameras · {total.toLocaleString()} indexed</p>
          </div>
          <button onClick={() => fetchCameras(true)} title="Reload"
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] transition">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search cameras…"
              className="w-full bg-black/40 border border-white/[0.06] rounded-lg pl-7 pr-2 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-red-500/40"
            />
          </div>
          <button
            onClick={triggerSync}
            disabled={syncing}
            title="Sync from upstream DOT/ArcGIS sources"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
            {syncing ? "Syncing" : "Sync"}
          </button>
        </div>

        {/* Source chips */}
        {sources.length > 0 && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar px-3 py-2 border-b border-white/[0.06]">
            <button onClick={() => setSourceFilter("")}
              className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition ${
                sourceFilter === ""
                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : "bg-black/40 text-white/60 border border-white/[0.06] hover:text-white"
              }`}>All · {cameras.length}</button>
            {sources.map(([src, n]) => (
              <button key={src} onClick={() => setSourceFilter(src === sourceFilter ? "" : src)}
                className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition ${
                  sourceFilter === src
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : "bg-black/40 text-white/60 border border-white/[0.06] hover:text-white"
                }`}>{src} · {n}</button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {error && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{error}</div>
          )}
          {!error && cameras.length === 0 && !loading && (
            <div className="text-center py-6 text-xs text-white/60">
              No cameras yet. Tap <span className="text-red-300 font-bold">Sync</span> to ingest the live DOT / ArcGIS feeds.
            </div>
          )}
          {loading && cameras.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-white/70">
              <Loader2 className="w-4 h-4 animate-spin text-red-400" /> Loading cameras…
            </div>
          )}
          {filtered.map(cam => (
            <button
              key={cam.id}
              onClick={() => onSelectCamera(cam)}
              className="w-full text-left flex items-center gap-2 p-2 rounded-xl bg-black/40 hover:bg-white/[0.06] border border-white/[0.04] hover:border-red-500/20 transition group"
            >
              <div className="w-14 h-10 rounded-lg overflow-hidden bg-black/70 border border-white/[0.06] shrink-0 relative">
                <img
                  src={`${PROXY_URL}?url=${encodeURIComponent(cam.imageUrl)}`}
                  alt={cam.name}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
                <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{cam.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] uppercase font-mono text-red-300/80">{cam.source}</span>
                  {cam.streamUrl && (
                    <span className="flex items-center gap-0.5 text-[9px] text-emerald-400 font-mono">
                      <Radio className="w-2.5 h-2.5" /> LIVE
                    </span>
                  )}
                  <span className="text-[9px] text-white/40 font-mono truncate">
                    {cam.lat.toFixed(3)}, {cam.lng.toFixed(3)}
                  </span>
                </div>
              </div>
              <MapPin className="w-3.5 h-3.5 text-white/20 group-hover:text-red-400 transition" />
            </button>
          ))}
          {!loading && filtered.length === 0 && cameras.length > 0 && (
            <div className="text-center py-4 text-[11px] text-white/50">No cameras match the filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}