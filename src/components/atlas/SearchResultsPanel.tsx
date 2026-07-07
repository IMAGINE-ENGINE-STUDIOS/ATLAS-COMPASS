import { Crosshair, Globe, Loader2, MapPin, Search, X, Star, Building2, Navigation } from "lucide-react";
import POICard, { type POIData } from "@/components/POICard";

export interface PanelResult {
  name: string;
  lat: number;
  lng: number;
  type: string;
  address?: string;
  phone?: string;
  website?: string;
  brand?: string;
  cuisine?: string;
  distance?: number;
  description?: string;
  rating?: number;
  ratingCount?: number;
  source?: "osm" | "google" | "poi";
  placeId?: string;
}

export interface CategoryChip {
  key: string;
  label: string;
  icon: React.ReactNode;
  color?: string;
  hex?: string;
}

interface Props {
  open: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  results: PanelResult[];
  loading: boolean;
  hoveredIdx: number | null;
  setHoveredIdx: (idx: number | null) => void;
  activeCategory: string;
  categories: CategoryChip[];
  onCategoryChange: (key: string) => void;
  onUseLocation: () => void;
  onScanCameraArea: () => void;
  geoLocationName: string;
  geoCenter: { lat: number; lng: number } | null;
  onSelect: (r: PanelResult, idx: number) => void;
}

const PLACE_TYPES = new Set([
  "City", "Mountain", "Highway", "Airport", "Port", "Place", "Coordinate",
]);

// Emoji + accent picked per row from its source bucket, so the fused list
// still carries the visual language the three separate sections had.
const iconFor = (r: PanelResult) => {
  if (r.source === "poi" || r.type === "Saved POI") return { emoji: "⭐", accent: "text-yellow-300/85" };
  if (PLACE_TYPES.has(r.type)) return { emoji: "📍", accent: "text-sky-300/85" };
  return { emoji: "🏪", accent: "text-emerald-300/85" };
};

export default function SearchResultsPanel(p: Props) {
  if (!p.open) return null;

  const totalCount = p.results.length;

  // Counts by bucket for the compact legend in the header.
  let savedCount = 0, placeCount = 0, bizCount = 0;
  p.results.forEach((r) => {
    if (r.source === "poi" || r.type === "Saved POI") savedCount++;
    else if (PLACE_TYPES.has(r.type)) placeCount++;
    else bizCount++;
  });

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed z-40 left-2 right-2 sm:left-4 sm:right-4 bottom-[88px] sm:bottom-[96px] max-h-[51vh] flex flex-col rounded-xl bg-black/85 backdrop-blur-2xl border border-white/[0.12] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] pointer-events-auto"
      style={{
        fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif',
        animation: "panelSlideUp 0.28s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <style>{`@keyframes panelSlideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div className="flex items-center gap-1.5 p-2.5 border-b border-white/[0.08]">
        <Search className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <input
          autoFocus
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          placeholder="Search places, stores, POIs…"
          className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/50 min-w-0"
          onKeyDown={(e) => { if (e.key === "Escape") p.onClose(); }}
        />
        {p.loading && <Loader2 className="w-3 h-3 text-emerald-400 animate-spin shrink-0" />}
        {p.query && (
          <button onClick={() => p.onQueryChange("")} className="shrink-0">
            <X className="w-3 h-3 text-white/60 hover:text-white" />
          </button>
        )}
        <button onClick={p.onClose} className="shrink-0 ml-1">
          <X className="w-3.5 h-3.5 text-white/70 hover:text-white" />
        </button>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-white/[0.06]">
        <button onClick={p.onUseLocation} title="Use my location"
          className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
          <Crosshair className="w-3 h-3" />
        </button>
        <button onClick={p.onScanCameraArea} title="Scan camera area"
          className="p-1 rounded-md bg-white/[0.05] text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors">
          <Globe className="w-3 h-3" />
        </button>
        <span className="text-[10px] font-mono text-white/60 ml-auto">
          {totalCount} result{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1 px-1.5 py-1.5 border-b border-white/[0.04]">
        {p.categories.map((c) => {
          const active = (c.key === "all" && !p.activeCategory) || c.key === p.activeCategory;
          const hex = c.hex || "#94a3b8";
          return (
            <button
              key={c.key}
              onClick={() => p.onCategoryChange(c.key)}
              className="flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all backdrop-blur-xl"
              style={active ? {
                background: `${hex}22`,
                border: `1px solid ${hex}66`,
                boxShadow: `0 4px 20px ${hex}33`,
                color: hex,
              } : {
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              <span
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                style={active ? { background: `${hex}33`, color: hex } : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}
              >
                {c.icon}
              </span>
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Location strip + unified legend */}
      <div className="px-2.5 py-1 border-b border-white/[0.04] flex items-center gap-2 flex-wrap">
        {p.geoCenter && (
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-white/65 truncate">{p.geoLocationName}</span>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto text-[10px] font-mono">
          <span className="flex items-center gap-1 text-yellow-300/80"><Star className="w-2.5 h-2.5" />{savedCount}</span>
          <span className="flex items-center gap-1 text-sky-300/80"><Navigation className="w-2.5 h-2.5" />{placeCount}</span>
          <span className="flex items-center gap-1 text-emerald-300/80"><Building2 className="w-2.5 h-2.5" />{bizCount}</span>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0 p-1.5 space-y-1">
        {totalCount === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-3 gap-1.5">
            {p.loading ? (
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
            ) : (
              <>
                <Search className="w-7 h-7 text-white/15" />
                <p className="text-xs text-white/50">
                  {p.query
                    ? "No matches yet — try a broader term."
                    : "Type to search places, stores, or saved POIs."}
                </p>
              </>
            )}
          </div>
        )}

        {/* No skeleton loading rows — the spinner in the header shows
            work-in-progress while results stream in. */}

        {totalCount > 0 && p.results.map((r, idx) => {
          const { emoji } = iconFor(r);
          return (
            <div
              key={`res-${idx}`}
              onMouseEnter={() => p.setHoveredIdx(idx)}
              onMouseLeave={() => p.setHoveredIdx(null)}
            >
              <POICard
                compact
                variant="glass"
                index={idx}
                poi={{
                  id: `res-${idx}`,
                  name: r.name,
                  emoji,
                  category: r.type,
                  address: r.address,
                  lat: r.lat,
                  lng: r.lng,
                  distance: r.distance,
                  phone: r.phone,
                  website: r.website,
                  brand: r.brand,
                  cuisine: r.cuisine,
                  description: r.description,
                  rating: r.rating,
                } as POIData}
                onNavigate={() => p.onSelect(r, idx)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}