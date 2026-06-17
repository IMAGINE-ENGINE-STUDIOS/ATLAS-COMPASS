import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Code2, Copy, Search, X } from "lucide-react";

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
  const [query, setQuery] = useState("");
  const [weight, setWeight] = useState(1.4);
  const [size, setSize] = useState<"S" | "M" | "L">("M");
  const [selected, setSelected] = useState<string>(ICONS[0].name);
  const [copied, setCopied] = useState<string | null>(null);

  const SIZE_PX = { S: 22, M: 32, L: 48 } as const;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICONS;
    return ICONS.filter(
      (i) => i.name.toLowerCase().includes(q) || i.tag.toLowerCase().includes(q),
    );
  }, [query]);

  const current = ICONS.find((i) => i.name === selected) || ICONS[0];

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
  };

  const jsxSnippet = (name: string) =>
    `<${name.replace(/\s+/g, "")} className="w-6 h-6" />`;
  const importSnippet = (name: string) =>
    `import { ${name.replace(/\s+/g, "")} } from "@/icons";`;

  return (
    <main
      className="min-h-screen w-full bg-black text-white selection:bg-white selection:text-black"
      style={{
        fontFamily:
          '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
        // override svg attribute stroke-width via CSS variable for live weight control
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ["--sw" as any]: weight,
      }}
    >
      <style>{`
        .ico-stage svg { stroke-width: var(--sw, 1.4) !important; }
        .mono { font-family: "SF Mono","JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace; font-feature-settings: "tnum","ss01"; }
        .hairline-grid > * + * { border-left: 1px solid rgba(255,255,255,0.06); }
        @media (max-width: 639px){ .hairline-grid > * + * { border-left: 0; } }
        @keyframes io-rise { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform:none; } }
      `}</style>

      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-black/85 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[11px] mono uppercase tracking-[0.2em] text-white/55 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Index
          </Link>
          <span className="mono text-[10px] uppercase tracking-[0.32em] text-white/30 hidden md:inline">
            Atlas / Iconography / v1.0
          </span>
          <div className="ml-auto mono text-[10px] uppercase tracking-[0.28em] text-white/40">
            {String(filtered.length).padStart(3, "0")} / {String(ICONS.length).padStart(3, "0")}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-[1400px] mx-auto px-6 pt-20 pb-14">
        <p className="mono text-[10px] uppercase tracking-[0.4em] text-white/40">
          Series — 020
        </p>
        <h1
          className="mt-6 text-[clamp(56px,11vw,168px)] leading-[0.88] tracking-[-0.04em]"
          style={{ fontWeight: 200 }}
        >
          Iconography.
        </h1>
        <div className="mt-8 grid md:grid-cols-2 gap-8 max-w-4xl">
          <p className="text-sm text-white/55 leading-relaxed">
            A monochrome system of twenty primitives drawn on a single
            twenty-four pixel grid. Engineered for instrumentation, telemetry
            and the control surfaces of the Atlas suite.
          </p>
          <div className="mono text-[10px] uppercase tracking-[0.28em] text-white/40 grid grid-cols-3 gap-4">
            <div>
              <div className="text-white/85 text-[11px]">24×24</div>
              <div className="mt-0.5">Grid</div>
            </div>
            <div>
              <div className="text-white/85 text-[11px]">{weight.toFixed(2)}</div>
              <div className="mt-0.5">Stroke</div>
            </div>
            <div>
              <div className="text-white/85 text-[11px]">SVG · 1c</div>
              <div className="mt-0.5">Format</div>
            </div>
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="max-w-[1400px] mx-auto px-6">
        <div className="border-y border-white/[0.06] hairline-grid grid grid-cols-1 sm:grid-cols-[1fr_auto_auto]">
          {/* search */}
          <label className="flex items-center gap-3 px-5 h-14">
            <Search className="w-3.5 h-3.5 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search glyphs…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30 text-white"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-white/40 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </label>

          {/* weight slider */}
          <div className="flex items-center gap-3 px-5 h-14 min-w-[220px]">
            <span className="mono text-[10px] uppercase tracking-[0.24em] text-white/45">Stroke</span>
            <input
              type="range"
              min={0.6}
              max={2.4}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value))}
              className="flex-1 accent-white h-px"
            />
            <span className="mono text-[10px] text-white/70 w-8 text-right">{weight.toFixed(1)}</span>
          </div>

          {/* size segmented */}
          <div className="flex items-center gap-1 px-5 h-14">
            <span className="mono text-[10px] uppercase tracking-[0.24em] text-white/45 mr-2">Size</span>
            {(["S", "M", "L"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`mono text-[10px] uppercase tracking-[0.2em] w-7 h-7 transition-colors ${
                  size === s ? "text-black bg-white" : "text-white/55 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-[1400px] mx-auto px-6 pb-40">
        {filtered.length === 0 ? (
          <p className="mono text-[11px] uppercase tracking-[0.24em] text-white/40 py-24 text-center">
            No glyphs match “{query}”.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 border-b border-white/[0.06]">
            {filtered.map(({ name, tag, Icon }, idx) => {
              const isActive = name === selected;
              const num = String(ICONS.findIndex((i) => i.name === name) + 1).padStart(3, "0");
              return (
                <button
                  key={name}
                  onClick={() => setSelected(name)}
                  className={`ico-stage group relative aspect-square border-t border-l border-white/[0.06] -mr-px -mb-px flex flex-col items-center justify-center transition-colors ${
                    isActive ? "bg-white text-black" : "text-white/85 hover:bg-white/[0.04] hover:text-white"
                  }`}
                  style={{ animation: `io-rise 0.4s ${idx * 12}ms both ease-out` }}
                >
                  <span
                    className="mono text-[9px] uppercase tracking-[0.22em] absolute top-2 left-2 opacity-50"
                  >
                    {num}
                  </span>

                  <span
                    className="block transition-transform duration-300 group-hover:scale-110"
                    style={{ width: SIZE_PX[size], height: SIZE_PX[size] }}
                  >
                    <Icon />
                  </span>

                  <span
                    className={`mono text-[9px] uppercase tracking-[0.22em] absolute bottom-2 right-2 transition-opacity ${
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    }`}
                  >
                    {tag}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Detail rail */}
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-black/90 backdrop-blur-2xl">
        <div className="max-w-[1400px] mx-auto px-6 py-5 flex items-center gap-6">
          {/* preview */}
          <div className="ico-stage shrink-0 w-20 h-20 border border-white/[0.08] flex items-center justify-center">
            <span className="block w-10 h-10 text-white">
              <current.Icon />
            </span>
          </div>

          {/* meta */}
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] uppercase tracking-[0.28em] text-white/40">
              {String(ICONS.findIndex((i) => i.name === current.name) + 1).padStart(3, "0")} · {current.tag}
            </p>
            <h3 className="mt-1 text-2xl tracking-tight" style={{ fontWeight: 300 }}>
              {current.name}
            </h3>
          </div>

          {/* actions */}
          <div className="hidden sm:flex items-center gap-2">
            <CopyChip
              label="Name"
              copied={copied === "name"}
              onClick={() => copy("name", current.name)}
            />
            <CopyChip
              label="JSX"
              icon={<Code2 className="w-3 h-3" />}
              copied={copied === "jsx"}
              onClick={() => copy("jsx", jsxSnippet(current.name))}
            />
            <CopyChip
              label="Import"
              icon={<Code2 className="w-3 h-3" />}
              copied={copied === "import"}
              onClick={() => copy("import", importSnippet(current.name))}
            />
          </div>
        </div>
      </aside>
    </main>
  );
}

function CopyChip({
  label,
  copied,
  onClick,
  icon,
}: {
  label: string;
  copied: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`mono inline-flex items-center gap-1.5 px-3 h-8 text-[10px] uppercase tracking-[0.2em] border transition-colors ${
        copied
          ? "border-white bg-white text-black"
          : "border-white/15 text-white/70 hover:border-white/60 hover:text-white"
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : icon || <Copy className="w-3 h-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}