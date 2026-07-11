/**
 * MoonPill / EarthPill
 * --------------------
 * A circular cropout button pinned to the top-center of the viewport that
 * teleports the user between the Earth (`/atlas`) and Moon (`/moon`) worlds.
 *
 *   • `<MoonPill />`  — shown on Earth, navigates to `/moon`.
 *   • `<EarthPill />` — shown on Moon,  navigates to `/atlas`.
 *
 * The icon is a pure CSS crescent-lit moon disc so it stays crisp at any
 * DPR and matches the Apple-inspired dark glass aesthetic used across the
 * rest of the Atlas HUD.
 */
import { Link } from "react-router-dom";

type PillProps = { className?: string };

function DiscMoon() {
  return (
    <span
      aria-hidden
      className="relative block w-10 h-10 rounded-full shrink-0"
      style={{
        background:
          "radial-gradient(circle at 30% 30%, #f5f0e6 0%, #cfc7b5 45%, #7c7466 100%)",
        boxShadow:
          "inset -6px -6px 14px rgba(0,0,0,0.55), inset 4px 4px 10px rgba(255,255,255,0.15), 0 0 22px rgba(220,220,255,0.35)",
      }}
    >
      {/* craters */}
      <span className="absolute left-[22%] top-[35%] w-[10%] h-[10%] rounded-full bg-black/25" />
      <span className="absolute left-[55%] top-[22%] w-[14%] h-[14%] rounded-full bg-black/20" />
      <span className="absolute left-[45%] top-[60%] w-[18%] h-[18%] rounded-full bg-black/25" />
      <span className="absolute left-[70%] top-[55%] w-[8%] h-[8%] rounded-full bg-black/20" />
    </span>
  );
}

function DiscEarth() {
  return (
    <span
      aria-hidden
      className="relative block w-10 h-10 rounded-full shrink-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 30% 30%, #6bb6ff 0%, #1e60c8 55%, #06264d 100%)",
        boxShadow:
          "inset -6px -6px 14px rgba(0,0,0,0.55), inset 4px 4px 10px rgba(255,255,255,0.2), 0 0 22px rgba(80,160,255,0.4)",
      }}
    >
      <span className="absolute left-[18%] top-[30%] w-[26%] h-[22%] rounded-[40%] bg-emerald-400/70" />
      <span className="absolute left-[55%] top-[50%] w-[22%] h-[18%] rounded-[40%] bg-emerald-500/60" />
      <span className="absolute left-[35%] top-[65%] w-[18%] h-[12%] rounded-[40%] bg-emerald-400/60" />
    </span>
  );
}

export function MoonPill({ className = "" }: PillProps) {
  return (
    <Link
      to="/moon"
      title="Travel to the Moon"
      aria-label="Travel to the Moon"
      className={`group fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-black/70 backdrop-blur-xl border border-white/15 hover:border-white/30 hover:bg-black/85 transition-all shadow-2xl ${className}`}
    >
      <DiscMoon />
      <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/85 group-hover:text-white">
        Moon
      </span>
    </Link>
  );
}

export function EarthPill({ className = "" }: PillProps) {
  return (
    <Link
      to="/atlas"
      title="Return to Earth"
      aria-label="Return to Earth"
      className={`group fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-black/70 backdrop-blur-xl border border-white/15 hover:border-white/30 hover:bg-black/85 transition-all shadow-2xl ${className}`}
    >
      <DiscEarth />
      <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/85 group-hover:text-white">
        Earth
      </span>
    </Link>
  );
}

export default MoonPill;