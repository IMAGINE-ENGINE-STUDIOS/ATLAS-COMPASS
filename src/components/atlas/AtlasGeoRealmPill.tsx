/**
 * AtlasGeoRealmPill — floating nav pill that opens the /geo-realm workbench
 * (subsurface tectonic + crustal compiler). Sits next to the Community
 * Layers pill in the Atlas HUD.
 */
import { Link } from "react-router-dom";
import { Layers3 } from "lucide-react";

export default function AtlasGeoRealmPill() {
  return (
    <Link
      to="/geo-realm"
      title="Open Geo Realm — subsurface compiler"
      className="group flex items-center gap-1.5 h-8 px-3 rounded-full border border-white/15 bg-black/60 backdrop-blur-md text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85 hover:border-orange-400/50 hover:bg-orange-400/10 hover:text-white transition-colors"
    >
      <Layers3
        className="w-3.5 h-3.5 text-orange-300 group-hover:text-orange-200"
        strokeWidth={2.2}
      />
      <span>Geo Realm</span>
      <span className="ml-0.5 h-1 w-1 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(255,140,66,0.85)]" />
    </Link>
  );
}