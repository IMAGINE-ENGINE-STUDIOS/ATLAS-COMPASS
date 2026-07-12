/**
 * QuakeTagsOverlay
 * ----------------
 * Renders USGS earthquake events as modern glass-pill tags anchored to
 * fixed geographic locations (lat / lng, ground-clamped). Mirrors the
 * horizon-culling + per-frame positioning pattern used by
 * `AtlasTagsOverlay` so tags only appear on the near side of the planet
 * and never drift off their epicenter.
 *
 * Tag color/size encodes magnitude using the same ramp as the panel
 * legend. Clicking a tag opens the full event report modal.
 */
import { useEffect, useRef, useState } from "react";
import { Cartesian3, Ellipsoid, SceneTransforms, type Viewer } from "cesium";
import { Activity } from "lucide-react";

const EARTH_RADIUS_M = 6371000;

function project(viewer: Viewer, world: Cartesian3, margin = 24) {
  const camera = viewer.camera;
  const to = Cartesian3.subtract(world, camera.positionWC, new Cartesian3());
  if (Cartesian3.dot(to, camera.directionWC) <= 0) return null;
  if (Cartesian3.dot(world, camera.positionWC) < EARTH_RADIUS_M * EARTH_RADIUS_M) return null;
  const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
  if (!win) return null;
  const c = viewer.scene.canvas;
  const cw = c.clientWidth || 0;
  const ch = c.clientHeight || 0;
  if (win.x < -margin || win.y < -margin || win.x > cw + margin || win.y > ch + margin) return null;
  return win;
}

export interface QuakeTag {
  id: string;
  mag: number;
  place: string;
  time: number;
  lat: number;
  lng: number;
  depthKm: number;
  tsunami: 0 | 1;
  url: string;
  alert?: string | null;
}

function magColor(m: number): string {
  if (m >= 7) return "#b91c1c";
  if (m >= 6) return "#ef4444";
  if (m >= 5) return "#f97316";
  if (m >= 4) return "#f59e0b";
  if (m >= 3) return "#facc15";
  if (m >= 2) return "#84cc16";
  return "#22c55e";
}
function magSize(m: number): number {
  return Math.max(18, Math.min(46, 18 + m * 3.4));
}

interface Props {
  viewer: Viewer | null;
  quakes: QuakeTag[];
  selectedId?: string | null;
  onSelect: (q: QuakeTag) => void;
  ellipsoid?: Ellipsoid;
  /** Cap DOM nodes for perf. */
  maxTags?: number;
}

export default function QuakeTagsOverlay({
  viewer, quakes, selectedId, onSelect,
  ellipsoid = Ellipsoid.WGS84,
  maxTags = 260,
}: Props) {
  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  // Trigger a re-render on camera moveEnd so we can prune off-screen tags
  // from the DOM entirely (keeps click surface small on big result sets).
  const [, tick] = useState(0);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const bump = () => tick((n) => n + 1);
    const off = viewer.camera.moveEnd.addEventListener(bump);
    return () => { off(); };
  }, [viewer]);

  // Imperative per-frame positioning + horizon culling.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const sync = () => {
      if (!viewer || viewer.isDestroyed()) return;
      for (const q of quakes) {
        const node = nodeRefs.current.get(q.id);
        if (!node) continue;
        try {
          const world = Cartesian3.fromDegrees(q.lng, q.lat, (q.depthKm < 0 ? 0 : 8), ellipsoid);
          const win = project(viewer, world, 40);
          if (!win) { node.style.opacity = "0"; node.style.pointerEvents = "none"; continue; }
          node.style.opacity = "1";
          node.style.pointerEvents = "auto";
          node.style.transform = `translate3d(${win.x}px, ${win.y}px, 0) translate(-50%, -100%)`;
        } catch {
          node.style.opacity = "0";
          node.style.pointerEvents = "none";
        }
      }
    };
    sync();
    const off = viewer.scene.postRender.addEventListener(sync);
    return () => { off(); };
  }, [viewer, quakes, ellipsoid]);

  if (!viewer) return null;

  // Sort by magnitude desc so bigger events are on top when they overlap,
  // and cap the DOM count for perf.
  const sorted = [...quakes].sort((a, b) => (b.mag || 0) - (a.mag || 0)).slice(0, maxTags);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {sorted.map((q) => {
        const color = magColor(q.mag || 0);
        const size = magSize(q.mag || 0);
        const sel = selectedId === q.id;
        return (
          <div
            key={q.id}
            ref={(el) => { nodeRefs.current.set(q.id, el); }}
            className="absolute left-0 top-0 will-change-transform pointer-events-auto"
            style={{ transform: "translate3d(-9999px,-9999px,0)" }}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(q); }}
              title={`M ${q.mag?.toFixed?.(1) ?? q.mag} — ${q.place}`}
              className="backdrop-blur-xl rounded-full px-1.5 py-1 flex items-center gap-1.5 group hover:scale-105 transition-transform"
              style={{
                background: `${color}22`,
                border: `1px solid ${sel ? "#FFD700" : color + "88"}`,
                boxShadow: sel
                  ? `0 4px 22px #FFD70066, 0 0 0 1px #FFD70055`
                  : `0 4px 18px ${color}55`,
              }}
            >
              <span
                className="rounded-full flex items-center justify-center font-mono font-bold text-[10px]"
                style={{
                  width: size * 0.55,
                  height: size * 0.55,
                  background: color,
                  color: "#0b0b0f",
                  boxShadow: `0 0 ${size * 0.35}px ${color}cc`,
                }}
              >
                {(q.mag ?? 0).toFixed(1)}
              </span>
              <span
                className="text-[10px] uppercase tracking-widest font-semibold pr-1 max-w-[160px] truncate hidden sm:inline"
                style={{ color: sel ? "#FFD700" : color }}
              >
                {q.place?.split(",").pop()?.trim() || "Quake"}
              </span>
              {q.tsunami ? (
                <Activity className="w-3 h-3 text-cyan-300 animate-pulse" />
              ) : null}
            </button>
            <div
              className="mx-auto w-px"
              style={{
                height: 12,
                background: `linear-gradient(to bottom, ${sel ? "#FFD700cc" : color + "cc"}, transparent)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}