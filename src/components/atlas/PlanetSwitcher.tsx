/**
 * Top-center planet thumbnail bar shown on every Atlas world.
 * Clicking a planet routes to its dedicated viewer (/atlas, /moon, /mars,
 * /planet/:id).  Thumbnails are gradient-tinted discs derived from each
 * planet's NASA-derived albedo texture so the bar reads instantly even on
 * slow networks (the full texture streams into the sphere viewers).
 */
import { Link, useLocation } from "react-router-dom";
import { PLANETS, type PlanetEntry } from "@/lib/planets/config";

function PlanetChip({ p, active }: { p: PlanetEntry; active: boolean }) {
  return (
    <Link
      to={p.route}
      title={`${p.name} — ${p.blurb}`}
      className={`group relative flex flex-col items-center gap-0.5 shrink-0`}
    >
      <div
        className={`relative rounded-full overflow-hidden border transition-all duration-200 ${
          active
            ? "w-10 h-10 border-white shadow-[0_0_18px_rgba(255,255,255,0.55)]"
            : "w-8 h-8 border-white/25 group-hover:border-white/70 group-hover:scale-110"
        }`}
        style={{
          background: `radial-gradient(circle at 32% 30%, ${p.color} 0%, ${p.color}80 40%, #05060a 100%)`,
        }}
      >
        <img
          src={p.textureUrl}
          alt=""
          loading="lazy"
          decoding="async"
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover rounded-full opacity-90"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
        {p.id === "saturn" && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border pointer-events-none"
            style={{
              width: "160%",
              height: "30%",
              borderColor: `${p.color}cc`,
              transform: "translate(-50%,-50%) rotate(-18deg)",
            }}
          />
        )}
      </div>
      <span
        className={`text-[9px] font-mono uppercase tracking-widest transition-colors ${
          active ? "text-white" : "text-white/50 group-hover:text-white/90"
        }`}
      >
        {p.name}
      </span>
    </Link>
  );
}

export default function PlanetSwitcher() {
  const location = useLocation();
  const path = location.pathname;
  const activeId = (() => {
    if (path === "/" || path.startsWith("/atlas") || path.startsWith("/explore")) return "earth";
    if (path.startsWith("/moon")) return "moon";
    if (path.startsWith("/mars")) return "mars";
    if (path.startsWith("/planet/")) return path.split("/planet/")[1];
    return null;
  })();

  return (
    <div className="pointer-events-auto">
      <div className="rounded-full border border-white/10 bg-black/55 backdrop-blur-xl px-2 py-1.5 shadow-2xl">
        <div className="flex items-end gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar max-w-[92vw] sm:max-w-none">
          {PLANETS.map((p) => (
            <PlanetChip key={p.id} p={p} active={activeId === p.id} />
          ))}
        </div>
      </div>
    </div>
  );
}