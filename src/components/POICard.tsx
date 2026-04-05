import { Navigation, MapPin, Phone, Globe, Truck, Copy, Check, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export interface POIData {
  id?: string | number;
  name: string;
  emoji?: string;
  category?: string;
  address?: string;
  distance?: number;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  openNow?: boolean;
  rating?: number;
  description?: string;
  brand?: string;
  cuisine?: string;
}

interface POICardProps {
  poi: POIData;
  onNavigate?: (poi: POIData) => void;
  onSelect?: (poi: POIData) => void;
  compact?: boolean;
  variant?: "glass" | "solid";
  index?: number;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

export default function POICard({ poi, onNavigate, onSelect, compact = false, variant = "glass", index = 0 }: POICardProps) {
  const isGlass = variant === "glass";
  const [copied, setCopied] = useState(false);
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try { navigate = useNavigate(); } catch {}

  const copyAddress = () => {
    const text = poi.address || `${poi.lat.toFixed(6)}, ${poi.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (compact) {
    return (
      <button
        onClick={() => (onSelect || onNavigate)?.(poi)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all group min-h-[44px] ${
          isGlass
            ? "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-emerald-500/20"
            : "bg-secondary/20 border border-border/20 hover:bg-primary/10 hover:border-primary/20"
        }`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${
          isGlass ? "bg-white/[0.06]" : "bg-primary/10"
        }`}>
          {poi.emoji || "📍"}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold truncate ${isGlass ? "text-white" : "text-foreground"}`}>{poi.name}</p>
          <p className={`text-[10px] truncate ${isGlass ? "text-white/30" : "text-muted-foreground"}`}>
            {poi.category}{poi.address ? ` · ${poi.address}` : ""}
          </p>
        </div>
        {poi.openNow !== undefined && (
          <span className={`w-2 h-2 rounded-full shrink-0 ${poi.openNow ? "bg-emerald-400 animate-pulse" : "bg-red-400/60"}`} />
        )}
        {poi.distance != null && (
          <span className={`text-[9px] font-mono shrink-0 ${isGlass ? "text-white/20" : "text-muted-foreground"}`}>
            {formatDistance(poi.distance)}
          </span>
        )}
        <Navigation className={`w-3.5 h-3.5 shrink-0 transition-colors ${
          isGlass ? "text-white/10 group-hover:text-emerald-400" : "text-muted-foreground/30 group-hover:text-primary"
        }`} />
      </button>
    );
  }

  // Determine if this is a business POI (for Visit Store button)
  const bizTypes = new Set(["Restaurant","Fast food","Cafe","Café","Hotel","Shop","Store","Supermarket","Convenience","Grocery","Mall","Business"]);
  const isBiz = poi.category && bizTypes.has(poi.category);

  // Full-size glassmorphic detail card
  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all group max-w-sm w-full ${
        isGlass
          ? "bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] hover:border-emerald-500/30 hover:bg-white/[0.07]"
          : "bg-card/60 backdrop-blur-xl border border-border/30 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
      }`}
    >
      {/* Header gradient strip */}
      <div className={`h-1 w-full ${isGlass ? "bg-gradient-to-r from-emerald-500/40 via-cyan-500/30 to-transparent" : "bg-gradient-to-r from-primary/40 via-accent/30 to-transparent"}`} />

      <div className="p-3.5">
        <div className="flex items-start gap-3">
          {/* Large emoji icon */}
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0 ${
            isGlass
              ? "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.08]"
              : "bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10"
          }`}>
            {poi.emoji || "📍"}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className={`text-sm font-bold leading-tight ${isGlass ? "text-white" : "text-foreground"}`}>
                  <span className="line-clamp-2">{poi.name}</span>
                </h4>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {poi.category && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md inline-block ${
                      isGlass ? "bg-white/[0.06] text-white/40" : "bg-secondary/40 text-muted-foreground"
                    }`}>
                      {poi.category}
                    </span>
                  )}
                  {poi.openNow !== undefined && (
                    <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                      poi.openNow
                        ? (isGlass ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-500/10 text-emerald-600")
                        : (isGlass ? "bg-red-500/10 text-red-400/70" : "bg-red-500/10 text-red-500")
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${poi.openNow ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                      {poi.openNow ? "Open" : "Closed"}
                    </span>
                  )}
                </div>
              </div>
              {poi.distance != null && (
                <div className={`text-right shrink-0 ${isGlass ? "text-emerald-400/70" : "text-primary/70"}`}>
                  <p className="text-sm font-mono font-bold">{formatDistance(poi.distance)}</p>
                  <p className={`text-[8px] uppercase tracking-wider ${isGlass ? "text-white/20" : "text-muted-foreground/60"}`}>away</p>
                </div>
              )}
            </div>

            {/* Brand / cuisine / description */}
            {(poi.brand || poi.cuisine || poi.description) && (
              <p className={`text-[10px] mt-1 line-clamp-2 ${isGlass ? "text-white/25" : "text-muted-foreground/70"}`}>
                {poi.brand && poi.brand !== poi.name ? `${poi.brand} · ` : ""}
                {poi.cuisine || poi.description || ""}
              </p>
            )}

            {/* Address with copy */}
            {poi.address && (
              <button onClick={copyAddress}
                className={`text-[11px] mt-1.5 flex items-start gap-1 group/addr max-w-full ${isGlass ? "text-white/30 hover:text-white/50" : "text-muted-foreground hover:text-foreground"} transition-colors`}>
                <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                <span className="truncate text-left">{poi.address}</span>
                {copied
                  ? <Check className="w-3 h-3 shrink-0 text-emerald-400" />
                  : <Copy className="w-3 h-3 shrink-0 opacity-0 group-hover/addr:opacity-100 transition-opacity" />
                }
              </button>
            )}

            {/* Phone + Website row */}
            {(poi.phone || poi.website) && (
              <div className="flex items-center gap-3 mt-1.5 overflow-hidden">
                {poi.phone && (
                  <a href={`tel:${poi.phone}`}
                    className={`flex items-center gap-1 text-[10px] shrink-0 ${isGlass ? "text-cyan-400/60 hover:text-cyan-400" : "text-primary/60 hover:text-primary"} transition-colors`}
                    onClick={e => e.stopPropagation()}>
                    <Phone className="w-3 h-3" />
                    <span className="font-mono">{poi.phone}</span>
                  </a>
                )}
                {poi.website && (
                  <a href={poi.website.startsWith("http") ? poi.website : `https://${poi.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-1 text-[10px] truncate min-w-0 ${isGlass ? "text-cyan-400/60 hover:text-cyan-400" : "text-primary/60 hover:text-primary"} transition-colors`}
                    onClick={e => e.stopPropagation()}>
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="truncate">{poi.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</span>
                  </a>
                )}
              </div>
            )}

            {/* Coords */}
            <div className="flex items-center gap-3 mt-2">
              {poi.rating != null && (
                <span className={`text-[10px] font-mono ${isGlass ? "text-amber-400/70" : "text-amber-500"}`}>
                  {"★".repeat(Math.round(poi.rating))}{" "}{poi.rating.toFixed(1)}
                </span>
              )}
              <span className={`text-[9px] font-mono ${isGlass ? "text-white/15" : "text-muted-foreground/40"}`}>
                {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions — grid layout prevents overflow */}
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {onNavigate && (
            <button
              onClick={() => onNavigate(poi)}
              className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold transition-all truncate px-2 ${
                isGlass
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25"
                  : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
              }`}
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" /> Navigate
            </button>
          )}
          {poi.address && navigate && (
            <button
              onClick={() => navigate!(`/delivery?address=${encodeURIComponent(poi.address || poi.name)}&lat=${poi.lat}&lng=${poi.lng}`)}
              className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold transition-all truncate px-2 ${
                isGlass
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20"
                  : "bg-accent/10 text-accent-foreground border border-accent/20 hover:bg-accent/20"
              }`}
            >
              <Truck className="w-3.5 h-3.5 shrink-0" /> Delivery
            </button>
          )}
          {isBiz && navigate && (
            <button
              onClick={() => navigate!(`/marketplace?store=${encodeURIComponent(poi.name)}&lat=${poi.lat}&lng=${poi.lng}`)}
              className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold transition-all truncate px-2 ${
                isGlass
                  ? "bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20"
                  : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" /> Visit Store
            </button>
          )}
          {onSelect && (
            <button
              onClick={() => onSelect(poi)}
              className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold transition-all truncate px-2 ${
                isGlass
                  ? "bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.1]"
                  : "bg-secondary/30 text-foreground border border-border/20 hover:bg-secondary/50"
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" /> Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
