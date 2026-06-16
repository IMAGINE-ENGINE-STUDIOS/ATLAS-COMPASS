import { useEffect, useRef, useState } from "react";
import { Cartesian3, SceneTransforms, type Viewer } from "cesium";
import {
  UtensilsCrossed, Coffee, Store, Hotel, Fuel, Stethoscope,
  Landmark, Box,
} from "lucide-react";

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
  cx: number;
  cy: number;
  members: ScreenPos[];
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
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const compute = () => {
      if (!viewer || viewer.isDestroyed()) return;
      const screen: ScreenPos[] = [];
      for (const m of models) {
        try {
          const world = Cartesian3.fromDegrees(m.lng, m.lat, (m.alt || 0) + 12);
          const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
          if (!win) continue;
          // Reject points behind camera or off-screen
          const canvas = viewer.scene.canvas;
          if (win.x < -200 || win.y < -80 || win.x > canvas.clientWidth + 200 || win.y > canvas.clientHeight + 200) continue;
          screen.push({ id: m.id, x: win.x, y: win.y, model: m });
        } catch { /* ignore */ }
      }

      // Cluster by category + proximity (greedy)
      const out: Cluster[] = [];
      const used = new Set<string>();
      for (const p of screen) {
        if (used.has(p.id)) continue;
        const cat = p.model.category || "other";
        const members: ScreenPos[] = [p];
        used.add(p.id);
        for (const q of screen) {
          if (used.has(q.id)) continue;
          if ((q.model.category || "other") !== cat) continue;
          const dx = q.x - p.x, dy = q.y - p.y;
          if (dx * dx + dy * dy <= clusterDistancePx * clusterDistancePx) {
            members.push(q);
            used.add(q.id);
          }
        }
        const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
        const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
        out.push({ key: members.map(m => m.id).join("|"), category: cat, cx, cy, members });
      }
      setClusters(out);
    };

    const onChange = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        compute();
      });
    };

    const remove = viewer.scene.postRender.addEventListener(onChange);
    compute();

    return () => {
      remove();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [viewer, models, clusterDistancePx]);

  if (!viewer) return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {clusters.map(cluster => {
        const cat = getCategory(cluster.category);
        const Icon = cat.icon;
        if (cluster.members.length === 1) {
          const m = cluster.members[0].model;
          const accent = accentForId(m.id);
          return (
            <button
              key={cluster.key}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect?.(m); }}
              className="absolute -translate-x-1/2 -translate-y-full pointer-events-auto group"
              style={{
                left: cluster.cx,
                top: cluster.cy - 14,
              }}
            >
              <div
                className="backdrop-blur-xl rounded-full pl-2 pr-3 py-1 flex items-center gap-1.5 transition-transform group-hover:scale-105"
                style={{
                  background: `${accent}22`,
                  border: `1px solid ${accent}66`,
                  boxShadow: `0 4px 20px ${accent}33`,
                }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${accent}33`, color: accent }}
                >
                  <Icon className="w-3 h-3" />
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
            </button>
          );
        }

        // Cluster: row of circular thumbnails grouped by category
        return (
          <div
            key={cluster.key}
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-auto"
            style={{ left: cluster.cx, top: cluster.cy - 14 }}
          >
            <div
              className="backdrop-blur-xl rounded-full px-2 py-1 flex items-center gap-1.5"
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
                const initials = m.model.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "·";
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={m.model.name}
                    onClick={(e) => { e.stopPropagation(); onSelect?.(m.model); }}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-110"
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