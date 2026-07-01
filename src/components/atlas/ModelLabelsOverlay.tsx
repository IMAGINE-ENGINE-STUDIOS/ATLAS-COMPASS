import { useEffect, useMemo, useRef, useState } from "react";
import { Cartesian3, SceneTransforms, type Viewer } from "cesium";
import {
  UtensilsCrossed, Coffee, Store, Hotel, Fuel, Stethoscope,
  Landmark, Box,
} from "lucide-react";

const EARTH_RADIUS_M = 6371000;

function isWorldPointInFrontViewport(viewer: Viewer, world: Cartesian3, margin = 24) {
  const camera = viewer.camera;
  const toPoint = Cartesian3.subtract(world, camera.positionWC, new Cartesian3());
  if (Cartesian3.dot(toPoint, camera.directionWC) <= 0) return null;
  if (Cartesian3.dot(world, camera.positionWC) < EARTH_RADIUS_M * EARTH_RADIUS_M) return null;
  const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
  if (!win) return null;
  const canvas = viewer.scene.canvas;
  const cw = canvas.clientWidth || 0;
  const ch = canvas.clientHeight || 0;
  if (win.x < -margin || win.y < -margin || win.x > cw + margin || win.y > ch + margin) return null;
  return win;
}

export interface ModelCategory {
  id: string;
  label: string;
  color: string;     // tailwind base color name fragment, e.g. "emerald"
  hex: string;       // border/glow hex
  icon: React.ComponentType<{ className?: string }>;
}

export const MODEL_CATEGORIES: ModelCategory[] = [
  { id: "restaurant", label: "Restaurant", color: "rose",    hex: "#fb7185", icon: UtensilsCrossed },
  { id: "cafe",       label: "Café",       color: "amber",   hex: "#f59e0b", icon: Coffee },
  { id: "shop",       label: "Shop",       color: "violet",  hex: "#a78bfa", icon: Store },
  { id: "hotel",      label: "Hotel",      color: "sky",     hex: "#38bdf8", icon: Hotel },
  { id: "fuel",       label: "Fuel",       color: "orange",  hex: "#fb923c", icon: Fuel },
  { id: "health",     label: "Health",     color: "teal",    hex: "#2dd4bf", icon: Stethoscope },
  { id: "landmark",   label: "Landmark",   color: "emerald", hex: "#34d399", icon: Landmark },
  { id: "other",      label: "Other",      color: "slate",   hex: "#94a3b8", icon: Box },
];

export function getCategory(id?: string): ModelCategory {
  return MODEL_CATEGORIES.find(c => c.id === id) || MODEL_CATEGORIES[MODEL_CATEGORIES.length - 1];
}

// Deterministic accent color per model id, used to disambiguate same-category neighbours.
const ACCENTS = ["#34d399", "#22d3ee", "#a78bfa", "#fb7185", "#f59e0b", "#38bdf8", "#f472b6", "#facc15", "#4ade80", "#fb923c"];
export function accentForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

interface PlacedModelLike {
  id: string;
  name: string;
  lat: number;
  lng: number;
  alt: number;
  category?: string;
}

interface ScreenPos { id: string; x: number; y: number; model: PlacedModelLike; }

interface Cluster {
  key: string;
  category: string;
  members: PlacedModelLike[];
  anchorLat: number;
  anchorLng: number;
  anchorAlt: number;
}

interface Props {
  viewer: Viewer | null;
  models: PlacedModelLike[];
  onSelect?: (model: PlacedModelLike) => void;
  clusterDistancePx?: number;
}

/**
 * HTML overlay that renders glassmorphic pill labels above each placed model.
 * - Single model → coloured pill (category accent) matching the targeting-brush header style.
 * - Two or more nearby models of the same category collapse into a row of
 *   circular thumbnails so the user can easily identify each instance.
 */
