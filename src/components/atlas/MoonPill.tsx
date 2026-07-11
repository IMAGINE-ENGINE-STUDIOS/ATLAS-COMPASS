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
import moonPhoto from "@/assets/moon-photo.png";
import earthPhoto from "@/assets/earth-photo.png";

type PillProps = { className?: string };

function PhotoDisc({ src, glow }: { src: string; glow: string }) {
  return (
    <span
      aria-hidden
      className="relative block w-11 h-11 rounded-full shrink-0 overflow-hidden ring-1 ring-white/20"
      style={{ boxShadow: `0 0 24px ${glow}` }}
    >
      <img
        src={src}
        alt=""
        width={44}
        height={44}
        loading="lazy"
        className="w-full h-full object-cover object-center"
        draggable={false}
      />
    </span>
  );
}

export function MoonPill({ className = "" }: PillProps) {
  return (
    <Link
      to="/moon"
      title="Travel to the Moon"
      aria-label="Travel to the Moon"
      className={`group fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex items-center justify-center rounded-full bg-black/60 backdrop-blur-xl border border-white/15 hover:border-white/30 hover:bg-black/85 transition-all shadow-2xl p-0.5 ${className}`}
    >
      <PhotoDisc src={moonPhoto} glow="rgba(220,220,255,0.35)" />
    </Link>
  );
}

export function EarthPill({ className = "" }: PillProps) {
  return (
    <Link
      to="/atlas"
      title="Return to Earth"
      aria-label="Return to Earth"
      className={`group fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex items-center justify-center rounded-full bg-black/60 backdrop-blur-xl border border-white/15 hover:border-white/30 hover:bg-black/85 transition-all shadow-2xl p-0.5 ${className}`}
    >
      <PhotoDisc src={earthPhoto} glow="rgba(80,160,255,0.4)" />
    </Link>
  );
}

export default MoonPill;