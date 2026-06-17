import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy } from "lucide-react";

/* ───────────────────────────────────────────────────────────
   20 original icons — pure SVG, currentColor, 24x24, 1.6 stroke
   Cohesive outline style with subtle accent fills.
   ─────────────────────────────────────────────────────────── */

type IconProps = { className?: string };
const base = "w-full h-full";
const SVG = ({ className, children, ...rest }: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || base}
    {...rest}
  >
    {children}
  </svg>
);

const AtlasOrbit = ({ className }: IconProps) => (
  <SVG className={className}>
    <circle cx="12" cy="12" r="5" />
    <path d="M3.5 12c2-3 5-5 8.5-5s6.5 2 8.5 5c-2 3-5 5-8.5 5s-6.5-2-8.5-5z" opacity="0.55" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </SVG>
);

const Spaceship = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M12 3c3 2.5 4.5 6 4.5 9.5L12 16l-4.5-3.5C7.5 9 9 5.5 12 3z" />
    <path d="M9 13l-3 4 3-1M15 13l3 4-3-1" />
    <circle cx="12" cy="10" r="1.4" />
  </SVG>
);

const VoxelStack = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M12 3l7 4-7 4-7-4 7-4z" />
    <path d="M5 11l7 4 7-4" opacity="0.55" />
    <path d="M5 15l7 4 7-4" opacity="0.3" />
  </SVG>
);

const TerrainBrush = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M3 17c2-3 4-3 6-1s4 2 6-1 4-3 6-1" />
    <path d="M15 6l3-3 3 3-3 3-3-3z" />
    <path d="M15 6l-4 4" />
  </SVG>
);

const POIPin = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="9.5" r="2.4" fill="currentColor" stroke="none" />
  </SVG>
);

const LogisticsRoute = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M3 17h10l3-4h4l1 4h-1" />
    <circle cx="7" cy="18.5" r="1.6" />
    <circle cx="17" cy="18.5" r="1.6" />
    <path d="M3 9l3-3 3 3" />
    <path d="M6 6v8" opacity="0.6" />
  </SVG>
);

const MarketStar = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M5 8h14l-1.5 11a2 2 0 01-2 1.8h-7A2 2 0 016.5 19L5 8z" />
    <path d="M9 8a3 3 0 016 0" />
    <path d="M12 12l.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 14.2l2.1-.3.9-1.9z" fill="currentColor" stroke="none" />
  </SVG>
);

const PaymentChip = ({ className }: IconProps) => (
  <SVG className={className}>
    <rect x="2.5" y="5" width="19" height="14" rx="3" />
    <rect x="6" y="9" width="5" height="4" rx="0.8" />
    <path d="M14 11h4M14 14h4M6 16h6" opacity="0.7" />
  </SVG>
);

const Beacon = ({ className }: IconProps) => (
  <SVG className={className}>
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <path d="M8 8a5.5 5.5 0 000 8M16 8a5.5 5.5 0 010 8" />
    <path d="M5 5a10 10 0 000 14M19 5a10 10 0 010 14" opacity="0.55" />
  </SVG>
);

const Constellation = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M4 6l6 4 4-3 6 7-10-2-6-6z" opacity="0.6" />
    {[
      [4, 6], [10, 10], [14, 7], [20, 14], [10, 12], [4, 18],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="1.3" fill="currentColor" stroke="none" />
    ))}
  </SVG>
);

const CompassRose = ({ className }: IconProps) => (
  <SVG className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 4l2 8-2 8-2-8 2-8z" fill="currentColor" />
    <path d="M4 12l8-2 8 2-8 2-8-2z" opacity="0.55" />
  </SVG>
);

const Drone = ({ className }: IconProps) => (
  <SVG className={className}>
    <circle cx="5" cy="6" r="2" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="5" cy="18" r="2" />
    <circle cx="19" cy="18" r="2" />
    <path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3" />
    <rect x="9" y="9" width="6" height="6" rx="1.4" />
  </SVG>
);

const CargoContainer = ({ className }: IconProps) => (
  <SVG className={className}>
    <rect x="3" y="7" width="18" height="10" rx="1.4" />
    <path d="M7 7v10M11 7v10M15 7v10M19 7v10" opacity="0.55" />
  </SVG>
);

const Telemetry = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M3 12h3l2-6 3 12 2-9 2 6 2-3h4" />
  </SVG>
);

const NetworkMesh = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M5 6l7 4 7-4M5 18l7-4 7 4M5 6v12M19 6v12M12 10v4" opacity="0.55" />
    {[
      [5, 6], [19, 6], [12, 10], [12, 14], [5, 18], [19, 18],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="1.6" fill="currentColor" stroke="none" />
    ))}
  </SVG>
);

