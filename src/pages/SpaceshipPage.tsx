import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
// CSS-only animations — no framer-motion in this heavy page
import {
  ArrowLeft, Search, MapPin, Mountain, Building2, Navigation,
  Maximize2, Minimize2, Globe, Crosshair, X,
  Eye, Satellite, Trash2, Check, Plane, Anchor, SquareIcon,
  FileText, Edit3, Save, Plus, Paintbrush, Upload, RotateCcw,
  Move, Scale, Box, AlertCircle, Loader2, Route, Clock, Ruler,
  Play, Square as StopIcon, Store, UtensilsCrossed, Hotel, Fuel,
  GraduationCap, Stethoscope, ShoppingCart, Coffee, Ship, Truck, ShoppingBag, Cctv, Film
} from "lucide-react";
import { Layers } from "lucide-react";
import {
  ACCEPT_STRING, convertToGltfBlob, getFormatCategory, getFormatLabel
} from "@/lib/model-converter";
import {
  deleteAtlasModelBlob,
  loadAtlasModelBlob,
  saveAtlasModelBlob,
} from "@/lib/atlas-model-storage";
import { ALL_CARGO_ROUTES, CARGO_CATEGORIES, type CargoRoute, type CargoCategory } from "@/lib/cargo-routes";
import POICard, { type POIData } from "@/components/POICard";
import ModelTransformWidget, { type TransformData } from "@/components/ModelTransformWidget";
import AtlasDeliveryPanel from "@/components/delivery/AtlasDeliveryPanel";
import MarketplaceProductCard from "@/components/atlas/MarketplaceProductCard";
import { fetchMarketplaceProducts, type MarketplaceProduct } from "@/lib/marketplace-products";
import ModelLabelsOverlay, { MODEL_CATEGORIES } from "@/components/atlas/ModelLabelsOverlay";
import AtlasTagsOverlay, { type AtlasTag } from "@/components/atlas/AtlasTagsOverlay";
import {
  amenityToCategoryId,
  clearSelected,
  isSelected as isTagSelected,
  selectedCount as getSelectedCount,
  subscribeSelection,
  toggleSelected,
  type SelectedTag,
} from "@/lib/atlasSelection";
import { Star } from "lucide-react";
import {
  Viewer, Ion, Cartesian3, Math as CesiumMath,
  createWorldTerrainAsync, createOsmBuildingsAsync,
  Cartographic, Color, ScreenSpaceEventHandler, ScreenSpaceEventType,
  defined,
  HeadingPitchRoll, Transforms,
  Cartesian2, Cesium3DTileset,
  PolylineGlowMaterialProperty,
  ClassificationType,
  SceneTransforms,
  BoundingSphere, HeadingPitchRange, Matrix4,
  ClippingPolygon, ClippingPolygonCollection,
  CallbackProperty, ColorMaterialProperty, LabelStyle, HorizontalOrigin, VerticalOrigin,
  HeightReference,
  CameraEventType, KeyboardEventModifier,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import QuickStoreFilter from "@/components/atlas/QuickStoreFilter";
import { useAtlasLevelLayer, type LevelPlacement } from "@/lib/useAtlasLevelLayer";
// Levels live INSIDE the Atlas world. Cesium entities (green box +
// beacon + label from useAtlasLevelLayer) act as the cheap far-LOD
// marker, and AtlasLevelsR3FOverlay fades in the real R3F scene
// (geometry, models, characters, terrain) when the camera is close.
// One open world: the user can fly/drive/walk/train between placements
// without leaving Atlas.
import AtlasLevelsR3FOverlay from "@/components/atlas/AtlasLevelsR3FOverlay";
import LevelInspectorPanel from "@/components/atlas/LevelInspectorPanel";
import EarthContextMenu, { type EarthLoc } from "@/components/atlas/EarthContextMenu";
import type { FileClipboardEntry } from "@/lib/fileClipboard";
import { snapToLevelTile, DEFAULT_LEVEL_SIZE_M, LEVEL_HEIGHT_M } from "@/lib/atlasLevelGeo";
import { toast } from "sonner";
import filterAllPng     from "@/assets/icons/filter-all.png";
import filterFoodPng    from "@/assets/icons/filter-food.png";
import filterCafePng    from "@/assets/icons/filter-cafe.png";
import filterGroceryPng from "@/assets/icons/filter-grocery.png";
import filterShopsPng   from "@/assets/icons/filter-shops.png";
import filterHotelsPng  from "@/assets/icons/filter-hotels.png";
import filterFuelPng    from "@/assets/icons/filter-fuel.png";
import filterHealthPng  from "@/assets/icons/filter-health.png";
import targetPng        from "@/assets/icons/target.png";
import eyePng           from "@/assets/icons/eye.png";

const FilterPng = ({ src, alt, hex }: { src: string; alt: string; hex: string }) => (
  <img
    src={src}
    alt={alt}
    width={20}
    height={20}
    loading="lazy"
    draggable={false}
    className="w-6 h-6 sm:w-6 sm:h-6 object-contain select-none shrink-0"
    style={{ filter: `drop-shadow(0 0 4px ${hex}aa) drop-shadow(0 0 1px ${hex})` }}
  />
);
import IntelligencePanel, { type TrafficCamera, type CameraBounds } from "@/components/atlas/IntelligencePanel";
import CameraViewerPopup from "@/components/atlas/CameraViewerPopup";
import CameraRecordingsGallery from "@/components/atlas/CameraRecordingsGallery";
import SearchResultsPanel from "@/components/atlas/SearchResultsPanel";
import GlyphIcon from "@/components/atlas/GlyphIcon";

/* ── Cesium Token (publishable key) ── */
const CESIUM_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiODhlOTUyMy1kNmE2LTQ3MWUtYTkyNS0zN2QwYzM5YWIwNjciLCJpZCI6MzU0Mjc2LCJpYXQiOjE3NjE1MzQ0OTh9.BvVrQHG_6Ln5TryWETCkQISdSTH8PTSBuZboxLgM45o";

/* ── Types ── */
interface SearchResult {
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
  source?: 'osm' | 'google';
  placeId?: string;
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
  pitch?: number;
  roll?: number;
  scale: number;
  createdAt: number;
  category?: string; // see MODEL_CATEGORIES
  cropRadius?: number; // meters — if >0, crops a circular hole in 3D tilesets under the model
  cropBase?: CropBase;
}

/** Architectural base + editable voxel terrain that fills a cropped tile. */
interface CropBase {
  shape: "circle" | "square";
  wireframe: boolean;
  /** Active terrain brush operation. */
  tool: "raise" | "lower" | "smooth" | "flatten";
  brushRadius: number;   // m
  brushStrength: number; // m per step
  /** Target height (m) used by the flatten tool. */
  flattenHeight: number;
  gridSize: number;      // cells per side (gridSize × gridSize)
  cellSize: number;      // meters per cell (1m default)
  heights: number[];     // length = gridSize * gridSize, meters
}

const DEFAULT_CROP_BASE = (radiusMeters: number): CropBase => {
  const cellSize = 1;
  const gridSize = Math.max(2, Math.ceil((radiusMeters * 2) / cellSize));
  return {
    shape: "circle",
    wireframe: false,
    tool: "raise",
    brushRadius: 4,
    brushStrength: 0.5,
    flattenHeight: 0,
    gridSize,
    cellSize,
    heights: new Array(gridSize * gridSize).fill(0),
  };
};

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
function GlassPanel({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`bg-black/75 backdrop-blur-2xl border border-white/[0.08] rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_16px_40px_rgba(0,0,0,0.5)] ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent rounded-xl pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function getTypeIcon(type: string) {
  switch (type) {
    case "Mountain": return <Mountain className="w-3.5 h-3.5 text-green-400" />;
    case "Port": return <Anchor className="w-3.5 h-3.5 text-blue-400" />;
    case "Airport": return <Plane className="w-3.5 h-3.5 text-cyan-400" />;
    case "Plaza": return <SquareIcon className="w-3.5 h-3.5 text-purple-400" />;
    case "Highway": return <Navigation className="w-3.5 h-3.5 text-orange-400" />;
    case "Landmark": return <Eye className="w-3.5 h-3.5 text-pink-400" />;
    case "Coordinate": return <Crosshair className="w-3.5 h-3.5 text-yellow-400" />;
    case "Restaurant": return <UtensilsCrossed className="w-3.5 h-3.5 text-orange-400" />;
    case "Hotel": return <Hotel className="w-3.5 h-3.5 text-indigo-400" />;
    case "Shop": case "Store": return <Store className="w-3.5 h-3.5 text-emerald-400" />;
    case "Fuel": return <Fuel className="w-3.5 h-3.5 text-red-400" />;
    case "Education": return <GraduationCap className="w-3.5 h-3.5 text-blue-400" />;
    case "Health": return <Stethoscope className="w-3.5 h-3.5 text-red-400" />;
    case "Supermarket": return <ShoppingCart className="w-3.5 h-3.5 text-green-400" />;
    case "Cafe": return <Coffee className="w-3.5 h-3.5 text-amber-400" />;
    case "Business": return <Building2 className="w-3.5 h-3.5 text-sky-400" />;
    case "City": return <Building2 className="w-3.5 h-3.5 text-primary" />;
    default: return <MapPin className="w-3.5 h-3.5 text-primary" />;
  }
}

/* ── Create high-quality pin canvas for billboard ── */
const pinCanvasCache = new Map<string, string>();

// ── Favicon cache for store pins ──────────────────────────────────────────
// Each website resolves to an <img> we draw inside the pin's icon circle.
// Status: 'loading' (in flight), HTMLImageElement (loaded), or 'failed'.
type FaviconState = "loading" | "failed" | HTMLImageElement;
const faviconCache = new Map<string, FaviconState>();
const faviconWaiters = new Map<string, Array<(img: HTMLImageElement | null) => void>>();

function hostFor(website?: string): string | null {
  if (!website) return null;
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
  } catch { return null; }
}

/** Returns the loaded favicon synchronously if cached, otherwise kicks off a
 *  load and invokes onReady when ready (or null on failure). */
function getFavicon(website: string | undefined, onReady?: (img: HTMLImageElement | null) => void): HTMLImageElement | null {
  const host = hostFor(website);
  if (!host) { onReady?.(null); return null; }
  const cached = faviconCache.get(host);
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === "failed") { onReady?.(null); return null; }
  if (onReady) {
    const list = faviconWaiters.get(host) || [];
    list.push(onReady);
    faviconWaiters.set(host, list);
  }
  if (cached === "loading") return null;
  faviconCache.set(host, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.referrerPolicy = "no-referrer";
  img.onload = () => {
    faviconCache.set(host, img);
    (faviconWaiters.get(host) || []).forEach(fn => fn(img));
    faviconWaiters.delete(host);
  };
  img.onerror = () => {
    faviconCache.set(host, "failed");
    (faviconWaiters.get(host) || []).forEach(fn => fn(null));
    faviconWaiters.delete(host);
  };
  // DuckDuckGo's icon service returns `Access-Control-Allow-Origin: *`, so the
  // image loads cleanly under crossOrigin="anonymous" and the canvas/WebGL
  // texture stays untainted. Google's s2/favicons doesn't reliably send CORS
  // headers, which would cause the load to fail and the pin to fall back to
  // the category icon.
  img.src = `https://icons.duckduckgo.com/ip3/${host}.ico`;
  return null;
}

function createPinCanvas(icon: string, name: string, bgColor: string, favicon?: HTMLImageElement | null): string {
  const key = `${icon}|${name}|${bgColor}|${favicon ? (favicon.src) : ""}`;
  if (pinCanvasCache.has(key)) return pinCanvasCache.get(key)!;

  // Parse `r,g,b` out of the incoming `rgba(r,g,b,...)` (handles both
  // closed `rgba(r,g,b,0.75)` and open `rgba(r,g,b,` forms).
  const m = bgColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  const r0 = m ? +m[1] : 56, g0 = m ? +m[2] : 189, b0 = m ? +m[3] : 248;
  const rgba = (a: number) => `rgba(${r0},${g0},${b0},${a})`;

  const dpr = 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // Layout — mirrors ModelLabelsOverlay single-pill style:
  // pl-1.5 pr-2.5 py-1 + 20px circle + 6px gap + 11px text + leader line
  const padL = 6 * dpr;
  const padR = 10 * dpr;
  const padY = 5 * dpr;
  const circleD = 18 * dpr;
  const gap = 6 * dpr;
  const leaderH = 10 * dpr;

  const fontSpec = `500 ${11 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`;
  ctx.font = fontSpec;
  const textWidth = Math.ceil(ctx.measureText(name).width);

  const contentH = circleD;
  const pillH = contentH + padY * 2;
  const pillW = padL + circleD + gap + textWidth + padR;
  const radius = pillH / 2;

  // Extra room on canvas for drop-shadow and leader line.
  const shadowPad = 8 * dpr;
  canvas.width = pillW + shadowPad * 2;
  canvas.height = pillH + leaderH + shadowPad * 2;

  const ox = shadowPad;
  const oy = shadowPad;

  // Soft accent glow under the pill.
  ctx.save();
  ctx.shadowColor = rgba(0.33);
  ctx.shadowBlur = 18 * dpr;
  ctx.shadowOffsetY = 3 * dpr;

  // Rounded pill path.
  ctx.beginPath();
  ctx.moveTo(ox + radius, oy);
  ctx.lineTo(ox + pillW - radius, oy);
  ctx.quadraticCurveTo(ox + pillW, oy, ox + pillW, oy + radius);
  ctx.lineTo(ox + pillW, oy + pillH - radius);
  ctx.quadraticCurveTo(ox + pillW, oy + pillH, ox + pillW - radius, oy + pillH);
  ctx.lineTo(ox + radius, oy + pillH);
  ctx.quadraticCurveTo(ox, oy + pillH, ox, oy + pillH - radius);
  ctx.lineTo(ox, oy + radius);
  ctx.quadraticCurveTo(ox, oy, ox + radius, oy);
  ctx.closePath();

  // Accent-tinted glass fill (matches `${accent}22` in the React overlay).
  ctx.fillStyle = rgba(0.16);
  ctx.fill();
  ctx.restore();

  // Subtle dark backdrop so accent text reads on bright tiles (mimics backdrop-blur).
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "rgba(15,20,28,0.55)";
  ctx.beginPath();
  ctx.moveTo(ox + radius, oy);
  ctx.lineTo(ox + pillW - radius, oy);
  ctx.quadraticCurveTo(ox + pillW, oy, ox + pillW, oy + radius);
  ctx.lineTo(ox + pillW, oy + pillH - radius);
  ctx.quadraticCurveTo(ox + pillW, oy + pillH, ox + pillW - radius, oy + pillH);
  ctx.lineTo(ox + radius, oy + pillH);
  ctx.quadraticCurveTo(ox, oy + pillH, ox, oy + pillH - radius);
  ctx.lineTo(ox, oy + radius);
  ctx.quadraticCurveTo(ox, oy, ox + radius, oy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Accent border (`${accent}66`).
  ctx.strokeStyle = rgba(0.45);
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  ctx.moveTo(ox + radius, oy);
  ctx.lineTo(ox + pillW - radius, oy);
  ctx.quadraticCurveTo(ox + pillW, oy, ox + pillW, oy + radius);
  ctx.lineTo(ox + pillW, oy + pillH - radius);
  ctx.quadraticCurveTo(ox + pillW, oy + pillH, ox + pillW - radius, oy + pillH);
  ctx.lineTo(ox + radius, oy + pillH);
  ctx.quadraticCurveTo(ox, oy + pillH, ox, oy + pillH - radius);
  ctx.lineTo(ox, oy + radius);
  ctx.quadraticCurveTo(ox, oy, ox + radius, oy);
  ctx.closePath();
  ctx.stroke();

  // Accent-tinted icon circle (`${accent}33`).
  const cx = ox + padL + circleD / 2;
  const cy = oy + pillH / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, circleD / 2, 0, Math.PI * 2);
  ctx.fillStyle = favicon ? "#ffffff" : rgba(0.28);
  ctx.fill();

  if (favicon) {
    // Draw the company favicon clipped to the circle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, circleD / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    const s = circleD - 4 * dpr;
    ctx.drawImage(favicon, cx - s / 2, cy - s / 2, s, s);
    ctx.restore();
  } else {
    // Icon glyph — text color matches accent so emoji stays vivid.
    ctx.font = `${12 * dpr}px -apple-system, BlinkMacSystemFont, "Apple Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(1);
    ctx.fillText(icon, cx, cy + 0.5 * dpr);
  }

  // Label — accent color, like the overlay pill.
  ctx.font = fontSpec;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = rgba(1);
  ctx.fillText(name, ox + padL + circleD + gap, cy);

  // Leader line down to the anchor — matches the React overlay.
  const lineX = canvas.width / 2;
  const lineY0 = oy + pillH;
  const lineY1 = lineY0 + leaderH;
  const grad = ctx.createLinearGradient(lineX, lineY0, lineX, lineY1);
  grad.addColorStop(0, rgba(0.7));
  grad.addColorStop(1, rgba(0));
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  ctx.moveTo(lineX, lineY0);
  ctx.lineTo(lineX, lineY1);
  ctx.stroke();

  const dataUrl = canvas.toDataURL("image/png");
  pinCanvasCache.set(key, dataUrl);
  return dataUrl;
}

// ── Golden pin canvas for user-selected stores ─────────────────────────────
// Mirrors createPinCanvas but paints a gold gradient background, gold border
// and bigger glow so selected pins read as "starred" and always-on-top.
const goldenPinCache = new Map<string, string>();
function createGoldenPinCanvas(icon: string, name: string, favicon?: HTMLImageElement | null): string {
  const key = `gold|${icon}|${name}|${favicon ? favicon.src : ""}`;
  if (goldenPinCache.has(key)) return goldenPinCache.get(key)!;

  const dpr = 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const padL = 6 * dpr, padR = 10 * dpr, padY = 5 * dpr;
  const circleD = 20 * dpr;       // slightly larger than the regular pin
  const gap = 6 * dpr;
  const leaderH = 10 * dpr;
  const fontSpec = `600 ${11 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`;
  ctx.font = fontSpec;
  const textWidth = Math.ceil(ctx.measureText(name).width);
  const contentH = circleD;
  const pillH = contentH + padY * 2;
  const pillW = padL + circleD + gap + textWidth + padR + 8 * dpr; // room for star
  const radius = pillH / 2;

  const shadowPad = 12 * dpr;
  canvas.width = pillW + shadowPad * 2;
  canvas.height = pillH + leaderH + shadowPad * 2;

  const ox = shadowPad, oy = shadowPad;

  const pill = () => {
    ctx.beginPath();
    ctx.moveTo(ox + radius, oy);
    ctx.lineTo(ox + pillW - radius, oy);
    ctx.quadraticCurveTo(ox + pillW, oy, ox + pillW, oy + radius);
    ctx.lineTo(ox + pillW, oy + pillH - radius);
    ctx.quadraticCurveTo(ox + pillW, oy + pillH, ox + pillW - radius, oy + pillH);
    ctx.lineTo(ox + radius, oy + pillH);
    ctx.quadraticCurveTo(ox, oy + pillH, ox, oy + pillH - radius);
    ctx.lineTo(ox, oy + radius);
    ctx.quadraticCurveTo(ox, oy, ox + radius, oy);
    ctx.closePath();
  };

  // Gold glow
  ctx.save();
  ctx.shadowColor = "rgba(255,215,0,0.55)";
  ctx.shadowBlur = 22 * dpr;
  ctx.shadowOffsetY = 3 * dpr;
  pill();
  const grad = ctx.createLinearGradient(ox, oy, ox, oy + pillH);
  grad.addColorStop(0, "#FFE56A");
  grad.addColorStop(1, "#B8860B");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Gold border
  pill();
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();

  // Icon circle (white bg if favicon, else dark for emoji contrast)
  const cx = ox + padL + circleD / 2;
  const cy = oy + pillH / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, circleD / 2, 0, Math.PI * 2);
  ctx.fillStyle = favicon ? "#ffffff" : "rgba(26,19,0,0.55)";
  ctx.fill();
  if (favicon) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, circleD / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    const s = circleD - 4 * dpr;
    ctx.drawImage(favicon, cx - s / 2, cy - s / 2, s, s);
    ctx.restore();
  } else {
    ctx.font = `${13 * dpr}px -apple-system, BlinkMacSystemFont, "Apple Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(icon, cx, cy + 0.5 * dpr);
  }

  // Name label — deep brown for contrast on gold.
  ctx.font = fontSpec;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1a1300";
  ctx.fillText(name, ox + padL + circleD + gap, cy);

  // Tiny star glyph at far right.
  ctx.font = `${11 * dpr}px -apple-system, BlinkMacSystemFont, "Apple Color Emoji", sans-serif`;
  ctx.fillStyle = "#1a1300";
  ctx.fillText("★", ox + pillW - padR - 4 * dpr, cy);

  // Leader line.
  const lineX = canvas.width / 2;
  const lineY0 = oy + pillH;
  const lineY1 = lineY0 + leaderH;
  const g2 = ctx.createLinearGradient(lineX, lineY0, lineX, lineY1);
  g2.addColorStop(0, "rgba(255,215,0,0.8)");
  g2.addColorStop(1, "rgba(255,215,0,0)");
  ctx.strokeStyle = g2;
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(lineX, lineY0);
  ctx.lineTo(lineX, lineY1);
  ctx.stroke();

  const url = canvas.toDataURL("image/png");
  goldenPinCache.set(key, url);
  return url;
}

function flyCameraToTarget(
  viewer: Viewer | null,
  target: { lat: number; lng: number; alt?: number },
  options: { range?: number; pitchDeg?: number; headingDeg?: number; duration?: number; radius?: number } = {}
) {
  if (!viewer || viewer.isDestroyed()) return;
  viewer.trackedEntity = undefined;
  viewer.selectedEntity = undefined;

  const targetAltitude = Math.max(target.alt ?? 0, 0) + 8;
  const center = Cartesian3.fromDegrees(target.lng, target.lat, targetAltitude);
  const sphere = new BoundingSphere(center, options.radius ?? 80);
  const offset = new HeadingPitchRange(
    CesiumMath.toRadians(options.headingDeg ?? 0),
    CesiumMath.toRadians(options.pitchDeg ?? -38),
    options.range ?? 1800
  );

  viewer.camera.flyToBoundingSphere(sphere, {
    offset,
    duration: options.duration ?? 1.6,
    complete: () => {
      if (viewer.isDestroyed()) return;
      const position = viewer.camera.positionWC.clone();
      const direction = viewer.camera.directionWC.clone();
      const up = viewer.camera.upWC.clone();
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      viewer.camera.setView({ destination: position, orientation: { direction, up } });
    },
  });
}

const OVERPASS_ENDPOINTS = [
  // Ordered by observed reliability — first non-empty response wins.
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function fetchOverpassJson(query: string, signal?: AbortSignal): Promise<any | null> {
  let lastOkEmpty: any = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      // Some mirrors respond 200 with an empty payload due to stale/broken
      // index. Prefer the first mirror that returns actual data; only fall
      // back to an empty payload after every mirror has been tried.
      if ((json?.elements?.length ?? 0) > 0) return json;
      lastOkEmpty ??= json;
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
    }
  }
  return lastOkEmpty;
}

/* ── Main Spaceship Component ── */
function SpaceshipPage() {
  const cesiumContainer = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  // Restore previously persisted UI state (if any)
  const savedUI = (() => {
    try { return JSON.parse(localStorage.getItem("atlas_ui") || "{}"); } catch { return {}; }
  })();
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // LEVEL placements on Atlas — click a pin to play the Level in-place
  // Levels render directly in the same world as the globe via
  // AtlasLevelsR3FOverlay — clicking a pin just flies the camera there,
  // there is no separate "open level" modal anymore. Earth + level share
  // one coordinate system so the user can walk in and out of levels.
  const { placements: levelPlacements } = useAtlasLevelLayer(
    viewerRef,
    isLoaded,
    useCallback((p: LevelPlacement) => {
      setSelectedLevelPlacement(p);
    }, []),
  );
  // Inspector panel: clicking a placed Level opens this floating panel
  // with info, control bars (heading/scale/altitude), Main Character
  // read-out, and ▶ Play / Edit / Delete actions.
  const [selectedLevelPlacement, setSelectedLevelPlacement] =
    useState<LevelPlacement | null>(null);
  // Keep the inspector's placement in sync with the latest list (after
  // slider edits / refreshes).
  useEffect(() => {
    if (!selectedLevelPlacement) return;
    const fresh = levelPlacements.find((p) => p.id === selectedLevelPlacement.id);
    if (fresh && fresh !== selectedLevelPlacement) setSelectedLevelPlacement(fresh);
    if (!fresh) setSelectedLevelPlacement(null);
  }, [levelPlacements, selectedLevelPlacement]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cursorInfo, setCursorInfo] = useState<CursorInfo | null>(null);
  const [showBuildings, setShowBuildings] = useState<boolean>(savedUI.showBuildings ?? true);
  const [viewMode, setViewMode] = useState<"realistic" | "osm">(savedUI.viewMode ?? "realistic");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudVisible, setHudVisible] = useState<boolean>(savedUI.hudVisible ?? true);
  const [cameraAlt, setCameraAlt] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pois, setPois] = useState<POI[]>(loadPOIs);
  const [namingPOI, setNamingPOI] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const [earthMenu, setEarthMenu] = useState<{ x: number; y: number; loc: EarthLoc } | null>(null);
  // When set, the user is previewing a level placement; double-clicks move the ghost cube.
  const [pendingLevelPlacement, setPendingLevelPlacement] = useState<{
    levelId: string;
    levelName: string;
    sizeM: number;
    loc: EarthLoc | null;
    heading: number;
  } | null>(null);
  const pendingLevelPlacementRef = useRef<typeof pendingLevelPlacement>(null);
  useEffect(() => { pendingLevelPlacementRef.current = pendingLevelPlacement; }, [pendingLevelPlacement]);

  // Ghost preview cube for pending level placement.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !pendingLevelPlacement?.loc) return;
    const { loc, sizeM, heading } = pendingLevelPlacement;
    const snap = snapToLevelTile(loc.lat, loc.lng, sizeM);
    const size = snap.tileSizeM;
    const center = Cartesian3.fromDegrees(snap.lng, snap.lat, (loc.alt ?? 0) + LEVEL_HEIGHT_M / 2);
    const hpr = new HeadingPitchRoll(CesiumMath.toRadians(heading ?? 0), 0, 0);
    const orientation = Transforms.headingPitchRollQuaternion(center as any, hpr);
    const ent = viewer.entities.add({
      id: "pending-level-ghost",
      position: center as any,
      orientation: orientation as any,
      box: {
        dimensions: new Cartesian3(size, size, LEVEL_HEIGHT_M) as any,
        material: Color.fromCssColorString("#22c55e").withAlpha(0.35) as any,
        outline: true,
        outlineColor: Color.fromCssColorString("#86efac") as any,
        outlineWidth: 3,
      } as any,
      label: {
        text: `Preview — ${pendingLevelPlacement.levelName} · ${Math.round(heading ?? 0)}°`,
        font: "12px Inter, sans-serif",
        pixelOffset: new Cartesian2(0, -8),
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Color.fromCssColorString("rgba(15,23,42,0.85)"),
      } as any,
    });
    return () => { try { viewer.entities.remove(ent); } catch {} };
  }, [pendingLevelPlacement]);

  const confirmLevelPlacement = useCallback(async () => {
    const p = pendingLevelPlacement;
    if (!p?.loc) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) { toast.error("Sign in to place a level"); return; }
    const { error } = await supabase.from("atlas_level_placements").insert({
      owner_id: uid,
      level_id: p.levelId,
      lat: p.loc.lat,
      lng: p.loc.lng,
      altitude: Math.max(0, p.loc.alt),
      heading: p.heading ?? 0,
      scale: 1,
    });
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    window.dispatchEvent(new CustomEvent("atlas-level-placements-refresh"));
    toast.success(`Loaded "${p.levelName}" here`);
    setPendingLevelPlacement(null);
    // Fly the camera to the new placement so the user sees the cube immediately.
    try {
      viewerRef.current?.camera.flyTo({
        destination: Cartesian3.fromDegrees(p.loc.lng, p.loc.lat, 1500),
        duration: 1.2,
      });
    } catch {}
  }, [pendingLevelPlacement]);
  const [poiName, setPoiName] = useState("");
  const [poiDescription, setPoiDescription] = useState("");
  const [poisPanelOpen, setPoisPanelOpen] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editNotesValue, setEditNotesValue] = useState("");

  // Tile Brush state
  const [brushMode, setBrushMode] = useState<boolean>(savedUI.brushMode ?? false);
  const [brushPanelOpen, setBrushPanelOpen] = useState<boolean>(savedUI.brushPanelOpen ?? false);
  // Targeting Brush sub-modes:
  //   reticle — live single-point info HUD
  //   area    — paint a circular zone, scan & export
  //   stamp   — load a model once, click to stamp many times
  //   tiles   — Web Mercator XYZ tile selection (grid/rect/lasso)
  type BrushSubMode = "reticle" | "area" | "stamp" | "tiles";
  const [brushSubMode, setBrushSubMode] = useState<BrushSubMode>(savedUI.brushSubMode ?? "stamp");
  const [placedModels, setPlacedModels] = useState<PlacedModel[]>(loadPlacedModels);
  const [pendingPlacement, setPendingPlacement] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [convertingModel, setConvertingModel] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertProgress, setConvertProgress] = useState<string>("");
  const [modelScale, setModelScale] = useState(1);
  const [modelHeading, setModelHeading] = useState(0);
  const [modelCategory, setModelCategory] = useState<string>("other");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelUrlsRef = useRef<Map<string, string>>(new Map());
  const restoringModelIdsRef = useRef<Set<string>>(new Set());
  const brushIndicatorRef = useRef<any>(null);
  const pendingPlacementRef = useRef<{ lat: number; lng: number; alt: number } | null>(null);
  const [draggingModelId, setDraggingModelId] = useState<string | null>(null); // used for UI indicator
  const draggingRef = useRef<string | null>(null);

  // Stamp-mode loaded model (persists across stamps so dialog opens only once)
  const stampModelRef = useRef<{
    blobUrl: string;
    fileName: string;
    name: string;
    baseScale: number;
    baseHeading: number;
    category?: string;
  } | null>(null);
  const [stampModelInfo, setStampModelInfo] = useState<{ name: string; fileName: string } | null>(null);
  const [stampSpacingM, setStampSpacingM] = useState(0);
  const lastStampRef = useRef<{ lat: number; lng: number } | null>(null);

  // Area-mode state
  const areaEntityRef = useRef<any>(null);
  const [areaCenter, setAreaCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [areaRadiusM, setAreaRadiusM] = useState(250);
  const [areaScanning, setAreaScanning] = useState(false);
  const [areaScanResults, setAreaScanResults] = useState<SearchResult[]>([]);

  // Reticle-mode locked target
  const [reticleTarget, setReticleTarget] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const brushSubModeRef = useRef<BrushSubMode>("stamp");

  // ── Tiles-mode state ──
  // Web Mercator (XYZ / "slippy") tiles. Zoom 18 ≈ building-scale.
  type TileKey = string; // `${z}/${x}/${y}`
  type TilesTool = "grid" | "rectangle" | "lasso";
  type TilesToolExt = TilesTool | "terrain";
  const [tilesTool, setTilesTool] = useState<TilesToolExt>(savedUI.tilesTool ?? "grid");
  const [tileZoom, setTileZoom] = useState<number>(savedUI.tileZoom ?? 18);
  const [selectedTiles, setSelectedTiles] = useState<Set<TileKey>>(new Set());
  const [rectStart, setRectStart] = useState<{ lat: number; lng: number } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [tilesScanning, setTilesScanning] = useState(false);
  const [tilesScanResults, setTilesScanResults] = useState<SearchResult[]>([]);
  const tileEntitiesRef = useRef<Map<TileKey, any>>(new Map());
  const lassoEntityRef = useRef<any>(null);
  const tilesToolRef = useRef<TilesToolExt>("grid");
  useEffect(() => { tilesToolRef.current = tilesTool; }, [tilesTool]);

  // Model transform editing state
  const [editingModel, setEditingModel] = useState<PlacedModel | null>(null);

  // Uber Direct Delivery panel state
  const [deliveryPanelOpen, setDeliveryPanelOpen] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  const [activeCamera, setActiveCamera] = useState<TrafficCamera | null>(null);
  const [deliveryPickupPrefill, setDeliveryPickupPrefill] = useState<{ address: string; lat?: number; lng?: number } | undefined>(undefined);

  // Marketplace pins state
  const [showMarketplacePins, setShowMarketplacePins] = useState<boolean>(savedUI.showMarketplacePins ?? false);
  const [selectedMarketplaceProduct, setSelectedMarketplaceProduct] = useState<MarketplaceProduct | null>(null);
  const marketplaceEntitiesRef = useRef<any[]>([]);
  // Bumps whenever loaded atlas tags (businesses, marketplace) change so the
  // unified cluster overlay re-derives its tag list.
  const [tagsVersion, setTagsVersion] = useState(0);
  // Reactive count for the "Selected (n)" chip.
  const [selectedCount, setSelectedCount] = useState(getSelectedCount());
  useEffect(() => subscribeSelection(() => setSelectedCount(getSelectedCount())), []);

  // ── Pin ground-clamping helper ─────────────────────────────────────────────
  // In "realistic" mode the globe terrain is hidden and Google Photorealistic
  // 3D Tiles are the only visible surface — Cesium's CLAMP_TO_GROUND falls
  // back to sea level there, dropping pins under buildings. CLAMP_TO_3D_TILE
  // anchors them to the photogrammetry top instead.
  const viewModeRef = useRef<"realistic" | "osm">("realistic");
  const pinHeightRef = useCallback(() => (
    viewModeRef.current === "realistic"
      ? HeightReference.CLAMP_TO_3D_TILE
      : HeightReference.CLAMP_TO_GROUND
  ), []);

  // ── Surface-snap helper ────────────────────────────────────────────────────
  // CLAMP_TO_3D_TILE / CLAMP_TO_GROUND can only place the pin on the surface
  // *after* the tile at that coordinate has streamed in. While the tile is
  // still loading the billboard sits at h=0 (sea level), which on photo-
  // grammetry buildings or elevated terrain looks like the pin is buried
  // INSIDE the planet. To prevent that, we hide each pin on creation, ask
  // Cesium to load the most-detailed tiles at the pin's (lng,lat) and sample
  // the resulting height, then place the pin exactly on top of that surface
  // with a tiny upward offset before showing it. If the sample fails we still
  // reveal the pin using the heightReference clamp so we never leave it
  // permanently hidden.
  const clampPinToSurface = useCallback((entity: any, lng: number, lat: number) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !entity) return;
    entity.show = false;
    const carto = Cartographic.fromDegrees(lng, lat);
    const reveal = (height: number | null) => {
      if (!viewer || viewer.isDestroyed()) return;
      if (typeof height === "number" && isFinite(height)) {
        // +0.5m lift so the billboard's base sits ABOVE the tile surface,
        // never co-planar with (or below) it.
        entity.position = Cartesian3.fromDegrees(lng, lat, height + 0.5);
      }
      entity.show = true;
      viewer.scene.requestRender?.();
    };
    try {
      const p = (viewer.scene as any).sampleHeightMostDetailed?.([carto]);
      if (p && typeof p.then === "function") {
        p.then((arr: Cartographic[]) => {
          const h = arr?.[0]?.height;
          reveal(typeof h === "number" ? h : null);
        }).catch(() => reveal(null));
      } else {
        // Fallback: synchronous sampleHeight against currently-loaded tiles.
        const h = (viewer.scene as any).sampleHeight?.(carto);
        reveal(typeof h === "number" ? h : null);
      }
    } catch {
      reveal(null);
    }
  }, []);

  // Re-anchor every existing pin billboard when the view mode toggles.
  useEffect(() => {
    viewModeRef.current = viewMode;
    const hr = viewMode === "realistic"
      ? HeightReference.CLAMP_TO_3D_TILE
      : HeightReference.CLAMP_TO_GROUND;
    const refs = [
      businessEntitiesRef, marketplaceEntitiesRef,
      cameraEntitiesRef, searchResultEntitiesRef,
    ];
    refs.forEach(ref => {
      ref.current?.forEach((e: any) => {
        if (e?.billboard) e.billboard.heightReference = hr;
      });
    });
    viewerRef.current?.scene.requestRender?.();
  }, [viewMode]);
  const cameraEntitiesRef = useRef<any[]>([]);
  const [mapCameras, setMapCameras] = useState<TrafficCamera[]>([]);

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

  // Unified search (nearest-first, OSM Overpass + Nominatim, unlimited)
  const [unifiedResults, setUnifiedResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [hoveredResultIdx, setHoveredResultIdx] = useState<number | null>(null);
  const [activeSearchCategory, setActiveSearchCategory] = useState<string>("");
  const searchResultEntitiesRef = useRef<any[]>([]);

  // Cargo routes state
  const [showCargoRoutes, setShowCargoRoutes] = useState(false);
  const [cargoFilter, setCargoFilter] = useState<"all" | "maritime" | "air">("all");
  const [cargoTypeFilter, setCargoTypeFilter] = useState<CargoCategory | "all">("all");
  const [selectedRoute, setSelectedRoute] = useState<CargoRoute | null>(null);
  const cargoEntitiesRef = useRef<any[]>([]);

  // Business/Store icons toggle
  const [showBusinessIcons, setShowBusinessIcons] = useState<boolean>(savedUI.showBusinessIcons ?? false);
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(false);
  const businessEntitiesRef = useRef<any[]>([]);
  const businessLoadedAreaRef = useRef<string>("");
  const businessDataRef = useRef<Map<string, POIData>>(new Map());
  const [selectedBusiness, setSelectedBusiness] = useState<POIData | null>(null);
  const instantBusinessAbortRef = useRef<AbortController | null>(null);

  // Real-time aircraft & ship tracking
  const [showLiveTraffic, setShowLiveTraffic] = useState<boolean>(savedUI.showLiveTraffic ?? false);
  const [liveTrafficStats, setLiveTrafficStats] = useState({ planes: 0, ships: 0 });
  const liveTrafficEntitiesRef = useRef<any[]>([]);
  const liveTrafficTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aisWebSocketRef = useRef<WebSocket | null>(null);
  const liveShipsRef = useRef<Map<string, { lat: number; lng: number; speed: number; heading: number; name: string; type: number; country: string; mmsi: string; lastUpdate: number }>>(new Map());

  // ── Geofencing Panel State ──
  const [geofencingOpen, setGeofencingOpen] = useState(false);
  const [geoCenter, setGeoCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLocationName, setGeoLocationName] = useState("Use camera position");
  const [geoRadiusKm, setGeoRadiusKm] = useState(5);
  const [geoCategory, setGeoCategory] = useState<string>(savedUI.geoCategory ?? "all");
  const [geoSearchQuery, setGeoSearchQuery] = useState("");
  const [geoBusinesses, setGeoBusinesses] = useState<any[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoShowRadius, setGeoShowRadius] = useState(false);
  const geoAbortRef = useRef<AbortController | null>(null);

  // Persist UI state so the app reloads exactly where the user left it.
  useEffect(() => {
    try {
      localStorage.setItem("atlas_ui", JSON.stringify({
        showBuildings, viewMode, hudVisible,
        brushMode, brushPanelOpen, brushSubMode,
        tilesTool, tileZoom,
        showBusinessIcons, showLiveTraffic, geoCategory,
        showMarketplacePins,
      }));
    } catch {}
  }, [
    showBuildings, viewMode, hudVisible,
    brushMode, brushPanelOpen, brushSubMode,
    tilesTool, tileZoom,
    showBusinessIcons, showLiveTraffic, geoCategory,
    showMarketplacePins,
  ]);

  const GEO_CATEGORIES = [
    { key: "all",         label: "All",     icon: <FilterPng src={filterAllPng}     alt="All"     hex="#94a3b8" />, color: "slate",   hex: "#94a3b8" },
    { key: "restaurant",  label: "Food",    icon: <FilterPng src={filterFoodPng}    alt="Food"    hex="#fb7185" />, color: "rose",    hex: "#fb7185" },
    { key: "cafe",        label: "Café",    icon: <FilterPng src={filterCafePng}    alt="Cafe"    hex="#f59e0b" />, color: "amber",   hex: "#f59e0b" },
    { key: "supermarket", label: "Grocery", icon: <FilterPng src={filterGroceryPng} alt="Grocery" hex="#34d399" />, color: "emerald", hex: "#34d399" },
    { key: "shop",        label: "Shops",   icon: <FilterPng src={filterShopsPng}   alt="Shops"   hex="#a78bfa" />, color: "violet",  hex: "#a78bfa" },
    { key: "hotel",       label: "Hotels",  icon: <FilterPng src={filterHotelsPng}  alt="Hotels"  hex="#38bdf8" />, color: "sky",     hex: "#38bdf8" },
    { key: "fuel",        label: "Fuel",    icon: <FilterPng src={filterFuelPng}    alt="Fuel"    hex="#fb923c" />, color: "orange",  hex: "#fb923c" },
    { key: "health",      label: "Health",  icon: <FilterPng src={filterHealthPng}  alt="Health"  hex="#2dd4bf" />, color: "teal",    hex: "#2dd4bf" },
  ];
  const GEO_RADIUS_OPTIONS = [1, 3, 5, 10, 25, 50];

  const geoHaversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /* ── Web Mercator XYZ tile math (matches OSM / slippy tiles) ── */
  const lngLatToTile = (lat: number, lng: number, z: number) => {
    const n = Math.pow(2, z);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
  };
  const tileToLngLat = (x: number, y: number, z: number) => {
    const n = Math.pow(2, z);
    const lng = (x / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
    return { lng, lat: (latRad * 180) / Math.PI };
  };
  const tileBounds = (x: number, y: number, z: number) => {
    const nw = tileToLngLat(x, y, z);
    const se = tileToLngLat(x + 1, y + 1, z);
    return { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng };
  };
  const tileSizeMeters = (lat: number, z: number) =>
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
  const tileKey = (z: number, x: number, y: number): string => `${z}/${x}/${y}`;
  const parseTileKey = (k: string) => {
    const [z, x, y] = k.split("/").map(Number);
    return { z, x, y };
  };
  // Ray-cast point-in-polygon (lng/lat)
  const pointInPoly = (lat: number, lng: number, poly: { lat: number; lng: number }[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].lng, yi = poly[i].lat;
      const xj = poly[j].lng, yj = poly[j].lat;
      const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const geoClassify = (tags: Record<string, string>) => {
    const a = tags.amenity || "", s = tags.shop || "", t = tags.tourism || "", h = tags.healthcare || "";
    if (a === "restaurant" || a === "fast_food") return "🍽️ Restaurant";
    if (a === "cafe") return "☕ Café";
    if (a === "fuel" || a === "charging_station") return "⛽ Fuel";
    if (a === "hospital" || a === "pharmacy" || a === "clinic" || a === "doctors" || a === "dentist" || h) return "🏥 Health";
    if (a === "school" || a === "university") return "🎓 Education";
    if (a === "bank") return "🏦 Bank";
    if (s === "supermarket" || s === "convenience" || s === "grocery" || s === "department_store" || s === "general") return "🛒 Grocery";
    if (t === "hotel" || t === "motel" || t === "hostel" || t === "guest_house") return "🏨 Hotel";
    if (s) return "🏪 Shop";
    return "📍 Business";
  };

  const fetchGeofencedBusinesses = useCallback(async (center: { lat: number; lng: number }) => {
    if (geoAbortRef.current) geoAbortRef.current.abort();
    const controller = new AbortController();
    geoAbortRef.current = controller;
    setGeoLoading(true);

    const degR = geoRadiusKm / 111;
    const bbox = `${(center.lat - degR).toFixed(5)},${(center.lng - degR).toFixed(5)},${(center.lat + degR).toFixed(5)},${(center.lng + degR).toFixed(5)}`;
    let filter = "";
    switch (geoCategory) {
      case "restaurant": filter = `nwr["amenity"~"restaurant|fast_food"](${bbox});`; break;
      case "cafe": filter = `nwr["amenity"="cafe"](${bbox});`; break;
      case "hotel": filter = `nwr["tourism"~"hotel|motel|hostel|guest_house"](${bbox});`; break;
      case "fuel": filter = `nwr["amenity"~"fuel|charging_station"](${bbox});`; break;
      case "health": filter = `nwr["amenity"~"hospital|pharmacy|clinic|doctors|dentist"](${bbox});nwr["healthcare"](${bbox});`; break;
      case "supermarket": filter = `nwr["shop"~"supermarket|convenience|grocery|department_store|general"](${bbox});`; break;
      case "shop": filter = `nwr["shop"](${bbox});`; break;
      default: filter = `nwr["shop"](${bbox});nwr["amenity"~"restaurant|cafe|fast_food|fuel|pharmacy|bank|hospital|clinic|doctors"](${bbox});nwr["tourism"~"hotel|motel"](${bbox});nwr["healthcare"](${bbox});`;
    }
      const limit = geoRadiusKm <= 5 ? 300 : 160;
    const q = `[out:json][timeout:15];(${filter});out center ${limit};`;
    try {
      const data = await fetchOverpassJson(q, controller.signal);
      if (!data) throw new Error("API error");
      const results = (data.elements || [])
        .filter((el: any) => el.tags?.name && (el.lat || el.center?.lat))
        .map((el: any) => {
          const tags = el.tags || {};
          const elLat = el.lat || el.center?.lat;
          const elLng = el.lon || el.center?.lon;
          return {
            id: el.id, name: tags.name, lat: elLat, lng: elLng,
            type: geoClassify(tags),
            address: [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean).join(" ") || "",
            distance: geoHaversine(center.lat, center.lng, elLat, elLng),
            phone: tags.phone || tags["contact:phone"] || "",
            website: tags.website || tags["contact:website"] || "",
            brand: tags.brand || "",
            cuisine: tags.cuisine || "",
            openNow: tags.opening_hours === "24/7" ? true : undefined,
          };
        })
        .filter((b: any) => b.distance <= geoRadiusKm)
        .sort((a: any, b: any) => a.distance - b.distance);
      setGeoBusinesses(results);
    } catch (e: any) {
      if (e.name !== "AbortError") setGeoBusinesses([]);
    }
    setGeoLoading(false);
  }, [geoRadiusKm, geoCategory]);

  const geoLocateUser = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoCenter(loc);
        // Fly to user
        const viewer = viewerRef.current;
        if (viewer && !viewer.isDestroyed()) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(loc.lng, loc.lat, 2000),
            orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(-45), roll: 0 },
            duration: 2,
          });
        }
        try {
          const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lng}&format=json`, { headers: { "Accept-Language": "en" } });
          const data = await resp.json();
          setGeoLocationName(data.display_name?.split(",").slice(0, 2).join(",") || "Your Location");
        } catch { setGeoLocationName("Your Location"); }
        fetchGeofencedBusinesses(loc);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [fetchGeofencedBusinesses]);

  const geofenceFromCamera = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const cam = viewer.camera.positionCartographic;
    const loc = { lat: CesiumMath.toDegrees(cam.latitude), lng: CesiumMath.toDegrees(cam.longitude) };
    setGeoCenter(loc);
    setGeoLocationName(`${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
    fetchGeofencedBusinesses(loc);
  }, [fetchGeofencedBusinesses]);

  // Re-fetch geofence panel data ONLY when the geofence panel is open.
  // The search dropdown drives its own results via runUnifiedSearch.
  useEffect(() => {
    if (geofencingOpen && geoCenter) fetchGeofencedBusinesses(geoCenter);
  }, [geoRadiusKm, geoCategory, geofencingOpen]);

  const flyToBusiness = useCallback((b: { lat: number; lng: number; name: string }) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    flyCameraToTarget(viewer, b, { range: 1700, pitchDeg: -36, radius: 90, duration: 1.5 });
  }, []);

  // Keep ref in sync with state for use inside Cesium handlers
  useEffect(() => { pendingPlacementRef.current = pendingPlacement; }, [pendingPlacement]);
  useEffect(() => { brushSubModeRef.current = brushSubMode; }, [brushSubMode]);

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

  /* ── Nominatim Geocoding Search (geofenced when possible) ── */
  const searchNominatim = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!query.trim() || query.trim().length < 2) return [];
    try {
      // Build viewbox from user location for local-first results
      let viewboxParam = "";
      const center = geoCenter || (() => {
        const viewer = viewerRef.current;
        if (viewer && !viewer.isDestroyed()) {
          const cam = viewer.camera.positionCartographic;
          return { lat: CesiumMath.toDegrees(cam.latitude), lng: CesiumMath.toDegrees(cam.longitude) };
        }
        return null;
      })();
      if (center) {
        const degR = geoRadiusKm / 111;
        viewboxParam = `&viewbox=${(center.lng - degR).toFixed(4)},${(center.lat + degR).toFixed(4)},${(center.lng + degR).toFixed(4)},${(center.lat - degR).toFixed(4)}&bounded=0`;
      }
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=12&addressdetails=1&extratags=1${viewboxParam}`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await resp.json();
      const results = data.map((r: any) => {
        const extra = r.extratags || {};
        const addrParts = r.address || {};
        const addr = [addrParts.road, addrParts.house_number, addrParts.city || addrParts.town || addrParts.village, addrParts.state].filter(Boolean).join(", ");
        return {
          name: r.display_name.split(",").slice(0, 3).join(","),
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          type: classifyOsmResult(r),
          address: addr || undefined,
          phone: extra.phone || extra["contact:phone"] || undefined,
          website: extra.website || extra["contact:website"] || undefined,
          brand: extra.brand || undefined,
          description: extra.description || undefined,
          distance: center ? geoHaversine(center.lat, center.lng, parseFloat(r.lat), parseFloat(r.lon)) : undefined,
        };
      });
      // Sort by distance if we have a center
      if (center) {
        results.sort((a: SearchResult, b: SearchResult) =>
          geoHaversine(center.lat, center.lng, a.lat, a.lng) - geoHaversine(center.lat, center.lng, b.lat, b.lng)
        );
      }
      return results;
    } catch { return []; }
  }, [classifyOsmResult, geoCenter, geoRadiusKm]);

  /* ── Unified Nearby-first OSM Search (Overpass + Nominatim, expanding radius, unlimited) ── */
  const resolveSearchCenter = useCallback((): { lat: number; lng: number } | null => {
    if (geoCenter) return geoCenter;
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      const cam = viewer.camera.positionCartographic;
      return { lat: CesiumMath.toDegrees(cam.latitude), lng: CesiumMath.toDegrees(cam.longitude) };
    }
    return null;
  }, [geoCenter]);

  const classifyOverpassTag = (tags: Record<string, string>): string => {
    const a = tags.amenity || "", s = tags.shop || "", t = tags.tourism || "", l = tags.leisure || "", h = tags.healthcare || "", o = tags.office || "";
    if (a === "restaurant" || a === "fast_food" || a === "food_court") return "Restaurant";
    if (a === "cafe") return "Cafe";
    if (a === "bar" || a === "pub" || a === "nightclub") return "Bar";
    if (a === "fuel" || a === "charging_station") return "Fuel";
    if (a === "pharmacy" || a === "hospital" || a === "clinic" || a === "doctors" || a === "dentist" || h) return "Health";
    if (a === "bank" || a === "atm") return "Bank";
    if (a === "school" || a === "university" || a === "college" || a === "kindergarten") return "Education";
    if (t === "hotel" || t === "motel" || t === "hostel" || t === "guest_house") return "Hotel";
    if (t === "museum" || t === "gallery" || t === "attraction" || t === "viewpoint") return "Attraction";
    if (l === "park" || l === "garden") return "Park";
    if (l) return "Leisure";
    if (s === "supermarket" || s === "convenience" || s === "grocery") return "Supermarket";
    if (s) return "Shop";
    if (o) return "Office";
    if (tags.craft) return "Craft";
    if (tags.historic) return "Historic";
    return "Place";
  };

  const addBusinessPinsFromResults = useCallback((results: SearchResult[], center?: { lat: number; lng: number }) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    businessEntitiesRef.current.forEach(e => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    businessEntitiesRef.current = [];
    businessDataRef.current.clear();

    const iconByType: Record<string, string> = {
      Restaurant: "🍽️", Cafe: "☕", Supermarket: "🛒", Shop: "🏪",
      Hotel: "🏨", Fuel: "⛽", Health: "🏥", Bank: "🏦",
      Education: "🎓", Office: "🏢", Business: "🏪", Place: "📍",
      Attraction: "🎡", Park: "🌳", Leisure: "🎯", Craft: "🛠️", Historic: "🏛️",
    };
    const colorByType: Record<string, string> = {
      Restaurant: "rgba(249,115,22,0.75)", Cafe: "rgba(217,119,6,0.75)",
      Supermarket: "rgba(34,197,94,0.75)", Shop: "rgba(16,185,129,0.75)",
      Hotel: "rgba(99,102,241,0.75)", Fuel: "rgba(239,68,68,0.75)",
      Health: "rgba(239,68,68,0.75)", Bank: "rgba(59,130,246,0.75)",
      Education: "rgba(99,102,241,0.75)", Office: "rgba(148,163,184,0.75)",
    };

    results.slice(0, 500).forEach((r, idx) => {
      const entityId = `biz-live-${idx}-${r.lat.toFixed(6)}-${r.lng.toFixed(6)}`;
      const icon = iconByType[r.type] || "📍";
      const truncName = r.name.length > 20 ? r.name.slice(0, 18) + "…" : r.name;
      businessDataRef.current.set(entityId, {
        id: entityId,
        name: r.name,
        emoji: icon,
        category: r.type || "Business",
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        distance: center ? geoHaversine(center.lat, center.lng, r.lat, r.lng) : r.distance,
        phone: r.phone,
        website: r.website,
        brand: r.brand,
        cuisine: r.cuisine,
        description: r.description,
      });
      const entity = viewer.entities.add({
        id: entityId,
        position: Cartesian3.fromDegrees(r.lng, r.lat, 0),
        billboard: {
          image: createPinCanvas(icon, truncName, colorByType[r.type] || "rgba(0,212,255,0.75)"),
          verticalOrigin: 1,
          pixelOffset: new Cartesian2(0, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: { near: 200, nearValue: 0.85, far: 30000, farValue: 0.3 } as any,
          translucencyByDistance: { near: 100, nearValue: 1.0, far: 45000, farValue: 0.15 } as any,
          heightReference: pinHeightRef(),
          alignedAxis: Cartesian3.ZERO,
        },
        properties: { type: "business-result" } as any,
        description: r.name + (r.address ? ` — ${r.address}` : ""),
      });
      businessEntitiesRef.current.push(entity);
      clampPinToSurface(entity, r.lng, r.lat);
    });
    viewer.scene.requestRender?.();
  }, []);

  const runOverpassAround = useCallback(async (
    query: string,
    center: { lat: number; lng: number },
    radiusKm: number,
    signal: AbortSignal,
    categoryFilter?: string,
  ): Promise<SearchResult[]> => {
    const sanitized = query.replace(/["\\\n\r\[\]{}()|.*+?^$]/g, '').trim();
    const radiusM = Math.round(radiusKm * 1000);
    const around = `around:${radiusM},${center.lat},${center.lng}`;
    // Optional category prefilter (e.g., from chips). Otherwise scan all common biz categories.
    const catBlocks = (() => {
      switch (categoryFilter) {
        case "restaurant": return [`nwr["amenity"~"restaurant|fast_food|food_court"](${around});`];
        case "cafe":       return [`nwr["amenity"="cafe"](${around});`];
        case "supermarket":return [`nwr["shop"~"supermarket|convenience|grocery|greengrocer|bakery|department_store|general"](${around});`];
        case "shop":       return [`nwr["shop"](${around});`];
        case "hotel":      return [`nwr["tourism"~"hotel|motel|hostel|guest_house"](${around});`];
        case "fuel":       return [`nwr["amenity"~"fuel|charging_station"](${around});`];
        case "health":     return [`nwr["amenity"~"hospital|pharmacy|clinic|doctors|dentist"](${around});`,`nwr["healthcare"](${around});`];
        default:           return ["shop","amenity","tourism","leisure","office","healthcare","craft","historic"].map(k => `nwr["${k}"](${around});`);
      }
    })();
    const nameFilter = sanitized ? `["name"~"${sanitized}",i]` : "";
    const brandFilter = sanitized ? `["brand"~"${sanitized}",i]` : "";
    const operatorFilter = sanitized ? `["operator"~"${sanitized}",i]` : "";
    // If a name is present, search name/brand/operator AND also include the raw
    // category set so generic terms like "restaurant" still surface POIs whose
    // actual names don't contain the typed word.
    const blocks = sanitized
      ? [
          ...catBlocks.map(b => b.replace(/^nwr/, `nwr${nameFilter}`)),
          `nwr${brandFilter}(${around});`,
          `nwr${operatorFilter}(${around});`,
          ...catBlocks,
        ]
      : catBlocks;
    // Higher cap so a category-only "show ALL" near me returns everything in the radius
    const q = `[out:json][timeout:25];(${blocks.join("")});out center 600;`;
    // Sequential mirror try — skip OK-but-empty mirrors so a broken/stale one
    // (e.g. overpass.osm.ch returning {"elements":[]}) doesn't shadow a working one.
    const data: any = await fetchOverpassJson(q, signal).catch(() => null);
    if (!data) return [];
    const seen = new Set<string>();
    return (data.elements || [])
      .map((el: any) => {
        const tags = el.tags || {};
        const name = tags.name || tags.brand || tags.operator;
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (!name || !lat || !lng) return null;
        const key = `${name}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const addr = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:country"]].filter(Boolean).join(" ");
        return {
          name,
          lat,
          lng,
          type: classifyOverpassTag(tags),
          address: addr || undefined,
          phone: tags.phone || tags["contact:phone"] || undefined,
          website: tags.website || tags["contact:website"] || undefined,
          brand: tags.brand || undefined,
          cuisine: tags.cuisine || undefined,
          description: tags.description || undefined,
          distance: geoHaversine(center.lat, center.lng, lat, lng),
        } as SearchResult;
      })
      .filter(Boolean) as SearchResult[];
  }, []);

  const runNominatimBounded = useCallback(async (
    query: string,
    center: { lat: number; lng: number },
    radiusKm: number,
    bounded: boolean,
    signal: AbortSignal,
  ): Promise<SearchResult[]> => {
    if (!query.trim()) return [];
    const degR = radiusKm / 111;
    const viewbox = `${(center.lng - degR).toFixed(4)},${(center.lat + degR).toFixed(4)},${(center.lng + degR).toFixed(4)},${(center.lat - degR).toFixed(4)}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=20&addressdetails=1&extratags=1&viewbox=${viewbox}&bounded=${bounded ? 1 : 0}`;
    try {
      const resp = await fetch(url, { headers: { "Accept-Language": "en" }, signal });
      const data = await resp.json();
      return (data || []).map((r: any) => {
        const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
        const extra = r.extratags || {};
        const a = r.address || {};
        const addr = [a.road, a.house_number, a.city || a.town || a.village, a.state].filter(Boolean).join(", ");
        return {
          name: r.display_name.split(",").slice(0, 3).join(","),
          lat,
          lng,
          type: classifyOsmResult(r),
          address: addr || undefined,
          phone: extra.phone || extra["contact:phone"] || undefined,
          website: extra.website || extra["contact:website"] || undefined,
          brand: extra.brand || undefined,
          description: extra.description || undefined,
          distance: geoHaversine(center.lat, center.lng, lat, lng),
        } as SearchResult;
      });
    } catch { return []; }
  }, [classifyOsmResult]);

  const runUnifiedSearch = useCallback(async (query: string, categoryFilter?: string) => {
    // Abort any in-flight previous search
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    let center = resolveSearchCenter();
    if (!center) {
      geoLocateUser();
      await new Promise(r => setTimeout(r, 400));
      center = resolveSearchCenter();
      if (!center) { setUnifiedResults([]); return; }
    }
    const ctr = center;

    // ── Instant: saved POI matches (synchronous, render in the same frame) ──
    const qLower = query.trim().toLowerCase();
    const poiMatches: SearchResult[] = pois
      .filter(p => !qLower
        || p.name.toLowerCase().includes(qLower)
        || (p.description || "").toLowerCase().includes(qLower)
        || (p.notes || "").toLowerCase().includes(qLower))
      .map(p => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        type: "Saved POI",
        description: p.description,
        distance: geoHaversine(ctr.lat, ctr.lng, p.lat, p.lng),
        source: "osm",
      } as SearchResult));
    setUnifiedResults(poiMatches);
    setSearchLoading(true);

    // Per-source streaming buffers
    let overpassBuf: SearchResult[] = [];
    let nominatimBuf: SearchResult[] = [];
    let googleBuf: SearchResult[] = [];

    const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const distM = (a: SearchResult, b: SearchResult) => {
      const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
      const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };
    const matchTier = (name: string): number => {
      if (!qLower) return 0;
      const n = (name || "").toLowerCase();
      if (n === qLower) return 4;
      if (n.startsWith(qLower)) return 3;
      if (n.split(/\s+/).some(w => w.startsWith(qLower))) return 2;
      if (n.includes(qLower)) return 1;
      return 0;
    };
    const recompose = () => {
      if (controller.signal.aborted) return;
      const tagged: SearchResult[] = [
        ...poiMatches,
        ...googleBuf,
        ...overpassBuf.map(r => ({ ...r, source: r.source ?? ("osm" as const) })),
        ...nominatimBuf.map(r => ({ ...r, source: r.source ?? ("osm" as const) })),
      ];
      const merged: SearchResult[] = [];
      for (const r of tagged) {
        const n = norm(r.name);
        const dup = merged.find(m => norm(m.name) === n && distM(m, r) < 25);
        if (!dup) { merged.push(r); continue; }
        if (dup.source !== "google" && r.source === "google") {
          merged[merged.indexOf(dup)] = { ...r };
        }
      }
      merged.sort((a, b) => {
        const ta = matchTier(a.name), tb = matchTier(b.name);
        if (ta !== tb) return tb - ta;
        const ga = a.source === "google" && (a.rating ?? 0) >= 4.0 ? 1 : 0;
        const gb = b.source === "google" && (b.rating ?? 0) >= 4.0 ? 1 : 0;
        if (ga !== gb) return gb - ga;
        return (a.distance ?? 9e9) - (b.distance ?? 9e9);
      });
      setUnifiedResults(merged);
    };

    try {
      // Fast path: category chip with no text query
      if (!query.trim() && categoryFilter) {
        try {
          const hits = await runOverpassAround("", ctr, 5, controller.signal, categoryFilter);
          if (controller.signal.aborted) return;
          overpassBuf = hits;
          recompose();
        } catch { /* */ }
        finally { if (!controller.signal.aborted) setSearchLoading(false); }
        return;
      }

      const isTextual = query.trim().length >= 2 && !categoryFilter;
      const sidePromises: Promise<void>[] = [];

      if (isTextual) {
        sidePromises.push(
          runNominatimBounded(query, ctr, 50, true, controller.signal).then(r => {
            if (controller.signal.aborted) return;
            nominatimBuf = r;
            recompose();
          }).catch(() => {})
        );
        sidePromises.push(
          runNominatimBounded(query, ctr, 200, false, controller.signal).then(r => {
            if (controller.signal.aborted) return;
            const seen = new Set(nominatimBuf.map(x => `${x.name}|${x.lat.toFixed(4)}|${x.lng.toFixed(4)}`));
            const extra = r.filter(x => !seen.has(`${x.name}|${x.lat.toFixed(4)}|${x.lng.toFixed(4)}`));
            nominatimBuf = [...nominatimBuf, ...extra];
            recompose();
          }).catch(() => {})
        );
        sidePromises.push(
          supabase.functions.invoke("google-search", {
            body: { query: query.trim(), center: { lat: ctr.lat, lng: ctr.lng }, radiusMeters: 25000 },
          }).then(({ data, error }) => {
            if (controller.signal.aborted || error || !data?.results) return;
            googleBuf = (data.results as any[]).map((r) => ({
              name: r.name, lat: r.lat, lng: r.lng, type: r.type || "Place",
              address: r.address, phone: r.phone, website: r.website,
              rating: r.rating, ratingCount: r.ratingCount, placeId: r.placeId,
              source: "google" as const,
              distance: geoHaversine(ctr.lat, ctr.lng, r.lat, r.lng),
            }));
            recompose();
          }).catch(() => {})
        );
      }

      // Overpass expanding radius — push results after each ring
      const radii = categoryFilter ? [1, 3, 10, 30] : [2, 5, 15, 50, 150];
      for (const r of radii) {
        if (controller.signal.aborted) return;
        try {
          const hits = await runOverpassAround(query, ctr, r, controller.signal, categoryFilter);
          if (controller.signal.aborted) return;
          if (hits.length > overpassBuf.length) {
            overpassBuf = hits;
            recompose();
          }
          if (hits.length >= 20) break;
        } catch {
          if (controller.signal.aborted) return;
        }
      }

      await Promise.allSettled(sidePromises);
    } catch { /* */ }
    finally {
      if (!controller.signal.aborted) setSearchLoading(false);
    }
  }, [resolveSearchCenter, runOverpassAround, runNominatimBounded, geoLocateUser, pois]);

  const loadCategoryBusinessesInstant = useCallback(async (categoryKey: string = geoCategory) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    instantBusinessAbortRef.current?.abort();
    const controller = new AbortController();
    instantBusinessAbortRef.current = controller;

    const cam = viewer.camera.positionCartographic;
    const center = { lat: CesiumMath.toDegrees(cam.latitude), lng: CesiumMath.toDegrees(cam.longitude) };
    const category = categoryKey && categoryKey !== "all" ? categoryKey : undefined;
    const radiusKm = cam.height < 2500 ? 2 : cam.height < 7000 ? 4 : cam.height < 25000 ? 8 : 15;

    setShowBusinessIcons(true);
    setSearchOpen(true);
    setSearchQuery("");
    setSearchLoading(true);
    setIsLoadingBusinesses(true);
    setActiveSearchCategory(category ?? "");
    setGeoCenter(center);
    setGeoLocationName(`${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
    businessLoadedAreaRef.current = `instant-${center.lat.toFixed(3)},${center.lng.toFixed(3)},${radiusKm},${category ?? "all"}`;
    bizLastFetchRef.current = 0;

    try {
      let hits = await runOverpassAround("", center, radiusKm, controller.signal, category);
      if (hits.length === 0) {
        const fallbackTerms: Record<string, string[]> = {
          restaurant: ["restaurant", "fast food"], cafe: ["cafe", "coffee"],
          supermarket: ["supermarket", "grocery"], shop: ["shop", "store"],
          hotel: ["hotel"], fuel: ["fuel", "charging station"], health: ["pharmacy", "clinic"],
        };
        const terms = category ? fallbackTerms[category] ?? [category] : ["restaurant", "cafe", "shop", "supermarket"];
        const batches = await Promise.all(terms.map(term => runNominatimBounded(term, center, radiusKm, true, controller.signal).catch(() => [])));
        const seen = new Set<string>();
        hits = batches.flat().filter(r => {
          const key = `${r.name.toLowerCase()}|${r.lat.toFixed(5)}|${r.lng.toFixed(5)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      if (controller.signal.aborted || viewer.isDestroyed()) return;
      const sorted = hits
        .map(r => ({ ...r, source: "osm" as const, distance: r.distance ?? geoHaversine(center.lat, center.lng, r.lat, r.lng) }))
        .sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9));
      setUnifiedResults(sorted);
      addBusinessPinsFromResults(sorted, center);
    } finally {
      if (!controller.signal.aborted) {
        setSearchLoading(false);
        setIsLoadingBusinesses(false);
      }
    }
  }, [addBusinessPinsFromResults, geoCategory, runNominatimBounded, runOverpassAround]);

  /* ── OSRM Routing (with fallback) ── */
  const fetchRoute = useCallback(async (origin: SearchResult, dest: SearchResult) => {
    setRouteLoading(true);
    setRouteError(null);
    try {
      // Try multiple OSRM servers for CORS compatibility
      const urls = [
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=false`,
        `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=false`,
      ];
      let data: any = null;
      for (const url of urls) {
        try {
          const resp = await fetch(url);
          if (resp.ok) { data = await resp.json(); break; }
        } catch { /* try next */ }
      }
      if (!data) {
        // Fallback: create a straight-line route
        data = {
          code: "Ok",
          routes: [{
            distance: geoHaversine(origin.lat, origin.lng, dest.lat, dest.lng) * 1000,
            duration: (geoHaversine(origin.lat, origin.lng, dest.lat, dest.lng) / 40) * 3600,
            geometry: { coordinates: [[origin.lng, origin.lat], [dest.lng, dest.lat]] },
          }],
        };
      }
      
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
      orderIndependentTranslucency: false,
    });

    viewerRef.current = viewer;

    // Dark space background
    viewer.scene.backgroundColor = Color.fromCssColorString("#0a0a1a");

    // ── First-person camera controls ──
    // Rebind LEFT_DRAG from "orbit globe center" to "look around" (FPS feel).
    // Wheel still zooms, RIGHT_DRAG zooms (dolly), MIDDLE_DRAG tilts.
    // SHIFT+LEFT_DRAG temporarily orbits the picked point (cinematic centering).
    const ssec0 = viewer.scene.screenSpaceCameraController;
    ssec0.enableLook = true;
    ssec0.enableRotate = true;
    ssec0.enableTilt = true;
    ssec0.enableZoom = true;
    ssec0.enableTranslate = true;
    ssec0.lookEventTypes = [CameraEventType.LEFT_DRAG] as any;
    ssec0.rotateEventTypes = [
      { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.SHIFT },
    ] as any;
    ssec0.tiltEventTypes = [
      CameraEventType.MIDDLE_DRAG,
      { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.CTRL },
      CameraEventType.PINCH,
    ] as any;
    ssec0.zoomEventTypes = [
      CameraEventType.WHEEL,
      CameraEventType.PINCH,
      CameraEventType.RIGHT_DRAG,
    ] as any;
    ssec0.inertiaSpin = 0.6;
    // Keep the camera free of any tracked transform so look is true first-person.
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);

    // Global ESC + click-on-empty-globe → restore first-person (clear any
    // sticky reference frame after fly-to / tracked entity).
    const restoreFirstPerson = () => {
      if (viewer.isDestroyed()) return;
      viewer.trackedEntity = undefined;
      viewer.selectedEntity = undefined;
      try { viewer.camera.lookAtTransform(Matrix4.IDENTITY); } catch {}
    };
    const onEscFps = (e: KeyboardEvent) => {
      if (e.key === "Escape") restoreFirstPerson();
    };
    window.addEventListener("keydown", onEscFps);
    (viewer as any)._fpsCleanup = () => window.removeEventListener("keydown", onEscFps);

    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.atmosphereLightIntensity = 10;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0a0a1a");

    // Outer-atmosphere sky glow
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.skyAtmosphere.hueShift = -0.05;
      viewer.scene.skyAtmosphere.saturationShift = 0.1;
      viewer.scene.skyAtmosphere.brightnessShift = 0.05;
    }


    // Prevent crash-reloads: catch render errors instead of letting them propagate
    viewer.scene.renderError.addEventListener((scene: any, error: any) => {
      console.error("[Atlas Render Error — suppressed reload]", error);
    });

    // Throttle tile loading on resize/fullscreen to prevent OOM crashes
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (viewer.isDestroyed()) return;
      // Temporarily reduce quality during resize
      const rt = (viewer as any)._realisticTileset;
      const ot = (viewer as any)._osmTileset;
      if (rt) rt.maximumScreenSpaceError = 32;
      if (ot) ot.maximumScreenSpaceError = 32;
      viewer.scene.globe.maximumScreenSpaceError = 8;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (viewer.isDestroyed()) return;
        if (rt) rt.maximumScreenSpaceError = 8;
        if (ot) ot.maximumScreenSpaceError = 4;
        viewer.scene.globe.maximumScreenSpaceError = 2;
        viewer.scene.requestRender();
      }, 600);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onResize);
    (viewer as any)._resizeCleanup = () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onResize);
    };
    viewer.scene.globe.maximumScreenSpaceError = 2;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    // Hide globe immediately — photorealistic tiles will be the only visible layer
    viewer.scene.globe.show = false;

    // Force continuous rendering so the globe appears immediately
    viewer.scene.requestRenderMode = false;
    viewer.scene.maximumRenderTimeChange = Infinity;

    // Add world terrain
    createWorldTerrainAsync({
      requestWaterMask: false,
      requestVertexNormals: true,
    }).then((terrain) => {
      if (!viewer.isDestroyed()) {
        viewer.terrainProvider = terrain;
        viewer.scene.requestRender();
      }
    });

    // Load Google Photorealistic 3D Tiles as default (asset 2275207)
    Cesium3DTileset.fromIonAssetId(2275207).then((tileset) => {
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.add(tileset);
        tileset.maximumScreenSpaceError = 8;
        (viewer as any)._realisticTileset = tileset;
        viewer.scene.requestRender();
        window.dispatchEvent(new CustomEvent("cesium-tileset-ready"));
      }
    }).catch(() => {
      // Fallback: if realistic tiles fail, show globe + OSM buildings
      if (!viewer.isDestroyed()) {
        console.warn("Realistic tiles unavailable, falling back to OSM");
        viewer.scene.globe.show = true;
        viewer.scene.globe.baseColor = Color.fromCssColorString("#0a1628");
        createOsmBuildingsAsync().then((tileset) => {
          if (!viewer.isDestroyed()) {
            viewer.scene.primitives.add(tileset);
            tileset.maximumScreenSpaceError = 4;
            (viewer as any)._osmTileset = tileset;
            window.dispatchEvent(new CustomEvent("cesium-tileset-ready"));
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
        window.dispatchEvent(new CustomEvent("cesium-tileset-ready"));
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

    // Area-mode circle entity (hidden by default; lives over the painted zone)
    const areaEntity = viewer.entities.add({
      id: "area-indicator",
      position: Cartesian3.fromDegrees(0, 0, 0),
      show: false,
      ellipse: {
        semiMajorAxis: 250,
        semiMinorAxis: 250,
        material: Color.fromCssColorString("#22d3ee").withAlpha(0.18),
        outline: true,
        outlineColor: Color.fromCssColorString("#22d3ee").withAlpha(0.85),
        outlineWidth: 2,
        height: 0,
        heightReference: 1, // CLAMP_TO_GROUND
      } as any,
    });
    areaEntityRef.current = areaEntity;

    // Restore last camera viewport if available, else open at full global view.
    let restoredCamera = false;
    try {
      const saved = localStorage.getItem("atlas_camera");
      if (saved) {
        const s = JSON.parse(saved);
        if (typeof s.lng === "number" && typeof s.lat === "number" && typeof s.alt === "number") {
          viewer.camera.setView({
            destination: Cartesian3.fromDegrees(s.lng, s.lat, s.alt),
            orientation: {
              heading: CesiumMath.toRadians(s.heading ?? 0),
              pitch: CesiumMath.toRadians(s.pitch ?? -90),
              roll: CesiumMath.toRadians(s.roll ?? 0),
            },
          });
          restoredCamera = true;
        }
      }
    } catch {}
    if (!restoredCamera) {
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(0, 20, 20000000),
        orientation: {
          heading: CesiumMath.toRadians(0),
          pitch: CesiumMath.toRadians(-90),
          roll: 0,
        },
      });
    }

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
        viewer.scene.screenSpaceCameraController.enableLook = false;
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
        viewer.scene.screenSpaceCameraController.enableLook = true;
      }
    }, ScreenSpaceEventType.LEFT_UP);

    // Helper: pick a world location under the given screen point.
    const pickWorldLoc = (screenPos: any) => {
      const ray = viewer.camera.getPickRay(screenPos);
      if (!ray) return null;
      const cartesian = viewer.scene.pickPosition(screenPos)
        || (viewer.scene.globe.show ? viewer.scene.globe.pick(ray, viewer.scene) : undefined);
      if (!defined(cartesian)) return null;
      const carto = Cartographic.fromCartesian(cartesian);
      return {
        lat: CesiumMath.toDegrees(carto.latitude),
        lng: CesiumMath.toDegrees(carto.longitude),
        alt: carto.height,
      };
    };

    // LEFT double click → set a camera focus point to orbit around, OR
    // LEFT DOUBLE CLICK → drive brush / pending placement, or open the
    // earth context menu. Edit a model if double-clicked on one.
    handler.setInputAction((click: any) => {
      viewer.trackedEntity = undefined;
      viewer.selectedEntity = undefined;
      const picked = viewer.scene.pick(click.position);
      if (picked?.id?.id && typeof picked.id.id === "string" && picked.id.id.startsWith("model-")) {
        const modelId = picked.id.id.replace("model-", "");
        window.dispatchEvent(new CustomEvent("cesium-model-dblclick", { detail: { id: modelId } }));
        return;
      }
      const loc = pickWorldLoc(click.position);
      if (!loc) return;
      const screen = { x: click.position?.x ?? 0, y: click.position?.y ?? 0 };
      window.dispatchEvent(new CustomEvent("cesium-dblclick", { detail: { ...loc, screen } }));
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
      if ((viewer as any)._resizeCleanup) (viewer as any)._resizeCleanup();
      if ((viewer as any)._fpsCleanup) (viewer as any)._fpsCleanup();
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

    if (!showCargoRoutes) return;

    // Filter routes
    let filteredRoutes = ALL_CARGO_ROUTES;
    if (cargoFilter !== "all") filteredRoutes = filteredRoutes.filter(r => r.type === cargoFilter);
    if (cargoTypeFilter !== "all") filteredRoutes = filteredRoutes.filter(r => r.category === cargoTypeFilter);

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

      // Port markers at endpoints (no fake vessels — only real live tracking is used)
      [[route.waypoints[0],0],[route.waypoints[route.waypoints.length-1],1]].forEach(([pt, pi]) => {
        const [pLng, pLat] = pt as [number, number];
        cargoEntitiesRef.current.push(viewer.entities.add({
          id: `cargo-port-${route.id}-${pi}`,
          position: Cartesian3.fromDegrees(pLng, pLat, height + 1000),
          point: { pixelSize: 6, color: lineColor, outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        }));
      });
    });

    // Click handler for route data cards (no fake vessels — real-time data comes from live traffic)
    const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (picked?.id?.id) {
        const entityId = picked.id.id as string;
        // Check if it's a route line
        if (entityId.startsWith("cargo-") && !entityId.startsWith("cargo-core-") && !entityId.startsWith("cargo-label-") && !entityId.startsWith("cargo-arrow-") && !entityId.startsWith("cargo-port-")) {
          const routeId = entityId.replace("cargo-", "");
          const route = ALL_CARGO_ROUTES.find(r => r.id === routeId);
          if (route) {
            setSelectedRoute(route);
          }
        }
        // Check if it's a business entity
        if (entityId.startsWith("biz-")) {
          const bizData = businessDataRef.current.get(entityId);
          if (bizData) {
            setSelectedBusiness(bizData);
            flyCameraToTarget(viewer, bizData, { range: 1200, pitchDeg: -34, radius: 80, duration: 1.2 });
          }
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      clickHandler.destroy();
    };
  }, [showCargoRoutes, cargoFilter, cargoTypeFilter]);

  // ── Business/Store Icons on Globe ──
  const bizLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bizLastFetchRef = useRef<number>(0);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Clear existing business entities
    businessEntitiesRef.current.forEach(e => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    businessEntitiesRef.current = [];
    businessDataRef.current.clear();
    businessLoadedAreaRef.current = "";
    // Reset throttle so a category/visibility change refetches immediately
    bizLastFetchRef.current = 0;

    if (!showBusinessIcons) return;

    const loadBusinesses = async () => {
      setIsLoadingBusinesses(true);
      // Throttle: min 3s between fetches
      const now = Date.now();
      if (now - bizLastFetchRef.current < 3000) {
        setIsLoadingBusinesses(false);
        return;
      }

      const cam = viewer.camera.positionCartographic;
      const lat = CesiumMath.toDegrees(cam.latitude);
      const lng = CesiumMath.toDegrees(cam.longitude);
      const alt = cam.height;
      if (alt > 500000) {
        setIsLoadingBusinesses(false);
        return;
      }

      const radius = alt < 5000 ? 0.08 : alt < 20000 ? 0.15 : alt < 80000 ? 0.3 : 0.5;
      const limit = alt < 10000 ? 400 : alt < 80000 ? 250 : 150;
      const areaKey = `${lat.toFixed(2)},${lng.toFixed(2)},${radius.toFixed(3)},${geoCategory}`;
      if (businessLoadedAreaRef.current === areaKey) {
        setIsLoadingBusinesses(false);
        return;
      }
      businessLoadedAreaRef.current = areaKey;
      bizLastFetchRef.current = now;

      const bbox = `${(lat - radius).toFixed(5)},${(lng - radius).toFixed(5)},${(lat + radius).toFixed(5)},${(lng + radius).toFixed(5)}`;

      // Apply category filter to globe pins query — use nwr for full store coverage
      let filter = "";
      switch (geoCategory) {
        case "restaurant": filter = `nwr["amenity"~"restaurant|fast_food"](${bbox});`; break;
        case "cafe": filter = `nwr["amenity"="cafe"](${bbox});`; break;
        case "hotel": filter = `nwr["tourism"~"hotel|motel|hostel|guest_house"](${bbox});`; break;
        case "fuel": filter = `nwr["amenity"~"fuel|charging_station"](${bbox});`; break;
        case "health": filter = `nwr["amenity"~"hospital|pharmacy|clinic|doctors|dentist"](${bbox});nwr["healthcare"](${bbox});`; break;
        case "supermarket": filter = `nwr["shop"~"supermarket|convenience|grocery|department_store|general"](${bbox});`; break;
        case "shop": filter = `nwr["shop"](${bbox});`; break;
        default: filter = `nwr["shop"](${bbox});nwr["amenity"~"restaurant|cafe|fast_food|fuel|pharmacy|bank|hospital|clinic|doctors"](${bbox});nwr["tourism"~"hotel|motel"](${bbox});nwr["healthcare"](${bbox});`;
      }

      const query = `[out:json][timeout:10];(${filter});out center ${limit};`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const data = await fetchOverpassJson(query, controller.signal);
        clearTimeout(timeout);
        if (!data?.elements || viewer.isDestroyed()) return;

        // Clear old before adding new
        businessEntitiesRef.current.forEach(e => {
          if (viewer.entities.contains(e)) viewer.entities.remove(e);
        });
        businessEntitiesRef.current = [];

        const iconMap: Record<string, string> = {
          restaurant: "🍽️", fast_food: "🍔", cafe: "☕", bar: "🍺", pub: "🍺",
          fuel: "⛽", charging_station: "🔌", pharmacy: "💊", hospital: "🏥", clinic: "🏥", doctors: "👨‍⚕️", dentist: "🦷", bank: "🏦",
          hotel: "🏨", motel: "🏨", hostel: "🏨", guest_house: "🏨",
          supermarket: "🛒", convenience: "🏪", department_store: "🏬", general: "🏪", grocery: "🛒",
          clothes: "👕", electronics: "📱", bakery: "🍞", butcher: "🥩", hairdresser: "💇", car_repair: "🔧",
        };

        const colorMap: Record<string, string> = {
          restaurant: "rgba(249,115,22,0.75)", fast_food: "rgba(249,115,22,0.7)",
          cafe: "rgba(217,119,6,0.75)", fuel: "rgba(239,68,68,0.7)", charging_station: "rgba(239,68,68,0.7)",
          pharmacy: "rgba(168,85,247,0.7)", hospital: "rgba(239,68,68,0.7)", clinic: "rgba(239,68,68,0.7)", doctors: "rgba(239,68,68,0.7)", dentist: "rgba(239,68,68,0.7)",
          bank: "rgba(59,130,246,0.7)", hotel: "rgba(99,102,241,0.7)",
          supermarket: "rgba(34,197,94,0.7)", convenience: "rgba(34,197,94,0.65)", department_store: "rgba(34,197,94,0.7)", grocery: "rgba(34,197,94,0.7)",
        };

        data.elements.forEach((el: any) => {
          const tags = el.tags || {};
          if (!tags.name) return;
          const elLat = el.lat || el.center?.lat;
          const elLng = el.lon || el.center?.lon;
          if (!elLat || !elLng) return;
          const amenity = tags.amenity || tags.shop || tags.tourism || tags.healthcare || "";
          const icon = iconMap[amenity] || "📍";
          const entityId = `biz-${el.id}`;
          const addr = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ");
          const _lat = elLat;
          const _lng = elLng;
          

          businessDataRef.current.set(entityId, {
            id: el.id,
            name: tags.name,
            emoji: icon,
            category: amenity ? (amenity.charAt(0).toUpperCase() + amenity.slice(1)).replace(/_/g, " ") : "Business",
            address: addr || undefined,
            lat: _lat,
            lng: _lng,
            phone: tags.phone || tags["contact:phone"] || undefined,
            website: tags.website || tags["contact:website"] || undefined,
            openNow: tags.opening_hours === "24/7" ? true : undefined,
            brand: tags.brand || undefined,
            cuisine: tags.cuisine || undefined,
            description: tags.description || undefined,
          });

          // High-quality glassmorphic pin at real coordinates
          const bgColor = colorMap[amenity] || "rgba(0,212,255,0.65)";
          const truncName = tags.name.length > 20 ? tags.name.slice(0, 18) + "…" : tags.name;
          const website = tags.website || tags["contact:website"] || undefined;
          const favicon = getFavicon(website, (img) => {
            // Once the favicon loads asynchronously, refresh this pin's image.
            if (!img || viewer.isDestroyed()) return;
            const ent = viewer.entities.getById(entityId);
            if (ent && ent.billboard) {
              const selected = isTagSelected(entityId);
              (ent.billboard as any).image = selected
                ? createGoldenPinCanvas(icon, truncName, img)
                : createPinCanvas(icon, truncName, bgColor, img);
              viewer.scene.requestRender();
            }
          });
          const selectedNow = isTagSelected(entityId);
          const entity = viewer.entities.add({
            id: entityId,
            position: Cartesian3.fromDegrees(_lng, _lat, 0),
            billboard: {
              image: selectedNow
                ? createGoldenPinCanvas(icon, truncName, favicon)
                : createPinCanvas(icon, truncName, bgColor, favicon),
              verticalOrigin: 1, // BOTTOM
              pixelOffset: new Cartesian2(0, 0),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: { near: 200, nearValue: selectedNow ? 1.0 : 0.8, far: 15000, farValue: selectedNow ? 0.35 : 0.25 } as any,
              translucencyByDistance: { near: 100, nearValue: 1.0, far: 18000, farValue: 0.0 } as any,
              heightReference: pinHeightRef(),
              alignedAxis: Cartesian3.ZERO, // Always face camera
              eyeOffset: selectedNow ? new Cartesian3(0, 0, -50) : new Cartesian3(0, 0, 0),
            },
            description: tags.name + (addr ? ` — ${addr}` : ""),
          });
          businessEntitiesRef.current.push(entity);
          clampPinToSurface(entity, _lng, _lat);
        });
        setTagsVersion(v => v + 1);
      } catch { /* ignore network/abort errors */ } finally {
        if (!viewer.isDestroyed()) setIsLoadingBusinesses(false);
      }
    };

    // Stores load ONLY when the user selects a category filter or searches.
    // The camera-move listener here just persists the camera state — it does
    // not auto-fetch business pins.
    const removeListener = viewer.camera.moveEnd.addEventListener(() => {
      try {
        const cam = viewer.camera;
        const pos = cam.positionCartographic;
        localStorage.setItem("atlas_camera", JSON.stringify({
          lng: CesiumMath.toDegrees(pos.longitude),
          lat: CesiumMath.toDegrees(pos.latitude),
          alt: pos.height,
          heading: CesiumMath.toDegrees(cam.heading),
          pitch: CesiumMath.toDegrees(cam.pitch),
          roll: CesiumMath.toDegrees(cam.roll),
        }));
      } catch {}
    });

    return () => {
      removeListener();
      if (bizLoadTimerRef.current) clearTimeout(bizLoadTimerRef.current);
    };
  }, [showBusinessIcons, geoCategory]);

  // ── Always-active click handler for business pin entities ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (picked?.id?.id) {
        const entityId = picked.id.id as string;
        if (entityId.startsWith("biz-")) {
          const bizData = businessDataRef.current.get(entityId);
          if (bizData) {
            setSelectedBusiness(bizData);
            flyCameraToTarget(viewer, bizData, { range: 1200, pitchDeg: -34, radius: 80, duration: 1.2 });
          }
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => { handler.destroy(); };
  }, [isLoaded]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Clear existing
    liveTrafficEntitiesRef.current.forEach(e => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    liveTrafficEntitiesRef.current = [];
    if (liveTrafficTimerRef.current) { clearInterval(liveTrafficTimerRef.current); liveTrafficTimerRef.current = null; }
    if (aisWebSocketRef.current) { aisWebSocketRef.current.close(); aisWebSocketRef.current = null; }
    liveShipsRef.current.clear();

    if (!showLiveTraffic) { setLiveTrafficStats({ planes: 0, ships: 0 }); return; }

    /* ── Aircraft from OpenSky ── */
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

    /* ── Ships from AISStream.io WebSocket ── */
    const aisApiKey = import.meta.env.VITE_AISSTREAM_API_KEY;
    if (aisApiKey) {
      try {
        const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
        aisWebSocketRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({
            Apikey: aisApiKey,
            BoundingBoxes: [[[-90, -180], [90, 180]]],
            FilterMessageTypes: ["PositionReport", "ShipStaticData"],
          }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const meta = msg.MetaData;
            if (!meta) return;
            const mmsi = String(meta.MMSI || "");
            if (!mmsi) return;

            if (msg.MessageType === "PositionReport") {
              const pos = msg.Message?.PositionReport;
              if (!pos) return;
              const lat = pos.Latitude;
              const lng = pos.Longitude;
              if (lat == null || lng == null || (lat === 0 && lng === 0)) return;

              liveShipsRef.current.set(mmsi, {
                lat, lng,
                speed: pos.Sog || 0,
                heading: pos.TrueHeading || pos.Cog || 0,
                name: (meta.ShipName || "").trim() || `MMSI ${mmsi}`,
                type: meta.ShipType || 0,
                country: meta.country_iso || "",
                mmsi,
                lastUpdate: Date.now(),
              });
            }
          } catch {}
        };

        ws.onerror = () => {};
        ws.onclose = () => {};
      } catch {}
    }

    /* ── Render loop: update entities for both planes & ships ── */
    const getShipColor = (shipType: number): string => {
      if (shipType >= 70 && shipType <= 79) return "#ef4444"; // Cargo - red
      if (shipType >= 80 && shipType <= 89) return "#3b82f6"; // Tanker - blue
      if (shipType >= 60 && shipType <= 69) return "#f97316"; // Passenger - orange
      if (shipType >= 40 && shipType <= 49) return "#a855f7"; // High-speed craft - purple
      if (shipType >= 50 && shipType <= 59) return "#14b8a6"; // Tug/Pilot - teal
      if (shipType >= 30 && shipType <= 39) return "#22c55e"; // Fishing - green
      return "#06b6d4"; // Other - cyan
    };

    const getShipTypeLabel = (shipType: number): string => {
      if (shipType >= 70 && shipType <= 79) return "Cargo";
      if (shipType >= 80 && shipType <= 89) return "Tanker";
      if (shipType >= 60 && shipType <= 69) return "Passenger";
      if (shipType >= 40 && shipType <= 49) return "High-Speed";
      if (shipType >= 50 && shipType <= 59) return "Tug/Pilot";
      if (shipType >= 30 && shipType <= 39) return "Fishing";
      return "Vessel";
    };

    const updateEntities = async () => {
      if (!viewer || viewer.isDestroyed()) return;
      const aircraft = await fetchAircraft();

      // Build set of all expected IDs
      const expectedIds = new Set<string>();

      // Aircraft
      const maxPlanes = 8000;
      const planes = aircraft.slice(0, maxPlanes);
      planes.forEach((ac: any) => expectedIds.add(`live-ac-${ac.id}`));

      // Ships from WebSocket
      const ships = Array.from(liveShipsRef.current.values());
      // Prune ships not updated in 5 minutes
      const now = Date.now();
      ships.forEach(s => {
        if (now - s.lastUpdate > 300000) liveShipsRef.current.delete(s.mmsi);
      });
      const activeShips = ships.filter(s => now - s.lastUpdate <= 300000);
      activeShips.forEach(s => expectedIds.add(`live-ship-${s.mmsi}`));

      // Remove stale entities
      liveTrafficEntitiesRef.current = liveTrafficEntitiesRef.current.filter(e => {
        if (!expectedIds.has(e.id)) {
          if (viewer.entities.contains(e)) viewer.entities.remove(e);
          return false;
        }
        return true;
      });

      // Update/add aircraft
      planes.forEach((ac: any) => {
        const eid = `live-ac-${ac.id}`;
        const existing = viewer.entities.getById(eid);
        const pos = Cartesian3.fromDegrees(ac.lng, ac.lat, Math.max(ac.alt, 500) * 3);
        if (existing) {
          existing.position = pos as any;
        } else {
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

      // Update/add ships
      activeShips.forEach(ship => {
        const eid = `live-ship-${ship.mmsi}`;
        const existing = viewer.entities.getById(eid);
        const pos = Cartesian3.fromDegrees(ship.lng, ship.lat, 0);
        const shipColor = getShipColor(ship.type);

        if (existing) {
          existing.position = pos as any;
        } else {
          const entity = viewer.entities.add({
            id: eid,
            position: pos,
            point: {
              pixelSize: 5,
              color: Color.fromCssColorString(shipColor),
              outlineColor: Color.fromCssColorString(shipColor).withAlpha(0.4),
              outlineWidth: 6,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: { near: 1e3, nearValue: 3.0, far: 5e6, farValue: 0.4 } as any,
            },
            label: {
              text: `🚢 ${ship.name}`,
              font: "10px sans-serif",
              fillColor: Color.fromCssColorString(shipColor),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: { near: 1e3, nearValue: 1.0, far: 2e5, farValue: 0.0 } as any,
              translucencyByDistance: { near: 1e3, nearValue: 1.0, far: 3e5, farValue: 0.0 } as any,
              pixelOffset: new Cartesian2(0, -12),
            },
            description: JSON.stringify({
              name: ship.name,
              mmsi: ship.mmsi,
              type: getShipTypeLabel(ship.type),
              typeCode: ship.type,
              speed: ship.speed,
              heading: ship.heading,
              country: ship.country,
              lat: ship.lat,
              lng: ship.lng,
            }),
          });
          liveTrafficEntitiesRef.current.push(entity);
        }
      });

      setLiveTrafficStats({ planes: planes.length, ships: activeShips.length });
    };

    updateEntities();
    // Refresh every 10 seconds for aircraft; ships update via WebSocket continuously
    liveTrafficTimerRef.current = setInterval(updateEntities, 10000);

    return () => {
      if (liveTrafficTimerRef.current) { clearInterval(liveTrafficTimerRef.current); liveTrafficTimerRef.current = null; }
      if (aisWebSocketRef.current) { aisWebSocketRef.current.close(); aisWebSocketRef.current = null; }
    };
  }, [showLiveTraffic]);

  // Listen for double-click events from Cesium
  useEffect(() => {
    const handleDblClick = (e: Event) => {
      const loc = (e as CustomEvent).detail;
      // Intercept while previewing a level placement — just move the ghost.
      const pending = pendingLevelPlacementRef.current;
      if (pending) {
        // Use the EXACT clicked coordinates (matches the HUD readout) — no tile snap.
        setPendingLevelPlacement({ ...pending, loc: { lat: loc.lat, lng: loc.lng, alt: Math.max(0, loc.alt) } });
        return;
      }
      if (brushMode) {
        // Sample the actual tile/terrain altitude so all brush modes snap
        // to the real surface (incl. negative altitudes below sea level).
        let tileAlt = loc.alt;
        const viewer = viewerRef.current;
        if (viewer) {
          try {
            const carto = Cartographic.fromDegrees(loc.lng, loc.lat);
            const sampled = viewer.scene.sampleHeight(carto);
            if (typeof sampled === "number" && !isNaN(sampled)) tileAlt = sampled;
            else {
              const terrainH = viewer.scene.globe.getHeight(carto);
              if (typeof terrainH === "number" && !isNaN(terrainH)) tileAlt = terrainH;
            }
          } catch {}
        }
        const snappedLoc = { ...loc, alt: tileAlt };
        const sub = brushSubModeRef.current;

        if (sub === "reticle") {
          setReticleTarget(snappedLoc);
          if (brushIndicatorRef.current && viewer) {
            brushIndicatorRef.current.position = Cartesian3.fromDegrees(snappedLoc.lng, snappedLoc.lat, snappedLoc.alt) as any;
          }
          return;
        }

        if (sub === "area") {
          setAreaCenter({ lat: snappedLoc.lat, lng: snappedLoc.lng });
          setAreaScanResults([]);
          return;
        }

        if (sub === "tiles") {
          const tool = tilesToolRef.current;
          if (tool === "grid") {
            const { x, y } = lngLatToTile(snappedLoc.lat, snappedLoc.lng, tileZoom);
            const k = tileKey(tileZoom, x, y);
            setSelectedTiles(prev => {
              const next = new Set(prev);
              if (next.has(k)) next.delete(k); else next.add(k);
              return next;
            });
          } else if (tool === "rectangle") {
            if (!rectStart) {
              setRectStart({ lat: snappedLoc.lat, lng: snappedLoc.lng });
            } else {
              const a = lngLatToTile(rectStart.lat, rectStart.lng, tileZoom);
              const b = lngLatToTile(snappedLoc.lat, snappedLoc.lng, tileZoom);
              const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
              const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
              setSelectedTiles(prev => {
                const next = new Set(prev);
                for (let xi = x0; xi <= x1; xi++)
                  for (let yi = y0; yi <= y1; yi++)
                    next.add(tileKey(tileZoom, xi, yi));
                return next;
              });
              setRectStart(null);
            }
          } else if (tool === "lasso") {
            setLassoPoints(prev => [...prev, { lat: snappedLoc.lat, lng: snappedLoc.lng }]);
          } else if (tool === "terrain") {
            stampTerrainAt(snappedLoc);
          }
          return;
        }

        // sub === "stamp"
        // If a model is already loaded into stamp memory, stamp directly.
        if (stampModelRef.current) {
          // Spacing guard
          if (stampSpacingM > 0 && lastStampRef.current) {
            const d = geoHaversine(lastStampRef.current.lat, lastStampRef.current.lng, snappedLoc.lat, snappedLoc.lng);
            if (d < stampSpacingM) return;
          }
          stampModelAt(snappedLoc);
          lastStampRef.current = { lat: snappedLoc.lat, lng: snappedLoc.lng };
          return;
        }
        // Otherwise open the placement dialog so the user picks/uploads a model.
        setPendingPlacement(snappedLoc);
        if (brushIndicatorRef.current && viewer) {
          brushIndicatorRef.current.position = Cartesian3.fromDegrees(snappedLoc.lng, snappedLoc.lat, snappedLoc.alt) as any;
        }
      } else {
        // No brush / no pending placement: open the earth context menu.
        setEarthMenu({ x: loc.screen?.x ?? window.innerWidth / 2, y: loc.screen?.y ?? window.innerHeight / 2, loc: { lat: loc.lat, lng: loc.lng, alt: loc.alt } });
      }
    };
    window.addEventListener("cesium-dblclick", handleDblClick);
    return () => window.removeEventListener("cesium-dblclick", handleDblClick);
  }, [brushMode, tileZoom, rectStart, stampSpacingM]);


  // Listen for model double-click (open transform widget)
  useEffect(() => {
    const handleModelDblClick = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const model = placedModels.find(m => m.id === id);
      if (model) {
        // Clear tracked/selected entity so camera doesn't follow
        if (viewerRef.current) {
          viewerRef.current.trackedEntity = undefined;
          viewerRef.current.selectedEntity = undefined;
        }
        setEditingModel(model);
      }
    };
    window.addEventListener("cesium-model-dblclick", handleModelDblClick);
    return () => window.removeEventListener("cesium-model-dblclick", handleModelDblClick);
  }, [placedModels]);

  // Listen for model drag events
  useEffect(() => {
    const handleModelMoved = (e: Event) => {
      const { id, lat, lng, alt } = (e as CustomEvent).detail;
      setPlacedModels(prev => {
        const updated = prev.map(m => m.id === id ? { ...m, lat, lng, alt } : m);
        savePlacedModels(updated);
        const movedModel = updated.find(m => m.id === id);
        if (movedModel && viewerRef.current) {
          const entity = viewerRef.current.entities.getById(`model-${id}`);
          if (entity) {
            const pos = Cartesian3.fromDegrees(movedModel.lng, movedModel.lat, movedModel.alt || 0);
            const hpr = new HeadingPitchRoll(
              CesiumMath.toRadians(movedModel.heading || 0),
              CesiumMath.toRadians(movedModel.pitch || 0),
              CesiumMath.toRadians(movedModel.roll || 0),
            );
            entity.position = pos as any;
            entity.orientation = Transforms.headingPitchRollQuaternion(pos, hpr) as any;
          }
        }
        setEditingModel(current => current?.id === id ? { ...current, lat, lng, alt } : current);
        return updated;
      });
    };
    window.addEventListener("cesium-model-moved", handleModelMoved);
    return () => window.removeEventListener("cesium-model-moved", handleModelMoved);
  }, []);

  useEffect(() => {
    return () => {
      modelUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      modelUrlsRef.current.clear();
    };
  }, []);

  // ── Repaint business / marketplace billboards when selection changes ──
  // Selected pins switch to a gold canvas with eyeOffset.z = -50 so they
  // always render on top of any other tag in the scene.
  useEffect(() => {
    const repaint = () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      // Businesses
      businessEntitiesRef.current.forEach(ent => {
        if (!ent?.id || !ent.billboard) return;
        const data = businessDataRef.current.get(ent.id);
        if (!data) return;
        const sel = isTagSelected(ent.id);
        const truncName = data.name.length > 20 ? data.name.slice(0, 18) + "…" : data.name;
        const favicon = getFavicon(data.website);
        const amenityKey = (data.category || "").toLowerCase().replace(/ /g, "_");
        const iconMap: Record<string, string> = {
          restaurant: "🍽️", fast_food: "🍔", cafe: "☕", bar: "🍺", pub: "🍺",
          fuel: "⛽", charging_station: "🔌", pharmacy: "💊", hospital: "🏥",
          clinic: "🏥", doctors: "👨‍⚕️", dentist: "🦷", bank: "🏦",
          hotel: "🏨", motel: "🏨", hostel: "🏨", guest_house: "🏨",
          supermarket: "🛒", convenience: "🏪", department_store: "🏬",
          general: "🏪", grocery: "🛒",
        };
        const icon = data.emoji || iconMap[amenityKey] || "📍";
        const bgColor = "rgba(0,212,255,0.65)";
        (ent.billboard as any).image = sel
          ? createGoldenPinCanvas(icon, truncName, favicon)
          : createPinCanvas(icon, truncName, bgColor, favicon);
        (ent.billboard as any).eyeOffset = sel
          ? new Cartesian3(0, 0, -50)
          : new Cartesian3(0, 0, 0);
        (ent.billboard as any).scaleByDistance = {
          near: 200, nearValue: sel ? 1.0 : 0.8,
          far: 15000, farValue: sel ? 0.35 : 0.25,
        } as any;
      });
      // Marketplace
      marketplaceEntitiesRef.current.forEach(ent => {
        if (!ent?.id || !ent.billboard) return;
        const sel = isTagSelected(ent.id);
        (ent.billboard as any).eyeOffset = sel
          ? new Cartesian3(0, 0, -50)
          : new Cartesian3(0, 0, 0);
      });
      viewer.scene.requestRender();
    };
    repaint();
    return subscribeSelection(repaint);
  }, [tagsVersion]);

  // Brush mode indicator visibility
  useEffect(() => {
    if (brushIndicatorRef.current) {
      // Show the cursor reticle only when actively painting (not when
      // browsing the placed-models list with brushMode off, and not while
      // the area / tiles sub-modes draw their own overlays).
      brushIndicatorRef.current.show =
        brushMode && brushSubMode !== "area" && brushSubMode !== "tiles";
    }
    if (areaEntityRef.current) {
      areaEntityRef.current.show = brushMode && brushSubMode === "area" && !!areaCenter;
    }
  }, [brushMode, brushSubMode, areaCenter]);

  // ── Tiles-mode: render selected tile polygons on the globe ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const visible = brushMode && brushSubMode === "tiles";
    const map = tileEntitiesRef.current;

    // Remove entities for keys no longer selected (or hide all if not visible)
    map.forEach((ent, k) => {
      if (!visible || !selectedTiles.has(k)) {
        if (viewer.entities.contains(ent)) viewer.entities.remove(ent);
        map.delete(k);
      }
    });
    if (!visible) return;

    // Add new selections
    selectedTiles.forEach(k => {
      if (map.has(k)) return;
      const { z, x, y } = parseTileKey(k);
      const b = tileBounds(x, y, z);
      const ring = [
        b.west, b.north,
        b.east, b.north,
        b.east, b.south,
        b.west, b.south,
      ];
      const ent = viewer.entities.add({
        id: `tile-${k}`,
        polygon: {
          hierarchy: Cartesian3.fromDegreesArray(ring) as any,
          material: Color.fromCssColorString("#10b981").withAlpha(0.22),
          outline: true,
          outlineColor: Color.fromCssColorString("#34d399").withAlpha(0.9),
          classificationType: ClassificationType.BOTH,
        } as any,
        properties: { type: "selected-tile", key: k } as any,
      });
      map.set(k, ent);
    });
  }, [selectedTiles, brushMode, brushSubMode, isLoaded]);

  // ── Tiles-mode: render lasso outline (in-progress polygon) ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    if (lassoEntityRef.current) {
      if (viewer.entities.contains(lassoEntityRef.current)) viewer.entities.remove(lassoEntityRef.current);
      lassoEntityRef.current = null;
    }
    if (!(brushMode && brushSubMode === "tiles" && tilesTool === "lasso" && lassoPoints.length > 0)) return;
    const pts = lassoPoints.concat(lassoPoints.length > 2 ? [lassoPoints[0]] : []);
    const positions = Cartesian3.fromDegreesArray(pts.flatMap(p => [p.lng, p.lat]));
    lassoEntityRef.current = viewer.entities.add({
      id: "lasso-outline",
      polyline: {
        positions: positions as any,
        width: 2,
        material: Color.fromCssColorString("#f59e0b").withAlpha(0.9),
        clampToGround: true,
      } as any,
    });
  }, [lassoPoints, tilesTool, brushMode, brushSubMode]);

  // Keep the area-indicator entity in sync with center + radius
  useEffect(() => {
    const ent = areaEntityRef.current;
    if (!ent) return;
    if (areaCenter) {
      ent.position = Cartesian3.fromDegrees(areaCenter.lng, areaCenter.lat, 0) as any;
      if (ent.ellipse) {
        ent.ellipse.semiMajorAxis = areaRadiusM as any;
        ent.ellipse.semiMinorAxis = areaRadiusM as any;
      }
    }
  }, [areaCenter, areaRadiusM]);

  // Marketplace pins — add/remove product billboard entities
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Remove existing marketplace entities
    marketplaceEntitiesRef.current.forEach(e => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    marketplaceEntitiesRef.current = [];

    if (!showMarketplacePins) return;

    const products = fetchMarketplaceProducts();
    products.forEach(p => {
      const pinImg = createPinCanvas(p.emoji || "🛍️", p.name.length > 18 ? p.name.slice(0, 16) + "…" : p.name, "rgba(139,92,246,");
      const entity = viewer.entities.add({
        id: `marketplace-${p.id}`,
        position: Cartesian3.fromDegrees(p.sellerLng, p.sellerLat, 0),
        billboard: {
          image: pinImg,
          verticalOrigin: 1, // BOTTOM
          scale: 0.5,
          scaleByDistance: { near: 100, nearValue: 1.0, far: 50000, farValue: 0.3 } as any,
          translucencyByDistance: { near: 0, nearValue: 1.0, far: 80000, farValue: 0.4 } as any,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: pinHeightRef(),
        },
        properties: { type: "marketplace", productId: p.id } as any,
      });
      marketplaceEntitiesRef.current.push(entity);
      clampPinToSurface(entity, p.sellerLng, p.sellerLat);
    });

    // Click handler for marketplace pins
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id?.id?.startsWith("marketplace-")) {
        const pId = picked.id.properties?.productId?.getValue?.(viewer.clock.currentTime) || picked.id.id.replace("marketplace-", "");
        const product = products.find(p => p.id === pId);
        if (product) setSelectedMarketplaceProduct(product);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => handler.destroy();
  }, [showMarketplacePins, isLoaded]);

  /* ── Traffic camera pins (Intelligence layer) ── */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    cameraEntitiesRef.current.forEach(e => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    cameraEntitiesRef.current = [];

    if (!intelligenceOpen || mapCameras.length === 0) return;

    const camById = new Map(mapCameras.map(c => [c.id, c] as const));
    mapCameras.slice(0, 2000).forEach(cam => {
      const truncName = cam.name.length > 22 ? cam.name.slice(0, 20) + "…" : cam.name;
      const entity = viewer.entities.add({
        id: `camera-${cam.id}`,
        position: Cartesian3.fromDegrees(cam.lng, cam.lat, 0),
        billboard: {
          image: createPinCanvas("📹", truncName, "rgba(239,68,68,"),
          verticalOrigin: 1,
          scale: 0.55,
          scaleByDistance: { near: 200, nearValue: 1.0, far: 60000, farValue: 0.25 } as any,
          translucencyByDistance: { near: 0, nearValue: 1.0, far: 90000, farValue: 0.3 } as any,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: pinHeightRef(),
        },
        properties: { type: "camera", camId: cam.id } as any,
      });
      cameraEntitiesRef.current.push(entity);
      clampPinToSurface(entity, cam.lng, cam.lat);
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id?.id?.startsWith?.("camera-")) {
        const cid = picked.id.properties?.camId?.getValue?.(viewer.clock.currentTime) || picked.id.id.replace("camera-", "");
        const cam = camById.get(cid);
        if (cam) setActiveCamera(cam);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => handler.destroy();
  }, [mapCameras, intelligenceOpen, isLoaded]);

  /* ── Search-result pins on the globe (every dropdown item = a pin) ── */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Clear previous search pins
    searchResultEntitiesRef.current.forEach(e => {
      if (viewer.entities.contains(e)) viewer.entities.remove(e);
    });
    searchResultEntitiesRef.current = [];

    if (!searchOpen || unifiedResults.length === 0) return;

    const colorByType: Record<string, string> = {
      Restaurant: "rgba(245,158,11,",
      Cafe: "rgba(168,85,247,",
      Supermarket: "rgba(16,185,129,",
      Shop: "rgba(59,130,246,",
      Hotel: "rgba(236,72,153,",
      Fuel: "rgba(239,68,68,",
      Health: "rgba(239,68,68,",
      Bank: "rgba(34,197,94,",
      Education: "rgba(99,102,241,",
      Park: "rgba(34,197,94,",
      Office: "rgba(148,163,184,",
      Leisure: "rgba(56,189,248,",
      "Saved POI": "rgba(250,204,21,",
    };
    const iconByType: Record<string, string> = {
      Restaurant: "🍽️", Cafe: "☕", Supermarket: "🛒", Shop: "🏪",
      Hotel: "🏨", Fuel: "⛽", Health: "🏥", Bank: "🏦",
      Education: "🎓", Park: "🌳", Office: "🏢", Leisure: "🎯",
      Attraction: "🎡", Craft: "🛠️", Historic: "🏛️", Place: "📍",
      "Saved POI": "⭐",
    };

    unifiedResults.slice(0, 80).forEach((r, idx) => {
      const bg = (colorByType[r.type] || "rgba(0,212,255,") + "0.88)";
      const icon = iconByType[r.type] || "📍";
      const truncName = r.name.length > 22 ? r.name.slice(0, 20) + "…" : r.name;
      const entity = viewer.entities.add({
        id: `search-${idx}-${r.lat.toFixed(5)}-${r.lng.toFixed(5)}`,
        position: Cartesian3.fromDegrees(r.lng, r.lat, 0),
        billboard: {
          image: createPinCanvas(icon, truncName, bg),
          verticalOrigin: 1,
          scale: hoveredResultIdx === idx ? 1.25 : 1.0,
          scaleByDistance: { near: 200, nearValue: 1.0, far: 25000, farValue: 0.3 } as any,
          translucencyByDistance: { near: 100, nearValue: 1.0, far: 30000, farValue: 0.0 } as any,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: pinHeightRef(),
        },
        properties: { type: "search-result", idx } as any,
      });
      searchResultEntitiesRef.current.push(entity);
      clampPinToSurface(entity, r.lng, r.lat);
    });
  }, [unifiedResults, searchOpen, hoveredResultIdx, isLoaded]);

  /* ── Search input handler: presets + unified OSM search ── */
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const filtered = PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)
    );
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      filtered.unshift({
        name: `Coordinates ${coordMatch[1]}, ${coordMatch[2]}`,
        lat: parseFloat(coordMatch[1]),
        lng: parseFloat(coordMatch[2]),
        type: "Coordinate",
      });
    }
    setSearchResults(trimmed ? filtered : PRESETS);

    // Auto-geolocate so the very first search has a center
    if (!geoCenter) geoLocateUser();

    // Instant search — 120 ms debounce. Saved POIs match synchronously inside
    // runUnifiedSearch, so the panel updates in the same frame as the keystroke
    // while async sources stream in.
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (trimmed.length === 0 || trimmed.length >= 2) {
      searchTimerRef.current = setTimeout(() => { runUnifiedSearch(trimmed, activeSearchCategory || undefined); }, 120);
    } else {
      setUnifiedResults([]);
    }
  }, [runUnifiedSearch, geoCenter, geoLocateUser, activeSearchCategory]);

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
    const businessTypes = ["Restaurant","Cafe","Hotel","Shop","Store","Supermarket","Fuel","Health","Education","Business"];
    const isBusiness = businessTypes.includes(result.type);
    const range = result.type === "Mountain" ? 14000 : result.type === "City" ? 7200 : isBusiness ? 1700 : 3200;
    const pitchDeg = result.type === "Mountain" ? -42 : result.type === "City" ? -45 : -36;
    flyCameraToTarget(viewerRef.current, result, { range, pitchDeg, radius: isBusiness ? 90 : 180, duration: 1.8 });
    viewerRef.current.entities.add({
      position: Cartesian3.fromDegrees(result.lng, result.lat),
      name: result.name,
      label: {
        text: `📍 ${result.name}`, font: "bold 14px 'Inter', system-ui, sans-serif",
        fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, style: 2,
        pixelOffset: new Cartesian2(0, -8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: Color.fromCssColorString("#00d4ff").withAlpha(0.55),
        backgroundPadding: new Cartesian2(10, 6),
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
    flyCameraToTarget(viewerRef.current, poi, { range: 1800, pitchDeg: -36, radius: 90, duration: 1.6 });
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
  const applyModelTransformToEntity = useCallback((entity: any, model: Pick<PlacedModel, "lat" | "lng" | "alt" | "heading" | "pitch" | "roll" | "scale">) => {
    const position = Cartesian3.fromDegrees(model.lng, model.lat, model.alt || 0);
    entity.position = position as any;
    if (entity.model) {
      (entity.model as any).heightReference = 0;
      (entity.model as any).scale = model.scale || 1;
    }

    const hpr = new HeadingPitchRoll(
      CesiumMath.toRadians(model.heading || 0),
      CesiumMath.toRadians(model.pitch || 0),
      CesiumMath.toRadians(model.roll || 0),
    );
    entity.orientation = Transforms.headingPitchRollQuaternion(position, hpr) as any;
  }, []);

  // ── Tile cropping: clip a circular hole in 3D tilesets under a model ──
  const buildCircleClippingPolygon = useCallback((lat: number, lng: number, radiusMeters: number, segments = 48) => {
    const positions: Cartesian3[] = [];
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(CesiumMath.toRadians(lat));
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const dLat = (radiusMeters * Math.sin(theta)) / metersPerDegLat;
      const dLng = (radiusMeters * Math.cos(theta)) / Math.max(1, metersPerDegLng);
      positions.push(Cartesian3.fromDegrees(lng + dLng, lat + dLat));
    }
    return new ClippingPolygon({ positions });
  }, []);

  const applyAllCropsRef = useRef<() => void>(() => {});
  const applyAllCrops = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const cropped = placedModels.filter(m => m.cropRadius && m.cropRadius > 0);
    const polygons = cropped.map(m => buildCircleClippingPolygon(m.lat, m.lng, m.cropRadius!));
    // Cut a square hole in the 3D tilesets for every placed Level. The
    // cut NEVER extends beyond the level's own perimeter unless the user
    // explicitly grows it via `terrain_expand_feet` in the Level
    // Inspector — in which case the cut grows outward by that many feet
    // and an editable terrain plane fills the new area (rendered by
    // AtlasLevelsR3FOverlay). With 0 ft the hole is exactly the level's
    // footprint so no visible "hole in the world" ever appears.
    for (const lp of levelPlacements) {
      const expandM = (lp.terrain_expand_feet ?? 0) * 0.3048;
      const half = DEFAULT_LEVEL_SIZE_M / 2 + expandM;
      const metersPerDegLat = 111320;
      const metersPerDegLng = 111320 * Math.cos(CesiumMath.toRadians(lp.lat));
      const dLat = half / metersPerDegLat;
      const dLng = half / Math.max(1, metersPerDegLng);
      const corners = [
        Cartesian3.fromDegrees(lp.lng - dLng, lp.lat - dLat),
        Cartesian3.fromDegrees(lp.lng + dLng, lp.lat - dLat),
        Cartesian3.fromDegrees(lp.lng + dLng, lp.lat + dLat),
        Cartesian3.fromDegrees(lp.lng - dLng, lp.lat + dLat),
      ];
      polygons.push(new ClippingPolygon({ positions: corners }));
    }
    const tilesets = [
      (viewer as any)._realisticTileset as Cesium3DTileset | undefined,
      (viewer as any)._osmTileset as Cesium3DTileset | undefined,
    ].filter(Boolean) as Cesium3DTileset[];
    tilesets.forEach((ts) => {
      try {
        ts.clippingPolygons = polygons.length
          ? new ClippingPolygonCollection({ polygons })
          : (undefined as any);
      } catch (err) {
        console.warn("[CropTile] failed to apply clipping polygons", err);
      }
    });
    viewer.scene.requestRender();
  }, [placedModels, levelPlacements, buildCircleClippingPolygon]);
  useEffect(() => { applyAllCropsRef.current = applyAllCrops; }, [applyAllCrops]);

  // Re-apply crops whenever models change or a tileset becomes ready.
  useEffect(() => {
    applyAllCrops();
    const onReady = () => applyAllCropsRef.current();
    window.addEventListener("cesium-tileset-ready", onReady);
    return () => window.removeEventListener("cesium-tileset-ready", onReady);
  }, [applyAllCrops]);

  // ── Crop-base architectural pad: grey base + grid/ruler + editable voxel terrain ──
  const cropBaseEntitiesRef = useRef<Map<string, any[]>>(new Map());
  const [terrainEditing, setTerrainEditing] = useState(false);

  const rebuildCropBaseForModel = useCallback((model: PlacedModel) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const map = cropBaseEntitiesRef.current;
    // Clear previous
    const prev = map.get(model.id) || [];
    prev.forEach(e => { try { viewer.entities.remove(e); } catch {} });
    map.set(model.id, []);
    const out = map.get(model.id)!;

    if (!model.cropRadius || model.cropRadius <= 0 || !model.cropBase) return;

    const { shape, wireframe, gridSize, cellSize, heights } = model.cropBase;
    const r = model.cropRadius;
    const baseAlt = (model.alt ?? 0);
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(CesiumMath.toRadians(model.lat));
    const dLat = (m: number) => m / metersPerDegLat;
    const dLng = (m: number) => m / Math.max(1, metersPerDegLng);
    const GREY = Color.fromCssColorString("rgba(140,140,148,1.0)");
    const GRID_MINOR = Color.fromCssColorString("rgba(150,210,255,0.35)");
    const GRID_MAJOR = Color.fromCssColorString("rgba(180,230,255,0.85)");
    const AXIS = Color.fromCssColorString("rgba(0,220,255,1.0)");
    const VOXEL = Color.fromCssColorString("rgba(160,160,168,1.0)");
    const VOXEL_NEG = Color.fromCssColorString("rgba(60,90,120,0.95)");

    // 1) Grey base — circle (N-gon) or square — clamped to ground
    let basePositions: Cartesian3[];
    if (shape === "circle") {
      const segs = 64;
      basePositions = [];
      for (let i = 0; i < segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        basePositions.push(Cartesian3.fromDegrees(
          model.lng + dLng(r * Math.cos(theta)),
          model.lat + dLat(r * Math.sin(theta)),
        ));
      }
    } else {
      basePositions = [
        Cartesian3.fromDegrees(model.lng - dLng(r), model.lat - dLat(r)),
        Cartesian3.fromDegrees(model.lng + dLng(r), model.lat - dLat(r)),
        Cartesian3.fromDegrees(model.lng + dLng(r), model.lat + dLat(r)),
        Cartesian3.fromDegrees(model.lng - dLng(r), model.lat + dLat(r)),
      ];
    }
    out.push(viewer.entities.add({
      id: `cropbase-${model.id}-pad`,
      polygon: {
        hierarchy: basePositions as any,
        material: GREY as any,
        classificationType: ClassificationType.TERRAIN,
        height: 0,
      } as any,
    }));

    // 2) Wireframe overlay (grid + axis ruler) — only when enabled
    if (wireframe) {
      const halfR = r;
      const major = 5;
      // Minor + major lines across N/S and E/W
      for (let m = -halfR; m <= halfR; m += cellSize) {
        const isMajor = Math.abs(m % major) < 1e-6;
        const mat = isMajor ? GRID_MAJOR : GRID_MINOR;
        const width = isMajor ? 1.4 : 0.8;
        // East-West line at offset m (north)
        out.push(viewer.entities.add({
          polyline: {
            positions: [
              Cartesian3.fromDegrees(model.lng - dLng(halfR), model.lat + dLat(m)),
              Cartesian3.fromDegrees(model.lng + dLng(halfR), model.lat + dLat(m)),
            ] as any,
            width, material: mat as any, clampToGround: true,
          } as any,
        }));
        // North-South line at offset m (east)
        out.push(viewer.entities.add({
          polyline: {
            positions: [
              Cartesian3.fromDegrees(model.lng + dLng(m), model.lat - dLat(halfR)),
              Cartesian3.fromDegrees(model.lng + dLng(m), model.lat + dLat(halfR)),
            ] as any,
            width, material: mat as any, clampToGround: true,
          } as any,
        }));
      }
      // Axis through origin — bright cyan
      out.push(viewer.entities.add({
        polyline: {
          positions: [
            Cartesian3.fromDegrees(model.lng - dLng(halfR), model.lat),
            Cartesian3.fromDegrees(model.lng + dLng(halfR), model.lat),
          ] as any,
          width: 2.2, material: AXIS as any, clampToGround: true,
        } as any,
      }));
      out.push(viewer.entities.add({
        polyline: {
          positions: [
            Cartesian3.fromDegrees(model.lng, model.lat - dLat(halfR)),
            Cartesian3.fromDegrees(model.lng, model.lat + dLat(halfR)),
          ] as any,
          width: 2.2, material: AXIS as any, clampToGround: true,
        } as any,
      }));
      // Ruler tick labels every 5 m on +X and +Y axes
      for (let m = major; m <= halfR; m += major) {
        out.push(viewer.entities.add({
          position: Cartesian3.fromDegrees(model.lng + dLng(m), model.lat, baseAlt + 0.5),
          label: {
            text: `${m}m`, font: '600 10px -apple-system,system-ui,sans-serif',
            fillColor: AXIS, outlineColor: Color.BLACK, outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.BOTTOM,
            scaleByDistance: { near: 80, nearValue: 1, far: 4000, farValue: 0.3 } as any,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          } as any,
        }));
        out.push(viewer.entities.add({
          position: Cartesian3.fromDegrees(model.lng, model.lat + dLat(m), baseAlt + 0.5),
          label: {
            text: `${m}m`, font: '600 10px -apple-system,system-ui,sans-serif',
            fillColor: AXIS, outlineColor: Color.BLACK, outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.BOTTOM,
            scaleByDistance: { near: 80, nearValue: 1, far: 4000, farValue: 0.3 } as any,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          } as any,
        }));
      }
    }

    // 3) Voxel terrain — only render non-zero cells as boxes
    const halfGrid = gridSize / 2;
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const h = heights[row * gridSize + col];
        if (!h) continue;
        const cx_m = (col - halfGrid + 0.5) * cellSize;
        const cy_m = (row - halfGrid + 0.5) * cellSize;
        // Skip cells outside the crop radius (circular pad)
        if (shape === "circle" && Math.hypot(cx_m, cy_m) > r) continue;
        const lng = model.lng + dLng(cx_m);
        const lat = model.lat + dLat(cy_m);
        const absH = Math.abs(h);
        // Terrain must never rise above the model's base — cap top at baseAlt.
        // raise (h>0): box sits just below baseAlt, filling up to it.
        // lower (h<0): box sits below baseAlt, top at baseAlt + h.
        const topZ = baseAlt + Math.min(0, h);
        const centerZ = topZ - absH / 2;
        const pos = Cartesian3.fromDegrees(lng, lat, centerZ);
        out.push(viewer.entities.add({
          position: pos,
          box: {
            dimensions: new Cartesian3(cellSize * 0.98, cellSize * 0.98, absH) as any,
            material: (h >= 0 ? VOXEL : VOXEL_NEG) as any,
            outline: true, outlineColor: Color.fromCssColorString("rgba(40,50,60,0.8)") as any,
          } as any,
        }));
      }
    }
    viewer.scene.requestRender();
  }, []);

  const applyAllCropBasesRef = useRef<() => void>(() => {});
  useEffect(() => {
    applyAllCropBasesRef.current = () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      // Remove bases for models that no longer exist or have no crop
      const validIds = new Set(placedModels.filter(m => m.cropRadius && m.cropBase).map(m => m.id));
      cropBaseEntitiesRef.current.forEach((ents, id) => {
        if (!validIds.has(id)) {
          ents.forEach(e => { try { viewer.entities.remove(e); } catch {} });
          cropBaseEntitiesRef.current.delete(id);
        }
      });
      placedModels.forEach(m => { if (m.cropRadius && m.cropBase) rebuildCropBaseForModel(m); });
    };
    applyAllCropBasesRef.current();
  }, [placedModels, rebuildCropBaseForModel]);

  // ── Voxel terrain editor: install pointer handler while terrainEditing on ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    if (!terrainEditing || !editingModel || !editingModel.cropBase || !editingModel.cropRadius) return;

    const ssec = viewer.scene.screenSpaceCameraController;
    const prevRotate = ssec.enableRotate;
    const prevTilt = ssec.enableTilt;
    const prevTrans = ssec.enableTranslate;
    ssec.enableRotate = false;
    ssec.enableTilt = false;
    ssec.enableTranslate = false;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(CesiumMath.toRadians(editingModel.lat));

    // ── Brush cursor: a glowing ring that follows the mouse over the pad ──
    const brushCursor = viewer.entities.add({
      id: `terrain-brush-cursor-${editingModel.id}`,
      position: Cartesian3.fromDegrees(editingModel.lng, editingModel.lat, editingModel.alt || 0),
      ellipse: {
        semiMajorAxis: editingModel.cropBase.brushRadius,
        semiMinorAxis: editingModel.cropBase.brushRadius,
        material: Color.fromCssColorString("rgba(245,158,11,0.18)") as any,
        outline: true,
        outlineColor: Color.fromCssColorString("rgba(245,158,11,0.95)") as any,
        outlineWidth: 2,
        height: (editingModel.alt || 0) + 0.05,
        classificationType: ClassificationType.TERRAIN,
      } as any,
      point: {
        pixelSize: 6,
        color: Color.fromCssColorString("rgba(245,158,11,1)") as any,
        outlineColor: Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } as any,
      show: false,
    });

    const pickWorld = (screenPos: { x: number; y: number }) => {
      const sp = new Cartesian2(screenPos.x, screenPos.y);
      let world = viewer.scene.pickPosition(sp);
      if (!world) world = viewer.camera.pickEllipsoid(sp, viewer.scene.globe.ellipsoid) || undefined;
      return world || null;
    };

    const screenToCell = (screenPos: { x: number; y: number }) => {
      const world = pickWorld(screenPos);
      if (!world) return null;
      const c = Cartographic.fromCartesian(world);
      const lat = CesiumMath.toDegrees(c.latitude);
      const lng = CesiumMath.toDegrees(c.longitude);
      const cb = editingModel.cropBase!;
      const dx = (lng - editingModel.lng) * metersPerDegLng;
      const dy = (lat - editingModel.lat) * metersPerDegLat;
      const half = cb.gridSize / 2;
      const col = Math.floor(dx / cb.cellSize + half);
      const row = Math.floor(dy / cb.cellSize + half);
      if (col < 0 || col >= cb.gridSize || row < 0 || row >= cb.gridSize) return null;
      return { row, col, dx, dy, lat, lng };
    };

    const mutateHeights = (mutator: (heights: number[], cb: CropBase) => void) => {
      setPlacedModels(prev => {
        const updated = prev.map(m => {
          if (m.id !== editingModel.id || !m.cropBase) return m;
          const newH = m.cropBase.heights.slice();
          mutator(newH, m.cropBase);
          return { ...m, cropBase: { ...m.cropBase, heights: newH } };
        });
        savePlacedModels(updated);
        return updated;
      });
      setEditingModel(curr => {
        if (!curr || curr.id !== editingModel.id || !curr.cropBase) return curr;
        const newH = curr.cropBase.heights.slice();
        mutator(newH, curr.cropBase);
        return { ...curr, cropBase: { ...curr.cropBase, heights: newH } };
      });
    };

    let painting = false;
    let shift = false;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Shift") shift = true; };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") shift = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const paintAt = (screenPos: { x: number; y: number }) => {
      const cb = editingModel.cropBase!;
      const cell = screenToCell(screenPos);
      if (!cell) return;
      const br = cb.brushRadius;
      const baseStrength = cb.brushStrength;
      const tool = cb.tool ?? "raise";
      // Shift swaps raise<->lower for muscle-memory inversion.
      const effectiveTool: CropBase["tool"] =
        shift && tool === "raise" ? "lower"
        : shift && tool === "lower" ? "raise"
        : tool;
      const cellsR = Math.ceil(br / cb.cellSize);
      const gs = cb.gridSize;
      mutateHeights((h) => {
        for (let dr = -cellsR; dr <= cellsR; dr++) {
          for (let dc = -cellsR; dc <= cellsR; dc++) {
            const r2 = cell.row + dr, c2 = cell.col + dc;
            if (r2 < 0 || r2 >= gs || c2 < 0 || c2 >= gs) continue;
            const d = Math.hypot(dr * cb.cellSize, dc * cb.cellSize);
            if (d > br) continue;
            const fall = 1 - d / br;
            const idx = r2 * gs + c2;
            switch (effectiveTool) {
              case "raise":
                h[idx] += baseStrength * fall;
                break;
              case "lower":
                h[idx] -= baseStrength * fall;
                break;
              case "flatten": {
                const target = cb.flattenHeight ?? 0;
                const mix = Math.min(1, baseStrength * fall);
                h[idx] = h[idx] * (1 - mix) + target * mix;
                break;
              }
              case "smooth": {
                let sum = 0, count = 0;
                for (let nr = -1; nr <= 1; nr++) {
                  for (let nc = -1; nc <= 1; nc++) {
                    const rr = r2 + nr, cc = c2 + nc;
                    if (rr < 0 || rr >= gs || cc < 0 || cc >= gs) continue;
                    sum += h[rr * gs + cc]; count++;
                  }
                }
                const avg = count > 0 ? sum / count : h[idx];
                const mix = Math.min(1, baseStrength * fall);
                h[idx] = h[idx] * (1 - mix) + avg * mix;
                break;
              }
            }
          }
        }
      });
    };

    handler.setInputAction((evt: any) => {
      paintAt(evt.position);
      painting = true;
    }, ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(() => { painting = false; }, ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction((evt: any) => {
      // Update brush cursor position every move so the user sees where they will paint.
      const world = pickWorld(evt.endPosition);
      if (world) {
        brushCursor.position = world as any;
        brushCursor.show = true as any;
        viewer.scene.requestRender();
      } else {
        brushCursor.show = false as any;
      }
      if (painting) paintAt(evt.endPosition);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
      try { viewer.entities.remove(brushCursor); } catch {}
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      ssec.enableRotate = prevRotate;
      ssec.enableTilt = prevTilt;
      ssec.enableTranslate = prevTrans;
    };
  }, [terrainEditing, editingModel?.id, editingModel?.cropBase?.tool, editingModel?.cropBase?.brushRadius, editingModel?.cropBase?.brushStrength, editingModel?.cropBase?.flattenHeight, editingModel?.lat, editingModel?.lng]);

  const handleCropBaseChange = useCallback((partial: Partial<CropBase>) => {
    if (!editingModel) return;
    setPlacedModels(prev => {
      const updated = prev.map(m => {
        if (m.id !== editingModel.id || !m.cropBase) return m;
        return { ...m, cropBase: { ...m.cropBase, ...partial } };
      });
      savePlacedModels(updated);
      return updated;
    });
    setEditingModel(curr => {
      if (!curr || curr.id !== editingModel.id || !curr.cropBase) return curr;
      return { ...curr, cropBase: { ...curr.cropBase, ...partial } };
    });
  }, [editingModel]);

  const handleResetTerrain = useCallback(() => {
    if (!editingModel?.cropBase) return;
    const size = editingModel.cropBase.gridSize;
    handleCropBaseChange({ heights: new Array(size * size).fill(0) });
  }, [editingModel, handleCropBaseChange]);

  const handleCropTile = useCallback((radius: number) => {
    if (!editingModel) return;
    const r = Math.max(1, radius);
    setPlacedModels(prev => {
      const updated = prev.map(m => {
        if (m.id !== editingModel.id) return m;
        // Preserve existing cropBase but resize the height field if the radius grew.
        let cropBase = m.cropBase;
        if (!cropBase) cropBase = DEFAULT_CROP_BASE(r);
        else {
          const newGrid = Math.max(2, Math.ceil((r * 2) / cropBase.cellSize));
          if (newGrid !== cropBase.gridSize) {
            const oldGrid = cropBase.gridSize;
            const oldH = cropBase.heights;
            const newH = new Array(newGrid * newGrid).fill(0);
            const offset = Math.floor((newGrid - oldGrid) / 2);
            for (let r2 = 0; r2 < oldGrid; r2++) {
              for (let c2 = 0; c2 < oldGrid; c2++) {
                const nr = r2 + offset, nc = c2 + offset;
                if (nr >= 0 && nr < newGrid && nc >= 0 && nc < newGrid) {
                  newH[nr * newGrid + nc] = oldH[r2 * oldGrid + c2];
                }
              }
            }
            cropBase = { ...cropBase, gridSize: newGrid, heights: newH };
          }
        }
        return { ...m, cropRadius: r, cropBase };
      });
      savePlacedModels(updated);
      return updated;
    });
    setEditingModel(current => {
      if (!current || current.id !== editingModel.id) return current;
      const cropBase = current.cropBase ?? DEFAULT_CROP_BASE(r);
      return { ...current, cropRadius: r, cropBase };
    });
  }, [editingModel]);

  const handleUncropTile = useCallback(() => {
    if (!editingModel) return;
    setPlacedModels(prev => {
      const updated = prev.map(m => m.id === editingModel.id ? { ...m, cropRadius: 0, cropBase: undefined } : m);
      savePlacedModels(updated);
      return updated;
    });
    setEditingModel(current => current?.id === editingModel.id ? { ...current, cropRadius: 0, cropBase: undefined } : current);
  }, [editingModel]);

  const placeModelOnGlobe = useCallback((model: PlacedModel, blobUrl: string) => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    const existing = viewer.entities.getById(`model-${model.id}`);
    if (existing) viewer.entities.remove(existing);

    const entity = viewer.entities.add({
      id: `model-${model.id}`,
      name: model.name,
      model: {
        uri: blobUrl,
        scale: model.scale,
        minimumPixelSize: 64,
        maximumScale: 20000,
        heightReference: 0, // NONE — required for orientation to work
      } as any,
    });

    applyModelTransformToEntity(entity, model);
  }, [applyModelTransformToEntity]);

  useEffect(() => {
    if (!isLoaded || !viewerRef.current) return;

    let cancelled = false;
    const viewer = viewerRef.current;

    const restoreModels = async () => {
      await Promise.all(placedModels.map(async (model) => {
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;

        const entityId = `model-${model.id}`;
        const existingEntity = viewer.entities.getById(entityId);
        if (existingEntity) {
          applyModelTransformToEntity(existingEntity, model);
          return;
        }

        const existingUrl = modelUrlsRef.current.get(model.id);
        if (existingUrl) {
          placeModelOnGlobe(model, existingUrl);
          return;
        }

        if (restoringModelIdsRef.current.has(model.id)) return;
        restoringModelIdsRef.current.add(model.id);

        try {
          const blob = await loadAtlasModelBlob(model.id);
          if (!blob || cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;

          const url = URL.createObjectURL(blob);
          modelUrlsRef.current.set(model.id, url);
          placeModelOnGlobe(model, url);
        } finally {
          restoringModelIdsRef.current.delete(model.id);
        }
      }));
    };

    void restoreModels();

    return () => {
      cancelled = true;
    };
  }, [applyModelTransformToEntity, isLoaded, placeModelOnGlobe, placedModels]);

  // ── Model Transform: live update entity in Cesium ──
  const handleTransformUpdate = useCallback((data: TransformData) => {
    if (!editingModel || !viewerRef.current) return;
    const viewer = viewerRef.current;
    viewer.trackedEntity = undefined;
    viewer.selectedEntity = undefined;
    const entity = viewer.entities.getById(`model-${editingModel.id}`);
    if (!entity) return;
    applyModelTransformToEntity(entity, data);
    setEditingModel(current => current?.id === editingModel.id ? { ...current, ...data } : current);
    setPlacedModels(prev => {
      const updated = prev.map((model) => model.id === editingModel.id ? { ...model, ...data } : model);
      savePlacedModels(updated);
      return updated;
    });
  }, [applyModelTransformToEntity, editingModel]);

  const handleTransformApply = useCallback((data: TransformData) => {
    if (!editingModel) return;
    setEditingModel(current => current?.id === editingModel.id ? { ...current, ...data } : current);
    setEditingModel(null);
  }, [editingModel]);

  const handleSnapToGround = useCallback((currentData: TransformData, callback: (snapped: TransformData) => void) => {
    if (!editingModel || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const entity = viewer.entities.getById(`model-${editingModel.id}`);
    if (!entity) return;

    const cartographic = Cartographic.fromDegrees(currentData.lng, currentData.lat);
    let groundHeight = currentData.alt;
    // Exclude the model itself from the ray so we sample the tile/terrain
    // beneath it, not the top of the model.
    const exclude: any[] = [entity];
    try {
      const sampled = viewer.scene.sampleHeight(cartographic, exclude);
      if (sampled !== undefined && sampled !== null && !isNaN(sampled)) {
        groundHeight = sampled;
      } else {
        const terrainHeight = viewer.scene.globe.getHeight(cartographic);
        if (terrainHeight !== undefined && terrainHeight !== null && !isNaN(terrainHeight)) {
          groundHeight = terrainHeight;
        }
      }
    } catch {
      const terrainHeight = viewer.scene.globe.getHeight(cartographic);
      if (terrainHeight !== undefined && terrainHeight !== null && !isNaN(terrainHeight)) {
        groundHeight = terrainHeight;
      }
    }

    const snapped = { ...currentData, alt: groundHeight };
    applyModelTransformToEntity(entity, snapped);
    // Persist the snapped altitude on the model itself so re-renders and
    // future edits use the new ground-locked value.
    setPlacedModels(prev => prev.map(m => m.id === editingModel.id ? { ...m, alt: groundHeight } : m));
    setEditingModel(prev => prev && prev.id === editingModel.id ? { ...prev, alt: groundHeight } : prev);
    callback(snapped);
  }, [applyModelTransformToEntity, editingModel]);

  const confirmModelPlacement = useCallback(async () => {
    if (!pendingPlacement || !modelFile || !modelName.trim()) return;

    setConvertingModel(true);
    setConvertError(null);
    try {
      const gltfBlob = await convertToGltfBlob(modelFile, setConvertProgress);
      const modelId = crypto.randomUUID();
      await saveAtlasModelBlob(modelId, gltfBlob, modelFile.name);
      const blobUrl = URL.createObjectURL(gltfBlob);

      // Sample the actual tile surface height so the model sits ON the tile
      // rather than floating at the pickPosition height (which can be off
      // for photoreal 3D tiles before the tile fully resolves).
      let surfaceAlt = pendingPlacement.alt;
      try {
        const viewer = viewerRef.current;
        if (viewer) {
          const carto = Cartographic.fromDegrees(pendingPlacement.lng, pendingPlacement.lat);
          const sampled = viewer.scene.sampleHeight(carto);
          if (typeof sampled === "number" && !isNaN(sampled)) {
            surfaceAlt = sampled;
          } else {
            const terrainH = viewer.scene.globe.getHeight(carto);
            if (typeof terrainH === "number" && !isNaN(terrainH)) surfaceAlt = terrainH;
          }
        }
      } catch {}

      const newModel: PlacedModel = {
        id: modelId,
        name: modelName.trim(),
        fileName: modelFile.name,
        lat: pendingPlacement.lat,
        lng: pendingPlacement.lng,
        alt: surfaceAlt,
        heading: modelHeading,
        pitch: 0,
        roll: 0,
        scale: modelScale,
        createdAt: Date.now(),
        category: modelCategory,
      };

      modelUrlsRef.current.set(newModel.id, blobUrl);
      placeModelOnGlobe(newModel, blobUrl);

      const updated = [...placedModels, newModel];
      setPlacedModels(updated);
      savePlacedModels(updated);
      // Remember the loaded model so subsequent dbl-clicks in Stamp mode
      // immediately stamp another instance — no dialog. This is what makes
      // the brush usable more than once.
      stampModelRef.current = {
        blobUrl,
        fileName: modelFile.name,
        name: modelName.trim(),
        baseScale: modelScale,
        baseHeading: modelHeading,
        category: modelCategory,
      };
      setStampModelInfo({ name: modelName.trim(), fileName: modelFile.name });
      setPendingPlacement(null);
      setModelFile(null);
      setModelName("");
      setModelScale(1);
      setModelHeading(0);
      setModelCategory("other");
      setConvertProgress("");
      // Reset native file input so re-picking the same file fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setConvertError(err.message || "Failed to convert model");
    } finally {
      setConvertingModel(false);
    }
  }, [pendingPlacement, modelFile, modelName, modelHeading, modelScale, placedModels, placeModelOnGlobe]);

  // Stamp a new instance of the currently-loaded stamp model at a location.
  // No dialog — just creates a new PlacedModel reusing the existing blob URL.
  const stampModelAt = useCallback(async (loc: { lat: number; lng: number; alt: number }) => {
    const stamp = stampModelRef.current;
    if (!stamp) return;
    const modelId = crypto.randomUUID();
    // Snap to ground precisely.
    let surfaceAlt = loc.alt;
    try {
      const viewer = viewerRef.current;
      if (viewer) {
        const carto = Cartographic.fromDegrees(loc.lng, loc.lat);
        const sampled = viewer.scene.sampleHeight(carto);
        if (typeof sampled === "number" && !isNaN(sampled)) surfaceAlt = sampled;
        else {
          const terrainH = viewer.scene.globe.getHeight(carto);
          if (typeof terrainH === "number" && !isNaN(terrainH)) surfaceAlt = terrainH;
        }
      }
    } catch {}

    const newModel: PlacedModel = {
      id: modelId,
      name: `${stamp.name} (${placedModels.length + 1})`,
      fileName: stamp.fileName,
      lat: loc.lat,
      lng: loc.lng,
      alt: surfaceAlt,
      heading: stamp.baseHeading,
      pitch: 0,
      roll: 0,
      scale: stamp.baseScale,
      createdAt: Date.now(),
      category: stamp.category,
    };
    modelUrlsRef.current.set(newModel.id, stamp.blobUrl);
    placeModelOnGlobe(newModel, stamp.blobUrl);
    setPlacedModels(prev => {
      const updated = [...prev, newModel];
      savePlacedModels(updated);
      return updated;
    });
    // Also persist a per-instance copy of the blob so it survives reloads.
    try {
      const resp = await fetch(stamp.blobUrl);
      const blob = await resp.blob();
      await saveAtlasModelBlob(modelId, blob, stamp.fileName);
    } catch {}
  }, [placeModelOnGlobe, placedModels.length]);

  const clearStampModel = useCallback(() => {
    stampModelRef.current = null;
    setStampModelInfo(null);
    lastStampRef.current = null;
  }, []);

  // Drop an editable terrain pad — no GLB, just a circular cropBase the user can sculpt.
  const stampTerrainAt = useCallback((loc: { lat: number; lng: number; alt: number }) => {
    const viewer = viewerRef.current;
    let surfaceAlt = loc.alt;
    if (viewer) {
      try {
        const carto = Cartographic.fromDegrees(loc.lng, loc.lat);
        const sampled = viewer.scene.sampleHeight(carto);
        if (typeof sampled === "number" && !isNaN(sampled)) surfaceAlt = sampled;
        else {
          const terrainH = viewer.scene.globe.getHeight(carto);
          if (typeof terrainH === "number" && !isNaN(terrainH)) surfaceAlt = terrainH;
        }
      } catch {}
    }
    const radius = 15;
    const id = crypto.randomUUID();
    const newModel: PlacedModel = {
      id,
      name: `Terrain Pad ${placedModels.filter(m => m.category === "terrain-pad").length + 1}`,
      fileName: "",
      lat: loc.lat,
      lng: loc.lng,
      alt: surfaceAlt,
      heading: 0,
      pitch: 0,
      roll: 0,
      scale: 1,
      createdAt: Date.now(),
      category: "terrain-pad",
      cropRadius: radius,
      cropBase: DEFAULT_CROP_BASE(radius),
    };
    // Add a small clickable marker so users can double-click to open the terrain editor.
    if (viewer) {
      try {
        viewer.entities.add({
          id: `model-${id}`,
          position: Cartesian3.fromDegrees(loc.lng, loc.lat, surfaceAlt + 1) as any,
          point: {
            pixelSize: 10,
            color: Color.fromCssColorString("#10b981"),
            outlineColor: Color.WHITE,
            outlineWidth: 2,
          } as any,
          label: {
            text: "Terrain",
            font: "11px Inter, sans-serif",
            pixelOffset: new Cartesian2(0, -18),
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            showBackground: true,
            backgroundColor: Color.fromCssColorString("rgba(15,23,42,0.85)"),
          } as any,
        });
      } catch {}
    }
    setPlacedModels(prev => {
      const updated = [...prev, newModel];
      savePlacedModels(updated);
      return updated;
    });
    setEditingModel(newModel);
    setTerrainEditing(true);
  }, [placedModels]);

  const deleteModel = useCallback(async (id: string) => {
    const updated = placedModels.filter((m) => m.id !== id);
    setPlacedModels(updated);
    savePlacedModels(updated);
    setEditingModel(current => current?.id === id ? null : current);
    if (viewerRef.current) {
      const entity = viewerRef.current.entities.getById(`model-${id}`);
      if (entity) viewerRef.current.entities.remove(entity);
    }
    const url = modelUrlsRef.current.get(id);
    if (url) { URL.revokeObjectURL(url); modelUrlsRef.current.delete(id); }
    await deleteAtlasModelBlob(id);
  }, [placedModels]);

  const flyToModel = useCallback((model: PlacedModel) => {
    if (!viewerRef.current) return;
    flyCameraToTarget(viewerRef.current, model, { range: 1400, pitchDeg: -32, radius: 80, duration: 1.6 });
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

      {/* Placed Model Labels (HTML overlay) */}
      {isLoaded && (
        <ModelLabelsOverlay
          viewer={viewerRef.current}
          models={placedModels}
          onSelect={(m) => flyToModel(m as PlacedModel)}
        />
      )}

      {/* In-world Levels — full R3F scenes geo-anchored to the globe.
          Far away the cheap green Cesium box stands in; up close the
          real level fades in and the user can Play it without leaving
          the Atlas (Esc to exit). */}
      <AtlasLevelsR3FOverlay
        viewerRef={viewerRef}
        isLoaded={isLoaded}
        placements={levelPlacements}
      />

      {/* Level Inspector — opens when the user clicks a placed Level on
          the globe. Provides info, control bars, Main Character readout
          and the ▶ Play here action. */}
      {selectedLevelPlacement && (
        <LevelInspectorPanel
          placement={selectedLevelPlacement}
          onClose={() => setSelectedLevelPlacement(null)}
          onChanged={() => { /* placements stream refresh via realtime + custom event */ }}
        />
      )}

      {/* Unified Atlas tag clustering overlay */}
      {isLoaded && (() => {
        const allTags: AtlasTag[] = [];
        // Business pins
        businessDataRef.current.forEach((data, id) => {
          allTags.push({
            kind: "biz", id,
            name: data.name,
            lat: data.lat, lng: data.lng,
            categoryId: amenityToCategoryId(data.category),
            emoji: data.emoji,
            website: data.website,
          });
        });
        // Saved POIs
        pois.forEach(p => {
          allTags.push({
            kind: "poi", id: `poi-${p.id}`,
            name: p.name, lat: p.lat, lng: p.lng,
            categoryId: "landmark",
          });
        });
        // Marketplace
        if (showMarketplacePins) {
          fetchMarketplaceProducts().forEach(p => {
            allTags.push({
              kind: "market", id: `marketplace-${p.id}`,
              name: p.name, lat: p.sellerLat, lng: p.sellerLng,
              categoryId: "shop",
              emoji: p.emoji,
            });
          });
        }
        // Reference tagsVersion to keep this block re-running.
        void tagsVersion;
        return (
          <AtlasTagsOverlay
            viewer={viewerRef.current}
            tags={allTags}
            onSelect={(t) => {
              if (t.kind === "biz") {
                const data = businessDataRef.current.get(t.id);
                if (data) setSelectedBusiness(data);
              } else if (t.kind === "market") {
                const productId = t.id.replace("marketplace-", "");
                const prod = fetchMarketplaceProducts().find(p => p.id === productId);
                if (prod) setSelectedMarketplaceProduct(prod);
              } else if (t.kind === "poi") {
                const poiId = t.id.replace("poi-", "");
                const poi = pois.find(p => p.id === poiId);
                if (poi) setSelectedPOI(poi);
              }
            }}
          />
        );
      })()}

      {/* Loading Screen */}
      {/* Loading screen removed */}

      {/* Business Store Loading Overlay */}
      {isLoaded && isLoadingBusinesses && (
        <div className="absolute inset-0 z-40 bg-[#0a0a1a]/40 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in pointer-events-none">
          <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-primary animate-spin" />
          <p className="mt-3 text-white/90 text-sm font-mono tracking-wide">LOADING STORES...</p>
        </div>
      )}
      

      {/* Brush Mode Indicator */}
      
        {brushMode && !draggingModelId && (
          <div
            className="absolute top-20 left-1/2 -translate-x-1/2 z-30"
          >
            <div className="bg-emerald-500/20 backdrop-blur-xl border border-emerald-500/40 rounded-full px-4 py-1.5 flex items-center gap-1.5">
              <Paintbrush className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-emerald-300">
                TARGETING BRUSH · {brushSubMode.toUpperCase()}
              </span>
              <span className="text-xs text-emerald-400/60">
                {brushSubMode === "reticle" && "— Double-click to lock target"}
                {brushSubMode === "area" && "— Double-click to set area center"}
                {brushSubMode === "stamp" && (stampModelInfo ? "— Double-click to stamp" : "— Double-click to upload first model")}
                {brushSubMode === "tiles" && (
                  tilesTool === "grid" ? "— Double-click to toggle tile"
                  : tilesTool === "rectangle" ? (rectStart ? "— Double-click second corner" : "— Double-click first corner")
                  : tilesTool === "lasso" ? "— Double-click to add lasso vertex"
                  : "— Double-click to drop a terrain pad"
                )}
              </span>
            </div>
          </div>
        )}
      

      {/* Dragging Model Indicator */}
      
        {draggingModelId && (
          <div
            className="absolute top-20 left-1/2 -translate-x-1/2 z-30"
          >
            <div className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/40 rounded-full px-4 py-1.5 flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-sm font-medium text-cyan-300">DRAGGING MODEL</span>
              <span className="text-xs text-cyan-400/60">— Release to place</span>
            </div>
          </div>
        )}
      

      {/* ── HUD Overlay ── */}
      {isLoaded && hudVisible && (
        <>
          {/* Top Bar */}
          <div
            className="absolute top-0 left-0 right-0 z-20 p-1.5 sm:p-3"
          >
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex items-center gap-2.5">
                <Link to="/">
                  <GlassPanel className="p-2 cursor-pointer hover:bg-black/75 transition-colors">
                    <ArrowLeft className="w-4 h-4 text-white/70" />
                  </GlassPanel>
                </Link>
                <div className="hidden sm:block">
                  <GlassPanel className="px-3 py-2 flex items-center gap-1.5">
                    <GlyphIcon name="atlas" alt="Atlas" glow="#22d3ee" />
                    <span className="text-sm font-bold">ATLAS</span>
                  </GlassPanel>
                </div>
              </div>

              <GlassPanel className="flex items-center flex-nowrap gap-1 p-1 overflow-x-auto max-w-[calc(100vw-5rem)] sm:max-w-none sm:flex-wrap sm:overflow-visible">
                  <button
                    onClick={toggleBuildings}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${showBuildings ? "bg-primary/20 text-primary" : "text-white/75 hover:text-white"}`}
                    title="Toggle Buildings On/Off"
                  >
                    <GlyphIcon name="layers" alt="Toggle Buildings" glow={showBuildings ? "#22d3ee" : undefined} />
                  </button>
                  <button
                    onClick={resetView}
                    className="p-1 rounded-md text-white/75 hover:text-white transition-colors shrink-0"
                    title="Global View"
                  >
                    <GlyphIcon name="compass" alt="Global View" />
                  </button>
                  <button
                    onClick={() => setPoisPanelOpen(!poisPanelOpen)}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${poisPanelOpen ? "bg-yellow-500/20 text-yellow-400" : "text-white/75 hover:text-white"}`}
                    title="Interest Points"
                  >
                    <GlyphIcon name="poi" alt="Interest Points" glow={poisPanelOpen ? "#facc15" : undefined} />
                  </button>
                  {/* Tile Brush Toggle */}
                  <button
                    onClick={() => { setBrushMode(!brushMode); setBrushPanelOpen(!brushMode); }}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${brushMode ? "bg-emerald-500/20 text-emerald-400" : "text-white/75 hover:text-white"}`}
                    title="Tile Brush — Place 3D Models"
                  >
                    <GlyphIcon name="brush" alt="Tile Brush" glow={brushMode ? "#34d399" : undefined} />
                  </button>
                  {/* Directions Toggle */}
                  <button
                    onClick={() => setDirectionsOpen(!directionsOpen)}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${directionsOpen ? "bg-blue-500/20 text-blue-400" : "text-white/75 hover:text-white"}`}
                    title="Directions & Routes"
                  >
                    <GlyphIcon name="route" alt="Directions" glow={directionsOpen ? "#60a5fa" : undefined} />
                  </button>
                  {/* Trade Routes Toggle (merged cargo routes + live traffic) */}
                  <button
                    onClick={() => {
                      const next = !showCargoRoutes;
                      setShowCargoRoutes(next);
                      setShowLiveTraffic(next);
                    }}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${showCargoRoutes ? "bg-amber-500/20 text-amber-400" : "text-white/75 hover:text-white"}`}
                    title="Trade Routes"
                  >
                    <GlyphIcon name="cargo" alt="Trade Routes" glow={showCargoRoutes ? "#fbbf24" : undefined} />
                  </button>
                  {/* Uber Direct Delivery */}
                  <button
                    onClick={() => setDeliveryPanelOpen(!deliveryPanelOpen)}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${deliveryPanelOpen ? "bg-primary/20 text-primary" : "text-white/75 hover:text-white"}`}
                    title="Uber Direct Delivery"
                  >
                    <GlyphIcon name="speed" alt="Delivery" glow={deliveryPanelOpen ? "#22d3ee" : undefined} />
                  </button>
                  {/* Marketplace Pins Toggle */}
                  <button
                    onClick={() => setShowMarketplacePins(!showMarketplacePins)}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${showMarketplacePins ? "bg-violet-500/20 text-violet-400" : "text-white/75 hover:text-white"}`}
                    title="Marketplace Products"
                  >
                    <GlyphIcon name="market" alt="Marketplace" glow={showMarketplacePins ? "#a78bfa" : undefined} />
                  </button>
                  {/* Intelligence — Traffic Cameras */}
                  <button
                    onClick={() => setIntelligenceOpen(o => !o)}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${intelligenceOpen ? "bg-red-500/20 text-red-400" : "text-white/75 hover:text-white"}`}
                    title="Intelligence — Live Traffic Cameras"
                  >
                    <GlyphIcon name="camera" alt="Traffic Cameras" glow={intelligenceOpen ? "#f87171" : undefined} />
                  </button>
                  {/* Recordings Gallery */}
                  <button
                    onClick={() => setRecordingsOpen(o => !o)}
                    className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${recordingsOpen ? "bg-red-500/20 text-red-400" : "text-white/75 hover:text-white"}`}
                    title="Camera recordings gallery"
                  >
                    <GlyphIcon name="telemetry" alt="Recordings" glow={recordingsOpen ? "#f87171" : undefined} />
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="p-1 rounded-md text-white/75 hover:text-white transition-colors shrink-0"
                    title="Fullscreen"
                  >
                    {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </GlassPanel>
            </div>
          </div>




          {/* ── CARGO ROUTES PANEL ── */}
          
            {showCargoRoutes && (
              <div
                className="absolute bottom-24 left-4 z-30 w-[calc(100vw-2rem)] max-w-64"
              >
                <GlassPanel className="p-3">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Ship className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-bold text-white">Trade Routes</span>
                    <button onClick={() => { setShowCargoRoutes(false); setShowLiveTraffic(false); setSelectedRoute(null); }} className="ml-auto">
                      <X className="w-3.5 h-3.5 text-white/75 hover:text-white" />
                    </button>
                  </div>

                  {/* Live Traffic Stats */}
                  <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-1.5 text-center">
                      <div className="text-lg font-bold font-mono text-yellow-400">{liveTrafficStats.planes.toLocaleString()}</div>
                      <div className="text-[9px] text-yellow-400/60 uppercase">✈ Live Aircraft</div>
                    </div>
                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-1.5 text-center">
                      <div className="text-lg font-bold font-mono text-cyan-400">{liveTrafficStats.ships.toLocaleString()}</div>
                      <div className="text-[9px] text-cyan-400/60 uppercase">🚢 Live Vessels</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-white/70 font-mono text-center mb-2.5">
                    Aircraft: OpenSky · 10s | Ships: AISStream · Real-time WS
                  </div>

                  {/* Type / Category Filter */}
                  <div className="flex gap-1 mb-1.5">
                    {(["all","maritime","air"] as const).map(f => (
                      <button key={f} onClick={() => setCargoFilter(f)}
                        className={`flex-1 px-1.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all ${
                          cargoFilter === f
                            ? f === "maritime" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : f === "air" ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-black/70 text-white/70 border border-white/[0.06] hover:text-white/85"
                        }`}>{f === "all" ? "All" : f === "maritime" ? "Sea" : "Air"}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2.5">
                    {[{id:"all" as const,label:"All",icon:"🌐"}, ...CARGO_CATEGORIES.filter(c => cargoFilter === "all" || (cargoFilter === "maritime" ? !c.id.startsWith("air-") : c.id.startsWith("air-")))].map(c => (
                      <button key={c.id} onClick={() => setCargoTypeFilter(c.id as any)}
                        className={`px-1.5 py-1 rounded-md text-[9px] font-mono transition-all ${cargoTypeFilter === c.id ? "bg-white/10 text-white border border-white/20" : "bg-black/65 text-white/25 border border-white/[0.05] hover:text-white/80"}`}>
                        {c.icon} {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Route count */}
                  <div className="flex items-center justify-between text-[9px] text-white/70 font-mono mb-2.5">
                    <span>{(cargoFilter === "all" ? ALL_CARGO_ROUTES : ALL_CARGO_ROUTES.filter(r => r.type === cargoFilter)).length} routes</span>
                  </div>

                  {/* Selected Route Card */}
                  {selectedRoute && (
                    <div className="bg-black/70 border border-white/[0.08] rounded-lg p-2.5 mb-1.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-white">{selectedRoute.name}</span>
                        <button onClick={() => setSelectedRoute(null)}><X className="w-2.5 h-2.5 text-white/70" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div><span className="text-white/70">Type</span><br/><span className="text-white font-mono">{CARGO_CATEGORIES.find(c=>c.id===selectedRoute.category)?.icon} {CARGO_CATEGORIES.find(c=>c.id===selectedRoute.category)?.label}</span></div>
                        <div><span className="text-white/70">Distance</span><br/><span className="text-white font-mono">{selectedRoute.distance}</span></div>
                        <div><span className="text-white/70">Transit</span><br/><span className="text-white font-mono">{selectedRoute.transitTime}</span></div>
                        <div><span className="text-white/70">Transit</span><br/><span className="text-white font-mono">{selectedRoute.transitTime}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Route Category Legend */}
                  <div className="mt-2.5 space-y-1 border-t border-white/[0.06] pt-1.5">
                    <div className="text-[9px] text-white/70 uppercase tracking-wider mb-1">Route Categories</div>
                    <div className="flex flex-wrap gap-1">
                      {CARGO_CATEGORIES.slice(0, 7).map(c => (
                        <span key={c.id} className="text-[9px] text-white/75">{c.icon} {c.label}</span>
                      ))}
                    </div>
                  </div>
                </GlassPanel>
              </div>
            )}
          




          {/* ── DIRECTIONS PANEL ── */}
          
            {directionsOpen && (
              <div
                className="absolute top-20 left-4 z-30 w-[calc(100vw-2rem)] max-w-80"
              >
                <GlassPanel className="p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Route className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-bold text-white">Directions</span>
                    </div>
                    <button onClick={() => setDirectionsOpen(false)}>
                      <X className="w-3.5 h-3.5 text-white/75 hover:text-white" />
                    </button>
                  </div>

                  {/* Origin Input */}
                  <div className="relative mb-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                      <span className="text-[10px] text-white/75 uppercase tracking-wider">From</span>
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
                      className="w-full bg-black/70 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-400/40 placeholder:text-white/85 transition-colors"
                    />
                    {showOriginResults && originResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-36 overflow-y-auto bg-black/90 backdrop-blur-xl border border-white/[0.1] rounded-lg">
                        {originResults.map((r, i) => (
                          <button key={i} onClick={() => selectRoutePoint(r, "origin")}
                            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-black/75 text-sm text-white/80 truncate">
                            {getTypeIcon(r.type)}
                            <span className="truncate">{r.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Destination Input */}
                  <div className="relative mb-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <span className="text-[10px] text-white/75 uppercase tracking-wider">To</span>
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
                      className="w-full bg-black/70 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-400/40 placeholder:text-white/85 transition-colors"
                    />
                    {showDestResults && destResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-36 overflow-y-auto bg-black/90 backdrop-blur-xl border border-white/[0.1] rounded-lg">
                        {destResults.map((r, i) => (
                          <button key={i} onClick={() => selectRoutePoint(r, "dest")}
                            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-black/75 text-sm text-white/80 truncate">
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
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-sm font-medium text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mb-2.5"
                  >
                    {routeLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating...</>
                    ) : (
                      <><Navigation className="w-3.5 h-3.5" /> Get Directions</>
                    )}
                  </button>

                  {/* Route Error */}
                  {routeError && (
                    <div className="flex items-start gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mb-2.5">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-300">{routeError}</p>
                    </div>
                  )}

                  {/* Route Info */}
                  {routeInfo && (
                    <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5 mb-2.5">
                      <p className="text-[9px] text-white/75 uppercase tracking-wider mb-1.5">Route Summary</p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex items-center gap-1.5">
                          <Ruler className="w-3.5 h-3.5 text-blue-400" />
                          <div>
                            <p className="text-[9px] text-white/70">Distance</p>
                            <p className="text-sm font-mono text-white">
                              {routeInfo.distance > 1000
                                ? `${(routeInfo.distance / 1000).toFixed(1)} km`
                                : `${routeInfo.distance.toFixed(0)} m`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-400" />
                          <div>
                            <p className="text-[9px] text-white/70">Duration</p>
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
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500/20 border border-green-500/30 rounded-lg text-sm font-medium text-green-400 hover:bg-green-500/30 transition-colors mb-2.5"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Journey
                    </button>
                  )}

                  {/* Journey Progress */}
                  {journeyActive && (
                    <div className="mb-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-white/75 uppercase tracking-wider">Navigating...</span>
                        <span className="text-xs font-mono text-blue-400">{journeyProgress}%</span>
                      </div>
                      <div className="w-full h-1 bg-black/75 rounded-full overflow-hidden mb-2.5">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full transition-all duration-100"
                          style={{ width: `${journeyProgress}%` }}
                        />
                      </div>
                      <button
                        onClick={stopJourney}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        <StopIcon className="w-3.5 h-3.5" /> Stop Journey
                      </button>
                    </div>
                  )}

                  {/* Clear Route */}
                  {(routeInfo || originPoint || destPoint) && (
                    <button
                      onClick={clearRoute}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-black/70 border border-white/[0.08] rounded-lg text-sm text-white/80 hover:text-white transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Clear Route
                    </button>
                  )}
                </GlassPanel>
              </div>
            )}
          

          {/* ── UBER DIRECT DELIVERY PANEL ── */}
          {deliveryPanelOpen && (
            <div className="absolute top-20 right-4 z-30 w-[calc(100vw-2rem)] max-w-80">
              <GlassPanel className="p-3">
                <AtlasDeliveryPanel
                  onClose={() => { setDeliveryPanelOpen(false); setDeliveryPickupPrefill(undefined); }}
                  initialPickup={deliveryPickupPrefill}
                />
              </GlassPanel>
            </div>
          )}

          {/* POI Naming Dialog */}
          
            {namingPOI && (
              <div
                className={isMobile
                  ? "absolute inset-x-3 bottom-24 z-40 max-h-[calc(100dvh-9rem)]"
                  : "absolute top-1/2 left-1/2 z-40 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 px-3"
                }
              >
                <GlassPanel className={isMobile ? "max-h-[calc(100dvh-9rem)] overflow-y-auto p-3" : "p-4"}>
                  <div className="mb-3 flex items-start gap-1.5">
                    <MapPin className="mt-0.5 w-4 h-4 text-yellow-400 shrink-0" />
                    <h3 className="min-w-0 text-sm font-bold text-white">Create Point of Interest</h3>
                  </div>
                  <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5 mb-3">
                    <p className="text-[9px] text-white/75 uppercase tracking-wider mb-1">Exact Coordinates</p>
                    <div className="grid grid-cols-1 gap-1.5 text-xs font-mono text-white/70 xs:grid-cols-3">
                      <div><span className="text-[8px] text-white/70">LAT</span><p>{namingPOI.lat.toFixed(6)}°</p></div>
                      <div><span className="text-[8px] text-white/70">LNG</span><p>{namingPOI.lng.toFixed(6)}°</p></div>
                      <div><span className="text-[8px] text-white/70">ALT</span><p>{formatAlt(namingPOI.alt)}</p></div>
                    </div>
                  </div>
                  <input
                    type="text" autoFocus value={poiName}
                    onChange={(e) => setPoiName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && poiName.trim()) confirmPOI(); if (e.key === "Escape") setNamingPOI(null); }}
                    placeholder="Name this point..."
                    className="w-full bg-black/70 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/40 placeholder:text-white/85 transition-colors mb-2.5"
                  />
                  <textarea
                    value={poiDescription} onChange={(e) => setPoiDescription(e.target.value)}
                    placeholder="Description (optional)..." rows={3}
                    className="w-full bg-black/70 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/40 placeholder:text-white/85 transition-colors resize-none"
                  />
                  <div className={isMobile ? "mt-3 flex flex-col-reverse gap-1.5" : "mt-3 flex gap-1.5"}>
                    <button onClick={confirmPOI} disabled={!poiName.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-sm font-medium text-yellow-400 hover:bg-yellow-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <Check className="w-3.5 h-3.5" /> Save Point
                    </button>
                    <button onClick={() => setNamingPOI(null)}
                      className="px-3 py-1.5 bg-black/70 border border-white/[0.08] rounded-lg text-sm text-white/80 hover:text-white transition-colors">
                      Cancel
                    </button>
                  </div>
                </GlassPanel>
              </div>
            )}
          

          {/* ── MODEL PLACEMENT DIALOG ── */}
          
            {pendingPlacement && (
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-md px-3"
              >
                <GlassPanel className="p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Paintbrush className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Place 3D Model</h3>
                  </div>

                  {/* Coordinates */}
                  <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5 mb-3">
                    <p className="text-[9px] text-white/75 uppercase tracking-wider mb-1">Placement Location</p>
                    <div className="grid grid-cols-3 gap-1.5 text-xs font-mono text-white/70">
                      <div><span className="text-[8px] text-white/70">LAT</span><p>{pendingPlacement.lat.toFixed(6)}°</p></div>
                      <div><span className="text-[8px] text-white/70">LNG</span><p>{pendingPlacement.lng.toFixed(6)}°</p></div>
                      <div><span className="text-[8px] text-white/70">ALT</span><p>{formatAlt(pendingPlacement.alt)}</p></div>
                    </div>
                  </div>

                  {/* File Upload */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-lg p-3 mb-3 cursor-pointer transition-colors text-center ${
                      modelFile
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-white/[0.1] bg-black/60 hover:border-emerald-500/30"
                    }`}
                  >
                    {modelFile ? (
                      <div className="flex items-center gap-2.5 justify-center">
                        <Box className="w-4 h-4 text-emerald-400" />
                        <div className="text-left">
                          <p className="text-sm text-white font-medium truncate max-w-[170px]">{modelFile.name}</p>
                          <div className="flex items-center gap-1.5">
                            <p className="text-[10px] text-white/70">{(modelFile.size / 1024 / 1024).toFixed(2)} MB</p>
                            <span className={`text-[9px] px-1 py-0.5 rounded-full ${
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
                        <Upload className="w-7 h-7 text-white/85 mx-auto mb-1.5" />
                        <p className="text-sm text-white/75">Upload 3D Model</p>
                        <p className="text-[10px] text-white/85 mt-1 leading-relaxed">
                          glTF · OBJ · FBX · STL · PLY · DAE · AutoCAD · SketchUp · Blender · Unreal & more
                        </p>
                      </>
                    )}
                    {convertError && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-left bg-red-500/10 border border-red-500/20 rounded-md p-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-300">{convertError}</p>
                      </div>
                    )}
                  </div>

                  {/* Model Name */}
                  <input
                    type="text" value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="Model name..."
                    className="w-full bg-black/70 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40 placeholder:text-white/85 transition-colors mb-2.5"
                  />

                  {/* Category Picker */}
                  <div className="mb-2.5">
                    <p className="text-[9px] text-white/75 uppercase tracking-wider mb-1">Category</p>
                    <div className="flex flex-wrap gap-1">
                      {MODEL_CATEGORIES.map((c) => {
                        const Icon = c.icon;
                        const active = modelCategory === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setModelCategory(c.id)}
                            className="flex items-center gap-1 px-1.5 py-1 rounded-full text-[10px] font-medium transition-all"
                            style={{
                              background: active ? `${c.hex}33` : "rgba(0,0,0,0.5)",
                              border: `1px solid ${active ? c.hex : "rgba(255,255,255,0.08)"}`,
                              color: active ? c.hex : "rgba(255,255,255,0.7)",
                            }}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scale & Heading Controls */}
                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <Scale className="w-2.5 h-2.5 text-white/75" />
                        <p className="text-[9px] text-white/75 uppercase tracking-wider">Scale</p>
                      </div>
                      <input
                        type="range" min="0.1" max="100" step="0.1"
                        value={modelScale}
                        onChange={(e) => setModelScale(parseFloat(e.target.value))}
                        className="w-full accent-emerald-400"
                      />
                      <p className="text-[10px] text-white/80 font-mono text-center">{modelScale}x</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <RotateCcw className="w-2.5 h-2.5 text-white/75" />
                        <p className="text-[9px] text-white/75 uppercase tracking-wider">Heading</p>
                      </div>
                      <input
                        type="range" min="0" max="360" step="1"
                        value={modelHeading}
                        onChange={(e) => setModelHeading(parseInt(e.target.value))}
                        className="w-full accent-emerald-400"
                      />
                      <p className="text-[10px] text-white/80 font-mono text-center">{modelHeading}°</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={confirmModelPlacement}
                      disabled={!modelFile || !modelName.trim() || convertingModel}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {convertingModel ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {convertProgress || "Converting..."}</>
                      ) : (
                        <><Check className="w-3.5 h-3.5" /> Place Model</>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setPendingPlacement(null);
                        setModelFile(null);
                        setModelName("");
                        setModelCategory("other");
                        setConvertError(null);
                        setConvertProgress("");
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="px-3 py-1.5 bg-black/70 border border-white/[0.08] rounded-lg text-sm text-white/80 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </GlassPanel>
              </div>
            )}
          

          {/* ── TILE BRUSH PANEL (Placed Models) ── */}
          
            {brushPanelOpen && !pendingPlacement && (
              <div
                className="absolute top-20 right-4 z-30 w-[calc(100vw-2rem)] max-w-72"
              >
                <GlassPanel className="p-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <Paintbrush className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-sm font-bold text-white">Targeting Brush</span>
                      <span className="text-[10px] text-white/70 font-mono">({placedModels.length})</span>
                    </div>
                    <button onClick={() => { setBrushPanelOpen(false); setBrushMode(false); }}>
                      <X className="w-3.5 h-3.5 text-white/75 hover:text-white" />
                    </button>
                  </div>

                  {/* Mode tabs */}
                  <div className="grid grid-cols-4 gap-1 p-1 bg-black/60 border border-white/[0.06] rounded-lg mb-2.5">
                    {(["reticle", "area", "stamp", "tiles"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setBrushSubMode(m)}
                        className={`px-1.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                          brushSubMode === m
                            ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/30"
                            : "text-white/60 hover:text-white border border-transparent"
                        }`}
                        title={
                          m === "reticle" ? "Live targeting info" :
                          m === "area" ? "Paint a zone & scan" :
                          m === "stamp" ? "Stamp 3D models" :
                          "Select map tiles (XYZ)"
                        }
                      >
                        {m === "reticle" ? "Reticle" : m === "area" ? "Area" : m === "stamp" ? "Stamp" : "Tiles"}
                      </button>
                    ))}
                  </div>

                  {/* ── Reticle mode body ── */}
                  {brushSubMode === "reticle" && (
                    <div className="space-y-2.5">
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                        <p className="text-[10px] text-emerald-400/80 leading-relaxed">
                          Move the mouse to read live coordinates. <span className="font-bold">Double-click</span> to lock target.
                        </p>
                      </div>
                      <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5">
                        <p className="text-[9px] text-white/70 uppercase tracking-wider mb-1.5">Cursor</p>
                        {cursorInfo ? (
                          <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono text-white/85">
                            <div><span className="text-[8px] text-white/60 block">LAT</span>{cursorInfo.lat.toFixed(6)}°</div>
                            <div><span className="text-[8px] text-white/60 block">LNG</span>{cursorInfo.lng.toFixed(6)}°</div>
                            <div><span className="text-[8px] text-white/60 block">ALT</span>{formatAlt(cursorInfo.alt)}</div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-white/40">Move mouse over the globe…</p>
                        )}
                      </div>
                      {reticleTarget && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5">
                          <p className="text-[9px] text-emerald-300 uppercase tracking-wider mb-1.5">Locked Target</p>
                          <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono text-white/90 mb-2.5">
                            <div><span className="text-[8px] text-white/60 block">LAT</span>{reticleTarget.lat.toFixed(6)}°</div>
                            <div><span className="text-[8px] text-white/60 block">LNG</span>{reticleTarget.lng.toFixed(6)}°</div>
                            <div><span className="text-[8px] text-white/60 block">ALT</span>{formatAlt(reticleTarget.alt)}</div>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => {
                                if (!reticleTarget) return;
                                setNamingPOI(reticleTarget);
                                setPoiName("");
                                setPoiDescription("");
                              }}
                              className="flex-1 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-md text-[11px] text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                            >
                              Save POI
                            </button>
                            <button
                              onClick={() => {
                                if (!reticleTarget) return;
                                navigator.clipboard?.writeText(`${reticleTarget.lat.toFixed(6)}, ${reticleTarget.lng.toFixed(6)}`);
                              }}
                              className="px-2.5 py-1 bg-black/70 border border-white/[0.08] rounded-md text-[11px] text-white/80 hover:text-white transition-colors"
                            >
                              Copy
                            </button>
                            <button
                              onClick={() => setReticleTarget(null)}
                              className="px-2.5 py-1 bg-black/70 border border-white/[0.08] rounded-md text-[11px] text-white/60 hover:text-white transition-colors"
                              title="Clear lock"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Area mode body ── */}
                  {brushSubMode === "area" && (
                    <div className="space-y-2.5">
                      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-2.5">
                        <p className="text-[10px] text-cyan-300/80 leading-relaxed">
                          <span className="font-bold">Double-click</span> the globe to set the area center. Adjust radius below, then Scan.
                        </p>
                      </div>
                      <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[9px] text-white/70 uppercase tracking-wider">Radius</p>
                          <p className="text-[11px] text-white/85 font-mono">
                            {areaRadiusM >= 1000 ? `${(areaRadiusM/1000).toFixed(2)} km` : `${areaRadiusM} m`}
                          </p>
                        </div>
                        <input
                          type="range" min={10} max={5000} step={10}
                          value={areaRadiusM}
                          onChange={(e) => setAreaRadiusM(parseInt(e.target.value))}
                          className="w-full accent-cyan-400"
                        />
                        <p className="text-[9px] text-white/50 mt-1">
                          Area: {(Math.PI * areaRadiusM * areaRadiusM / 1e6).toFixed(3)} km²
                        </p>
                      </div>
                      {areaCenter ? (
                        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-2.5">
                          <p className="text-[9px] text-cyan-300 uppercase tracking-wider mb-1.5">Center</p>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-white/90 mb-2.5">
                            <div><span className="text-[8px] text-white/60 block">LAT</span>{areaCenter.lat.toFixed(6)}°</div>
                            <div><span className="text-[8px] text-white/60 block">LNG</span>{areaCenter.lng.toFixed(6)}°</div>
                          </div>
                          <div className="flex gap-1.5 mb-1.5">
                            <button
                              disabled={areaScanning}
                              onClick={async () => {
                                if (!areaCenter) return;
                                setAreaScanning(true);
                                setAreaScanResults([]);
                                try {
                                  const controller = new AbortController();
                                  const results = await runOverpassAround("", areaCenter, areaRadiusM / 1000, controller.signal);
                                  setAreaScanResults(results.slice(0, 50));
                                } finally {
                                  setAreaScanning(false);
                                }
                              }}
                              className="flex-1 px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded-md text-[11px] text-cyan-300 hover:bg-cyan-500/30 transition-colors disabled:opacity-40"
                            >
                              {areaScanning ? <Loader2 className="w-2.5 h-2.5 animate-spin inline" /> : "Scan POIs"}
                            </button>
                            <button
                              onClick={() => {
                                if (!areaCenter) return;
                                // Build a 64-vertex circle GeoJSON polygon
                                const pts: [number, number][] = [];
                                const R = 6378137;
                                const lat0 = areaCenter.lat * Math.PI/180;
                                const lng0 = areaCenter.lng * Math.PI/180;
                                const d = areaRadiusM / R;
                                for (let i = 0; i <= 64; i++) {
                                  const brg = (i / 64) * 2 * Math.PI;
                                  const lat = Math.asin(Math.sin(lat0)*Math.cos(d) + Math.cos(lat0)*Math.sin(d)*Math.cos(brg));
                                  const lng = lng0 + Math.atan2(Math.sin(brg)*Math.sin(d)*Math.cos(lat0), Math.cos(d) - Math.sin(lat0)*Math.sin(lat));
                                  pts.push([lng * 180/Math.PI, lat * 180/Math.PI]);
                                }
                                const geojson = {
                                  type: "Feature",
                                  properties: { radius_m: areaRadiusM, center: [areaCenter.lng, areaCenter.lat] },
                                  geometry: { type: "Polygon", coordinates: [pts] },
                                };
                                const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url; a.download = `area-${Date.now()}.geojson`; a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="px-2.5 py-1 bg-black/70 border border-white/[0.08] rounded-md text-[11px] text-white/80 hover:text-white transition-colors"
                            >
                              GeoJSON
                            </button>
                            <button
                              onClick={() => { setAreaCenter(null); setAreaScanResults([]); }}
                              className="px-1.5 py-1 bg-black/70 border border-white/[0.08] rounded-md text-[11px] text-white/60 hover:text-white transition-colors"
                              title="Clear area"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {areaScanResults.length > 0 && (
                            <div className="max-h-36 overflow-y-auto space-y-1 mt-1.5">
                              {areaScanResults.map((r, i) => (
                                <div key={i} className="px-1.5 py-1 rounded-md bg-black/40 hover:bg-black/60 transition-colors">
                                  <p className="text-[11px] text-white/90 truncate">{r.name}</p>
                                  <p className="text-[9px] text-white/50 font-mono">
                                    {r.type}{r.distance != null ? ` · ${(r.distance/1000).toFixed(2)} km` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-3 text-[11px] text-white/40">
                          Double-click globe to set center
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Stamp mode body ── */}
                  {brushSubMode === "stamp" && (
                    <div className="space-y-2.5">
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                        <p className="text-[10px] text-emerald-400/80 leading-relaxed">
                          {stampModelInfo
                            ? <><span className="font-bold">Double-click</span> the globe to stamp another copy — no dialog. Clear the model below to switch.</>
                            : <><span className="font-bold">Double-click</span> the globe to open the upload dialog. After your first placement, every double-click stamps another instance.</>
                          }
                        </p>
                      </div>
                      {stampModelInfo && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
                          <Box className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-white truncate font-medium">{stampModelInfo.name}</p>
                            <p className="text-[9px] text-white/60 truncate">{stampModelInfo.fileName}</p>
                          </div>
                          <button
                            onClick={clearStampModel}
                            className="px-1.5 py-1 rounded-md text-[10px] text-white/70 hover:text-white border border-white/[0.08] hover:bg-black/60 transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                      <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[9px] text-white/70 uppercase tracking-wider">Min spacing</p>
                          <p className="text-[11px] text-white/85 font-mono">
                            {stampSpacingM === 0 ? "off" : `${stampSpacingM} m`}
                          </p>
                        </div>
                        <input
                          type="range" min={0} max={500} step={5}
                          value={stampSpacingM}
                          onChange={(e) => setStampSpacingM(parseInt(e.target.value))}
                          className="w-full accent-emerald-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* ── Tiles mode body ── */}
                  {brushSubMode === "tiles" && (
                    <div className="space-y-2.5">
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                        <p className="text-[10px] text-emerald-400/80 leading-relaxed">
                          Select <span className="font-bold">Web Mercator XYZ map tiles</span> (the actual tiles the Earth is built from).
                          Choose a tool, then double-click the globe.
                        </p>
                      </div>

                      {/* Tool picker */}
                      <div className="grid grid-cols-4 gap-1 p-1 bg-black/60 border border-white/[0.06] rounded-lg">
                        {(["grid", "rectangle", "lasso", "terrain"] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => { setTilesTool(t); setRectStart(null); setLassoPoints([]); }}
                            className={`px-1.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                              tilesTool === t
                                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/30"
                                : "text-white/60 hover:text-white border border-transparent"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>

                      {/* Zoom (tile size) */}
                      <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[9px] text-white/70 uppercase tracking-wider">Tile zoom (z)</p>
                          <p className="text-[11px] text-white/85 font-mono">
                            z{tileZoom} · ~{tileSizeMeters(cursorInfo?.lat ?? 0, tileZoom).toFixed(1)} m
                          </p>
                        </div>
                        <input
                          type="range" min={6} max={22} step={1}
                          value={tileZoom}
                          onChange={(e) => setTileZoom(parseInt(e.target.value))}
                          className="w-full accent-emerald-400"
                        />
                        <p className="text-[9px] text-white/50 mt-1">
                          Higher z = smaller tiles. z18 ≈ building; z14 ≈ neighborhood; z10 ≈ city.
                        </p>
                      </div>

                      {/* Tool-specific hint / lasso close */}
                      {tilesTool === "rectangle" && rectStart && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-1.5 text-[10px] text-amber-300">
                          First corner set at {rectStart.lat.toFixed(4)}, {rectStart.lng.toFixed(4)}. Double-click the opposite corner.
                          <button onClick={() => setRectStart(null)} className="ml-1.5 underline">cancel</button>
                        </div>
                      )}
                      {tilesTool === "lasso" && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-1.5 text-[10px] text-amber-300 flex items-center justify-between gap-1.5">
                          <span>{lassoPoints.length} vertex{lassoPoints.length === 1 ? "" : "es"}</span>
                          <div className="flex gap-1">
                            <button
                              disabled={lassoPoints.length < 3}
                              onClick={() => {
                                // Compute tile bbox of polygon, then select tiles whose centers are inside.
                                const lats = lassoPoints.map(p => p.lat);
                                const lngs = lassoPoints.map(p => p.lng);
                                const nw = lngLatToTile(Math.max(...lats), Math.min(...lngs), tileZoom);
                                const se = lngLatToTile(Math.min(...lats), Math.max(...lngs), tileZoom);
                                const next = new Set(selectedTiles);
                                for (let xi = Math.min(nw.x, se.x); xi <= Math.max(nw.x, se.x); xi++) {
                                  for (let yi = Math.min(nw.y, se.y); yi <= Math.max(nw.y, se.y); yi++) {
                                    const b = tileBounds(xi, yi, tileZoom);
                                    const cLat = (b.north + b.south) / 2;
                                    const cLng = (b.east + b.west) / 2;
                                    if (pointInPoly(cLat, cLng, lassoPoints)) next.add(tileKey(tileZoom, xi, yi));
                                  }
                                }
                                setSelectedTiles(next);
                                setLassoPoints([]);
                              }}
                              className="px-1.5 py-0.5 rounded bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 disabled:opacity-40"
                            >
                              Close & select
                            </button>
                            <button onClick={() => setLassoPoints([])} className="px-1.5 py-0.5 rounded bg-black/60 border border-white/10 text-white/70">
                              clear
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Selection summary + batch actions */}
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[9px] text-emerald-300 uppercase tracking-wider">Selection</p>
                          <p className="text-[11px] text-white/90 font-mono">{selectedTiles.size} tile{selectedTiles.size === 1 ? "" : "s"}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                          <button
                            disabled={selectedTiles.size === 0 || tilesScanning}
                            onClick={async () => {
                              if (selectedTiles.size === 0) return;
                              setTilesScanning(true);
                              setTilesScanResults([]);
                              try {
                                // Union bounds; query Overpass via center+radius covering bbox diagonal.
                                let n = -90, s = 90, e = -180, w = 180;
                                selectedTiles.forEach(k => {
                                  const { z, x, y } = parseTileKey(k);
                                  const b = tileBounds(x, y, z);
                                  n = Math.max(n, b.north); s = Math.min(s, b.south);
                                  e = Math.max(e, b.east);  w = Math.min(w, b.west);
                                });
                                const center = { lat: (n + s) / 2, lng: (e + w) / 2 };
                                const diagKm = geoHaversine(n, w, s, e);
                                const radiusKm = Math.max(0.05, diagKm / 2);
                                const ctrl = new AbortController();
                                const results = await runOverpassAround("", center, radiusKm, ctrl.signal);
                                // Filter to results actually inside selected tiles
                                const filtered = results.filter(r => {
                                  const { x, y } = lngLatToTile(r.lat, r.lng, tileZoom);
                                  return selectedTiles.has(tileKey(tileZoom, x, y));
                                });
                                setTilesScanResults(filtered.slice(0, 80));
                              } finally {
                                setTilesScanning(false);
                              }
                            }}
                            className="px-1.5 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded-md text-[11px] text-cyan-300 hover:bg-cyan-500/30 transition-colors disabled:opacity-40"
                          >
                            {tilesScanning ? <Loader2 className="w-2.5 h-2.5 animate-spin inline" /> : "Scan POIs"}
                          </button>
                          <button
                            disabled={selectedTiles.size === 0 || !stampModelRef.current}
                            title={!stampModelRef.current ? "Load a model in Stamp mode first" : "Stamp model at each tile center"}
                            onClick={async () => {
                              for (const k of selectedTiles) {
                                const { z, x, y } = parseTileKey(k);
                                const b = tileBounds(x, y, z);
                                const lat = (b.north + b.south) / 2;
                                const lng = (b.east + b.west) / 2;
                                let alt = 0;
                                const v = viewerRef.current;
                                if (v) {
                                  try {
                                    const carto = Cartographic.fromDegrees(lng, lat);
                                    const h = v.scene.sampleHeight(carto);
                                    if (typeof h === "number" && !isNaN(h)) alt = h;
                                    else {
                                      const th = v.scene.globe.getHeight(carto);
                                      if (typeof th === "number" && !isNaN(th)) alt = th;
                                    }
                                  } catch {}
                                }
                                await stampModelAt({ lat, lng, alt });
                              }
                            }}
                            className="px-1.5 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-md text-[11px] text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
                          >
                            Stamp each
                          </button>
                          <button
                            disabled={selectedTiles.size === 0}
                            onClick={() => {
                              const features = Array.from(selectedTiles).map(k => {
                                const { z, x, y } = parseTileKey(k);
                                const b = tileBounds(x, y, z);
                                const ring: [number, number][] = [
                                  [b.west, b.north], [b.east, b.north],
                                  [b.east, b.south], [b.west, b.south],
                                  [b.west, b.north],
                                ];
                                return {
                                  type: "Feature",
                                  properties: { z, x, y, tile: k },
                                  geometry: { type: "Polygon", coordinates: [ring] },
                                };
                              });
                              const fc = { type: "FeatureCollection", features };
                              const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url; a.download = `tiles-z${tileZoom}-${Date.now()}.geojson`; a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="px-1.5 py-1 bg-black/70 border border-white/[0.08] rounded-md text-[11px] text-white/80 hover:text-white transition-colors disabled:opacity-40"
                          >
                            Export GeoJSON
                          </button>
                          <button
                            disabled={selectedTiles.size === 0}
                            onClick={() => { setSelectedTiles(new Set()); setTilesScanResults([]); }}
                            className="px-1.5 py-1 bg-black/70 border border-white/[0.08] rounded-md text-[11px] text-white/60 hover:text-white transition-colors disabled:opacity-40"
                          >
                            Clear
                          </button>
                        </div>
                        {tilesScanResults.length > 0 && (
                          <div className="max-h-36 overflow-y-auto space-y-1 mt-1.5">
                            {tilesScanResults.map((r, i) => (
                              <div key={i} className="px-1.5 py-1 rounded-md bg-black/40 hover:bg-black/60 transition-colors">
                                <p className="text-[11px] text-white/90 truncate">{r.name}</p>
                                <p className="text-[9px] text-white/50 font-mono">{r.type}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Placed models list (shared across all modes) */}
                  <div className="mt-2.5 pt-2.5 border-t border-white/[0.06]">
                    <p className="text-[9px] text-white/60 uppercase tracking-wider mb-1.5">Placed models ({placedModels.length})</p>
                  {placedModels.length === 0 ? (
                    <div className="text-center py-5">
                      <Box className="w-7 h-7 text-white/10 mx-auto mb-1.5" />
                      <p className="text-xs text-white/70">No models placed yet</p>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-1">
                      {placedModels.map((model) => (
                        <div key={model.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-black/70 group transition-colors">
                          <Box className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{model.name}</p>
                            <p className="text-[10px] text-white/70 font-mono">
                              {model.lat.toFixed(4)}, {model.lng.toFixed(4)} · {model.scale}x
                            </p>
                            <p className="text-[10px] text-white/85 truncate">{model.fileName}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => flyToModel(model)}
                              className="p-1 rounded-md text-white/85 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                              title="Fly to"
                            >
                              <Move className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => deleteModel(model.id)}
                              className="p-1 rounded-md text-white/85 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </GlassPanel>
              </div>
            )}
          

          {/* POI Detail View */}
          
            {selectedPOI && (
              <div
                className="absolute top-20 right-4 z-30 w-[calc(100vw-2rem)] max-w-80"
              >
                <GlassPanel className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-yellow-400 shrink-0" />
                      <h3 className="text-sm font-bold text-white">{selectedPOI.name}</h3>
                    </div>
                    <button onClick={() => { setSelectedPOI(null); setEditingNotes(false); }}>
                      <X className="w-3.5 h-3.5 text-white/75 hover:text-white" />
                    </button>
                  </div>
                  <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5 mb-2.5">
                    <p className="text-[9px] text-white/75 uppercase tracking-wider mb-1.5">Coordinates</p>
                    <div className="grid grid-cols-3 gap-2.5 text-xs font-mono text-white/80">
                      <div><span className="text-[8px] text-white/70 block">LATITUDE</span>{formatCoord(selectedPOI.lat, true)}</div>
                      <div><span className="text-[8px] text-white/70 block">LONGITUDE</span>{formatCoord(selectedPOI.lng, false)}</div>
                      <div><span className="text-[8px] text-white/70 block">ELEVATION</span>{formatAlt(selectedPOI.alt)}</div>
                    </div>
                  </div>
                  {selectedPOI.description && (
                    <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5 mb-2.5">
                      <p className="text-[9px] text-white/75 uppercase tracking-wider mb-1">Description</p>
                      <p className="text-xs text-white/70 leading-relaxed">{selectedPOI.description}</p>
                    </div>
                  )}
                  <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5 mb-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[9px] text-white/75 uppercase tracking-wider flex items-center gap-1">
                        <FileText className="w-2.5 h-2.5" /> Notes
                      </p>
                      {!editingNotes ? (
                        <button onClick={() => { setEditingNotes(true); setEditNotesValue(selectedPOI.notes); }}
                          className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors">
                          <Edit3 className="w-2.5 h-2.5" /> {selectedPOI.notes ? "Edit" : "Add"}
                        </button>
                      ) : (
                        <button onClick={saveNotes}
                          className="text-[10px] text-yellow-400/60 hover:text-yellow-400 flex items-center gap-1 transition-colors">
                          <Save className="w-2.5 h-2.5" /> Save
                        </button>
                      )}
                    </div>
                    {editingNotes ? (
                      <textarea autoFocus value={editNotesValue}
                        onChange={(e) => setEditNotesValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") setEditingNotes(false); }}
                        rows={4}
                        className="w-full bg-black/70 border border-white/[0.08] rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-yellow-400/30 placeholder:text-white/85 transition-colors resize-none"
                        placeholder="Add notes..."
                      />
                    ) : (
                      <p className="text-xs text-white/80 leading-relaxed">{selectedPOI.notes || "No notes yet."}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => flyToPOI(selectedPOI)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
                      <Navigation className="w-3 h-3" /> Fly To
                    </button>
                    <button onClick={() => deletePOI(selectedPOI.id)}
                      className="px-2.5 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 hover:bg-red-500/20 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[9px] text-white/85 font-mono mt-2.5 text-center">
                    Created {new Date(selectedPOI.createdAt).toLocaleString()}
                  </p>
                </GlassPanel>
              </div>
            )}
          

          {/* Business POI Card Popup */}
          
            {selectedBusiness && (
              <div
                className={`animate-scale-in ${isMobile
                  ? "absolute inset-x-3 bottom-28 z-40"
                  : "absolute bottom-28 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-3"
                }`}
              >
                <div className="relative">
                  <button onClick={() => setSelectedBusiness(null)}
                    className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-black/80 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                  {(() => {
                    const bizEntityId = `biz-${String(selectedBusiness.id ?? "")}`;
                    const sel = isTagSelected(bizEntityId);
                    return (
                      <button
                        onClick={() => toggleSelected({
                          kind: "biz",
                          id: bizEntityId,
                          name: selectedBusiness.name,
                          lat: selectedBusiness.lat,
                          lng: selectedBusiness.lng,
                          category: selectedBusiness.category,
                          website: selectedBusiness.website,
                          emoji: selectedBusiness.emoji,
                        })}
                        title={sel ? "Unselect" : "Select (mark as gold)"}
                        className="absolute -top-2 -left-2 z-10 w-6 h-6 rounded-full backdrop-blur-xl flex items-center justify-center transition-colors"
                        style={sel ? {
                          background: "linear-gradient(135deg,#FFE56A,#B8860B)",
                          border: "1px solid #FFD700",
                          boxShadow: "0 0 12px #FFD70088",
                        } : {
                          background: "rgba(0,0,0,0.8)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        <Star className={`w-3 h-3 ${sel ? "fill-[#1a1300] text-[#1a1300]" : "text-white/80"}`} />
                      </button>
                    );
                  })()}
                  <POICard
                    poi={selectedBusiness}
                    variant="glass"
                    onNavigate={(poi) => {
                      const viewer = viewerRef.current;
                      flyCameraToTarget(viewer, poi, { range: 1200, pitchDeg: -34, radius: 80, duration: 1 });
                    }}
                    onDirections={(poi) => {
                      // Get user's current camera position as origin
                      const viewer = viewerRef.current;
                      if (!viewer || viewer.isDestroyed()) return;
                      const cam = viewer.camera.positionCartographic;
                      const userLat = CesiumMath.toDegrees(cam.latitude);
                      const userLng = CesiumMath.toDegrees(cam.longitude);
                      const origin: SearchResult = { name: "My Location", lat: userLat, lng: userLng, type: "Location" };
                      const dest: SearchResult = { name: poi.name, lat: poi.lat, lng: poi.lng, type: poi.category || "Business" };
                      setOriginPoint(origin);
                      setDestPoint(dest);
                      setOriginQuery(origin.name);
                      setDestQuery(dest.name);
                      setDirectionsOpen(true);
                      setSelectedBusiness(null);
                      fetchRoute(origin, dest);
                    }}
                    onDelivery={(poi) => {
                      const addr = poi.address ? `${poi.name}, ${poi.address}` : poi.name;
                      setDeliveryPickupPrefill({ address: addr, lat: poi.lat, lng: poi.lng });
                      setDeliveryPanelOpen(true);
                      setSelectedBusiness(null);
                    }}
                    onSelect={(poi) => {
                      setSearchOpen(true);
                      setSearchQuery(poi.name);
                      handleSearch(poi.name);
                      setSelectedBusiness(null);
                    }}
                  />
                </div>
              </div>
            )}
          
          {/* Marketplace Product Card Popup */}
          {selectedMarketplaceProduct && (
            <div
              className={`animate-scale-in ${isMobile
                ? "absolute inset-x-3 bottom-28 z-40"
                : "absolute bottom-28 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-3"
              }`}
            >
              <MarketplaceProductCard
                product={selectedMarketplaceProduct}
                onClose={() => setSelectedMarketplaceProduct(null)}
                onDelivery={(product) => {
                  const addr = product.sellerAddress ? `${product.seller}, ${product.sellerAddress}` : product.seller;
                  setDeliveryPickupPrefill({ address: addr, lat: product.sellerLat, lng: product.sellerLng });
                  setDeliveryPanelOpen(true);
                  setSelectedMarketplaceProduct(null);
                }}
                onDirections={(product) => {
                  const viewer = viewerRef.current;
                  if (!viewer || viewer.isDestroyed()) return;
                  const cam = viewer.camera.positionCartographic;
                  const userLat = CesiumMath.toDegrees(cam.latitude);
                  const userLng = CesiumMath.toDegrees(cam.longitude);
                  const origin: SearchResult = { name: "My Location", lat: userLat, lng: userLng, type: "Location" };
                  const dest: SearchResult = { name: product.seller, lat: product.sellerLat, lng: product.sellerLng, type: "Store" };
                  setOriginPoint(origin);
                  setDestPoint(dest);
                  setOriginQuery(origin.name);
                  setDestQuery(dest.name);
                  setDirectionsOpen(true);
                  setSelectedMarketplaceProduct(null);
                  fetchRoute(origin, dest);
                }}
                onBuy={(product, quantity, options) => {
                  // Stripe integration placeholder — will be wired later
                  console.log("Buy:", product.name, quantity, options);
                  alert(`Purchase: ${quantity}x ${product.name} — $${(product.price * quantity).toFixed(2)}\n\nStripe checkout will be integrated soon.`);
                }}
              />
            </div>
          )}


          {/* POI List Panel */}
          
            {poisPanelOpen && !selectedPOI && !brushPanelOpen && (
              <div
                className="absolute top-20 right-4 z-30 w-[calc(100vw-2rem)] max-w-72"
              >
                <GlassPanel className="p-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-sm font-bold text-white">Interest Points</span>
                      <span className="text-[10px] text-white/70 font-mono">({pois.length + levelPlacements.length})</span>
                    </div>
                    <button onClick={() => setPoisPanelOpen(false)}>
                      <X className="w-3.5 h-3.5 text-white/75 hover:text-white" />
                    </button>
                  </div>
                  <p className="text-[10px] text-white/70 mb-2.5">Double-click anywhere to add a point.</p>
                  {pois.length === 0 && levelPlacements.length === 0 ? (
                    <div className="text-center py-7">
                      <Plus className="w-7 h-7 text-white/10 mx-auto mb-1.5" />
                      <p className="text-xs text-white/70">No points yet</p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {pois.map((poi) => (
                        <div key={poi.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-black/70 group transition-colors">
                          <button onClick={() => { setSelectedPOI(poi); setEditingNotes(false); }}
                            className="flex-1 flex items-center gap-2.5 text-left min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{poi.name}</p>
                              <p className="text-[10px] text-white/70 font-mono">{poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}</p>
                              {poi.description && <p className="text-[10px] text-white/85 truncate">{poi.description}</p>}
                            </div>
                          </button>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => flyToPOI(poi)}
                              className="p-1 rounded-md text-white/85 hover:text-primary hover:bg-primary/10 transition-all" title="Fly to">
                              <Navigation className="w-3 h-3" />
                            </button>
                            <button onClick={() => deletePOI(poi.id)}
                              className="p-1 rounded-md text-white/85 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {levelPlacements.length > 0 && (
                        <div className="pt-2 mt-1 border-t border-white/10">
                          <div className="flex items-center gap-1.5 px-1 pb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Levels</span>
                            <span className="text-[10px] text-white/60 font-mono">({levelPlacements.length})</span>
                          </div>
                          {levelPlacements.map((lp) => (
                            <div key={lp.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-black/70 group transition-colors">
                              <button
                                onClick={() => {
                                  const viewer = viewerRef.current;
                                  if (!viewer || viewer.isDestroyed()) return;
                                  viewer.camera.flyTo({
                                    destination: Cartesian3.fromDegrees(lp.lng, lp.lat, 800),
                                    duration: 1.2,
                                  });
                                }}
                                className="flex-1 flex items-center gap-2.5 text-left min-w-0"
                              >
                                <span className="w-3.5 h-3.5 shrink-0 rounded-sm bg-emerald-500/70 border border-emerald-300" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-white truncate">{lp.levels?.name ?? "Level"}</p>
                                  <p className="text-[10px] text-white/70 font-mono">{lp.lat.toFixed(4)}, {lp.lng.toFixed(4)}</p>
                                </div>
                              </button>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={() => {
                                    const viewer = viewerRef.current;
                                    if (!viewer || viewer.isDestroyed()) return;
                                    viewer.camera.flyTo({
                                      destination: Cartesian3.fromDegrees(lp.lng, lp.lat, 1500),
                                      duration: 1.2,
                                    });
                                  }}
                                  className="p-1 rounded-md text-white/85 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all"
                                  title="Fly to"
                                >
                                  <Navigation className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={async () => {
                                    const name = lp.levels?.name ?? "this level";
                                    if (!window.confirm(`Remove "${name}" from the Atlas?\n\nThis only deletes the placement, not the level itself.`)) return;
                                    const { error } = await supabase
                                      .from("atlas_level_placements")
                                      .delete()
                                      .eq("id", lp.id);
                                    if (error) {
                                      toast.error(error.message);
                                    } else {
                                      toast.success("Level placement removed");
                                      window.dispatchEvent(new CustomEvent("atlas-level-placements-refresh"));
                                    }
                                  }}
                                  className="p-1 rounded-md text-white/85 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                  title="Delete placement"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </GlassPanel>
              </div>
            )}
          


          {/* Quick Store Filter — right-side circular button */}
          <QuickStoreFilter
            options={GEO_CATEGORIES}
            value={geoCategory}
            onChange={(k) => {
              setGeoCategory(k);
              businessLoadedAreaRef.current = "";
              if (!showBusinessIcons) setShowBusinessIcons(true);
              const next = k === "all" ? "" : k;
              setActiveSearchCategory(next);
              loadCategoryBusinessesInstant(k);
            }}
            onActivate={(key) => loadCategoryBusinessesInstant(key)}
          />

          {/* Selected (gold) tags chip */}
          {selectedCount > 0 && (
            <div className="absolute right-3 sm:right-4 top-[calc(50%+140px)] z-30 flex items-center gap-1 pl-1.5 pr-1 py-1 rounded-full backdrop-blur-xl animate-fade-in"
              style={{
                background: "linear-gradient(135deg, rgba(255,215,0,0.18), rgba(184,134,11,0.18))",
                border: "1px solid #FFD70066",
                boxShadow: "0 4px 18px rgba(255,215,0,0.25)",
              }}
            >
              <Star className="w-2.5 h-2.5 fill-yellow-300 text-yellow-300" />
              <span className="text-[10px] font-semibold tracking-wide text-yellow-200">
                {selectedCount} selected
              </span>
              <button
                onClick={() => clearSelected()}
                title="Clear selection"
                className="w-4 h-4 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-yellow-200/90 hover:text-yellow-100"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}

          {/* Intelligence — Live Traffic Cameras Panel */}
          <IntelligencePanel
            open={intelligenceOpen}
            onClose={() => setIntelligenceOpen(false)}
            onCamerasLoaded={setMapCameras}
            getBounds={() => {
              const viewer = viewerRef.current;
              if (!viewer || viewer.isDestroyed()) return null;
              const rect = viewer.camera.computeViewRectangle();
              if (!rect) return null;
              return {
                north: CesiumMath.toDegrees(rect.north),
                south: CesiumMath.toDegrees(rect.south),
                east: CesiumMath.toDegrees(rect.east),
                west: CesiumMath.toDegrees(rect.west),
              } as CameraBounds;
            }}
            onSelectCamera={(cam) => {
              const viewer = viewerRef.current;
              if (viewer && !viewer.isDestroyed()) {
                flyCameraToTarget(viewer, { lat: cam.lat, lng: cam.lng }, { range: 900, pitchDeg: -40, radius: 60, duration: 1.4 });
              }
              setActiveCamera(cam);
            }}
          />

          {/* Live camera viewer popup */}
          {activeCamera && (
            <CameraViewerPopup
              camera={activeCamera}
              onClose={() => setActiveCamera(null)}
              onOpenGallery={() => setRecordingsOpen(true)}
            />
          )}

          {/* Camera recordings gallery */}
          <CameraRecordingsGallery open={recordingsOpen} onClose={() => setRecordingsOpen(false)} />

          {/* Instant search side panel — places, businesses, saved POIs */}
          <SearchResultsPanel
            open={searchOpen}
            query={searchQuery}
            onQueryChange={(q) => handleSearch(q)}
            onClose={() => { setSearchOpen(false); setUnifiedResults([]); }}
            results={unifiedResults as any}
            loading={searchLoading}
            hoveredIdx={hoveredResultIdx}
            setHoveredIdx={setHoveredResultIdx}
            activeCategory={activeSearchCategory}
            categories={GEO_CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: c.icon, color: c.color, hex: c.hex }))}
            onCategoryChange={(key) => {
              setGeoCategory(key);
              businessLoadedAreaRef.current = "";
              if (!showBusinessIcons) setShowBusinessIcons(true);
              const next = key === "all" ? "" : key;
              setActiveSearchCategory(next);
              if (searchQuery.trim()) runUnifiedSearch(searchQuery.trim(), next || undefined);
              else loadCategoryBusinessesInstant(key);
            }}
            onUseLocation={geoLocateUser}
            onScanCameraArea={geofenceFromCamera}
            geoLocationName={geoLocationName}
            geoCenter={geoCenter}
            onSelect={(r) => {
              flyTo(r as any);
              setSelectedBusiness({
                id: `sel-${r.lat}-${r.lng}`,
                name: r.name, emoji: r.type === "Saved POI" ? "⭐" : r.source === "google" ? "🟢" : "📍",
                category: r.type, address: r.address, lat: r.lat, lng: r.lng,
                distance: r.distance, phone: r.phone, website: r.website,
                brand: r.brand, cuisine: r.cuisine, description: r.description, rating: r.rating,
              } as any);
              setSearchOpen(false);
            }}
          />

           {/* Bottom HUD — Coordinates & Search */}
          <div className="absolute bottom-0 left-0 right-0 z-20 p-1.5 sm:p-3">
            {/* Bottom bar content */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-1.5">
              <GlassPanel className="px-2.5 py-1.5 sm:px-3 sm:py-2.5 flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-3">
                  <img src={targetPng} alt="Target" width={16} height={16} className="w-3 h-3 object-contain shrink-0" />
                  {cursorInfo ? (
                    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                      <div className="min-w-0">
                        <p className="text-[8px] sm:text-[9px] text-white/70 uppercase tracking-wider">Lat</p>
                        <p className="text-xs sm:text-sm text-white truncate tabular-nums tracking-tight">{formatCoord(cursorInfo.lat, true)}</p>
                      </div>
                      <div className="w-px h-5 sm:h-7 bg-white/10 hidden sm:block" />
                      <div className="min-w-0">
                        <p className="text-[8px] sm:text-[9px] text-white/70 uppercase tracking-wider">Lng</p>
                        <p className="text-xs sm:text-sm text-white truncate tabular-nums tracking-tight">{formatCoord(cursorInfo.lng, false)}</p>
                      </div>
                      <div className="w-px h-5 sm:h-7 bg-white/10 hidden sm:block" />
                      <div className="min-w-0">
                        <p className="text-[8px] sm:text-[9px] text-white/70 uppercase tracking-wider">Alt</p>
                        <p className="text-xs sm:text-sm text-white tabular-nums tracking-tight">{formatAlt(cursorInfo.alt)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] sm:text-xs text-white/70">Hover for coordinates</p>
                  )}
                  <div className="w-px h-5 sm:h-7 bg-white/10 ml-auto" />
                  <div className="relative flex items-center gap-1 cursor-text flex-1 min-w-0"
                    onClick={() => { if (!searchOpen) { setSearchOpen(true); setSearchResults(PRESETS); } }}>
                    <Search className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary shrink-0" />
                    {searchOpen ? (
                      <input type="text" autoFocus value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Search stores, addresses…"
                        className="flex-1 bg-transparent text-white text-xs sm:text-sm outline-none placeholder:text-white/70 min-w-0"
                        style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif' }}
                        onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }} />
                    ) : (
                      <span className="text-[10px] sm:text-xs text-white/70 truncate" style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif' }}>Search stores, addresses…</span>
                    )}
                    {searchOpen && searchQuery && (
                      <button onClick={(e) => { e.stopPropagation(); setSearchQuery(""); handleSearch(""); }} className="shrink-0"><X className="w-2.5 h-2.5 text-white/70 hover:text-white/85" /></button>
                    )}
                    {searchOpen && (
                      <button onClick={(e) => { e.stopPropagation(); setSearchOpen(false); }} className="shrink-0"><X className="w-3 h-3 text-white/75" /></button>
                    )}

                    {/* Results live in the dedicated left-side SearchResultsPanel mounted below */}
                  </div>
                </div>
              </GlassPanel>

              <GlassPanel className="px-2.5 py-1.5 sm:px-3 sm:py-2.5 shrink-0">
                <div className="flex items-center gap-1.5 sm:gap-2.5">
                  <img src={eyePng} alt="Eye" width={16} height={16} className="w-3 h-3 sm:w-3.5 sm:h-3.5 object-contain shrink-0" />
                  <div>
                    <p className="text-[8px] sm:text-[9px] text-white/70 uppercase tracking-wider">Alt</p>
                    <p className="text-xs sm:text-sm text-white tabular-nums tracking-tight">{formatAlt(cameraAlt)}</p>
                  </div>
                  <div className="w-px h-5 sm:h-7 bg-white/10" />
                  <div>
                    <p className="text-[8px] sm:text-[9px] text-white/70 uppercase tracking-wider mb-0.5">Mode</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => switchViewMode("realistic")}
                        className={`px-1 py-0.5 sm:px-1.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-medium tracking-wide transition-all ${viewMode === "realistic" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-white/70 hover:text-white/85 border border-transparent"}`}>
                        <span className="flex items-center gap-1"><Satellite className="w-2.5 h-2.5" /> <span className="hidden sm:inline">Realistic</span><span className="sm:hidden">3D</span></span>
                      </button>
                      <button onClick={() => switchViewMode("osm")}
                        className={`px-1 py-0.5 sm:px-1.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-medium tracking-wide transition-all ${viewMode === "osm" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "text-white/70 hover:text-white/85 border border-transparent"}`}>
                        <span className="flex items-center gap-1"><Building2 className="w-2.5 h-2.5" /> OSM</span>
                      </button>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </div>
          </div>

          <button
            onClick={() => setHudVisible(false)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-white/85 hover:text-white/80 transition-colors text-[10px] font-mono uppercase tracking-wider"
          >
            Hide HUD
          </button>
        </>
      )}

      {isLoaded && !hudVisible && (
        <button
          onClick={() => setHudVisible(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/75 backdrop-blur-xl border border-white/[0.08] rounded-full px-3 py-1.5 text-white/75 hover:text-white transition-colors text-xs font-mono"
        >
          Show HUD
        </button>
      )}

      {/* Model Transform Widget */}
      {editingModel && (
        <ModelTransformWidget
          modelName={editingModel.name}
          initial={{
            lat: editingModel.lat,
            lng: editingModel.lng,
            alt: editingModel.alt || 0,
            heading: editingModel.heading || 0,
            pitch: editingModel.pitch || 0,
            roll: editingModel.roll || 0,
            scale: editingModel.scale || 1,
          }}
          onUpdate={handleTransformUpdate}
          onApply={handleTransformApply}
          onClose={() => setEditingModel(null)}
          onSnapToGround={handleSnapToGround}
          cropRadius={editingModel.cropRadius || 0}
          onCropTile={handleCropTile}
          onUncropTile={handleUncropTile}
          cropBase={editingModel.cropBase}
          onCropBaseChange={handleCropBaseChange}
          onResetTerrain={handleResetTerrain}
          terrainEditing={terrainEditing}
          onToggleTerrainEditing={() => setTerrainEditing(v => !v)}
        />
      )}
      {earthMenu && (
        <EarthContextMenu
          x={earthMenu.x}
          y={earthMenu.y}
          loc={earthMenu.loc}
          onClose={() => setEarthMenu(null)}
          onCreatePOI={(l) => {
            setNamingPOI(l);
            setPoiName("");
            setPoiDescription("");
          }}
          onPickLevel={(lvl, l) => {
            setPendingLevelPlacement({
              levelId: lvl.id,
              levelName: lvl.name,
              sizeM: DEFAULT_LEVEL_SIZE_M,
              loc: { lat: l.lat, lng: l.lng, alt: Math.max(0, l.alt) },
              heading: 0,
            });
          }}
          onPasteEntry={(entry: FileClipboardEntry, l) => {
            // Levels paste → create placement
            if (entry.kind === "level" && entry.sourceId) {
              (async () => {
                const { data: userRes } = await supabase.auth.getUser();
                const uid = userRes.user?.id;
                if (!uid) return;
                await supabase.from("atlas_level_placements").insert({
                  owner_id: uid,
                  level_id: entry.sourceId,
                  lat: l.lat, lng: l.lng,
                  altitude: Math.max(0, l.alt),
                  heading: 0, scale: 1,
                });
                window.dispatchEvent(new CustomEvent("atlas-level-placements-refresh"));
              })();
              return;
            }
            // Default: drop a POI carrying the clipboard name
            setNamingPOI(l);
            setPoiName(entry.name || "");
            setPoiDescription("");
          }}
        />
      )}
      {pendingLevelPlacement && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] rounded-xl border border-emerald-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl text-white p-3 w-[360px] space-y-3">
          <div>
            <div className="font-semibold text-sm text-emerald-300">{pendingLevelPlacement.levelName}</div>
            <div className="text-[10px] text-white/60 font-mono mt-0.5">
              {pendingLevelPlacement.loc
                ? `${pendingLevelPlacement.loc.lat.toFixed(5)}, ${pendingLevelPlacement.loc.lng.toFixed(5)} · ~${pendingLevelPlacement.sizeM}m tile`
                : "Double-click the globe to choose a tile"}
            </div>
          </div>
          {/* Rotation widget — drag to rotate the preview cube before
              confirming. Saved to atlas_level_placements.heading on
              "Drop here". */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/70">Rotation</span>
              <span className="text-[11px] font-mono text-emerald-300">{Math.round(pendingLevelPlacement.heading)}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={pendingLevelPlacement.heading}
              onChange={(e) =>
                setPendingLevelPlacement({ ...pendingLevelPlacement, heading: Number(e.target.value) })
              }
              className="w-full accent-emerald-400"
            />
            <div className="flex gap-1">
              {[0, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  onClick={() => setPendingLevelPlacement({ ...pendingLevelPlacement, heading: deg })}
                  className={`flex-1 text-[10px] px-1 py-1 rounded border ${
                    Math.round(pendingLevelPlacement.heading) === deg
                      ? "bg-emerald-500/30 border-emerald-400/60"
                      : "bg-white/5 hover:bg-white/15 border-white/10"
                  }`}
                >{deg}°</button>
              ))}
              <button
                onClick={() =>
                  setPendingLevelPlacement({
                    ...pendingLevelPlacement,
                    heading: (pendingLevelPlacement.heading + 15) % 360,
                  })
                }
                className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/15 border border-white/10"
                title="Nudge +15°"
              >+15°</button>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={confirmLevelPlacement}
              disabled={!pendingLevelPlacement.loc}
              className="flex-1 px-3 py-1.5 rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-[11px] font-semibold disabled:opacity-40"
            >
              Drop here
            </button>
            <button
              onClick={() => setPendingLevelPlacement({ ...pendingLevelPlacement, loc: null })}
              className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-[11px]"
            >
              Re-pick
            </button>
            <button
              onClick={() => setPendingLevelPlacement(null)}
              className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/15 text-[11px] text-white/70"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Error Boundary: prevent crash-reload loops ──
import { Component, type ReactNode, type ErrorInfo } from "react";

class AtlasErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string; retryCount: number }> {
  state = { hasError: false, error: "", retryCount: 0 };
  private autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Atlas Error Boundary]", error, info);
    // Auto-recover after 1.5s if less than 3 retries
    if (this.state.retryCount < 3) {
      this.autoRetryTimer = setTimeout(() => {
        this.setState((s) => ({ hasError: false, error: "", retryCount: s.retryCount + 1 }));
      }, 1500);
    }
  }
  componentWillUnmount() {
    if (this.autoRetryTimer) clearTimeout(this.autoRetryTimer);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen bg-[#0a0a1a] flex flex-col items-center justify-center text-white gap-3">
          <div className="text-4xl">🌍</div>
          <h2 className="text-lg font-semibold">Atlas encountered an issue</h2>
          <p className="text-sm text-white/80 max-w-sm text-center">{this.state.error || "Something went wrong"}</p>
          {this.state.retryCount < 3 && <p className="text-xs text-white/70">Auto-recovering…</p>}
          <button
            onClick={() => this.setState({ hasError: false, error: "", retryCount: 0 })}
            className="mt-1.5 px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AtlasPage() {
  return (
    <AtlasErrorBoundary>
      <SpaceshipPage />
    </AtlasErrorBoundary>
  );
}
