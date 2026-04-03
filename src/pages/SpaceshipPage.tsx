import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Search, MapPin, Mountain, Building2, Navigation,
  Maximize2, Minimize2, Globe, Crosshair, X, ChevronRight,
  Eye, Satellite, Trash2, Check, Plane, Anchor, SquareIcon,
  FileText, Edit3, Save, Plus, Paintbrush, Upload, RotateCcw,
  Move, Scale, Box, AlertCircle, Loader2, Route, Clock, Ruler,
  Play, Square as StopIcon, Store, UtensilsCrossed, Hotel, Fuel,
  GraduationCap, Stethoscope, ShoppingCart, Coffee, Ship
} from "lucide-react";
import {
  ACCEPT_STRING, convertToGltfBlobUrl, getFormatCategory, getFormatLabel
} from "@/lib/model-converter";
import { ALL_CARGO_ROUTES, MARITIME_VESSEL_COUNT, AIR_VESSEL_COUNT, CARGO_CATEGORIES, interpolatePosition, type CargoRoute, type Vessel, type CargoCategory } from "@/lib/cargo-routes";
import {
  Viewer, Ion, Cartesian3, Math as CesiumMath,
  createWorldTerrainAsync, createOsmBuildingsAsync,
  Cartographic, Color, ScreenSpaceEventHandler, ScreenSpaceEventType,
  defined,
  HeadingPitchRoll, Transforms,
  Cartesian2, Cesium3DTileset,
  PolylineGlowMaterialProperty,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

/* ── Cesium Token (publishable key) ── */
const CESIUM_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiODhlOTUyMy1kNmE2LTQ3MWUtYTkyNS0zN2QwYzM5YWIwNjciLCJpZCI6MzU0Mjc2LCJpYXQiOjE3NjE1MzQ0OTh9.BvVrQHG_6Ln5TryWETCkQISdSTH8PTSBuZboxLgM45o";

/* ── Types ── */
interface SearchResult {
  name: string;
  lat: number;
  lng: number;
  type: string;
}

interface CursorInfo {
  lat: number;
  lng: number;
  alt: number;
}

interface POI {
  id: string;
  name: string;
  description: string;
  notes: string;
  lat: number;
  lng: number;
  alt: number;
  createdAt: number;
}

interface PlacedModel {
  id: string;
  name: string;
  fileName: string;
  lat: number;
  lng: number;
  alt: number;
  heading: number;
  scale: number;
  createdAt: number;
}

const POI_STORAGE_KEY = "nexus-spaceship-pois";
const MODELS_STORAGE_KEY = "nexus-spaceship-models";

function loadPOIs(): POI[] {
  try {
    const stored = localStorage.getItem(POI_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored).map((p: any) => ({
      ...p,
      description: p.description || "",
      notes: p.notes || "",
    }));
  } catch { return []; }
}

function savePOIs(pois: POI[]) {
  localStorage.setItem(POI_STORAGE_KEY, JSON.stringify(pois));
}

function loadPlacedModels(): PlacedModel[] {
  try {
    const stored = localStorage.getItem(MODELS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function savePlacedModels(models: PlacedModel[]) {
  localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(models));
}

/* ── Preset Locations ── */
const PRESETS: SearchResult[] = [
  { name: "New York City", lat: 40.7128, lng: -74.006, type: "City" },
  { name: "London", lat: 51.5074, lng: -0.1278, type: "City" },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, type: "City" },
  { name: "Dubai", lat: 25.2048, lng: 55.2708, type: "City" },
  { name: "Singapore", lat: 1.3521, lng: 103.8198, type: "City" },
  { name: "Sydney", lat: -33.8688, lng: 151.2093, type: "City" },
  { name: "São Paulo", lat: -23.5505, lng: -46.6333, type: "City" },
  { name: "Paris", lat: 48.8566, lng: 2.3522, type: "City" },
  { name: "Berlin", lat: 52.52, lng: 13.405, type: "City" },
  { name: "Beijing", lat: 39.9042, lng: 116.4074, type: "City" },
  { name: "Mumbai", lat: 19.076, lng: 72.8777, type: "City" },
  { name: "Moscow", lat: 55.7558, lng: 37.6173, type: "City" },
  { name: "Istanbul", lat: 41.0082, lng: 28.9784, type: "City" },
  { name: "Cairo", lat: 30.0444, lng: 31.2357, type: "City" },
  { name: "Lagos", lat: 6.5244, lng: 3.3792, type: "City" },
  { name: "Mexico City", lat: 19.4326, lng: -99.1332, type: "City" },
  { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, type: "City" },
  { name: "Toronto", lat: 43.6532, lng: -79.3832, type: "City" },
  { name: "Los Angeles", lat: 34.0522, lng: -118.2437, type: "City" },
  { name: "Chicago", lat: 41.8781, lng: -87.6298, type: "City" },
  { name: "Hong Kong", lat: 22.3193, lng: 114.1694, type: "City" },
  { name: "Seoul", lat: 37.5665, lng: 126.978, type: "City" },
  { name: "Bangkok", lat: 13.7563, lng: 100.5018, type: "City" },
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473, type: "City" },
  { name: "Rome", lat: 41.9028, lng: 12.4964, type: "City" },
  { name: "Madrid", lat: 40.4168, lng: -3.7038, type: "City" },
  { name: "Mount Everest", lat: 27.9881, lng: 86.925, type: "Mountain" },
  { name: "Grand Canyon", lat: 36.1069, lng: -112.1129, type: "Landmark" },
  { name: "Mount Fuji", lat: 35.3606, lng: 138.7274, type: "Mountain" },
  { name: "Kilimanjaro", lat: -3.0674, lng: 37.3556, type: "Mountain" },
  { name: "JFK International Airport", lat: 40.6413, lng: -73.7781, type: "Airport" },
  { name: "London Heathrow Airport", lat: 51.47, lng: -0.4543, type: "Airport" },
  { name: "Dubai International Airport", lat: 25.2532, lng: 55.3657, type: "Airport" },
  { name: "Tokyo Haneda Airport", lat: 35.5494, lng: 139.7798, type: "Airport" },
  { name: "Singapore Changi Airport", lat: 1.3644, lng: 103.9915, type: "Airport" },
  { name: "Paris Charles de Gaulle", lat: 49.0097, lng: 2.5479, type: "Airport" },
  { name: "Port of Shanghai", lat: 31.3603, lng: 121.588, type: "Port" },
  { name: "Port of Singapore", lat: 1.2655, lng: 103.824, type: "Port" },
  { name: "Port of Rotterdam", lat: 51.9225, lng: 4.4792, type: "Port" },
  { name: "Port of Los Angeles", lat: 33.7361, lng: -118.264, type: "Port" },
  { name: "Panama Canal", lat: 9.08, lng: -79.68, type: "Port" },
  { name: "Suez Canal", lat: 30.4571, lng: 32.3498, type: "Port" },
  { name: "Times Square, NYC", lat: 40.758, lng: -73.9855, type: "Plaza" },
  { name: "Red Square, Moscow", lat: 55.7539, lng: 37.6208, type: "Plaza" },
  { name: "Trafalgar Square, London", lat: 51.508, lng: -0.1281, type: "Plaza" },
  { name: "Shibuya Crossing, Tokyo", lat: 35.6595, lng: 139.7004, type: "Plaza" },
  { name: "Route 66 Start (Chicago)", lat: 41.8803, lng: -87.6242, type: "Highway" },
  { name: "Pan-American Hwy (Panama)", lat: 8.9824, lng: -79.5199, type: "Highway" },
];

/* ── HUD Panel Glass ── */
function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-black/40 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_16px_40px_rgba(0,0,0,0.5)] ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent rounded-2xl pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function getTypeIcon(type: string) {
  switch (type) {
    case "Mountain": return <Mountain className="w-4 h-4 text-green-400" />;
    case "Port": return <Anchor className="w-4 h-4 text-blue-400" />;
    case "Airport": return <Plane className="w-4 h-4 text-cyan-400" />;
    case "Plaza": return <SquareIcon className="w-4 h-4 text-purple-400" />;
    case "Highway": return <Navigation className="w-4 h-4 text-orange-400" />;
    case "Landmark": return <Eye className="w-4 h-4 text-pink-400" />;
    case "Coordinate": return <Crosshair className="w-4 h-4 text-yellow-400" />;
    case "Restaurant": return <UtensilsCrossed className="w-4 h-4 text-orange-400" />;
    case "Hotel": return <Hotel className="w-4 h-4 text-indigo-400" />;
    case "Shop": case "Store": return <Store className="w-4 h-4 text-emerald-400" />;
    case "Fuel": return <Fuel className="w-4 h-4 text-red-400" />;
    case "Education": return <GraduationCap className="w-4 h-4 text-blue-400" />;
    case "Health": return <Stethoscope className="w-4 h-4 text-red-400" />;
    case "Supermarket": return <ShoppingCart className="w-4 h-4 text-green-400" />;
    case "Cafe": return <Coffee className="w-4 h-4 text-amber-400" />;
    case "Business": return <Building2 className="w-4 h-4 text-sky-400" />;
    case "City": return <Building2 className="w-4 h-4 text-primary" />;
    default: return <MapPin className="w-4 h-4 text-primary" />;
  }
}

