/**
 * Top-center cosmic body switcher.  Shows only the CURRENTLY selected
 * planet as a large chip flanked by prev / next arrows.  Sliding to a
 * neighbour fades the old chip out and the new one in (pure CSS), then
 * navigates.  Users can also swipe horizontally on touch devices.
 *
 * Navigating a planet lands on its full-Atlas experience (earth/moon/
 * mars have canonical routes, everything else routes through
 * `/planet/:id` → `PlanetAtlasPage`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PLANETS, type PlanetEntry } from "@/lib/planets/config";

function activeIdFromPath(path: string): string {
  if (path === "/" || path.startsWith("/atlas") || path.startsWith("/explore")) return "earth";
  if (path.startsWith("/moon")) return "moon";
  if (path.startsWith("/mars")) return "mars";
  if (path.startsWith("/planet/")) return path.split("/planet/")[1] ?? "earth";
  return "earth";
}

function PlanetOrb({ p, size = 44 }: { p: PlanetEntry; size?: number }) {
  return (
    <div
      className="relative rounded-full overflow-hidden border border-white/70 shadow-[0_0_22px_rgba(255,255,255,0.35)]"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 30%, ${p.color} 0%, ${p.color}80 40%, #05060a 100%)`,
      }}
    >
      <img
        src={p.textureUrl}
        alt=""
        loading="lazy"
        decoding="async"
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover rounded-full opacity-95"
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
      />
      {p.id === "saturn" && (
        <div
          className="absolute left-1/2 top-1/2 rounded-full border pointer-events-none"
          style={{
            width: "170%",
            height: "28%",
            borderColor: `${p.color}cc`,
            transform: "translate(-50%,-50%) rotate(-18deg)",
          }}
        />
      )}
    </div>
  );
}

export default function PlanetSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = activeIdFromPath(location.pathname);
  const activeIndex = useMemo(
    () => Math.max(0, PLANETS.findIndex((p) => p.id === activeId)),
    [activeId],
  );
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const [animKey, setAnimKey] = useState(activeId);

  // Re-key the chip whenever the route changes so it fades in.
  useEffect(() => {
    setAnimKey(activeId);
  }, [activeId]);

  const go = (delta: 1 | -1) => {
    const next = PLANETS[(activeIndex + delta + PLANETS.length) % PLANETS.length];
    setDir(delta);
    navigate(next.route);
  };

  // Touch swipe support.
  const startX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  const active = PLANETS[activeIndex];
  const enterAnim =
    dir === 1
      ? "animate-[slide-in-from-right_260ms_ease-out]"
      : dir === -1
        ? "animate-[slide-in-from-left_260ms_ease-out]"
        : "animate-fade-in";

  return (
    <div className="pointer-events-auto">
      <style>{`
        @keyframes slide-in-from-right { from { opacity:0; transform: translateX(24px);} to { opacity:1; transform: translateX(0);} }
        @keyframes slide-in-from-left  { from { opacity:0; transform: translateX(-24px);} to { opacity:1; transform: translateX(0);} }
      `}</style>
      <div
        className="flex items-center gap-1 rounded-full border border-white/10 bg-black/60 backdrop-blur-xl pl-1 pr-1 py-1 shadow-2xl"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous planet"
          className="w-7 h-7 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          key={animKey}
          onClick={() => navigate(active.route)}
          title={`${active.name} — ${active.blurb}`}
          className={`flex items-center gap-2 pl-1 pr-3 py-0.5 rounded-full hover:bg-white/5 transition ${enterAnim}`}
        >
          <PlanetOrb p={active} size={38} />
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-white">
              {active.name}
            </span>
            <span className="hidden sm:block text-[9px] font-mono text-white/50 max-w-[220px] truncate">
              {active.blurb}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next planet"
          className="w-7 h-7 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Tiny progress dots so the user still perceives the full set. */}
      <div className="mt-1.5 flex justify-center gap-1">
        {PLANETS.map((p, i) => (
          <span
            key={p.id}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === activeIndex ? "w-4 bg-white" : "w-1 bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}