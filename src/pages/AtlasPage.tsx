import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, MapPin, Search, Filter, ArrowLeft, Crosshair,
  Store, UtensilsCrossed, Hotel, Fuel, GraduationCap,
  Stethoscope, ShoppingCart, Coffee, Building2, Navigation,
  Loader2, X, ChevronDown, Layers, Eye, EyeOff, Radius,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Types ── */
interface Business {
  id: number;
  name: string;
  lat: number;
  lng: number;
  type: string;
  amenity: string;
  address: string;
  distance?: number;
}

type BusinessCategory = "all" | "restaurant" | "cafe" | "hotel" | "shop" | "fuel" | "health" | "education" | "supermarket";

const CATEGORIES: { key: BusinessCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "all", label: "All", icon: <Layers className="w-4 h-4" />, color: "text-white" },
  { key: "restaurant", label: "Restaurants", icon: <UtensilsCrossed className="w-4 h-4" />, color: "text-orange-400" },
  { key: "cafe", label: "Cafés", icon: <Coffee className="w-4 h-4" />, color: "text-amber-400" },
  { key: "supermarket", label: "Grocery", icon: <ShoppingCart className="w-4 h-4" />, color: "text-green-400" },
  { key: "shop", label: "Shops", icon: <Store className="w-4 h-4" />, color: "text-emerald-400" },
  { key: "hotel", label: "Hotels", icon: <Hotel className="w-4 h-4" />, color: "text-indigo-400" },
  { key: "fuel", label: "Fuel", icon: <Fuel className="w-4 h-4" />, color: "text-red-400" },
  { key: "health", label: "Health", icon: <Stethoscope className="w-4 h-4" />, color: "text-pink-400" },
  { key: "education", label: "Education", icon: <GraduationCap className="w-4 h-4" />, color: "text-blue-400" },
];

const RADIUS_OPTIONS = [1, 3, 5, 10, 25, 50];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classifyBusiness(tags: Record<string, string>): { type: string; amenity: string } {
  const a = tags.amenity || "";
  const s = tags.shop || "";
  const t = tags.tourism || "";
  if (a === "restaurant" || a === "fast_food") return { type: "Restaurant", amenity: "restaurant" };
  if (a === "cafe") return { type: "Café", amenity: "cafe" };
  if (a === "fuel") return { type: "Fuel Station", amenity: "fuel" };
  if (a === "hospital" || a === "pharmacy" || a === "clinic" || a === "doctors") return { type: "Health", amenity: "health" };
  if (a === "school" || a === "university" || a === "college") return { type: "Education", amenity: "education" };
  if (a === "bank") return { type: "Bank", amenity: "shop" };
  if (s === "supermarket" || s === "convenience" || s === "grocery") return { type: "Supermarket", amenity: "supermarket" };
  if (t === "hotel" || t === "motel" || t === "hostel") return { type: "Hotel", amenity: "hotel" };
  if (s) return { type: "Shop", amenity: "shop" };
  return { type: "Business", amenity: "shop" };
}

function getIcon(amenity: string) {
  switch (amenity) {
    case "restaurant": return <UtensilsCrossed className="w-4 h-4 text-orange-400" />;
    case "cafe": return <Coffee className="w-4 h-4 text-amber-400" />;
    case "hotel": return <Hotel className="w-4 h-4 text-indigo-400" />;
    case "fuel": return <Fuel className="w-4 h-4 text-red-400" />;
    case "health": return <Stethoscope className="w-4 h-4 text-pink-400" />;
    case "education": return <GraduationCap className="w-4 h-4 text-blue-400" />;
    case "supermarket": return <ShoppingCart className="w-4 h-4 text-green-400" />;
    default: return <Store className="w-4 h-4 text-emerald-400" />;
  }
}

