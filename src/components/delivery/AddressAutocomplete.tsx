import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Globe, Loader2, Search, Store, Navigation } from "lucide-react";

interface Suggestion {
  label: string;
  address: string;
  lat: number;
  lng: number;
  type: "address" | "business";
  emoji?: string;
  distance?: number;
}

interface Props {
  value: string;
  onChange: (address: string, coords?: { lat: number; lng: number }) => void;
  placeholder?: string;
  icon?: "pickup" | "dropoff";
  compact?: boolean;
}

const CATEGORY_EMOJI: Record<string, string> = {
  restaurant: "🍽️", cafe: "☕", fast_food: "🍔", bar: "🍺",
  supermarket: "🛒", convenience: "🏪", pharmacy: "💊",
  fuel: "⛽", bank: "🏦", hospital: "🏥", school: "🏫",
  hotel: "🏨", cinema: "🎬", gym: "💪", parking: "🅿️",
  default_shop: "🛍️", default_amenity: "📍",
};

function getEmoji(tags: Record<string, string>): string {
  const amenity = tags?.amenity || "";
  const shop = tags?.shop || "";
  if (CATEGORY_EMOJI[amenity]) return CATEGORY_EMOJI[amenity];
  if (CATEGORY_EMOJI[shop]) return CATEGORY_EMOJI[shop];
  if (shop) return CATEGORY_EMOJI.default_shop;
  if (amenity) return CATEGORY_EMOJI.default_amenity;
  return "📍";
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let cachedLocation: { lat: number; lng: number } | null = null;

function getUserLocation(): Promise<{ lat: number; lng: number } | null> {
  if (cachedLocation) return Promise.resolve(cachedLocation);
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cachedLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        resolve(cachedLocation);
      },
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000 }
    );
  });
}

export default function AddressAutocomplete({ value, onChange, placeholder = "Enter address or business name", icon = "dropoff", compact = false }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) { setSuggestions([]); return; }
    setLoading(true);
    const userLoc = await getUserLocation();
    const results: Suggestion[] = [];

    try {
      // Nominatim
      const params = new URLSearchParams({ q, format: "json", addressdetails: "1", limit: "5" });
      if (userLoc) { params.set("viewbox", `${userLoc.lng - 0.5},${userLoc.lat + 0.5},${userLoc.lng + 0.5},${userLoc.lat - 0.5}`); params.set("bounded", "0"); }
      const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "Accept-Language": "en" } });
      const nomData = await nomRes.json();
      for (const r of nomData) {
        const dist = userLoc ? haversineKm(userLoc.lat, userLoc.lng, +r.lat, +r.lon) : undefined;
        results.push({ label: r.display_name?.split(",")[0] || q, address: r.display_name || "", lat: +r.lat, lng: +r.lon, type: "address", distance: dist });
      }
    } catch {}

    try {
      // Overpass for businesses
      const center = userLoc || { lat: 25.76, lng: -80.19 };
      const degR = 50 / 111;
      const bbox = `${(center.lat - degR).toFixed(4)},${(center.lng - degR).toFixed(4)},${(center.lat + degR).toFixed(4)},${(center.lng + degR).toFixed(4)}`;
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const overpassQ = `[out:json][timeout:8];(node["name"~"${escapedQ}",i]["shop"](${bbox});node["name"~"${escapedQ}",i]["amenity"](${bbox}););out 10;`;
      const ovRes = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: `data=${encodeURIComponent(overpassQ)}` });
      const ovData = await ovRes.json();
      for (const el of ovData.elements || []) {
        const name = el.tags?.name || "";
        const addr = [el.tags?.["addr:housenumber"], el.tags?.["addr:street"], el.tags?.["addr:city"], el.tags?.["addr:state"]].filter(Boolean).join(", ");
        const dist = userLoc ? haversineKm(userLoc.lat, userLoc.lng, el.lat, el.lon) : undefined;
        results.push({ label: name, address: addr || `${el.lat.toFixed(5)}, ${el.lon.toFixed(5)}`, lat: el.lat, lng: el.lon, type: "business", emoji: getEmoji(el.tags || {}), distance: dist });
      }
    } catch {}

    // Sort: businesses with distance first, then addresses
    results.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      return 1;
    });

    setSuggestions(results.slice(0, 12));
    setOpen(results.length > 0);
    setLoading(false);
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const selectSuggestion = (s: Suggestion) => {
    const display = s.type === "business" && s.address ? `${s.label}, ${s.address}` : s.address || s.label;
    setQuery(display);
    onChange(display, { lat: s.lat, lng: s.lng });
    setOpen(false);
  };

  const inputCls = `w-full bg-secondary/30 border border-border/30 rounded-xl ${compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm"} text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary`;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {icon === "pickup" ? (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-success" />
        ) : (
          <Navigation className={`absolute left-3 top-1/2 -translate-y-1/2 ${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-primary`} />
        )}
        <input
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className={`${inputCls} pl-8 pr-8`}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
        ) : (
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-border/40 bg-card shadow-xl backdrop-blur-xl">
          {/* Businesses first */}
          {suggestions.some(s => s.type === "business") && (
            <div className="px-3 pt-2 pb-1">
              <p className="text-[9px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                <Store className="w-3 h-3" /> Businesses & Stores
              </p>
            </div>
          )}
          {suggestions.filter(s => s.type === "business").map((s, i) => (
            <button key={`b-${i}`} onClick={() => selectSuggestion(s)}
              className="w-full text-left px-3 py-2.5 hover:bg-primary/10 flex items-start gap-2 transition-colors min-h-[44px]">
              <span className="text-base mt-0.5">{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{s.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{s.address}</p>
              </div>
              {s.distance != null && (
                <span className="text-[9px] text-muted-foreground whitespace-nowrap mt-1">{s.distance < 1 ? `${(s.distance * 1000).toFixed(0)}m` : `${s.distance.toFixed(1)}km`}</span>
              )}
            </button>
          ))}

          {/* Addresses */}
          {suggestions.some(s => s.type === "address") && (
            <div className="px-3 pt-2 pb-1 border-t border-border/20">
              <p className="text-[9px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Addresses
              </p>
            </div>
          )}
          {suggestions.filter(s => s.type === "address").map((s, i) => (
            <button key={`a-${i}`} onClick={() => selectSuggestion(s)}
              className="w-full text-left px-3 py-2.5 hover:bg-primary/10 flex items-start gap-2 transition-colors min-h-[44px]">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{s.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{s.address}</p>
              </div>
              {s.distance != null && (
                <span className="text-[9px] text-muted-foreground whitespace-nowrap mt-1">{s.distance < 1 ? `${(s.distance * 1000).toFixed(0)}m` : `${s.distance.toFixed(1)}km`}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