/* ── Main Spaceship Component ── */
export default function SpaceshipPage() {
  const cesiumContainer = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cursorInfo, setCursorInfo] = useState<CursorInfo | null>(null);
  const [showBuildings, setShowBuildings] = useState(true);
  const [viewMode, setViewMode] = useState<"realistic" | "osm">("realistic");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [cameraAlt, setCameraAlt] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pois, setPois] = useState<POI[]>(loadPOIs);
  const [namingPOI, setNamingPOI] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const [poiName, setPoiName] = useState("");
  const [poiDescription, setPoiDescription] = useState("");
  const [poisPanelOpen, setPoisPanelOpen] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editNotesValue, setEditNotesValue] = useState("");

  // Tile Brush state
  const [brushMode, setBrushMode] = useState(false);
  const [brushPanelOpen, setBrushPanelOpen] = useState(false);
  const [placedModels, setPlacedModels] = useState<PlacedModel[]>(loadPlacedModels);
  const [pendingPlacement, setPendingPlacement] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [convertingModel, setConvertingModel] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertProgress, setConvertProgress] = useState<string>("");
  const [modelScale, setModelScale] = useState(1);
  const [modelHeading, setModelHeading] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelUrlsRef = useRef<Map<string, string>>(new Map());
  const brushIndicatorRef = useRef<any>(null);
  const pendingPlacementRef = useRef<{ lat: number; lng: number; alt: number } | null>(null);
  const [draggingModelId, setDraggingModelId] = useState<string | null>(null); // used for UI indicator
  const draggingRef = useRef<string | null>(null);

  // Directions / Routing state
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originResults, setOriginResults] = useState<SearchResult[]>([]);
  const [destResults, setDestResults] = useState<SearchResult[]>([]);
  const [originPoint, setOriginPoint] = useState<SearchResult | null>(null);
  const [destPoint, setDestPoint] = useState<SearchResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showOriginResults, setShowOriginResults] = useState(false);
  const [showDestResults, setShowDestResults] = useState(false);
  const routeEntityRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);

  // Journey / navigation state
  const [journeyActive, setJourneyActive] = useState(false);
  const [journeyProgress, setJourneyProgress] = useState(0);
  const routeCoordsRef = useRef<[number, number][]>([]);
  const journeyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Global search with Nominatim + Overpass
  const [nominatimResults, setNominatimResults] = useState<SearchResult[]>([]);
  const [overpassResults, setOverpassResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargo routes state
  const [showCargoRoutes, setShowCargoRoutes] = useState(false);
  const [cargoFilter, setCargoFilter] = useState<"all" | "maritime" | "air">("all");
  const [cargoTypeFilter, setCargoTypeFilter] = useState<CargoCategory | "all">("all");
  const [selectedRoute, setSelectedRoute] = useState<CargoRoute | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<(Vessel & { routeName: string; routeColor: string; lat: number; lng: number }) | null>(null);
  const cargoEntitiesRef = useRef<any[]>([]);
  const vesselAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vesselProgressRef = useRef<Map<string, number>>(new Map());

  // Business/Store icons toggle
  const [showBusinessIcons, setShowBusinessIcons] = useState(false);
  const businessEntitiesRef = useRef<any[]>([]);
  const businessLoadedAreaRef = useRef<string>("");

  // Real-time aircraft & ship tracking
  const [showLiveTraffic, setShowLiveTraffic] = useState(false);
  const [liveTrafficStats, setLiveTrafficStats] = useState({ planes: 0, ships: 0 });
  const liveTrafficEntitiesRef = useRef<any[]>([]);
  const liveTrafficTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aisWebSocketRef = useRef<WebSocket | null>(null);
  const liveShipsRef = useRef<Map<string, { lat: number; lng: number; speed: number; heading: number; name: string; type: number; country: string; mmsi: string; lastUpdate: number }>>(new Map());

  // Keep ref in sync with state for use inside Cesium handlers
  useEffect(() => { pendingPlacementRef.current = pendingPlacement; }, [pendingPlacement]);

  /* ── Classify OSM result into business type ── */
  const classifyOsmResult = useCallback((r: any): string => {
    const t = r.type || "";
    const c = r.class || "";
    const name = (r.display_name || r.name || "").toLowerCase();
    if (t === "aerodrome" || t === "airport") return "Airport";
    if (c === "natural" && (t === "peak" || t === "volcano")) return "Mountain";
    if (t === "port" || t === "harbour" || t === "marina") return "Port";
    if (t === "city" || t === "town" || t === "village" || t === "hamlet") return "City";
    if (c === "highway") return "Highway";
    if (t === "restaurant" || t === "fast_food" || t === "food_court") return "Restaurant";
    if (t === "cafe" || t === "coffee") return "Cafe";
    if (t === "hotel" || t === "motel" || t === "hostel" || t === "guest_house") return "Hotel";
    if (t === "supermarket" || t === "convenience" || t === "grocery") return "Supermarket";
    if (t === "fuel" || t === "charging_station") return "Fuel";
    if (t === "school" || t === "university" || t === "college" || t === "kindergarten") return "Education";
    if (t === "hospital" || t === "clinic" || t === "doctors" || t === "pharmacy" || t === "dentist") return "Health";
    if (c === "shop" || t === "mall" || t === "department_store" || t === "clothes" || t === "electronics") return "Shop";
    if (c === "amenity" || c === "office" || c === "tourism" || c === "leisure") return "Business";
    if (name.includes("walmart") || name.includes("target") || name.includes("costco") || name.includes("ikea") || name.includes("publix") || name.includes("kroger") || name.includes("walgreens") || name.includes("cvs") || name.includes("home depot") || name.includes("lowe")) return "Supermarket";
    if (name.includes("mcdonald") || name.includes("burger") || name.includes("pizza") || name.includes("kfc") || name.includes("wendy") || name.includes("taco bell") || name.includes("chick-fil") || name.includes("subway") || name.includes("chipotle")) return "Restaurant";
    if (name.includes("starbucks") || name.includes("dunkin") || name.includes("tim horton") || name.includes("peet")) return "Cafe";
    if (name.includes("hilton") || name.includes("marriott") || name.includes("hyatt") || name.includes("holiday inn") || name.includes("best western")) return "Hotel";
    if (name.includes("hospital") || name.includes("clinic")) return "Health";
    if (name.includes("university") || name.includes("school") || name.includes("college")) return "Education";
    return "Place";
  }, []);

  /* ── Nominatim Geocoding Search ── */
  const searchNominatim = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!query.trim() || query.trim().length < 2) return [];
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1&extratags=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await resp.json();
      return data.map((r: any) => ({
        name: r.display_name.split(",").slice(0, 3).join(","),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        type: classifyOsmResult(r),
      }));
    } catch { return []; }
  }, [classifyOsmResult]);

  /* ── Overpass API for nearby businesses/POIs ── */
  const searchOverpassBusinesses = useCallback(async (query: string): Promise<SearchResult[]> => {
    try {
      // Use Overpass to search for named businesses globally
      const overpassQuery = `
[out:json][timeout:8];
(
  node["name"~"${query.replace(/"/g, '')}"i]["shop"];
  node["name"~"${query.replace(/"/g, '')}"i]["amenity"];
  node["name"~"${query.replace(/"/g, '')}"i]["tourism"];
  node["name"~"${query.replace(/"/g, '')}"i]["office"];
  node["name"~"${query.replace(/"/g, '')}"i]["leisure"];
  node["name"~"${query.replace(/"/g, '')}"i]["brand"];
);
out center 15;`;
      const resp = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const data = await resp.json();
      if (!data.elements) return [];
      return data.elements.slice(0, 10).map((el: any) => {
        const tags = el.tags || {};
        const elLat = el.lat || el.center?.lat;
        const elLng = el.lon || el.center?.lon;
        let type = "Business";
        if (tags.amenity === "restaurant" || tags.amenity === "fast_food") type = "Restaurant";
        else if (tags.amenity === "cafe") type = "Cafe";
        else if (tags.tourism === "hotel" || tags.tourism === "motel") type = "Hotel";
        else if (tags.shop === "supermarket" || tags.shop === "convenience") type = "Supermarket";
        else if (tags.shop) type = "Shop";
        else if (tags.amenity === "fuel") type = "Fuel";
        else if (tags.amenity === "hospital" || tags.amenity === "pharmacy") type = "Health";
        else if (tags.amenity === "school" || tags.amenity === "university") type = "Education";
        const addr = [tags["addr:street"], tags["addr:city"], tags["addr:country"]].filter(Boolean).join(", ");
        return {
          name: tags.name + (addr ? ` — ${addr}` : ""),
          lat: elLat,
          lng: elLng,
          type,
        };
      }).filter((r: SearchResult) => r.lat && r.lng);
    } catch { return []; }
  }, []);

  /* ── OSRM Routing ── */
  const fetchRoute = useCallback(async (origin: SearchResult, dest: SearchResult) => {
    setRouteLoading(true);
    setRouteError(null);
    try {
      const resp = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=false`
      );
      const data = await resp.json();
      if (data.code !== "Ok" || !data.routes?.length) {
        setRouteError("No route found between these locations");
        setRouteLoading(false);
        return;
      }
      const route = data.routes[0];
      setRouteInfo({ distance: route.distance, duration: route.duration });

      const coords: [number, number][] = route.geometry.coordinates;
      routeCoordsRef.current = coords;
      // Simplify: sample every N points for very long routes to keep rendering fast
      const step = coords.length > 2000 ? Math.floor(coords.length / 1000) : 1;
      const sampled = step > 1 ? coords.filter((_, i) => i % step === 0 || i === coords.length - 1) : coords;
      const positions = sampled.map((c) => Cartesian3.fromDegrees(c[0], c[1], 50));
      const viewer = viewerRef.current;
      if (!viewer) return;

      if (routeEntityRef.current) viewer.entities.remove(routeEntityRef.current);
      if (originMarkerRef.current) viewer.entities.remove(originMarkerRef.current);
      if (destMarkerRef.current) viewer.entities.remove(destMarkerRef.current);

      routeEntityRef.current = viewer.entities.add({
        polyline: { positions, width: 5, material: Color.fromCssColorString("#00d4ff").withAlpha(0.9), clampToGround: true },
      });
      originMarkerRef.current = viewer.entities.add({
        position: Cartesian3.fromDegrees(origin.lng, origin.lat),
        point: { pixelSize: 14, color: Color.fromCssColorString("#22c55e"), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `🟢 ${origin.name.split(",")[0]}`, font: "12px Inter", fillColor: Color.fromCssColorString("#22c55e"), outlineColor: Color.BLACK, outlineWidth: 2, style: 2, pixelOffset: new Cartesian2(0, -24), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      destMarkerRef.current = viewer.entities.add({
        position: Cartesian3.fromDegrees(dest.lng, dest.lat),
        point: { pixelSize: 14, color: Color.fromCssColorString("#ef4444"), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `🔴 ${dest.name.split(",")[0]}`, font: "12px Inter", fillColor: Color.fromCssColorString("#ef4444"), outlineColor: Color.BLACK, outlineWidth: 2, style: 2, pixelOffset: new Cartesian2(0, -24), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      viewer.flyTo(routeEntityRef.current, { duration: 1.5 });
    } catch {
      setRouteError("Failed to fetch route. Try again.");
    } finally {
      setRouteLoading(false);
    }
  }, []);

  /* ── Journey Navigation ── */
  const stopJourney = useCallback(() => {
    if (journeyTimerRef.current) {
      clearInterval(journeyTimerRef.current);
      journeyTimerRef.current = null;
    }
    setJourneyActive(false);
    setJourneyProgress(0);
  }, []);

  const startJourney = useCallback(() => {
    const coords = routeCoordsRef.current;
    if (coords.length < 2 || !viewerRef.current) return;

    setJourneyActive(true);
    setJourneyProgress(0);
    let idx = 0;

    const viewer = viewerRef.current;
    
    const moveCamera = (i: number) => {
      if (i >= coords.length - 1) {
        stopJourney();
        return;
      }
      const [lng, lat] = coords[i];
      const nextIdx = Math.min(i + Math.max(1, Math.floor(coords.length / 200)), coords.length - 1);
      const [nLng, nLat] = coords[nextIdx];
      
      const dLng = nLng - lng;
      const dLat = nLat - lat;
      const heading = Math.atan2(dLng, dLat) * (180 / Math.PI);

      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(lng, lat, 150),
        orientation: {
          heading: CesiumMath.toRadians(heading),
          pitch: CesiumMath.toRadians(-15),
          roll: 0,
        },
      });
      setJourneyProgress(Math.round((i / (coords.length - 1)) * 100));
    };

    moveCamera(0);

    const speed = Math.max(1, Math.floor(coords.length / 300));
    journeyTimerRef.current = setInterval(() => {
      idx += speed;
      if (idx >= coords.length - 1) {
        idx = coords.length - 1;
        moveCamera(idx);
        stopJourney();
      } else {
        moveCamera(idx);
      }
    }, 100);
  }, [stopJourney]);

  const clearRoute = useCallback(() => {
    stopJourney();
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (routeEntityRef.current) { viewer.entities.remove(routeEntityRef.current); routeEntityRef.current = null; }
    if (originMarkerRef.current) { viewer.entities.remove(originMarkerRef.current); originMarkerRef.current = null; }
    if (destMarkerRef.current) { viewer.entities.remove(destMarkerRef.current); destMarkerRef.current = null; }
    setOriginPoint(null); setDestPoint(null); setOriginQuery(""); setDestQuery("");
    setRouteInfo(null); setRouteError(null); setOriginResults([]); setDestResults([]);
    routeCoordsRef.current = [];
  }, [stopJourney]);

  /* ── Initialize Cesium ── */
  useEffect(() => {
    if (!cesiumContainer.current) return;

    Ion.defaultAccessToken = CESIUM_TOKEN;

    const viewer = new Viewer(cesiumContainer.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      vrButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      creditContainer: document.createElement("div"),
      skyAtmosphere: undefined,
      orderIndependentTranslucency: false,
    });

    viewerRef.current = viewer;

    // Dark space background
    viewer.scene.backgroundColor = Color.fromCssColorString("#0a0a1a");
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.atmosphereLightIntensity = 10;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0a1628");
    viewer.scene.globe.maximumScreenSpaceError = 2;
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // Add world terrain
    createWorldTerrainAsync({
      requestWaterMask: false,
      requestVertexNormals: true,
    }).then((terrain) => {
      if (!viewer.isDestroyed()) {
        viewer.terrainProvider = terrain;
      }
    });

    // Load Google Photorealistic 3D Tiles as default (asset 2275207)
    Cesium3DTileset.fromIonAssetId(2275207).then((tileset) => {
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.add(tileset);
        tileset.maximumScreenSpaceError = 8;
        (viewer as any)._realisticTileset = tileset;
        // Hide globe when realistic tiles are active to prevent z-fighting
        viewer.scene.globe.show = false;
      }
    }).catch(() => {
      // Fallback: if realistic tiles fail, use OSM buildings
      if (!viewer.isDestroyed()) {
        console.warn("Realistic tiles unavailable, falling back to OSM");
        createOsmBuildingsAsync().then((tileset) => {
          if (!viewer.isDestroyed()) {
            viewer.scene.primitives.add(tileset);
            tileset.maximumScreenSpaceError = 4;
            (viewer as any)._osmTileset = tileset;
          }
        });
      }
    });

    // Also pre-load OSM buildings (hidden by default)
    createOsmBuildingsAsync().then((tileset) => {
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.add(tileset);
        tileset.maximumScreenSpaceError = 4;
        tileset.show = false;
        (viewer as any)._osmTileset = tileset;
      }
    });

    // Create brush indicator entity (hidden by default)
    const brushEntity = viewer.entities.add({
      id: "brush-indicator",
      position: Cartesian3.fromDegrees(0, 0, 0),
      show: false,
      ellipse: {
        semiMajorAxis: 50,
        semiMinorAxis: 50,
        material: Color.fromCssColorString("#00ff88").withAlpha(0.3),
        outline: true,
        outlineColor: Color.fromCssColorString("#00ff88").withAlpha(0.8),
        outlineWidth: 3,
        height: 0,
        heightReference: 1, // CLAMP_TO_GROUND
      } as any,
    });
    brushIndicatorRef.current = brushEntity;

    // Fly to initial view
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(-74.006, 40.7128, 2500),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-35),
        roll: 0,
      },
      duration: 0,
    });

    // Mouse move handler for coordinates + brush indicator
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    let lastMouseX = -1;
    let lastMouseY = -1;
    
    handler.setInputAction((movement: any) => {
      const mx = movement.endPosition.x;
      const my = movement.endPosition.y;
      if (Math.abs(mx - lastMouseX) < 2 && Math.abs(my - lastMouseY) < 2) return;
      lastMouseX = mx;
      lastMouseY = my;

      // If dragging a model, reposition it
      if (draggingRef.current) {
        const ray = viewer.camera.getPickRay(movement.endPosition);
        if (ray) {
          const cartesian = viewer.scene.pickPosition(movement.endPosition)
            || (viewer.scene.globe.show ? viewer.scene.globe.pick(ray, viewer.scene) : undefined);
          if (defined(cartesian)) {
            const entity = viewer.entities.getById(`model-${draggingRef.current}`);
            if (entity) {
              entity.position = cartesian as any;
            }
          }
        }
        return;
      }

      const ray = viewer.camera.getPickRay(movement.endPosition);
      if (ray) {
        const cartesian = viewer.scene.pickPosition(movement.endPosition) 
          || (viewer.scene.globe.show ? viewer.scene.globe.pick(ray, viewer.scene) : undefined);
        if (defined(cartesian)) {
          const carto = Cartographic.fromCartesian(cartesian);
          setCursorInfo({
            lat: CesiumMath.toDegrees(carto.latitude),
            lng: CesiumMath.toDegrees(carto.longitude),
            alt: carto.height,
          });
          // Only update brush indicator when no placement dialog is open
          if (brushIndicatorRef.current && !pendingPlacementRef.current) {
            brushIndicatorRef.current.position = cartesian as any;
          }
        }
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // Left click down — start dragging a model entity
    handler.setInputAction((click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id && typeof picked.id.id === "string" && picked.id.id.startsWith("model-")) {
        const modelId = picked.id.id.replace("model-", "");
        draggingRef.current = modelId;
        setDraggingModelId(modelId);
        viewer.scene.screenSpaceCameraController.enableRotate = false;
        viewer.scene.screenSpaceCameraController.enableTranslate = false;
      }
    }, ScreenSpaceEventType.LEFT_DOWN);

    // Left click up — finish dragging
    handler.setInputAction((_click: any) => {
      if (draggingRef.current) {
        const modelId = draggingRef.current;
        const entity = viewer.entities.getById(`model-${modelId}`);
        if (entity && entity.position) {
          const pos = entity.position.getValue(viewer.clock.currentTime);
          if (pos) {
            const carto = Cartographic.fromCartesian(pos);
            const newLat = CesiumMath.toDegrees(carto.latitude);
            const newLng = CesiumMath.toDegrees(carto.longitude);
            // Dispatch event to update React state
            window.dispatchEvent(new CustomEvent("cesium-model-moved", {
              detail: { id: modelId, lat: newLat, lng: newLng, alt: carto.height }
            }));
          }
        }
        draggingRef.current = null;
        setDraggingModelId(null);
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableTranslate = true;
      }
    }, ScreenSpaceEventType.LEFT_UP);

    // Double-click handler — creates POI or places model depending on mode
    handler.setInputAction((click: any) => {
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      const cartesian = viewer.scene.pickPosition(click.position)
        || (viewer.scene.globe.show ? viewer.scene.globe.pick(ray, viewer.scene) : undefined);
      if (!defined(cartesian)) return;
      const carto = Cartographic.fromCartesian(cartesian);
      const loc = {
        lat: CesiumMath.toDegrees(carto.latitude),
        lng: CesiumMath.toDegrees(carto.longitude),
        alt: carto.height,
      };
      // We dispatch a custom event so React state can decide the action
      window.dispatchEvent(new CustomEvent("cesium-dblclick", { detail: loc }));
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Track camera altitude
    viewer.scene.postRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      const carto = Cartographic.fromCartesian(viewer.camera.position);
      setCameraAlt(carto.height);
    });

    setIsLoaded(true);

    return () => {
      handler.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  // ── Cargo Routes Rendering + Vessel Animation ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Cleanup
    cargoEntitiesRef.current.forEach((e) => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    cargoEntitiesRef.current = [];
    if (vesselAnimRef.current) { clearInterval(vesselAnimRef.current); vesselAnimRef.current = null; }

    if (!showCargoRoutes) return;

    // Filter routes
    let filteredRoutes = ALL_CARGO_ROUTES;
    if (cargoFilter !== "all") filteredRoutes = filteredRoutes.filter(r => r.type === cargoFilter);
    if (cargoTypeFilter !== "all") filteredRoutes = filteredRoutes.filter(r => r.category === cargoTypeFilter);

    // Initialize vessel progress
    filteredRoutes.forEach(route => {
      route.vessels.forEach(v => {
        if (!vesselProgressRef.current.has(v.id)) {
          vesselProgressRef.current.set(v.id, v.progress);
        }
      });
    });

    filteredRoutes.forEach((route) => {
      const height = route.type === "air" ? 80000 : 0;
      const positions = route.waypoints.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, height));
      const lineColor = Color.fromCssColorString(route.color);

      // Glow polyline
      const polyEntity = viewer.entities.add({
        id: `cargo-${route.id}`,
        polyline: { positions, width: route.type === "air" ? 3 : 4, material: new PolylineGlowMaterialProperty({ glowPower: 0.25, taperPower: 0.8, color: lineColor.withAlpha(0.85) }), clampToGround: route.type === "maritime" },
      });
      cargoEntitiesRef.current.push(polyEntity);

      // Core line
      cargoEntitiesRef.current.push(viewer.entities.add({
        id: `cargo-core-${route.id}`,
        polyline: { positions, width: route.type === "air" ? 1.5 : 2, material: lineColor.withAlpha(0.5), clampToGround: route.type === "maritime" },
      }));

      // Route label
      const midIdx = Math.floor(route.waypoints.length / 2);
      const [mLng, mLat] = route.waypoints[midIdx];
      cargoEntitiesRef.current.push(viewer.entities.add({
        id: `cargo-label-${route.id}`,
        position: Cartesian3.fromDegrees(mLng, mLat, height + (route.type === "air" ? 20000 : 8000)),
        label: {
          text: `${route.name}\n${CARGO_CATEGORIES.find(c => c.id === route.category)?.icon || ""} ${route.distance} · ${route.transitTime}`,
          font: "11px Inter", fillColor: Color.WHITE, outlineColor: lineColor.withAlpha(0.9), outlineWidth: 3, style: 2,
          pixelOffset: new Cartesian2(0, -10), disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: { near: 5e4, nearValue: 1.0, far: 8e6, farValue: 0.25 } as any,
          translucencyByDistance: { near: 5e4, nearValue: 1.0, far: 1.5e7, farValue: 0.0 } as any,
          backgroundColor: Color.BLACK.withAlpha(0.6), showBackground: true, backgroundPadding: new Cartesian2(6, 3),
        },
      }));

      // Direction arrows
      const arrowStep = Math.max(1, Math.floor(route.waypoints.length / Math.max(3, Math.floor(route.waypoints.length / 3))));
      for (let i = 1; i < route.waypoints.length - 1; i += arrowStep) {
        const [lng1, lat1] = route.waypoints[i];
        const ni = Math.min(i + 1, route.waypoints.length - 1);
        const [lng2, lat2] = route.waypoints[ni];
        const heading = Math.atan2(lng2 - lng1, lat2 - lat1);
        const arrowChars = ["↑","↗","→","↘","↓","↙","←","↖"];
        const octant = Math.round(((heading * 180 / Math.PI) + 360) % 360 / 45) % 8;
        cargoEntitiesRef.current.push(viewer.entities.add({
          id: `cargo-arrow-${route.id}-${i}`,
          position: Cartesian3.fromDegrees(lng1, lat1, height + (route.type === "air" ? 12000 : 3000)),
          label: { text: route.type === "air" ? "✈" : arrowChars[octant], font: route.type === "air" ? "16px sans-serif" : "14px sans-serif", fillColor: lineColor, outlineColor: Color.BLACK, outlineWidth: 2, style: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: { near: 2e4, nearValue: 1.2, far: 5e6, farValue: 0.15 } as any, translucencyByDistance: { near: 2e4, nearValue: 1.0, far: 1e7, farValue: 0.0 } as any },
        }));
      }

      // Vessel entities — positioned by interpolation
      route.vessels.forEach((vessel) => {
        const prog = vesselProgressRef.current.get(vessel.id) || vessel.progress;
        const [vLng, vLat] = interpolatePosition(route.waypoints, prog);
        const vHeight = route.type === "air" ? 35000 + (prog * 5000) : 0;
        const catInfo = CARGO_CATEGORIES.find(c => c.id === vessel.category);
        const vesselEntity = viewer.entities.add({
          id: `vessel-${vessel.id}`,
          position: Cartesian3.fromDegrees(vLng, vLat, vHeight),
          label: {
            text: catInfo?.icon || (route.type === "air" ? "✈" : "🚢"),
            font: route.type === "air" ? "20px sans-serif" : "18px sans-serif",
            fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 1, style: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: { near: 1e4, nearValue: 1.5, far: 3e6, farValue: 0.1 } as any,
            translucencyByDistance: { near: 1e4, nearValue: 1.0, far: 5e6, farValue: 0.0 } as any,
          },
          point: { pixelSize: 5, color: lineColor, outlineColor: lineColor.withAlpha(0.3), outlineWidth: 10, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: { near: 1e4, nearValue: 1.0, far: 1e7, farValue: 0.3 } as any },
          description: JSON.stringify({ vesselId: vessel.id, routeId: route.id }),
        });
        cargoEntitiesRef.current.push(vesselEntity);
      });

      // Port markers at endpoints
      [[route.waypoints[0],0],[route.waypoints[route.waypoints.length-1],1]].forEach(([pt, pi]) => {
        const [pLng, pLat] = pt as [number, number];
        cargoEntitiesRef.current.push(viewer.entities.add({
          id: `cargo-port-${route.id}-${pi}`,
          position: Cartesian3.fromDegrees(pLng, pLat, height + 1000),
          point: { pixelSize: 6, color: lineColor, outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        }));
      });
    });

    // Animate vessels — update positions every 2 seconds
    const SPEED_FACTOR = 0.0005; // progress per tick for ships
    const AIR_SPEED_FACTOR = 0.002; // faster for planes
    vesselAnimRef.current = setInterval(() => {
      if (!viewer || viewer.isDestroyed()) return;
      filteredRoutes.forEach(route => {
        const height = route.type === "air" ? 35000 : 0;
        route.vessels.forEach(vessel => {
          let prog = vesselProgressRef.current.get(vessel.id) || vessel.progress;
          prog += route.type === "air" ? AIR_SPEED_FACTOR : SPEED_FACTOR;
          if (prog >= 1) prog = 0; // loop back
          vesselProgressRef.current.set(vessel.id, prog);
          const [vLng, vLat] = interpolatePosition(route.waypoints, prog);
          const entity = viewer.entities.getById(`vessel-${vessel.id}`);
          if (entity) {
            entity.position = Cartesian3.fromDegrees(vLng, vLat, height + (route.type === "air" ? prog * 5000 : 0)) as any;
          }
        });
      });
    }, 2000);

    // Click handler for vessel data cards
    const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (picked?.id?.id) {
        const entityId = picked.id.id as string;
        // Check if it's a vessel
        if (entityId.startsWith("vessel-")) {
          const desc = picked.id.description?.getValue?.() || picked.id.description;
          if (desc) {
            try {
              const { vesselId, routeId } = JSON.parse(desc);
              const route = ALL_CARGO_ROUTES.find(r => r.id === routeId);
              const vessel = route?.vessels.find(v => v.id === vesselId);
              if (route && vessel) {
                const prog = vesselProgressRef.current.get(vessel.id) || vessel.progress;
                const [vLng, vLat] = interpolatePosition(route.waypoints, prog);
                setSelectedVessel({ ...vessel, routeName: route.name, routeColor: route.color, lat: vLat, lng: vLng });
                setSelectedRoute(null);
              }
            } catch {}
          }
        }
        // Check if it's a route line
        if (entityId.startsWith("cargo-") && !entityId.startsWith("cargo-core-") && !entityId.startsWith("cargo-label-") && !entityId.startsWith("cargo-arrow-") && !entityId.startsWith("cargo-port-")) {
          const routeId = entityId.replace("cargo-", "");
          const route = ALL_CARGO_ROUTES.find(r => r.id === routeId);
          if (route) {
            setSelectedRoute(route);
            setSelectedVessel(null);
          }
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      clickHandler.destroy();
      if (vesselAnimRef.current) { clearInterval(vesselAnimRef.current); vesselAnimRef.current = null; }
    };
  }, [showCargoRoutes, cargoFilter, cargoTypeFilter]);

  // ── Business/Store Icons on Globe ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Clear existing business entities
    businessEntitiesRef.current.forEach(e => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    businessEntitiesRef.current = [];

    if (!showBusinessIcons) return;

    // Load businesses in current view area
    const loadBusinesses = async () => {
      const cam = viewer.camera.positionCartographic;
      const lat = CesiumMath.toDegrees(cam.latitude);
      const lng = CesiumMath.toDegrees(cam.longitude);
      const alt = cam.height;
      // Only load when reasonably zoomed in
      if (alt > 50000) return;

      const radius = Math.min(alt / 111000 * 2, 0.15); // degrees, proportional to altitude
      const areaKey = `${lat.toFixed(2)},${lng.toFixed(2)},${radius.toFixed(3)}`;
      if (businessLoadedAreaRef.current === areaKey) return;
      businessLoadedAreaRef.current = areaKey;

      const bbox = `${(lat - radius).toFixed(5)},${(lng - radius).toFixed(5)},${(lat + radius).toFixed(5)},${(lng + radius).toFixed(5)}`;
      const query = `[out:json][timeout:10];(node["shop"](${bbox});node["amenity"~"restaurant|cafe|fast_food|fuel|pharmacy|hospital|bank|bar|pub"](${bbox});node["tourism"~"hotel|motel|hostel|guest_house"](${bbox}););out 80;`;
      try {
        const resp = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const data = await resp.json();
        if (!data.elements) return;

        // Clear old before adding new
        businessEntitiesRef.current.forEach(e => {
          if (viewer.entities.contains(e)) viewer.entities.remove(e);
        });
        businessEntitiesRef.current = [];

        const iconMap: Record<string, string> = {
          restaurant: "🍽️", fast_food: "🍔", cafe: "☕", bar: "🍺", pub: "🍺",
          fuel: "⛽", pharmacy: "💊", hospital: "🏥", bank: "🏦",
          hotel: "🏨", motel: "🏨", hostel: "🏨", guest_house: "🏨",
          supermarket: "🛒", convenience: "🏪", clothes: "👕", electronics: "📱",
          bakery: "🍞", butcher: "🥩", hairdresser: "💇", car_repair: "🔧",
        };

        data.elements.forEach((el: any) => {
          const tags = el.tags || {};
          if (!tags.name) return;
          const amenity = tags.amenity || tags.shop || tags.tourism || "";
          const icon = iconMap[amenity] || "📍";
          const entity = viewer.entities.add({
            id: `biz-${el.id}`,
            position: Cartesian3.fromDegrees(el.lon, el.lat, 2),
            label: {
              text: icon,
              font: "16px sans-serif",
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: { near: 100, nearValue: 1.2, far: 8000, farValue: 0.3 } as any,
              translucencyByDistance: { near: 100, nearValue: 1.0, far: 15000, farValue: 0.0 } as any,
            },
            description: tags.name + (tags["addr:street"] ? ` — ${tags["addr:street"]}` : ""),
          });
          businessEntitiesRef.current.push(entity);
        });
      } catch { /* ignore network errors */ }
    };

    loadBusinesses();

    // Reload on camera move end
    const removeListener = viewer.camera.moveEnd.addEventListener(() => {
      loadBusinesses();
    });

    return () => {
      removeListener();
    };
  }, [showBusinessIcons]);

  // ── Real-time Aircraft & Ship Tracking ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Clear existing
    liveTrafficEntitiesRef.current.forEach(e => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    liveTrafficEntitiesRef.current = [];
    if (liveTrafficTimerRef.current) { clearInterval(liveTrafficTimerRef.current); liveTrafficTimerRef.current = null; }

    if (!showLiveTraffic) { setLiveTrafficStats({ planes: 0, ships: 0 }); return; }

    const fetchAircraft = async () => {
      try {
        const resp = await fetch("https://opensky-network.org/api/states/all");
        const data = await resp.json();
        if (!data.states) return [];
        return data.states
          .filter((s: any) => s[5] != null && s[6] != null && !s[8])
          .map((s: any) => ({
            id: s[0],
            callsign: (s[1] || "").trim(),
            country: s[2] || "",
            lng: s[5],
            lat: s[6],
            alt: s[7] || 10000,
            speed: s[9] || 0,
            heading: s[10] || 0,
          }));
      } catch { return []; }
    };

    const updateEntities = async () => {
      if (!viewer || viewer.isDestroyed()) return;
      const aircraft = await fetchAircraft();

      // Update existing or add new entities
      const existingIds = new Set(liveTrafficEntitiesRef.current.map(e => e.id));
      const newIds = new Set(aircraft.map((ac: any) => `live-ac-${ac.id}`));

      // Remove entities no longer present
      liveTrafficEntitiesRef.current = liveTrafficEntitiesRef.current.filter(e => {
        if (!newIds.has(e.id)) {
          if (viewer.entities.contains(e)) viewer.entities.remove(e);
          return false;
        }
        return true;
      });

      const maxPlanes = 8000;
      const planes = aircraft.slice(0, maxPlanes);
      planes.forEach((ac: any) => {
        const eid = `live-ac-${ac.id}`;
        const existing = viewer.entities.getById(eid);
        const pos = Cartesian3.fromDegrees(ac.lng, ac.lat, Math.max(ac.alt, 500) * 3);
        if (existing) {
          // Update position in place — real-time movement
          existing.position = pos as any;
        } else if (!existingIds.has(eid)) {
          const entity = viewer.entities.add({
            id: eid,
            position: pos,
            point: {
              pixelSize: 3,
              color: Color.fromCssColorString("#facc15"),
              outlineColor: Color.fromCssColorString("#facc15").withAlpha(0.3),
              outlineWidth: 4,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: { near: 1e4, nearValue: 2.0, far: 1e7, farValue: 0.3 } as any,
            },
            label: {
              text: "✈",
              font: "12px sans-serif",
              fillColor: Color.fromCssColorString("#facc15"),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: { near: 5e3, nearValue: 1.0, far: 5e5, farValue: 0.0 } as any,
              translucencyByDistance: { near: 5e3, nearValue: 1.0, far: 8e5, farValue: 0.0 } as any,
              pixelOffset: new Cartesian2(0, -8),
            },
            description: JSON.stringify(ac),
          });
          liveTrafficEntitiesRef.current.push(entity);
        }
      });

      setLiveTrafficStats({ planes: planes.length, ships: 0 });
    };

    updateEntities();
    // Refresh every 10 seconds (OpenSky rate limit)
    liveTrafficTimerRef.current = setInterval(updateEntities, 10000);

    return () => {
      if (liveTrafficTimerRef.current) { clearInterval(liveTrafficTimerRef.current); liveTrafficTimerRef.current = null; }
    };
  }, [showLiveTraffic]);

  // Listen for double-click events from Cesium
  useEffect(() => {
    const handleDblClick = (e: Event) => {
      const loc = (e as CustomEvent).detail;
      if (brushMode) {
        setPendingPlacement(loc);
        // Lock the brush indicator at this position
        if (brushIndicatorRef.current && viewerRef.current) {
          const pos = Cartesian3.fromDegrees(loc.lng, loc.lat, loc.alt);
          brushIndicatorRef.current.position = pos as any;
        }
      } else {
        setNamingPOI(loc);
        setPoiName("");
        setPoiDescription("");
      }
    };
    window.addEventListener("cesium-dblclick", handleDblClick);
    return () => window.removeEventListener("cesium-dblclick", handleDblClick);
  }, [brushMode]);

  // Listen for model drag events
  useEffect(() => {
    const handleModelMoved = (e: Event) => {
      const { id, lat, lng, alt } = (e as CustomEvent).detail;
      setPlacedModels(prev => {
        const updated = prev.map(m => m.id === id ? { ...m, lat, lng, alt } : m);
        savePlacedModels(updated);
        return updated;
      });
    };
    window.addEventListener("cesium-model-moved", handleModelMoved);
    return () => window.removeEventListener("cesium-model-moved", handleModelMoved);
  }, []);

  // Brush mode indicator visibility
  useEffect(() => {
    if (brushIndicatorRef.current) {
      brushIndicatorRef.current.show = brushMode;
    }
  }, [brushMode]);

  /* ── Search (local presets + Nominatim + Overpass businesses) ── */
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults(PRESETS); setNominatimResults([]); setOverpassResults([]); return; }
    const q = query.toLowerCase();
    const filtered = PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)
    );
    const coordMatch = query.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      filtered.unshift({
        name: `Coordinates ${coordMatch[1]}, ${coordMatch[2]}`,
        lat: parseFloat(coordMatch[1]),
        lng: parseFloat(coordMatch[2]),
        type: "Coordinate",
      });
    }
    setSearchResults(filtered);

    // Debounced parallel search: Nominatim + Overpass — prioritize businesses
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.trim().length >= 3) {
      setSearchLoading(true);
      searchTimerRef.current = setTimeout(async () => {
        const [nomResults, ovResults] = await Promise.all([
          searchNominatim(query),
          searchOverpassBusinesses(query),
        ]);
        // Deduplicate overpass results that are already in nominatim (by proximity)
        const deduped = ovResults.filter(ov =>
          !nomResults.some(n => Math.abs(n.lat - ov.lat) < 0.001 && Math.abs(n.lng - ov.lng) < 0.001)
        );
        // Prioritize: exact name matches first, then businesses, then other results
        const businessTypes = new Set(["Restaurant","Cafe","Hotel","Shop","Store","Supermarket","Fuel","Health","Education","Business"]);
        const allResults = [...deduped, ...nomResults];
        const exactMatches = allResults.filter(r => r.name.toLowerCase().includes(q));
        const businessMatches = allResults.filter(r => businessTypes.has(r.type) && !r.name.toLowerCase().includes(q));
        const otherMatches = allResults.filter(r => !businessTypes.has(r.type) && !r.name.toLowerCase().includes(q));
        // Put business/exact matches into overpassResults (shown first), rest in nominatim
        setOverpassResults([...exactMatches.filter(r => businessTypes.has(r.type)), ...businessMatches]);
        setNominatimResults([...exactMatches.filter(r => !businessTypes.has(r.type)), ...otherMatches]);
        setSearchLoading(false);
      }, 400);
    } else {
      setNominatimResults([]);
      setOverpassResults([]);
    }
  }, [searchNominatim, searchOverpassBusinesses]);

  /* ── Directions search helpers ── */
  const searchForDirections = useCallback(async (query: string, target: "origin" | "dest") => {
    if (target === "origin") setOriginQuery(query); else setDestQuery(query);
    if (!query.trim() || query.length < 3) {
      if (target === "origin") { setOriginResults([]); setShowOriginResults(false); }
      else { setDestResults([]); setShowDestResults(false); }
      return;
    }
    const results = await searchNominatim(query);
    const presetResults = PRESETS.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
    const combined = [...presetResults.slice(0, 3), ...results].slice(0, 6);
    if (target === "origin") { setOriginResults(combined); setShowOriginResults(true); }
    else { setDestResults(combined); setShowDestResults(true); }
  }, [searchNominatim]);

  const selectRoutePoint = useCallback((point: SearchResult, target: "origin" | "dest") => {
    if (target === "origin") {
      setOriginPoint(point);
      setOriginQuery(point.name);
      setShowOriginResults(false);
    } else {
      setDestPoint(point);
      setDestQuery(point.name);
      setShowDestResults(false);
    }
  }, []);

  const flyTo = useCallback((result: SearchResult) => {
    if (!viewerRef.current) return;
    // Closer zoom for businesses/shops/restaurants
    const businessTypes = ["Restaurant","Cafe","Hotel","Shop","Store","Supermarket","Fuel","Health","Education","Business"];
    const isBusiness = businessTypes.includes(result.type);
    const altitude = result.type === "Mountain" ? 8000 : result.type === "City" ? 2000 : isBusiness ? 500 : 5000;
    viewerRef.current.camera.flyTo({
      destination: Cartesian3.fromDegrees(result.lng, result.lat, altitude),
      orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(isBusiness ? -45 : -35), roll: 0 },
      duration: 1.8,
    });
    viewerRef.current.entities.add({
      position: Cartesian3.fromDegrees(result.lng, result.lat),
      name: result.name,
      label: {
        text: result.name, font: "14px Inter, sans-serif",
        fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, style: 2,
        pixelOffset: new Cartesian2(0, -30),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      point: {
        pixelSize: 10, color: Color.fromCssColorString("#00d4ff"),
        outlineColor: Color.WHITE, outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    setSearchOpen(false);
    setSearchQuery("");
  }, []);

  const switchViewMode = useCallback((mode: "realistic" | "osm") => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    const realistic = (viewer as any)._realisticTileset;
    const osm = (viewer as any)._osmTileset;

    if (mode === "realistic") {
      if (realistic) { realistic.show = true; }
      if (osm) { osm.show = false; }
      viewer.scene.globe.show = !realistic; // hide globe only if realistic tiles loaded
    } else {
      if (realistic) { realistic.show = false; }
      if (osm) { osm.show = true; }
      viewer.scene.globe.show = true;
    }
    setViewMode(mode);
    setShowBuildings(true);
  }, []);

  const toggleBuildings = useCallback(() => {
    if (!viewerRef.current) return;
    const realistic = (viewerRef.current as any)._realisticTileset;
    const osm = (viewerRef.current as any)._osmTileset;
    const newShow = !showBuildings;
    if (viewMode === "realistic" && realistic) {
      realistic.show = newShow;
    } else if (osm) {
      osm.show = newShow;
    }
    setShowBuildings(newShow);
  }, [showBuildings, viewMode]);

  /* ── POI Functions ── */
  const addPOIToGlobe = useCallback((poi: POI) => {
    if (!viewerRef.current) return;
    viewerRef.current.entities.add({
      id: `poi-${poi.id}`,
      position: Cartesian3.fromDegrees(poi.lng, poi.lat),
      name: poi.name,
      label: {
        text: `📍 ${poi.name}`, font: "13px Inter, sans-serif",
        fillColor: Color.fromCssColorString("#ffd700"),
        outlineColor: Color.BLACK, outlineWidth: 2, style: 2,
        pixelOffset: new Cartesian2(0, -24),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      point: {
        pixelSize: 12, color: Color.fromCssColorString("#ffd700"),
        outlineColor: Color.WHITE, outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }, []);

  const confirmPOI = useCallback(() => {
    if (!namingPOI || !poiName.trim()) return;
    const newPoi: POI = {
      id: crypto.randomUUID(), name: poiName.trim(), description: poiDescription.trim(),
      notes: "", lat: namingPOI.lat, lng: namingPOI.lng, alt: namingPOI.alt, createdAt: Date.now(),
    };
    const updated = [...pois, newPoi];
    setPois(updated);
    savePOIs(updated);
    addPOIToGlobe(newPoi);
    setNamingPOI(null);
    setPoiName("");
    setPoiDescription("");
  }, [namingPOI, poiName, poiDescription, pois, addPOIToGlobe]);

  const deletePOI = useCallback((id: string) => {
    const updated = pois.filter((p) => p.id !== id);
    setPois(updated); savePOIs(updated);
    if (viewerRef.current) {
      const entity = viewerRef.current.entities.getById(`poi-${id}`);
      if (entity) viewerRef.current.entities.remove(entity);
    }
    if (selectedPOI?.id === id) setSelectedPOI(null);
  }, [pois, selectedPOI]);

  const flyToPOI = useCallback((poi: POI) => {
    if (!viewerRef.current) return;
    viewerRef.current.camera.flyTo({
      destination: Cartesian3.fromDegrees(poi.lng, poi.lat, 2000),
      orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(-35), roll: 0 },
      duration: 2,
    });
  }, []);

  const saveNotes = useCallback(() => {
    if (!selectedPOI) return;
    const updated = pois.map((p) => p.id === selectedPOI.id ? { ...p, notes: editNotesValue } : p);
    setPois(updated); savePOIs(updated);
    setSelectedPOI({ ...selectedPOI, notes: editNotesValue });
    setEditingNotes(false);
  }, [selectedPOI, editNotesValue, pois]);

  // Load saved POIs onto globe when viewer is ready
  useEffect(() => {
    if (!isLoaded || !viewerRef.current) return;
    pois.forEach(addPOIToGlobe);
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Tile Brush / 3D Model Placement ── */
  const placeModelOnGlobe = useCallback((model: PlacedModel, blobUrl: string) => {
    if (!viewerRef.current) return;
    // Place at ground level (alt=0) and clamp to terrain/3D tiles
    const position = Cartesian3.fromDegrees(model.lng, model.lat, 0);
    const hpr = new HeadingPitchRoll(CesiumMath.toRadians(model.heading), 0, 0);
    const orientation = Transforms.headingPitchRollQuaternion(position, hpr);

    viewerRef.current.entities.add({
      id: `model-${model.id}`,
      position,
      orientation: orientation as any,
      name: model.name,
      model: {
        uri: blobUrl,
        scale: model.scale,
        minimumPixelSize: 64,
        maximumScale: 20000,
        heightReference: 1, // CLAMP_TO_GROUND
      } as any,
      label: {
        text: `🏗️ ${model.name}`, font: "12px Inter, sans-serif",
        fillColor: Color.fromCssColorString("#00ff88"),
        outlineColor: Color.BLACK, outlineWidth: 2, style: 2,
        pixelOffset: new Cartesian2(0, -40),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }, []);

  const confirmModelPlacement = useCallback(async () => {
    if (!pendingPlacement || !modelFile || !modelName.trim()) return;

    setConvertingModel(true);
    setConvertError(null);
    try {
      const blobUrl = await convertToGltfBlobUrl(modelFile, setConvertProgress);
      const newModel: PlacedModel = {
        id: crypto.randomUUID(),
        name: modelName.trim(),
        fileName: modelFile.name,
        lat: pendingPlacement.lat,
        lng: pendingPlacement.lng,
        alt: pendingPlacement.alt,
        heading: modelHeading,
        scale: modelScale,
        createdAt: Date.now(),
      };

      modelUrlsRef.current.set(newModel.id, blobUrl);
      placeModelOnGlobe(newModel, blobUrl);

      const updated = [...placedModels, newModel];
      setPlacedModels(updated);
      savePlacedModels(updated);
      setPendingPlacement(null);
      setModelFile(null);
      setModelName("");
      setModelScale(1);
      setModelHeading(0);
      setConvertProgress("");
    } catch (err: any) {
      setConvertError(err.message || "Failed to convert model");
    } finally {
      setConvertingModel(false);
    }
  }, [pendingPlacement, modelFile, modelName, modelHeading, modelScale, placedModels, placeModelOnGlobe]);

  const deleteModel = useCallback((id: string) => {
    const updated = placedModels.filter((m) => m.id !== id);
    setPlacedModels(updated);
    savePlacedModels(updated);
    if (viewerRef.current) {
      const entity = viewerRef.current.entities.getById(`model-${id}`);
      if (entity) viewerRef.current.entities.remove(entity);
    }
    const url = modelUrlsRef.current.get(id);
    if (url) { URL.revokeObjectURL(url); modelUrlsRef.current.delete(id); }
  }, [placedModels]);

  const flyToModel = useCallback((model: PlacedModel) => {
    if (!viewerRef.current) return;
    viewerRef.current.camera.flyTo({
      destination: Cartesian3.fromDegrees(model.lng, model.lat, 500),
      orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(-35), roll: 0 },
      duration: 2,
    });
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setModelFile(file);
      setConvertError(null);
      if (!modelName) setModelName(file.name.replace(/\.[^.]+$/, ""));
    }
  }, [modelName]);

  const resetView = useCallback(() => {
    if (!viewerRef.current) return;
    viewerRef.current.camera.flyTo({
      destination: Cartesian3.fromDegrees(0, 20, 20000000),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
      duration: 2,
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const formatCoord = (val: number, isLat: boolean) => {
    const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
    return `${Math.abs(val).toFixed(4)}° ${dir}`;
  };

  const formatAlt = (meters: number) => {
    if (meters > 100000) return `${(meters / 1000).toFixed(0)} km`;
    if (meters > 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${meters.toFixed(0)} m`;
  };

  return (
    <div className="relative w-full h-screen bg-[#0a0a1a] overflow-hidden">
      {/* Hidden file input for model uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_STRING}
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Cesium Globe Container */}
      <div ref={cesiumContainer} className="absolute inset-0 z-0" />

      {/* Loading Screen */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0 z-50 bg-[#0a0a1a] flex flex-col items-center justify-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 rounded-full border-2 border-white/10 border-t-primary"
            />
            <p className="mt-6 text-white/50 text-sm font-mono">INITIALIZING EARTH SYSTEMS...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Brush Mode Indicator */}
      <AnimatePresence>
        {brushMode && !draggingModelId && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-30"
          >
            <div className="bg-emerald-500/20 backdrop-blur-xl border border-emerald-500/40 rounded-full px-5 py-2 flex items-center gap-2">
              <Paintbrush className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-emerald-300">TILE BRUSH ACTIVE</span>
              <span className="text-xs text-emerald-400/60">— Double-click to place model</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dragging Model Indicator */}
      <AnimatePresence>
        {draggingModelId && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-30"
          >
            <div className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/40 rounded-full px-5 py-2 flex items-center gap-2">
              <Move className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-sm font-medium text-cyan-300">DRAGGING MODEL</span>
              <span className="text-xs text-cyan-400/60">— Release to place</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HUD Overlay ── */}
      {isLoaded && hudVisible && (
        <>
          {/* Top Bar */}
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="absolute top-0 left-0 right-0 z-20 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link to="/">
                  <GlassPanel className="p-2.5 cursor-pointer hover:bg-white/[0.06] transition-colors">
                    <ArrowLeft className="w-5 h-5 text-white/70" />
                  </GlassPanel>
                </Link>
                <GlassPanel className="px-4 py-2.5 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-white">NEXUS</span>
                  <span className="text-xs text-white/30 font-mono">SPACESHIP</span>
                </GlassPanel>
              </div>

              <div className="flex items-center gap-2">
                <GlassPanel className="p-2.5 cursor-pointer hover:bg-white/[0.06] transition-colors">
                  <button onClick={() => { setSearchOpen(!searchOpen); setSearchResults(PRESETS); }}>
                    <Search className="w-5 h-5 text-white/70" />
                  </button>
                </GlassPanel>

                <GlassPanel className="flex items-center gap-1 p-1.5">
                  <button
                    onClick={toggleBuildings}
                    className={`p-1.5 rounded-lg transition-colors ${showBuildings ? "bg-primary/20 text-primary" : "text-white/40 hover:text-white/70"}`}
                    title="Toggle Buildings On/Off"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={resetView}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors"
                    title="Global View"
                  >
                    <Globe className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPoisPanelOpen(!poisPanelOpen)}
                    className={`p-1.5 rounded-lg transition-colors ${poisPanelOpen ? "bg-yellow-500/20 text-yellow-400" : "text-white/40 hover:text-white/70"}`}
                    title="Interest Points"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                  {/* Tile Brush Toggle */}
                  <button
                    onClick={() => { setBrushMode(!brushMode); setBrushPanelOpen(!brushMode); }}
                    className={`p-1.5 rounded-lg transition-colors ${brushMode ? "bg-emerald-500/20 text-emerald-400" : "text-white/40 hover:text-white/70"}`}
                    title="Tile Brush — Place 3D Models"
                  >
                    <Paintbrush className="w-4 h-4" />
                  </button>
                  {/* Directions Toggle */}
                  <button
                    onClick={() => setDirectionsOpen(!directionsOpen)}
                    className={`p-1.5 rounded-lg transition-colors ${directionsOpen ? "bg-blue-500/20 text-blue-400" : "text-white/40 hover:text-white/70"}`}
                    title="Directions & Routes"
                  >
                    <Route className="w-4 h-4" />
                  </button>
                  {/* Cargo Routes Toggle */}
                  <button
                    onClick={() => setShowCargoRoutes(!showCargoRoutes)}
                    className={`p-1.5 rounded-lg transition-colors ${showCargoRoutes ? "bg-amber-500/20 text-amber-400" : "text-white/40 hover:text-white/70"}`}
                    title="Global Cargo Routes"
                  >
                    <Ship className="w-4 h-4" />
                  </button>
                  {/* Business/Store Icons Toggle */}
                  <button
                    onClick={() => setShowBusinessIcons(!showBusinessIcons)}
                    className={`p-1.5 rounded-lg transition-colors ${showBusinessIcons ? "bg-emerald-500/20 text-emerald-400" : "text-white/40 hover:text-white/70"}`}
                    title="Show Nearby Businesses & Stores"
                  >
                    <Store className="w-4 h-4" />
                  </button>
                  {/* Live Traffic Toggle */}
                  <button
                    onClick={() => setShowLiveTraffic(!showLiveTraffic)}
                    className={`p-1.5 rounded-lg transition-colors ${showLiveTraffic ? "bg-yellow-500/20 text-yellow-400" : "text-white/40 hover:text-white/70"}`}
                    title="Live Aircraft & Ship Tracking"
                  >
                    <Plane className="w-4 h-4" />
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors"
                    title="Fullscreen"
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </GlassPanel>
              </div>
            </div>
          </motion.div>

          {/* Search Panel */}
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-20 left-1/2 -translate-x-1/2 z-30 w-full max-w-lg px-4"
              >
                <GlassPanel className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Search className="w-4 h-4 text-primary shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Search any address, city, business, or coordinates..."
                      className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/30"
                    />
                    <button onClick={() => setSearchOpen(false)}>
                      <X className="w-4 h-4 text-white/40 hover:text-white" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {["All", "City", "Business", "Restaurant", "Hotel", "Shop", "Airport", "Port", "Mountain"].map((t) => (
                      <button
                        key={t}
                        onClick={() => handleSearch(t === "All" ? "" : t)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase transition-colors ${
                          (t === "All" && !searchQuery) || searchQuery.toLowerCase() === t.toLowerCase()
                            ? "bg-primary/20 text-primary border border-primary/30"
                            : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/70"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-1 scrollbar-thin">
                    {/* Overpass business results — SHOWN FIRST */}
                    {overpassResults.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 px-3 py-2">
                          <div className="flex-1 h-px bg-emerald-500/20" />
                          <span className="text-[9px] text-emerald-400/70 font-mono uppercase">🏪 Businesses &amp; Stores</span>
                          <div className="flex-1 h-px bg-emerald-500/20" />
                        </div>
                        {overpassResults.map((r, i) => (
                          <button
                            key={`ov-${i}`}
                            onClick={() => flyTo(r)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-500/[0.08] transition-colors text-left group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/[0.08] flex items-center justify-center shrink-0">
                              {getTypeIcon(r.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{r.name}</p>
                              <p className="text-[10px] text-white/30 font-mono">{r.lat.toFixed(4)}, {r.lng.toFixed(4)} · {r.type}</p>
                            </div>
                            <Navigation className="w-4 h-4 text-emerald-400/40 group-hover:text-emerald-400 transition-colors" />
                          </button>
                        ))}
                      </>
                    )}

                    {/* Nominatim global results */}
                    {nominatimResults.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 px-3 py-2">
                          <div className="flex-1 h-px bg-white/[0.06]" />
                          <span className="text-[9px] text-white/30 font-mono uppercase">Global Results</span>
                          <div className="flex-1 h-px bg-white/[0.06]" />
                        </div>
                        {nominatimResults.map((r, i) => (
                          <button
                            key={`nom-${i}`}
                            onClick={() => flyTo(r)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                              {getTypeIcon(r.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{r.name}</p>
                              <p className="text-[10px] text-white/30 font-mono">{r.lat.toFixed(4)}, {r.lng.toFixed(4)} · {r.type}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
                          </button>
                        ))}
                      </>
                    )}

                    {/* Local preset results — shown last when searching */}
                    {searchQuery ? (
                      searchResults.length > 0 && (
                        <>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <div className="flex-1 h-px bg-white/[0.06]" />
                            <span className="text-[9px] text-white/30 font-mono uppercase">Presets</span>
                            <div className="flex-1 h-px bg-white/[0.06]" />
                          </div>
                          {searchResults.map((r, i) => (
                            <button key={`preset-${i}`} onClick={() => flyTo(r)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left group">
                              <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">{getTypeIcon(r.type)}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{r.name}</p>
                                <p className="text-[10px] text-white/30 font-mono">{r.lat.toFixed(4)}, {r.lng.toFixed(4)} · {r.type}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
                            </button>
                          ))}
                        </>
                      )
                    ) : (
                      PRESETS.map((r, i) => (
                        <button key={`preset-${i}`} onClick={() => flyTo(r)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left group">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">{getTypeIcon(r.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{r.name}</p>
                            <p className="text-[10px] text-white/30 font-mono">{r.lat.toFixed(4)}, {r.lng.toFixed(4)} · {r.type}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
                        </button>
                      ))
                    )}

                    {searchLoading && (
                      <div className="flex items-center justify-center gap-2 py-3">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        <span className="text-xs text-white/30">Searching worldwide for businesses...</span>
                      </div>
                    )}

                    {searchResults.length === 0 && nominatimResults.length === 0 && overpassResults.length === 0 && !searchLoading && searchQuery && (
                      <p className="text-sm text-white/30 text-center py-4">No results found.</p>
                    )}
                  </div>
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── CARGO ROUTES PANEL ── */}
          <AnimatePresence>
            {showCargoRoutes && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-24 left-4 z-30 w-72"
              >
                <GlassPanel className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Ship className="w-5 h-5 text-amber-400" />
                    <span className="text-sm font-bold text-white">Global Cargo Traffic</span>
                    <button onClick={() => { setShowCargoRoutes(false); setSelectedRoute(null); setSelectedVessel(null); }} className="ml-auto">
                      <X className="w-4 h-4 text-white/40 hover:text-white" />
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2 text-center">
                      <div className="text-lg font-bold font-mono text-blue-400">{MARITIME_VESSEL_COUNT}</div>
                      <div className="text-[9px] text-blue-400/60 uppercase">🚢 Ships</div>
                    </div>
                    <div className="bg-pink-500/10 border border-pink-500/20 rounded-xl p-2 text-center">
                      <div className="text-lg font-bold font-mono text-pink-400">{AIR_VESSEL_COUNT}</div>
                      <div className="text-[9px] text-pink-400/60 uppercase">✈ Planes</div>
                    </div>
                  </div>

                  {/* Type / Category Filter */}
                  <div className="flex gap-1.5 mb-2">
                    {(["all","maritime","air"] as const).map(f => (
                      <button key={f} onClick={() => setCargoFilter(f)}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all ${
                          cargoFilter === f
                            ? f === "maritime" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : f === "air" ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-white/[0.04] text-white/30 border border-white/[0.06] hover:text-white/60"
                        }`}>{f === "all" ? "All" : f === "maritime" ? "Sea" : "Air"}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {[{id:"all" as const,label:"All",icon:"🌐"}, ...CARGO_CATEGORIES.filter(c => cargoFilter === "all" || (cargoFilter === "maritime" ? !c.id.startsWith("air-") : c.id.startsWith("air-")))].map(c => (
                      <button key={c.id} onClick={() => setCargoTypeFilter(c.id as any)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-mono transition-all ${cargoTypeFilter === c.id ? "bg-white/10 text-white border border-white/20" : "bg-white/[0.03] text-white/25 border border-white/[0.05] hover:text-white/50"}`}>
                        {c.icon} {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Route count */}
                  <div className="flex items-center justify-between text-[9px] text-white/30 font-mono mb-3">
                    <span>{(cargoFilter === "all" ? ALL_CARGO_ROUTES : ALL_CARGO_ROUTES.filter(r => r.type === cargoFilter)).length} routes</span>
                    <span>{(cargoFilter === "all" ? ALL_CARGO_ROUTES : ALL_CARGO_ROUTES.filter(r => r.type === cargoFilter)).reduce((s, r) => s + r.vessels.length, 0)} vessels</span>
                  </div>

                  {/* Selected Route Card */}
                  {selectedRoute && (
                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white">{selectedRoute.name}</span>
                        <button onClick={() => setSelectedRoute(null)}><X className="w-3 h-3 text-white/30" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div><span className="text-white/30">Type</span><br/><span className="text-white font-mono">{CARGO_CATEGORIES.find(c=>c.id===selectedRoute.category)?.icon} {CARGO_CATEGORIES.find(c=>c.id===selectedRoute.category)?.label}</span></div>
                        <div><span className="text-white/30">Distance</span><br/><span className="text-white font-mono">{selectedRoute.distance}</span></div>
                        <div><span className="text-white/30">Transit</span><br/><span className="text-white font-mono">{selectedRoute.transitTime}</span></div>
                        <div><span className="text-white/30">Vessels</span><br/><span className="text-white font-mono">{selectedRoute.vessels.length} active</span></div>
                      </div>
                      <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
                        {selectedRoute.vessels.map(v => (
                          <div key={v.id} className="flex items-center gap-2 text-[9px] text-white/50 bg-white/[0.02] rounded-lg px-2 py-1">
                            <span>{v.flag}</span>
                            <span className="text-white/70 truncate flex-1">{v.name}</span>
                            <span className="text-white/30 font-mono">{v.speed}{selectedRoute.type === "air" ? "km/h" : "kn"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Selected Vessel Card */}
                  {selectedVessel && (
                    <div className="bg-white/[0.04] border rounded-xl p-3" style={{ borderColor: selectedVessel.routeColor + "40" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white">{selectedVessel.flag} {selectedVessel.name}</span>
                        <button onClick={() => setSelectedVessel(null)}><X className="w-3 h-3 text-white/30" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div><span className="text-white/30">Route</span><br/><span className="text-white font-mono">{selectedVessel.routeName}</span></div>
                        <div><span className="text-white/30">Category</span><br/><span className="text-white font-mono">{CARGO_CATEGORIES.find(c=>c.id===selectedVessel.category)?.icon} {CARGO_CATEGORIES.find(c=>c.id===selectedVessel.category)?.label}</span></div>
                        <div><span className="text-white/30">Speed</span><br/><span className="text-white font-mono">{selectedVessel.speed} {selectedVessel.category.startsWith("air") ? "km/h" : "knots"}</span></div>
                        <div><span className="text-white/30">Tonnage</span><br/><span className="text-white font-mono">{selectedVessel.tonnage}</span></div>
                        <div><span className="text-white/30">Operator</span><br/><span className="text-white font-mono">{selectedVessel.operator}</span></div>
                        <div><span className="text-white/30">Built</span><br/><span className="text-white font-mono">{selectedVessel.built}</span></div>
                        <div><span className="text-white/30">Position</span><br/><span className="text-white font-mono">{selectedVessel.lat.toFixed(3)}°, {selectedVessel.lng.toFixed(3)}°</span></div>
                        {selectedVessel.imo && <div><span className="text-white/30">IMO</span><br/><span className="text-white font-mono">{selectedVessel.imo}</span></div>}
                      </div>
                    </div>
                  )}
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>


          {/* ── LIVE TRAFFIC PANEL ── */}
          <AnimatePresence>
            {showLiveTraffic && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-24 right-4 z-30 w-64"
              >
                <GlassPanel className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Plane className="w-5 h-5 text-yellow-400" />
                    <span className="text-sm font-bold text-white">Live Air Traffic</span>
                    <button onClick={() => setShowLiveTraffic(false)} className="ml-auto">
                      <X className="w-4 h-4 text-white/40 hover:text-white" />
                    </button>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center mb-2">
                    <div className="text-2xl font-bold font-mono text-yellow-400">{liveTrafficStats.planes.toLocaleString()}</div>
                    <div className="text-[9px] text-yellow-400/60 uppercase tracking-wider">✈ Aircraft Tracked Live</div>
                  </div>
                  <div className="text-[9px] text-white/30 font-mono text-center">
                    OpenSky Network · Updates every 10s
                  </div>
                  <div className="mt-2 text-[9px] text-white/20 text-center">
                    Each yellow dot = a real aircraft in flight
                  </div>
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── DIRECTIONS PANEL ── */}
          <AnimatePresence>
            {directionsOpen && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="absolute top-20 left-4 z-30 w-96"
              >
                <GlassPanel className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Route className="w-5 h-5 text-blue-400" />
                      <span className="text-sm font-bold text-white">Directions</span>
                    </div>
                    <button onClick={() => setDirectionsOpen(false)}>
                      <X className="w-4 h-4 text-white/40 hover:text-white" />
                    </button>
                  </div>

                  {/* Origin Input */}
                  <div className="relative mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">From</span>
                    </div>
                    <input
                      type="text"
                      value={originQuery}
                      onChange={(e) => {
                        setOriginQuery(e.target.value);
                        if (e.target.value.length >= 3) {
                          searchForDirections(e.target.value, "origin");
                        } else {
                          setOriginResults([]); setShowOriginResults(false);
                        }
                      }}
                      placeholder="Search origin address..."
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400/40 placeholder:text-white/20 transition-colors"
                    />
                    {showOriginResults && originResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto bg-black/90 backdrop-blur-xl border border-white/[0.1] rounded-xl">
                        {originResults.map((r, i) => (
                          <button key={i} onClick={() => selectRoutePoint(r, "origin")}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] text-sm text-white/80 truncate">
                            {getTypeIcon(r.type)}
                            <span className="truncate">{r.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Destination Input */}
                  <div className="relative mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">To</span>
                    </div>
                    <input
                      type="text"
                      value={destQuery}
                      onChange={(e) => {
                        setDestQuery(e.target.value);
                        if (e.target.value.length >= 3) {
                          searchForDirections(e.target.value, "dest");
                        } else {
                          setDestResults([]); setShowDestResults(false);
                        }
                      }}
                      placeholder="Search destination address..."
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400/40 placeholder:text-white/20 transition-colors"
                    />
                    {showDestResults && destResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto bg-black/90 backdrop-blur-xl border border-white/[0.1] rounded-xl">
                        {destResults.map((r, i) => (
                          <button key={i} onClick={() => selectRoutePoint(r, "dest")}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] text-sm text-white/80 truncate">
                            {getTypeIcon(r.type)}
                            <span className="truncate">{r.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Get Directions Button */}
                  <button
                    onClick={() => { if (originPoint && destPoint) fetchRoute(originPoint, destPoint); }}
                    disabled={!originPoint || !destPoint || routeLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/20 border border-blue-500/30 rounded-xl text-sm font-medium text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mb-3"
                  >
                    {routeLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
                    ) : (
                      <><Navigation className="w-4 h-4" /> Get Directions</>
                    )}
                  </button>

                  {/* Route Error */}
                  {routeError && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-3">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-300">{routeError}</p>
                    </div>
                  )}

                  {/* Route Info */}
                  {routeInfo && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-3">
                      <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Route Summary</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <Ruler className="w-4 h-4 text-blue-400" />
                          <div>
                            <p className="text-[9px] text-white/30">Distance</p>
                            <p className="text-sm font-mono text-white">
                              {routeInfo.distance > 1000
                                ? `${(routeInfo.distance / 1000).toFixed(1)} km`
                                : `${routeInfo.distance.toFixed(0)} m`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-400" />
                          <div>
                            <p className="text-[9px] text-white/30">Duration</p>
                            <p className="text-sm font-mono text-white">
                              {routeInfo.duration > 3600
                                ? `${Math.floor(routeInfo.duration / 3600)}h ${Math.floor((routeInfo.duration % 3600) / 60)}m`
                                : `${Math.floor(routeInfo.duration / 60)} min`}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Start Journey Button */}
                  {routeInfo && !journeyActive && (
                    <button
                      onClick={startJourney}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500/20 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/30 transition-colors mb-3"
                    >
                      <Play className="w-4 h-4" /> Start Journey
                    </button>
                  )}

                  {/* Journey Progress */}
                  {journeyActive && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider">Navigating...</span>
                        <span className="text-xs font-mono text-blue-400">{journeyProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full transition-all duration-100"
                          style={{ width: `${journeyProgress}%` }}
                        />
                      </div>
                      <button
                        onClick={stopJourney}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        <StopIcon className="w-4 h-4" /> Stop Journey
                      </button>
                    </div>
                  )}

                  {/* Clear Route */}
                  {(routeInfo || originPoint || destPoint) && (
                    <button
                      onClick={clearRoute}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white/50 hover:text-white/70 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear Route
                    </button>
                  )}
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* POI Naming Dialog */}
          <AnimatePresence>
            {namingPOI && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-sm px-4"
              >
                <GlassPanel className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-5 h-5 text-yellow-400" />
                    <h3 className="text-sm font-bold text-white">Create Point of Interest</h3>
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-4">
                    <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Exact Coordinates</p>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono text-white/70">
                      <div><span className="text-[8px] text-white/30">LAT</span><p>{namingPOI.lat.toFixed(6)}°</p></div>
                      <div><span className="text-[8px] text-white/30">LNG</span><p>{namingPOI.lng.toFixed(6)}°</p></div>
                      <div><span className="text-[8px] text-white/30">ALT</span><p>{formatAlt(namingPOI.alt)}</p></div>
                    </div>
                  </div>
                  <input
                    type="text" autoFocus value={poiName}
                    onChange={(e) => setPoiName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && poiName.trim()) confirmPOI(); if (e.key === "Escape") setNamingPOI(null); }}
                    placeholder="Name this point..."
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-yellow-400/40 placeholder:text-white/20 transition-colors mb-3"
                  />
                  <textarea
                    value={poiDescription} onChange={(e) => setPoiDescription(e.target.value)}
                    placeholder="Description (optional)..." rows={3}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-yellow-400/40 placeholder:text-white/20 transition-colors resize-none"
                  />
                  <div className="flex gap-2 mt-4">
                    <button onClick={confirmPOI} disabled={!poiName.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded-xl text-sm font-medium text-yellow-400 hover:bg-yellow-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <Check className="w-4 h-4" /> Save Point
                    </button>
                    <button onClick={() => setNamingPOI(null)}
                      className="px-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white/50 hover:text-white/70 transition-colors">
                      Cancel
                    </button>
                  </div>
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── MODEL PLACEMENT DIALOG ── */}
          <AnimatePresence>
            {pendingPlacement && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-md px-4"
              >
                <GlassPanel className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Paintbrush className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Place 3D Model</h3>
                  </div>

                  {/* Coordinates */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-4">
                    <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Placement Location</p>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono text-white/70">
                      <div><span className="text-[8px] text-white/30">LAT</span><p>{pendingPlacement.lat.toFixed(6)}°</p></div>
                      <div><span className="text-[8px] text-white/30">LNG</span><p>{pendingPlacement.lng.toFixed(6)}°</p></div>
                      <div><span className="text-[8px] text-white/30">ALT</span><p>{formatAlt(pendingPlacement.alt)}</p></div>
                    </div>
                  </div>

                  {/* File Upload */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-xl p-4 mb-4 cursor-pointer transition-colors text-center ${
                      modelFile
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-white/[0.1] bg-white/[0.02] hover:border-emerald-500/30"
                    }`}
                  >
                    {modelFile ? (
                      <div className="flex items-center gap-3 justify-center">
                        <Box className="w-5 h-5 text-emerald-400" />
                        <div className="text-left">
                          <p className="text-sm text-white font-medium truncate max-w-[200px]">{modelFile.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-white/30">{(modelFile.size / 1024 / 1024).toFixed(2)} MB</p>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                              getFormatCategory(modelFile.name) === "native" ? "bg-emerald-500/20 text-emerald-400" :
                              getFormatCategory(modelFile.name) === "convertible" ? "bg-amber-500/20 text-amber-400" :
                              "bg-red-500/20 text-red-400"
                            }`}>
                              {getFormatLabel(modelFile.name)}
                              {getFormatCategory(modelFile.name) === "convertible" && " → glTF"}
                              {getFormatCategory(modelFile.name) === "unsupported" && " ⚠"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-white/20 mx-auto mb-2" />
                        <p className="text-sm text-white/40">Upload 3D Model</p>
                        <p className="text-[10px] text-white/20 mt-1 leading-relaxed">
                          glTF · OBJ · FBX · STL · PLY · DAE · AutoCAD · SketchUp · Blender · Unreal & more
                        </p>
                      </>
                    )}
                    {convertError && (
                      <div className="mt-2 flex items-start gap-2 text-left bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-300">{convertError}</p>
                      </div>
                    )}
                  </div>

                  {/* Model Name */}
                  <input
                    type="text" value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="Model name..."
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400/40 placeholder:text-white/20 transition-colors mb-3"
                  />

                  {/* Scale & Heading Controls */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <Scale className="w-3 h-3 text-white/40" />
                        <p className="text-[9px] text-white/40 uppercase tracking-wider">Scale</p>
                      </div>
                      <input
                        type="range" min="0.1" max="100" step="0.1"
                        value={modelScale}
                        onChange={(e) => setModelScale(parseFloat(e.target.value))}
                        className="w-full accent-emerald-400"
                      />
                      <p className="text-[10px] text-white/50 font-mono text-center">{modelScale}x</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <RotateCcw className="w-3 h-3 text-white/40" />
                        <p className="text-[9px] text-white/40 uppercase tracking-wider">Heading</p>
                      </div>
                      <input
                        type="range" min="0" max="360" step="1"
                        value={modelHeading}
                        onChange={(e) => setModelHeading(parseInt(e.target.value))}
                        className="w-full accent-emerald-400"
                      />
                      <p className="text-[10px] text-white/50 font-mono text-center">{modelHeading}°</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={confirmModelPlacement}
                      disabled={!modelFile || !modelName.trim() || convertingModel}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {convertingModel ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {convertProgress || "Converting..."}</>
                      ) : (
                        <><Check className="w-4 h-4" /> Place Model</>
                      )}
                    </button>
                    <button
                      onClick={() => { setPendingPlacement(null); setModelFile(null); setModelName(""); }}
                      className="px-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white/50 hover:text-white/70 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── TILE BRUSH PANEL (Placed Models) ── */}
          <AnimatePresence>
            {brushPanelOpen && !pendingPlacement && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute top-20 right-4 z-30 w-80"
              >
                <GlassPanel className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Paintbrush className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-bold text-white">Tile Brush</span>
                      <span className="text-[10px] text-white/30 font-mono">({placedModels.length})</span>
                    </div>
                    <button onClick={() => { setBrushPanelOpen(false); setBrushMode(false); }}>
                      <X className="w-4 h-4 text-white/40 hover:text-white" />
                    </button>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 mb-3">
                    <p className="text-[10px] text-emerald-400/80 leading-relaxed">
                      <span className="font-bold">Double-click</span> anywhere on the globe to select a tile position, then upload a 3D model (GLB/glTF) to place it there.
                    </p>
                  </div>

                  {placedModels.length === 0 ? (
                    <div className="text-center py-6">
                      <Box className="w-8 h-8 text-white/10 mx-auto mb-2" />
                      <p className="text-xs text-white/30">No models placed yet</p>
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {placedModels.map((model) => (
                        <div key={model.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] group transition-colors">
                          <Box className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{model.name}</p>
                            <p className="text-[10px] text-white/30 font-mono">
                              {model.lat.toFixed(4)}, {model.lng.toFixed(4)} · {model.scale}x
                            </p>
                            <p className="text-[10px] text-white/20 truncate">{model.fileName}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => flyToModel(model)}
                              className="p-1 rounded-lg text-white/20 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                              title="Fly to"
                            >
                              <Move className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteModel(model.id)}
                              className="p-1 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* POI Detail View */}
          <AnimatePresence>
            {selectedPOI && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute top-20 right-4 z-30 w-96"
              >
                <GlassPanel className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-yellow-400 shrink-0" />
                      <h3 className="text-sm font-bold text-white">{selectedPOI.name}</h3>
                    </div>
                    <button onClick={() => { setSelectedPOI(null); setEditingNotes(false); }}>
                      <X className="w-4 h-4 text-white/40 hover:text-white" />
                    </button>
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-3">
                    <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Coordinates</p>
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono text-white/80">
                      <div><span className="text-[8px] text-white/30 block">LATITUDE</span>{formatCoord(selectedPOI.lat, true)}</div>
                      <div><span className="text-[8px] text-white/30 block">LONGITUDE</span>{formatCoord(selectedPOI.lng, false)}</div>
                      <div><span className="text-[8px] text-white/30 block">ELEVATION</span>{formatAlt(selectedPOI.alt)}</div>
                    </div>
                  </div>
                  {selectedPOI.description && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-3">
                      <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Description</p>
                      <p className="text-xs text-white/70 leading-relaxed">{selectedPOI.description}</p>
                    </div>
                  )}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[9px] text-white/40 uppercase tracking-wider flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Notes
                      </p>
                      {!editingNotes ? (
                        <button onClick={() => { setEditingNotes(true); setEditNotesValue(selectedPOI.notes); }}
                          className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors">
                          <Edit3 className="w-3 h-3" /> {selectedPOI.notes ? "Edit" : "Add"}
                        </button>
                      ) : (
                        <button onClick={saveNotes}
                          className="text-[10px] text-yellow-400/60 hover:text-yellow-400 flex items-center gap-1 transition-colors">
                          <Save className="w-3 h-3" /> Save
                        </button>
                      )}
                    </div>
                    {editingNotes ? (
                      <textarea autoFocus value={editNotesValue}
                        onChange={(e) => setEditNotesValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") setEditingNotes(false); }}
                        rows={4}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-yellow-400/30 placeholder:text-white/20 transition-colors resize-none"
                        placeholder="Add notes..."
                      />
                    ) : (
                      <p className="text-xs text-white/50 leading-relaxed">{selectedPOI.notes || "No notes yet."}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => flyToPOI(selectedPOI)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
                      <Navigation className="w-3.5 h-3.5" /> Fly To
                    </button>
                    <button onClick={() => deletePOI(selectedPOI.id)}
                      className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 hover:bg-red-500/20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[9px] text-white/20 font-mono mt-3 text-center">
                    Created {new Date(selectedPOI.createdAt).toLocaleString()}
                  </p>
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* POI List Panel */}
          <AnimatePresence>
            {poisPanelOpen && !selectedPOI && !brushPanelOpen && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute top-20 right-4 z-30 w-80"
              >
                <GlassPanel className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm font-bold text-white">Interest Points</span>
                      <span className="text-[10px] text-white/30 font-mono">({pois.length})</span>
                    </div>
                    <button onClick={() => setPoisPanelOpen(false)}>
                      <X className="w-4 h-4 text-white/40 hover:text-white" />
                    </button>
                  </div>
                  <p className="text-[10px] text-white/30 mb-3">Double-click anywhere to add a point.</p>
                  {pois.length === 0 ? (
                    <div className="text-center py-8">
                      <Plus className="w-8 h-8 text-white/10 mx-auto mb-2" />
                      <p className="text-xs text-white/30">No points yet</p>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1">
                      {pois.map((poi) => (
                        <div key={poi.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] group transition-colors">
                          <button onClick={() => { setSelectedPOI(poi); setEditingNotes(false); }}
                            className="flex-1 flex items-center gap-3 text-left min-w-0">
                            <MapPin className="w-4 h-4 text-yellow-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{poi.name}</p>
                              <p className="text-[10px] text-white/30 font-mono">{poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}</p>
                              {poi.description && <p className="text-[10px] text-white/20 truncate">{poi.description}</p>}
                            </div>
                          </button>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => flyToPOI(poi)}
                              className="p-1 rounded-lg text-white/20 hover:text-primary hover:bg-primary/10 transition-all" title="Fly to">
                              <Navigation className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deletePOI(poi.id)}
                              className="p-1 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom HUD — Coordinates & Camera Info */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="absolute bottom-0 left-0 right-0 z-20 p-4"
          >
            <div className="flex items-end justify-between gap-4">
              <GlassPanel className="px-4 py-3">
                <div className="flex items-center gap-4">
                  <Crosshair className="w-4 h-4 text-primary shrink-0" />
                  {cursorInfo ? (
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[9px] text-white/30 uppercase tracking-wider">Latitude</p>
                        <p className="text-sm font-mono text-white">{formatCoord(cursorInfo.lat, true)}</p>
                      </div>
                      <div className="w-px h-8 bg-white/10" />
                      <div>
                        <p className="text-[9px] text-white/30 uppercase tracking-wider">Longitude</p>
                        <p className="text-sm font-mono text-white">{formatCoord(cursorInfo.lng, false)}</p>
                      </div>
                      <div className="w-px h-8 bg-white/10" />
                      <div>
                        <p className="text-[9px] text-white/30 uppercase tracking-wider">Elevation</p>
                        <p className="text-sm font-mono text-white">{formatAlt(cursorInfo.alt)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-white/30">Hover over terrain for coordinates</p>
                  )}
                </div>
              </GlassPanel>

              <GlassPanel className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Eye className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[9px] text-white/30 uppercase tracking-wider">Camera Alt</p>
                    <p className="text-sm font-mono text-white">{formatAlt(cameraAlt)}</p>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div>
                    <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Mode</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => switchViewMode("realistic")}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${viewMode === "realistic" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-white/30 hover:text-white/60 border border-transparent"}`}
                      >
                        <span className="flex items-center gap-1"><Satellite className="w-3 h-3" /> Realistic</span>
                      </button>
                      <button
                        onClick={() => switchViewMode("osm")}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${viewMode === "osm" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "text-white/30 hover:text-white/60 border border-transparent"}`}
                      >
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> OSM</span>
                      </button>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </div>
          </motion.div>

          <button
            onClick={() => setHudVisible(false)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-white/20 hover:text-white/50 transition-colors text-[10px] font-mono uppercase tracking-wider"
          >
            Hide HUD
          </button>
        </>
      )}

      {isLoaded && !hudVisible && (
        <button
          onClick={() => setHudVisible(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/40 backdrop-blur-xl border border-white/[0.08] rounded-full px-4 py-2 text-white/40 hover:text-white/70 transition-colors text-xs font-mono"
        >
          Show HUD
        </button>
      )}
    </div>
  );
}