export default function AtlasPage() {
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState("Detecting location…");
  const [radiusKm, setRadiusKm] = useState(5);
  const [category, setCategory] = useState<BusinessCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRadiusMenu, setShowRadiusMenu] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCenter(loc);
          try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lng}&format=json`, { headers: { "Accept-Language": "en" } });
            const data = await resp.json();
            setLocationName(data.display_name?.split(",").slice(0, 2).join(",") || "Your Location");
          } catch {
            setLocationName(`${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
          }
        },
        () => {
          // Fallback: NYC
          setCenter({ lat: 40.7128, lng: -74.006 });
          setLocationName("New York City (default)");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setCenter({ lat: 40.7128, lng: -74.006 });
      setLocationName("New York City (default)");
    }
  }, []);

  // Fetch businesses when center, radius, or category changes
  const fetchBusinesses = useCallback(async () => {
    if (!center) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const degRadius = radiusKm / 111;
    const bbox = `${(center.lat - degRadius).toFixed(5)},${(center.lng - degRadius).toFixed(5)},${(center.lat + degRadius).toFixed(5)},${(center.lng + degRadius).toFixed(5)}`;

    let amenityFilter = "";
    switch (category) {
      case "restaurant": amenityFilter = `node["amenity"~"restaurant|fast_food"](${bbox});`; break;
      case "cafe": amenityFilter = `node["amenity"="cafe"](${bbox});`; break;
      case "hotel": amenityFilter = `node["tourism"~"hotel|motel|hostel"](${bbox});`; break;
      case "fuel": amenityFilter = `node["amenity"="fuel"](${bbox});`; break;
      case "health": amenityFilter = `node["amenity"~"hospital|pharmacy|clinic|doctors"](${bbox});`; break;
      case "education": amenityFilter = `node["amenity"~"school|university|college"](${bbox});`; break;
      case "supermarket": amenityFilter = `node["shop"~"supermarket|convenience|grocery"](${bbox});`; break;
      case "shop": amenityFilter = `node["shop"](${bbox});`; break;
      default:
        amenityFilter = `node["shop"](${bbox});node["amenity"~"restaurant|cafe|fast_food|fuel|pharmacy|bank|hospital"](${bbox});node["tourism"~"hotel|motel"](${bbox});`;
    }

    const limit = radiusKm <= 5 ? 100 : radiusKm <= 25 ? 60 : 40;
    const query = `[out:json][timeout:15];(${amenityFilter});out ${limit};`;

    try {
      const resp = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error("API error");
      const data = await resp.json();
      if (!data.elements) { setBusinesses([]); setLoading(false); return; }

      const results: Business[] = data.elements
        .filter((el: any) => el.tags?.name)
        .map((el: any) => {
          const tags = el.tags || {};
          const cls = classifyBusiness(tags);
          const dist = haversine(center.lat, center.lng, el.lat, el.lon);
          const addr = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") ||
            [tags["addr:city"], tags["addr:state"]].filter(Boolean).join(", ") || "";
          return {
            id: el.id,
            name: tags.name,
            lat: el.lat,
            lng: el.lon,
            type: cls.type,
            amenity: cls.amenity,
            address: addr,
            distance: dist,
          };
        })
        .filter((b: Business) => b.distance! <= radiusKm)
        .sort((a: Business, b: Business) => (a.distance || 0) - (b.distance || 0));

      setBusinesses(results);
    } catch (e: any) {
      if (e.name !== "AbortError") setError("Failed to load businesses. Try a smaller radius.");
    }
    setLoading(false);
  }, [center, radiusKm, category]);

  useEffect(() => { fetchBusinesses(); }, [fetchBusinesses]);

  // Filter by search query
  const filtered = searchQuery
    ? businesses.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.type.toLowerCase().includes(searchQuery.toLowerCase()))
    : businesses;

  const navigateToAtlas = (b: Business) => {
    window.location.href = `/atlas?fly=${b.lat},${b.lng}&label=${encodeURIComponent(b.name)}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/atlas" className="p-2 rounded-xl hover:bg-white/5 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white/60" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Atlas Geofencing
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{locationName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Radius selector */}
            <div className="relative">
              <button
                onClick={() => setShowRadiusMenu(!showRadiusMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-xs font-medium hover:bg-white/[0.1] transition-colors"
              >
                <Radius className="w-3.5 h-3.5 text-primary" />
                {radiusKm}km
                <ChevronDown className="w-3 h-3 text-white/40" />
              </button>
              <AnimatePresence>
                {showRadiusMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 top-full mt-1 bg-[#1a1a24] border border-white/[0.1] rounded-xl p-1 min-w-[100px] z-50"
                  >
                    {RADIUS_OPTIONS.map(r => (
                      <button
                        key={r}
                        onClick={() => { setRadiusKm(r); setShowRadiusMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${r === radiusKm ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-white/70"}`}
                      >
                        {r} km
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => { if (center) fetchBusinesses(); }} className="p-2 rounded-xl bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] transition-colors">
              <Crosshair className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Category pills */}
        <div className="max-w-7xl mx-auto px-4 pb-3">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  category === cat.key
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-white/[0.04] text-white/50 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/70"
                }`}
              >
                {cat.icon}
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div className="max-w-7xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter results by name or type…"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-white/30 hover:text-white/60" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Results */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        {/* Stats bar */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-white/40 font-mono">
            {loading ? "Scanning area…" : `${filtered.length} businesses within ${radiusKm}km`}
          </span>
          {!loading && businesses.length > 0 && (
            <Link
              to={`/atlas?lat=${center?.lat}&lng=${center?.lng}`}
              className="text-xs text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
            >
              <Eye className="w-3 h-3" /> View on Globe
            </Link>
          )}
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <span className="text-sm text-white/40">Scanning {radiusKm}km radius…</span>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/30">
            <MapPin className="w-10 h-10" />
            <span className="text-sm">No businesses found. Try increasing the radius or changing category.</span>
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-2">
            {filtered.map(b => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group bg-white/[0.03] border rounded-2xl p-3.5 cursor-pointer transition-all hover:bg-white/[0.06] ${
                  selectedBusiness?.id === b.id ? "border-primary/40 bg-primary/[0.04]" : "border-white/[0.06]"
                }`}
                onClick={() => setSelectedBusiness(selectedBusiness?.id === b.id ? null : b)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                    {getIcon(b.amenity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold truncate">{b.name}</h3>
                      <span className="text-[10px] font-mono text-white/30 flex-shrink-0">
                        {b.distance ? `${b.distance.toFixed(1)}km` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">{b.type}</span>
                      {b.address && <span className="text-[10px] text-white/25 truncate">· {b.address}</span>}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {selectedBusiness?.id === b.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); navigateToAtlas(b); }}
                          className="flex-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20 rounded-xl text-xs"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          Navigate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`, "_blank");
                          }}
                          className="flex-1 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-xs"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          Google Maps
                        </Button>
                      </div>
                      <div className="mt-2 text-[10px] font-mono text-white/20">
                        {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}