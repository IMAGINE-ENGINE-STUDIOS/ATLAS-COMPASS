import { useEffect, useMemo, useRef, useState } from "react";
import { Cartesian3, SceneTransforms, type Viewer } from "cesium";
import { Star } from "lucide-react";
import { MODEL_CATEGORIES, getCategory } from "./ModelLabelsOverlay";
import { isSelected, subscribeSelection } from "@/lib/atlasSelection";

const EARTH_RADIUS_M = 6371000;

function isWorldPointInFrontViewport(viewer: Viewer, world: Cartesian3, margin = 24) {
  const camera = viewer.camera;
  const toPoint = Cartesian3.subtract(world, camera.positionWC, new Cartesian3());
  if (Cartesian3.dot(toPoint, camera.directionWC) <= 0) return null;
  // Reject anchors hidden by the far side of the planet. Without this, Cesium's
  // window projection can place labels for points behind the globe over the view.
  if (Cartesian3.dot(world, camera.positionWC) < EARTH_RADIUS_M * EARTH_RADIUS_M * 0.98) return null;
  const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
  if (!win) return null;
  const canvas = viewer.scene.canvas;
  const cw = canvas.clientWidth || 0;
  const ch = canvas.clientHeight || 0;
  if (win.x < -margin || win.y < -margin || win.x > cw + margin || win.y > ch + margin) return null;
  return win;
}

function faviconFor(website?: string): string | null {
  if (!website) return null;
  try {
    const host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return null;
  }
}

export interface AtlasTag {
  kind: "biz" | "poi" | "market";
  id: string;
  name: string;
  lat: number;
  lng: number;
  alt?: number;
  categoryId: string;   // already mapped to MODEL_CATEGORIES id
  emoji?: string;
  website?: string;
}

interface Cluster {
  key: string;
  categoryId: string;
  members: AtlasTag[];
  anchorLat: number;
  anchorLng: number;
  anchorAlt: number;
}

interface Props {
  viewer: Viewer | null;
  tags: AtlasTag[];
  onSelect?: (tag: AtlasTag) => void;
  clusterDistancePx?: number;
  /** Minimum members for a cluster to be rendered. Singles stay as billboards. */
  minMembers?: number;
}

/**
 * Unified HTML overlay that groups crowded atlas tags into category clusters,
 * mirroring ModelLabelsOverlay's behaviour. Selected tags are highlighted in
 * gold and always rendered at the top of their cluster row.
 */
