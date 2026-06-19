import { useEffect, useMemo, useRef, useState } from "react";
import { Cartesian3, SceneTransforms, type Viewer } from "cesium";
import { Star } from "lucide-react";
import { MODEL_CATEGORIES, getCategory } from "./ModelLabelsOverlay";
import { isSelected, subscribeSelection } from "@/lib/atlasSelection";

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
  clusterDistancePx = 64, minMembers = 2,
}: Props) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [, forceRerender] = useState(0);
  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Re-render when selection toggles so gold rings refresh.
  useEffect(() => subscribeSelection(() => forceRerender(n => n + 1)), []);

  const recompute = useMemo(() => () => {
    if (!viewer || viewer.isDestroyed()) { setClusters([]); return; }
    const screen: { tag: AtlasTag; x: number; y: number }[] = [];
    for (const t of tags) {
      try {
        const world = Cartesian3.fromDegrees(t.lng, t.lat, (t.alt || 0) + 8);
        const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
        if (!win) { screen.push({ tag: t, x: -99999, y: -99999 }); continue; }
        screen.push({ tag: t, x: win.x, y: win.y });
      } catch { screen.push({ tag: t, x: -99999, y: -99999 }); }
    }
    const out: Cluster[] = [];
    const used = new Set<string>();
    for (const p of screen) {
      if (used.has(p.tag.id)) continue;
      const cat = p.tag.categoryId || "other";
      const members: AtlasTag[] = [p.tag];
      used.add(p.tag.id);
      for (const q of screen) {
        if (used.has(q.tag.id)) continue;
        if ((q.tag.categoryId || "other") !== cat) continue;
        const dx = q.x - p.x, dy = q.y - p.y;
        if (dx * dx + dy * dy <= clusterDistancePx * clusterDistancePx) {
          members.push(q.tag); used.add(q.tag.id);
        }
      }
      if (members.length >= minMembers) {
        out.push({
          key: members.map(m => m.id).sort().join("|"),
          categoryId: cat,
          members,
        });
      }
    }
    setClusters(out);
  }, [viewer, tags, clusterDistancePx, minMembers]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    recompute();
    const remove = viewer.camera.moveEnd.addEventListener(recompute);
    return () => { remove(); };
  }, [viewer, recompute]);

  // Imperative DOM positioning each frame.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const sync = () => {
      if (!viewer || viewer.isDestroyed()) return;
      const canvas = viewer.scene.canvas;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      for (const c of clusters) {
        const node = nodeRefs.current.get(c.key);
        if (!node) continue;
        let sx = 0, sy = 0, n = 0;
        for (const m of c.members) {
          try {
            const world = Cartesian3.fromDegrees(m.lng, m.lat, (m.alt || 0) + 8);
            const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
            if (!win) continue;
            sx += win.x; sy += win.y; n++;
          } catch {}
        }
        if (!n) { node.style.opacity = "0"; node.style.pointerEvents = "none"; continue; }
        const x = sx / n, y = sy / n;
        if (x < -200 || y < -80 || x > cw + 200 || y > ch + 200) {
          node.style.opacity = "0"; node.style.pointerEvents = "none"; continue;
        }
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
              className="backdrop-blur-xl rounded-full px-2 py-1 flex items-center gap-1.5"
              style={{
                background: `${cat.hex}1f`,
                border: `1px solid ${hasGold ? "#FFD700" : cat.hex + "55"}`,
                boxShadow: hasGold
                  ? `0 4px 22px #FFD70066, 0 0 0 1px #FFD70055`
                  : `0 4px 20px ${cat.hex}33`,
              }}
            >
              <span className="text-[10px] uppercase tracking-wider font-semibold pr-1" style={{ color: hasGold ? "#FFD700" : cat.hex }}>
                {cat.label} · {c.members.length}
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
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-110 relative overflow-hidden"
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
                        className="w-4 h-4 object-contain"
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : initials}
                    {sel && (
                      <Star className="w-2 h-2 absolute -top-0.5 -right-0.5 fill-yellow-300 text-yellow-300" />
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