export default function ModelLabelsOverlay({ viewer, models, onSelect, clusterDistancePx = 70 }: Props) {
  // Cluster membership only changes when models change or the camera settles —
  // it stays stable mid-flight so labels can't visually swap groups every frame.
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Recompute cluster membership using current screen positions.
  const recomputeClusters = useMemo(() => {
    return () => {
      if (!viewer || viewer.isDestroyed()) {
        setClusters([]);
        return;
      }
      const screen: (ScreenPos & { cellX: number; cellY: number })[] = [];
      for (const m of models) {
        try {
          const world = Cartesian3.fromDegrees(m.lng, m.lat, (m.alt || 0) + 12);
          const win = isWorldPointInFrontViewport(viewer, world);
          if (!win) continue;
          screen.push({
            id: m.id,
            x: win.x,
            y: win.y,
            model: m,
            cellX: Math.floor(win.x / clusterDistancePx),
            cellY: Math.floor(win.y / clusterDistancePx),
          });
        } catch {}
      }
      const out: (Cluster & { x: number; y: number })[] = [];
      const grid = new Map<string, number[]>();
      const r2 = clusterDistancePx * clusterDistancePx;
      for (const p of screen) {
        const cat = p.model.category || "other";
        let hit = -1;
        for (let dx = -1; dx <= 1 && hit < 0; dx++) {
          for (let dy = -1; dy <= 1 && hit < 0; dy++) {
            const ids = grid.get(`${cat}:${p.cellX + dx}:${p.cellY + dy}`);
            if (!ids) continue;
            for (const idx of ids) {
              const c = out[idx];
              const ddx = c.x - p.x;
              const ddy = c.y - p.y;
              if (ddx * ddx + ddy * ddy <= r2) { hit = idx; break; }
            }
          }
        }
        if (hit >= 0) {
          const c = out[hit];
          c.members.push(p.model);
          const n = c.members.length;
          c.x += (p.x - c.x) / n;
          c.y += (p.y - c.y) / n;
          c.anchorLat += (p.model.lat - c.anchorLat) / n;
          c.anchorLng += (p.model.lng - c.anchorLng) / n;
          c.anchorAlt += ((p.model.alt || 0) - c.anchorAlt) / n;
        } else {
          const idx = out.length;
          out.push({
            key: p.id,
            category: cat,
            members: [p.model],
            anchorLat: p.model.lat,
            anchorLng: p.model.lng,
            anchorAlt: p.model.alt || 0,
            x: p.x,
            y: p.y,
          });
          const gk = `${cat}:${p.cellX}:${p.cellY}`;
          const arr = grid.get(gk);
          if (arr) arr.push(idx); else grid.set(gk, [idx]);
        }
      }
      setClusters(out.slice(0, 180).map(c => ({
        key: c.members.length === 1
          ? c.members[0].id
          : `${c.category}:${Math.round(c.anchorLat * 1e5)}:${Math.round(c.anchorLng * 1e5)}:${c.members.length}`,
        category: c.category,
        members: c.members,
        anchorLat: c.anchorLat,
        anchorLng: c.anchorLng,
        anchorAlt: c.anchorAlt,
      })));
    };
  }, [viewer, models, clusterDistancePx]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    recomputeClusters();
    // Only re-cluster when camera settles, to avoid mid-flight regrouping.
    const remove = viewer.camera.moveEnd.addEventListener(recomputeClusters);
    return () => { remove(); };
  }, [viewer, recomputeClusters]);

  // IMPERATIVE positioning: every postRender, sync each cluster DOM node
  // directly to its world position so labels stay glued to the model
  // regardless of React commit timing.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const sync = () => {
      if (!viewer || viewer.isDestroyed()) return;
      for (const cluster of clusters) {
        const node = nodeRefs.current.get(cluster.key);
        if (!node) continue;
        let x = 0, y = 0;
        try {
          const world = Cartesian3.fromDegrees(cluster.anchorLng, cluster.anchorLat, cluster.anchorAlt + 12);
          const win = isWorldPointInFrontViewport(viewer, world, 32);
          if (!win) { node.style.opacity = "0"; node.style.pointerEvents = "none"; continue; }
          x = win.x; y = win.y;
        } catch { node.style.opacity = "0"; node.style.pointerEvents = "none"; continue; }
        node.style.opacity = "1";
        node.style.pointerEvents = "auto";
        // translate first so the -50%/-100% shift is applied around the anchor
        node.style.transform = `translate3d(${x}px, ${y - 14}px, 0) translate(-50%, -100%)`;
      }
    };
    sync();
    const remove = viewer.scene.postRender.addEventListener(sync);
    return () => { remove(); };
  }, [viewer, clusters]);

  if (!viewer) return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {clusters.map(cluster => {
        const cat = getCategory(cluster.category);
        const Icon = cat.icon;
        if (cluster.members.length === 1) {
          const m = cluster.members[0];
          const accent = accentForId(m.id);
          return (
            <div
              key={cluster.key}
              ref={(el) => { nodeRefs.current.set(cluster.key, el); }}
              className="absolute left-0 top-0 will-change-transform pointer-events-auto group cursor-pointer"
              style={{ transform: "translate3d(-9999px,-9999px,0)" }}
              onClick={(e) => { e.stopPropagation(); onSelect?.(m); }}
            >
              <div
                className="backdrop-blur-xl rounded-full pl-1.5 pr-2.5 py-1 flex items-center gap-1 transition-transform group-hover:scale-105"
                style={{
                  background: `${accent}22`,
                  border: `1px solid ${accent}66`,
                  boxShadow: `0 4px 20px ${accent}33`,
                }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${accent}33`, color: accent }}
                >
                  <Icon className="w-2.5 h-2.5" />
                </span>
                <span className="text-[11px] font-medium tracking-wide whitespace-nowrap" style={{ color: accent }}>
                  {m.name}
                </span>
              </div>
              {/* leader line */}
              <div
                className="mx-auto w-px"
                style={{ height: 10, background: `linear-gradient(to bottom, ${accent}aa, transparent)` }}
              />
            </div>
          );
        }

        // Cluster: row of circular thumbnails grouped by category
        return (
          <div
            key={cluster.key}
            ref={(el) => { nodeRefs.current.set(cluster.key, el); }}
            className="absolute left-0 top-0 will-change-transform pointer-events-auto"
            style={{ transform: "translate3d(-9999px,-9999px,0)" }}
          >
            <div
              className="backdrop-blur-xl rounded-full px-1.5 py-1 flex items-center gap-1"
              style={{
                background: `${cat.hex}1f`,
                border: `1px solid ${cat.hex}55`,
                boxShadow: `0 4px 20px ${cat.hex}33`,
              }}
            >
              <span className="text-[10px] uppercase tracking-wider font-semibold pr-1" style={{ color: cat.hex }}>
                {cat.label} · {cluster.members.length}
              </span>
              {cluster.members.slice(0, 8).map(m => {
                const accent = accentForId(m.id);
                const initials = m.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "·";
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={m.name}
                    onClick={(e) => { e.stopPropagation(); onSelect?.(m); }}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-110"
                    style={{
                      background: `${accent}33`,
                      border: `1.5px solid ${accent}`,
                      color: accent,
                    }}
                  >
                    {initials}
                  </button>
                );
              })}
              {cluster.members.length > 8 && (
                <span className="text-[10px] font-mono pl-1" style={{ color: cat.hex }}>
                  +{cluster.members.length - 8}
                </span>
              )}
            </div>
            <div
              className="mx-auto w-px"
              style={{ height: 10, background: `linear-gradient(to bottom, ${cat.hex}aa, transparent)` }}
            />
          </div>
        );
      })}
    </div>
  );
}