export default function AtlasTagsOverlay({
  viewer, tags, onSelect,
  clusterDistancePx = 64, minMembers = 1,
}: Props) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [, forceRerender] = useState(0);
  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Re-render when selection toggles so gold rings refresh.
  useEffect(() => subscribeSelection(() => forceRerender(n => n + 1)), []);

  const recompute = useMemo(() => () => {
    if (!viewer || viewer.isDestroyed()) { setClusters([]); return; }
    const visible: { tag: AtlasTag; x: number; y: number; cellX: number; cellY: number }[] = [];
    for (const t of tags) {
      try {
        const world = Cartesian3.fromDegrees(t.lng, t.lat, (t.alt || 0) + 8);
        const win = isWorldPointInFrontViewport(viewer, world);
        if (!win) continue;
        visible.push({
          tag: t,
          x: win.x,
          y: win.y,
          cellX: Math.floor(win.x / clusterDistancePx),
          cellY: Math.floor(win.y / clusterDistancePx),
        });
      } catch {}
    }
    // Grid-neighbour clustering is O(n), replacing the previous O(n²) pass
    // that froze the map when hundreds/thousands of store tags were loaded.
    const out: (Cluster & { x: number; y: number })[] = [];
    const grid = new Map<string, number[]>();
    const r2 = clusterDistancePx * clusterDistancePx;
    for (const p of visible) {
      const cat = p.tag.categoryId || "other";
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
        c.members.push(p.tag);
        const n = c.members.length;
        c.x += (p.x - c.x) / n;
        c.y += (p.y - c.y) / n;
        c.anchorLat += (p.tag.lat - c.anchorLat) / n;
        c.anchorLng += (p.tag.lng - c.anchorLng) / n;
        c.anchorAlt += ((p.tag.alt || 0) - c.anchorAlt) / n;
      } else {
        const idx = out.length;
        out.push({
          key: p.tag.id,
          categoryId: cat,
          members: [p.tag],
          anchorLat: p.tag.lat,
          anchorLng: p.tag.lng,
          anchorAlt: p.tag.alt || 0,
          x: p.x,
          y: p.y,
        });
        const gk = `${cat}:${p.cellX}:${p.cellY}`;
        const arr = grid.get(gk);
        if (arr) arr.push(idx); else grid.set(gk, [idx]);
      }
    }
    setClusters(
      out
        .filter(c => c.members.length >= minMembers)
        .sort((a, b) => b.members.length - a.members.length)
        .slice(0, 160)
        .map(c => ({
          key: c.members.length === 1
            ? c.members[0].id
            : `${c.categoryId}:${Math.round(c.anchorLat * 1e5)}:${Math.round(c.anchorLng * 1e5)}:${c.members.length}`,
          categoryId: c.categoryId,
          members: c.members,
          anchorLat: c.anchorLat,
          anchorLng: c.anchorLng,
          anchorAlt: c.anchorAlt,
        })),
    );
  }, [viewer, tags, clusterDistancePx, minMembers]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    recompute();
    const remove = viewer.camera.moveEnd.addEventListener(recompute);
    return () => { remove(); };
  }, [viewer, recompute]);

  // Hide the legacy Cesium billboard pins for any tag rendered as a
  // glass-pill in this overlay so we have a single unified design.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const touched: any[] = [];
    for (const t of tags) {
      const ent = viewer.entities.getById(t.id);
      if (ent && (ent as any).billboard) {
        (ent as any).billboard.show = false;
        touched.push(ent);
      }
    }
    return () => {
      for (const ent of touched) {
        try { if ((ent as any).billboard) (ent as any).billboard.show = true; } catch {}
      }
    };
  }, [viewer, tags]);

  // Imperative DOM positioning each frame.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const sync = () => {
      if (!viewer || viewer.isDestroyed()) return;
      const canvas = viewer.scene.canvas;
      for (const c of clusters) {
        const node = nodeRefs.current.get(c.key);
        if (!node) continue;
        let x = 0, y = 0;
        try {
          const world = Cartesian3.fromDegrees(c.anchorLng, c.anchorLat, c.anchorAlt + 8);
          const win = isWorldPointInFrontViewport(viewer, world, 32);
          if (!win) { node.style.opacity = "0"; node.style.pointerEvents = "none"; continue; }
          x = win.x; y = win.y;
        } catch { node.style.opacity = "0"; node.style.pointerEvents = "none"; continue; }
        node.style.opacity = "1";
        node.style.pointerEvents = "auto";
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
      {clusters.map(c => {
        const cat = getCategory(c.categoryId);
        const hasGold = c.members.some(m => isSelected(m.id));
        // Sort: selected first
        const sorted = [...c.members].sort((a, b) => Number(isSelected(b.id)) - Number(isSelected(a.id)));
        return (
          <div
            key={c.key}
            ref={(el) => { nodeRefs.current.set(c.key, el); }}
            className="absolute left-0 top-0 will-change-transform pointer-events-auto"
            style={{ transform: "translate3d(-9999px,-9999px,0)" }}
          >
            <div
              className="backdrop-blur-xl rounded-full px-1.5 py-1 flex items-center gap-1"
              style={{
                background: `${cat.hex}1f`,
                border: `1px solid ${hasGold ? "#FFD700" : cat.hex + "55"}`,
                boxShadow: hasGold
                  ? `0 4px 22px #FFD70066, 0 0 0 1px #FFD70055`
                  : `0 4px 20px ${cat.hex}33`,
              }}
            >
              <span
                className="text-[10px] uppercase tracking-wider font-semibold pr-1 max-w-[160px] truncate"
                style={{ color: hasGold ? "#FFD700" : cat.hex }}
                title={c.members.length === 1 ? c.members[0].name : `${cat.label} · ${c.members.length}`}
              >
                {c.members.length === 1 ? c.members[0].name : `${cat.label} · ${c.members.length}`}
              </span>
              {sorted.slice(0, 8).map(m => {
                const sel = isSelected(m.id);
                const accent = sel ? "#FFD700" : cat.hex;
                const initials = m.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "·";
                const logo = faviconFor(m.website);
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={m.name}
                    onClick={(e) => { e.stopPropagation(); onSelect?.(m); }}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-110 relative overflow-hidden"
                    style={{
                      background: logo ? "#fff" : (sel ? "linear-gradient(135deg,#FFE56A,#B8860B)" : `${accent}33`),
                      border: `1.5px solid ${accent}`,
                      color: sel ? "#1a1300" : accent,
                      boxShadow: sel ? "0 0 10px #FFD70088" : undefined,
                    }}
                  >
                    {logo ? (
                      <img
                        src={logo}
                        alt=""
                        className="w-3.5 h-3.5 object-contain"
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : initials}
                    {sel && (
                      <Star className="w-1.5 h-1.5 absolute -top-0.5 -right-0.5 fill-yellow-300 text-yellow-300" />
                    )}
                  </button>
                );
              })}
              {c.members.length > 8 && (
                <span className="text-[10px] font-mono pl-1" style={{ color: hasGold ? "#FFD700" : cat.hex }}>
                  +{c.members.length - 8}
                </span>
              )}
            </div>
            <div
              className="mx-auto w-px"
              style={{ height: 10, background: `linear-gradient(to bottom, ${hasGold ? "#FFD700aa" : cat.hex + "aa"}, transparent)` }}
            />
          </div>
        );
      })}
    </div>
  );
}