const LayerStack = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M12 3l9 4-9 4-9-4 9-4z" />
    <path d="M3 12l9 4 9-4" />
    <path d="M3 16l9 4 9-4" opacity="0.55" />
  </SVG>
);

const BoltOrbit = ({ className }: IconProps) => (
  <SVG className={className}>
    <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)" />
    <path d="M13 6l-3 6h3l-2 6 5-7h-3l2-5z" fill="currentColor" stroke="none" />
  </SVG>
);

const MountainPeak = ({ className }: IconProps) => (
  <SVG className={className}>
    <path d="M3 19l5-8 4 5 3-4 6 7H3z" />
    <path d="M8 11l2-3 2 3" opacity="0.6" />
    <circle cx="17" cy="6" r="1.5" fill="currentColor" stroke="none" />
  </SVG>
);

const CameraLens = ({ className }: IconProps) => (
  <SVG className={className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 3l3 4.5h-6L12 3zM21 12l-4.5 3v-6L21 12zM12 21l-3-4.5h6L12 21zM3 12l4.5-3v6L3 12z" opacity="0.55" />
  </SVG>
);

const HeatPulse = ({ className }: IconProps) => (
  <SVG className={className}>
    <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="5" opacity="0.55" />
    <circle cx="12" cy="12" r="8" opacity="0.25" />
  </SVG>
);

const ICONS: { name: string; tag: string; Icon: React.FC<IconProps> }[] = [
  { name: "Atlas",         tag: "atlas",        Icon: AtlasOrbit },
  { name: "Spaceship",     tag: "spaceship",    Icon: Spaceship },
  { name: "Voxel",         tag: "voxel",        Icon: VoxelStack },
  { name: "Terrain Brush", tag: "brush",        Icon: TerrainBrush },
  { name: "POI Pin",       tag: "poi",          Icon: POIPin },
  { name: "Route",         tag: "route",        Icon: LogisticsRoute },
  { name: "Marketplace",   tag: "market",       Icon: MarketStar },
  { name: "Payments",      tag: "payments",     Icon: PaymentChip },
  { name: "Beacon",        tag: "signal",       Icon: Beacon },
  { name: "Constellation", tag: "graph",        Icon: Constellation },
  { name: "Compass",       tag: "compass",      Icon: CompassRose },
  { name: "Drone",         tag: "drone",        Icon: Drone },
  { name: "Cargo",         tag: "cargo",        Icon: CargoContainer },
  { name: "Telemetry",     tag: "telemetry",    Icon: Telemetry },
  { name: "Network",       tag: "network",      Icon: NetworkMesh },
  { name: "Layers",        tag: "layers",       Icon: LayerStack },
  { name: "Bolt Orbit",    tag: "speed",        Icon: BoltOrbit },
  { name: "Peak",          tag: "terrain",      Icon: MountainPeak },
  { name: "Lens",          tag: "camera",       Icon: CameraLens },
  { name: "Pulse",         tag: "heat",         Icon: HeatPulse },
];

export default function IconsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyName = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopied(name);
    setTimeout(() => setCopied(null), 1100);
  };

  return (
    <main
      className="min-h-screen w-full bg-[#06070b] text-white"
      style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif' }}
    >
      {/* Background glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(56,189,248,0.12), transparent 70%), radial-gradient(40% 40% at 80% 100%, rgba(167,139,250,0.10), transparent 70%)",
        }}
      />

      <header className="max-w-6xl mx-auto px-6 pt-10 pb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>

        <h1 className="mt-6 text-4xl md:text-5xl font-semibold tracking-tight">
          Icon Library
        </h1>
        <p className="mt-2 text-sm text-white/55 max-w-xl">
          Twenty original glyphs designed in-house for the Atlas suite. Pure SVG,
          24×24 grid, 1.6 stroke, inherits <code className="text-white/80">currentColor</code>.
        </p>
      </header>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {ICONS.map(({ name, tag, Icon }) => (
            <button
              key={name}
              onClick={() => copyName(name)}
              className="group relative aspect-square rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-all p-4 flex flex-col items-center justify-between text-center backdrop-blur-xl"
            >
              <div className="flex-1 w-full flex items-center justify-center text-white/85 group-hover:text-white transition-colors">
                <span className="w-10 h-10 block">
                  <Icon />
                </span>
              </div>
              <div className="w-full">
                <p className="text-[11px] font-medium text-white/90 truncate">{name}</p>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/35 mt-0.5">
                  {tag}
                </p>
              </div>
              <span
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-white/60"
                aria-hidden
              >
                {copied === name ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-8 text-[10px] uppercase tracking-[0.18em] text-white/30">
          {ICONS.length} icons · click to copy name
        </p>
      </section>
    </main>
  );
}