/**
 * Top-center cosmic body switcher — Apple-dock style.  All planets sit
 * in a single glass bar; the pointer's proximity magnifies neighbours
 * (like the macOS Dock), and the active planet is always slightly
 * larger with a label chip above it.  Click any orb to jump to its
 * full-Atlas experience.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PLANETS, type PlanetEntry } from "@/lib/planets/config";
import { preloadPlanet } from "@/lib/planets/preload";

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
      className="relative rounded-full overflow-hidden border border-white/60 shadow-[0_0_22px_rgba(255,255,255,0.28)] will-change-transform"
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

  // ── Apple-dock magnification ──────────────────────────────────────
  // Track the pointer's X in dock-local coords and compute a scale for
  // each orb based on distance to that X. Touch devices skip magnify
  // and just show the active orb larger.
  const dockRef = useRef<HTMLDivElement>(null);
  const [orbCenters, setOrbCenters] = useState<number[]>([]);
  const [pointerX, setPointerX] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Recompute orb centres whenever the layout changes (resize / count).
  useEffect(() => {
    const recompute = () => {
      const dock = dockRef.current;
      if (!dock) return;
      const dockRect = dock.getBoundingClientRect();
      const centers = Array.from(
        dock.querySelectorAll<HTMLElement>("[data-orb]"),
      ).map((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2 - dockRect.left;
      });
      setOrbCenters(centers);
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [activeIndex]);

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia?.("(max-width: 640px)").matches;
  const BASE = isMobile ? 30 : 40;
  const PEAK = isMobile ? 46 : 68;
  const INFLUENCE = isMobile ? 60 : 110;

  const scaleFor = (i: number) => {
    if (pointerX == null || orbCenters.length !== PLANETS.length) {
      return i === activeIndex ? 1.25 : 1;
    }
    const dx = Math.abs(orbCenters[i] - pointerX);
    const t = Math.max(0, 1 - dx / INFLUENCE);
    // Cosine falloff for a smooth Apple-like curve.
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
    return 1 + eased * (PEAK / BASE - 1);
  };

  const focusIdx = hoverIdx ?? activeIndex;
  const focused = PLANETS[focusIdx];

  return (
    <div className="pointer-events-auto select-none">
      {/* Floating label above the currently focused orb. */}
      <div className="relative h-6 mb-1">
        <div
          key={focused.id}
          className="absolute left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono uppercase tracking-[0.28em] text-white whitespace-nowrap animate-fade-in"
        >
          {focused.name}
        </div>
      </div>

      <div
        ref={dockRef}
        onPointerMove={(e) => {
          if (e.pointerType === "touch") return;
          const rect = e.currentTarget.getBoundingClientRect();
          setPointerX(e.clientX - rect.left);
        }}
        onPointerLeave={() => {
          setPointerX(null);
          setHoverIdx(null);
        }}
        className="flex items-end justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-full border border-white/10 bg-black/55 backdrop-blur-xl shadow-2xl"
        style={{ minHeight: PEAK + 12 }}
      >
        {PLANETS.map((p, i) => {
          const s = scaleFor(i);
          const size = BASE * s;
          const isActive = i === activeIndex;
          return (
            <button
              key={p.id}
              data-orb
              type="button"
              onClick={() => {
                preloadPlanet(p.id);
                navigate(p.route);
              }}
              onPointerEnter={() => {
                setHoverIdx(i);
                preloadPlanet(p.id);
              }}
              onFocus={() => preloadPlanet(p.id)}
              title={`${p.name} — ${p.blurb}`}
              aria-label={p.name}
              aria-current={isActive ? "true" : undefined}
              className="relative flex items-end justify-center transition-[width,height] duration-150 ease-out"
              style={{ width: size, height: size }}
            >
              <PlanetOrb p={p} size={size} />
              {isActive && (
                <span
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}