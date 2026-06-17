import { useState } from "react";
import {
  Building2,
  Coffee,
  Fuel,
  Hotel,
  ShoppingCart,
  Store,
  Stethoscope,
  UtensilsCrossed,
  MapPin,
} from "lucide-react";

/* Map an OSM-ish category to a fallback tag icon + tint */
const TAG_MAP: Record<string, { icon: React.ReactNode; hex: string }> = {
  restaurant:  { icon: <UtensilsCrossed className="w-1/2 h-1/2" />, hex: "#fb7185" },
  "fast food": { icon: <UtensilsCrossed className="w-1/2 h-1/2" />, hex: "#fb7185" },
  cafe:        { icon: <Coffee          className="w-1/2 h-1/2" />, hex: "#f59e0b" },
  "café":      { icon: <Coffee          className="w-1/2 h-1/2" />, hex: "#f59e0b" },
  supermarket: { icon: <ShoppingCart    className="w-1/2 h-1/2" />, hex: "#34d399" },
  grocery:     { icon: <ShoppingCart    className="w-1/2 h-1/2" />, hex: "#34d399" },
  convenience: { icon: <ShoppingCart    className="w-1/2 h-1/2" />, hex: "#34d399" },
  shop:        { icon: <Store           className="w-1/2 h-1/2" />, hex: "#a78bfa" },
  store:       { icon: <Store           className="w-1/2 h-1/2" />, hex: "#a78bfa" },
  mall:        { icon: <Store           className="w-1/2 h-1/2" />, hex: "#a78bfa" },
  hotel:       { icon: <Hotel           className="w-1/2 h-1/2" />, hex: "#38bdf8" },
  motel:       { icon: <Hotel           className="w-1/2 h-1/2" />, hex: "#38bdf8" },
  hostel:      { icon: <Hotel           className="w-1/2 h-1/2" />, hex: "#38bdf8" },
  fuel:        { icon: <Fuel            className="w-1/2 h-1/2" />, hex: "#fb923c" },
  hospital:    { icon: <Stethoscope     className="w-1/2 h-1/2" />, hex: "#2dd4bf" },
  pharmacy:    { icon: <Stethoscope     className="w-1/2 h-1/2" />, hex: "#2dd4bf" },
  clinic:      { icon: <Stethoscope     className="w-1/2 h-1/2" />, hex: "#2dd4bf" },
  health:      { icon: <Stethoscope     className="w-1/2 h-1/2" />, hex: "#2dd4bf" },
};

function tagFor(category?: string) {
  if (!category) return { icon: <Building2 className="w-1/2 h-1/2" />, hex: "#94a3b8" };
  const k = category.toLowerCase().trim().replace(/^[^a-z]+/, "");
  const first = k.split(/[\s·,/-]+/)[0] || "";
  return TAG_MAP[k] || TAG_MAP[first] || { icon: <MapPin className="w-1/2 h-1/2" />, hex: "#94a3b8" };
}

function logoForWebsite(website?: string): string | null {
  if (!website) return null;
  try {
    const host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return null;
  }
}

interface Props {
  website?: string;
  category?: string;
  size?: number;
  className?: string;
}

/**
 * Round company favicon.
 * - Loads a circular favicon for the given website
 * - On error (or when no website): renders the current category tag icon
 */
export default function CompanyFavicon({ website, category, size = 36, className = "" }: Props) {
  const [errored, setErrored] = useState(false);
  const logo = logoForWebsite(website);
  const { icon, hex } = tagFor(category);
  const showLogo = logo && !errored;

  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: showLogo ? "#fff" : `${hex}1f`,
        border: `1px solid ${hex}55`,
        boxShadow: `0 2px 10px ${hex}25`,
        color: hex,
      }}
      aria-label={category || "company"}
    >
      {showLogo ? (
        <img
          src={logo!}
          alt=""
          className="w-3/4 h-3/4 object-contain"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        icon
      )}
    </span>
  );
}