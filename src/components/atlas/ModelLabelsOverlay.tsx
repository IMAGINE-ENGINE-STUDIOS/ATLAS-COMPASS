import { useEffect, useMemo, useRef, useState } from "react";
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
  members: PlacedModelLike[];
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
      const screen: ScreenPos[] = [];
      for (const m of models) {
        try {
          const world = Cartesian3.fromDegrees(m.lng, m.lat, (m.alt || 0) + 12);
          const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
          if (!win) {
            // still include — will be hidden in postRender if off-screen
            screen.push({ id: m.id, x: 0, y: 0, model: m });
            continue;
          }
          screen.push({ id: m.id, x: win.x, y: win.y, model: m });
        } catch {
          screen.push({ id: m.id, x: 0, y: 0, model: m });
        }
      }
      const out: Cluster[] = [];
      const used = new Set<string>();
      for (const p of screen) {
        if (used.has(p.id)) continue;
        const cat = p.model.category || "other";
        const members: PlacedModelLike[] = [p.model];
        used.add(p.id);
        for (const q of screen) {
          if (used.has(q.id)) continue;
          if ((q.model.category || "other") !== cat) continue;
          const dx = q.x - p.x, dy = q.y - p.y;
          if (dx * dx + dy * dy <= clusterDistancePx * clusterDistancePx) {
            members.push(q.model);
            used.add(q.id);
          }
        }
        out.push({
          key: members.map(m => m.id).sort().join("|"),
          category: cat,
          members,
        });
      }
      setClusters(out);
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
      const canvas = viewer.scene.canvas;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      for (const cluster of clusters) {
        const node = nodeRefs.current.get(cluster.key);
        if (!node) continue;
        // Average world position of all members for the anchor.
        let sx = 0, sy = 0, visible = 0;
        for (const m of cluster.members) {
          try {
            const world = Cartesian3.fromDegrees(m.lng, m.lat, (m.alt || 0) + 12);
            const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
            if (!win) continue;
            sx += win.x; sy += win.y; visible++;
          } catch { /* ignore */ }
        }
        if (!visible) { node.style.opacity = "0"; node.style.pointerEvents = "none"; continue; }
        const x = sx / visible;
        const y = sy / visible;
        if (x < -200 || y < -80 || x > cw + 200 || y > ch + 200) {
          node.style.opacity = "0";
          node.style.pointerEvents = "none";
          continue;
        }
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
                const initials = m.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "·";
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={m.name}
                    onClick={(e) => { e.stopPropagation(); onSelect?.(m); }}
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