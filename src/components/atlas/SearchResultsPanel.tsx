import { Crosshair, Globe, Layers, Loader2, MapPin, Search, X, Star, Building2, Navigation } from "lucide-react";
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

export default function SearchResultsPanel(p: Props) {
  if (!p.open) return null;

  // Group results by source bucket
  const poiGroup: { r: PanelResult; idx: number }[] = [];
  const placeGroup: { r: PanelResult; idx: number }[] = [];
  const bizGroup: { r: PanelResult; idx: number }[] = [];
  p.results.forEach((r, idx) => {
    if (r.source === "poi" || r.type === "Saved POI") poiGroup.push({ r, idx });
    else if (PLACE_TYPES.has(r.type)) placeGroup.push({ r, idx });
    else bizGroup.push({ r, idx });
  });

  const totalCount = p.results.length;

  const Section = ({
    title,
    icon,
    items,
    accent,
    emoji,
  }: {
    title: string;
    icon: React.ReactNode;
    items: { r: PanelResult; idx: number }[];
    accent: string;
    emoji: string;
  }) => (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 px-2 pt-2 pb-1">
        <div className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider ${accent}`}>
          {icon}
          <span>{title}</span>
          <span className="opacity-60">· {items.length}</span>
        </div>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
      {items.length === 0 && p.loading && (
        <div className="px-3 py-2 space-y-1.5">
          {[0,1].map(i => (
            <div key={i} className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      )}
      {items.length === 0 && !p.loading && (
        <p className="px-3 py-1.5 text-[10px] text-white/40">No matches</p>
      )}
      {items.map(({ r, idx }) => (
        <div
          key={`grp-${idx}`}
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
      ))}
    </div>
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed z-40 left-3 top-20 bottom-28 w-[360px] max-w-[92vw] flex flex-col rounded-2xl bg-black/80 backdrop-blur-2xl border border-white/[0.12] shadow-[0_20px_60px_rgba(0,0,0,0.6)] pointer-events-auto"
      style={{
        fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif',
        animation: "panelSlideIn 0.25s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <style>{`@keyframes panelSlideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}`}</style>

      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-white/[0.08]">
        <Search className="w-4 h-4 text-emerald-400 shrink-0" />
        <input
          autoFocus
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          placeholder="Search places, stores, POIs…"
          className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/50 min-w-0"
          onKeyDown={(e) => { if (e.key === "Escape") p.onClose(); }}
        />
        {p.loading && <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />}
        {p.query && (
          <button onClick={() => p.onQueryChange("")} className="shrink-0">
            <X className="w-3.5 h-3.5 text-white/60 hover:text-white" />
          </button>
        )}
        <button onClick={p.onClose} className="shrink-0 ml-1">
          <X className="w-4 h-4 text-white/70 hover:text-white" />
        </button>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.06]">
        <button onClick={p.onUseLocation} title="Use my location"
          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
          <Crosshair className="w-3.5 h-3.5" />
        </button>
        <button onClick={p.onScanCameraArea} title="Scan camera area"
          className="p-1.5 rounded-lg bg-white/[0.05] text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors">
          <Globe className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono text-white/60 ml-auto">
          {totalCount} result{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Category chips */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar px-2 py-2 border-b border-white/[0.04]">
        {p.categories.map((c) => {
          const active = (c.key === "all" && !p.activeCategory) || c.key === p.activeCategory;
          return (
            <button
              key={c.key}
              onClick={() => p.onCategoryChange(c.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border ${active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-black/40 text-white/70 border-white/[0.06] hover:bg-black/60"}`}
            >
              {c.icon}
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Location strip */}
      {p.geoCenter && (
        <div className="px-3 py-1.5 border-b border-white/[0.04] flex items-center gap-2">
          <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] text-white/65 truncate">{p.geoLocationName}</span>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5">
        {totalCount === 0 && !p.loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
            <Search className="w-8 h-8 text-white/15" />
            <p className="text-xs text-white/50">
              {p.query
                ? "No matches yet — try a broader term."
                : "Type to search places, stores, or saved POIs."}
            </p>
          </div>
        )}

        {(totalCount > 0 || p.loading) && (
          <>
            <Section
              title="Saved POIs"
              icon={<Star className="w-3 h-3" />}
              items={poiGroup}
              accent="text-yellow-300/80"
              emoji="⭐"
            />
            <Section
              title="Places & Addresses"
              icon={<Navigation className="w-3 h-3" />}
              items={placeGroup}
              accent="text-sky-300/80"
              emoji="📍"
            />
            <Section
              title="Businesses & Stores"
              icon={<Building2 className="w-3 h-3" />}
              items={bizGroup}
              accent="text-emerald-300/80"
              emoji="🏪"
            />
          </>
        )}
      </div>
    </div>
  );
}