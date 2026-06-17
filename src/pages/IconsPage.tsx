import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Code2, Copy, Search, X } from "lucide-react";

/* ───────────────────────────────────────────────────────────
   20 original icons — generated with AI, monochrome line art
   in a SpaceX / Apple SF Symbols register.
   ─────────────────────────────────────────────────────────── */
import atlasImg      from "@/assets/icons/atlas.png";
import spaceshipImg  from "@/assets/icons/spaceship.png";
import voxelImg      from "@/assets/icons/voxel.png";
import brushImg      from "@/assets/icons/brush.png";
import poiImg        from "@/assets/icons/poi.png";
import routeImg      from "@/assets/icons/route.png";
import marketImg     from "@/assets/icons/market.png";
import paymentsImg   from "@/assets/icons/payments.png";
import signalImg     from "@/assets/icons/signal.png";
import graphImg      from "@/assets/icons/graph.png";
import compassImg    from "@/assets/icons/compass.png";
import droneImg      from "@/assets/icons/drone.png";
import cargoImg      from "@/assets/icons/cargo.png";
import telemetryImg  from "@/assets/icons/telemetry.png";
import networkImg    from "@/assets/icons/network.png";
import layersImg     from "@/assets/icons/layers.png";
import speedImg      from "@/assets/icons/speed.png";
import terrainImg    from "@/assets/icons/terrain.png";
import cameraImg     from "@/assets/icons/camera.png";
import heatImg       from "@/assets/icons/heat.png";

/* Store filter icons */
import filterAllImg     from "@/assets/icons/filter-all.png";
import filterFoodImg    from "@/assets/icons/filter-food.png";
import filterCafeImg    from "@/assets/icons/filter-cafe.png";
import filterGroceryImg from "@/assets/icons/filter-grocery.png";
import filterShopsImg   from "@/assets/icons/filter-shops.png";
import filterHotelsImg  from "@/assets/icons/filter-hotels.png";
import filterFuelImg    from "@/assets/icons/filter-fuel.png";
import filterHealthImg  from "@/assets/icons/filter-health.png";

const Glyph = ({ src, alt }: { src: string; alt: string }) => (
  <img
    src={src}
    alt={alt}
    width={512}
    height={512}
    loading="lazy"
    draggable={false}
    className="w-full h-full object-contain select-none"
  />
);

const GLYPH_ICONS: { name: string; tag: string; src: string }[] = [
  { name: "Atlas",         tag: "atlas",        src: atlasImg },
  { name: "Spaceship",     tag: "spaceship",    src: spaceshipImg },
  { name: "Voxel",         tag: "voxel",        src: voxelImg },
  { name: "Terrain Brush", tag: "brush",        src: brushImg },
  { name: "POI Pin",       tag: "poi",          src: poiImg },
  { name: "Route",         tag: "route",        src: routeImg },
  { name: "Marketplace",   tag: "market",       src: marketImg },
  { name: "Payments",      tag: "payments",     src: paymentsImg },
  { name: "Beacon",        tag: "signal",       src: signalImg },
  { name: "Constellation", tag: "graph",        src: graphImg },
  { name: "Compass",       tag: "compass",      src: compassImg },
  { name: "Drone",         tag: "drone",        src: droneImg },
  { name: "Cargo",         tag: "cargo",        src: cargoImg },
  { name: "Telemetry",     tag: "telemetry",    src: telemetryImg },
  { name: "Network",       tag: "network",      src: networkImg },
  { name: "Layers",        tag: "layers",       src: layersImg },
  { name: "Bolt Orbit",    tag: "speed",        src: speedImg },
  { name: "Peak",          tag: "terrain",      src: terrainImg },
  { name: "Lens",          tag: "camera",       src: cameraImg },
  { name: "Pulse",         tag: "heat",         src: heatImg },
];

const FILTER_ICONS: { name: string; tag: string; src: string }[] = [
  { name: "All",     tag: "all",     src: filterAllImg },
  { name: "Food",    tag: "food",    src: filterFoodImg },
  { name: "Café",    tag: "cafe",    src: filterCafeImg },
  { name: "Grocery", tag: "grocery", src: filterGroceryImg },
  { name: "Shops",   tag: "shops",   src: filterShopsImg },
  { name: "Hotels",  tag: "hotels",  src: filterHotelsImg },
  { name: "Fuel",    tag: "fuel",    src: filterFuelImg },
  { name: "Health",  tag: "health",  src: filterHealthImg },
];

const SECTIONS = {
  glyphs: { label: "Glyphs",  icons: GLYPH_ICONS },
  filters:{ label: "Filters", icons: FILTER_ICONS },
  fonts:  { label: "Font",    icons: [] as { name: string; tag: string; src: string }[] },
} as const;
type SectionKey = keyof typeof SECTIONS;

/* ───────── Typography specimens ───────── */
type FontSpec = {
  name: string;
  tag: string;
  stack: string;
  weight: number;
  tracking: string;
  sample: string;
  caption: string;
  italic?: boolean;
  transform?: "uppercase" | "none";
  size: string; // clamp()
};

const FONTS: FontSpec[] = [
  {
    name: "Atlas Display",
    tag: "display-ultralight",
    stack: '"SF Pro Display",-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
    weight: 200,
    tracking: "-0.04em",
    sample: "Iconography.",
    caption: "SF Pro Display · 200 · Hero",
    size: "clamp(56px, 9vw, 132px)",
  },
  {
    name: "Editorial Serif",
    tag: "serif-italic",
    stack: '"Cormorant Garamond","Playfair Display",Georgia,serif',
    weight: 300,
    tracking: "-0.02em",
    sample: "A monochrome system.",
    caption: "Serif · 300 italic · Editorial",
    italic: true,
    size: "clamp(40px, 6vw, 88px)",
  },
  {
    name: "Brutalist Caps",
    tag: "brutalist",
    stack: '"SF Pro Display",-apple-system,system-ui,sans-serif',
    weight: 800,
    tracking: "-0.02em",
    sample: "GROUND CONTROL",
    caption: "Display · 800 · Compressed",
    transform: "uppercase",
    size: "clamp(40px, 7vw, 96px)",
  },
  {
    name: "Telemetry Mono",
    tag: "mono-tnum",
    stack: '"SF Mono","JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace',
    weight: 500,
    tracking: "0.02em",
    sample: "40.7128° N · 74.0060° W",
    caption: "Mono · 500 · Tabular",
    size: "clamp(20px, 2.4vw, 32px)",
  },
  {
    name: "Tracking Label",
    tag: "label-mono",
    stack: '"SF Mono","JetBrains Mono",ui-monospace,monospace',
    weight: 500,
    tracking: "0.32em",
    sample: "SERIES — 020",
    caption: "Mono · 500 · Eyebrow / 0.32em",
    transform: "uppercase",
    size: "clamp(11px, 1vw, 13px)",
  },
  {
    name: "Body Refined",
    tag: "body",
    stack: '"SF Pro Text",-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
    weight: 400,
    tracking: "-0.005em",
    sample:
      "Engineered for instrumentation, telemetry and the control surfaces of the Atlas suite.",
    caption: "Text · 400 · Body 14/22",
    size: "14px",
  },
  {
    name: "Numeric Readout",
    tag: "numeric",
    stack: '"SF Mono","JetBrains Mono",ui-monospace,monospace',
    weight: 300,
    tracking: "-0.02em",
    sample: "01 / 020",
    caption: "Mono · 300 · Readout",
    size: "clamp(48px, 6vw, 84px)",
  },
  {
    name: "Whisper",
    tag: "whisper",
    stack: '"Cormorant Garamond",Georgia,serif',
    weight: 300,
    tracking: "0.04em",
    sample: "a quiet system",
    caption: "Serif · 300 italic · Lowercase",
    italic: true,
    size: "clamp(28px, 3.6vw, 52px)",
  },
];

export default function IconsPage() {
  const [section, setSection] = useState<SectionKey>("glyphs");
  const [query, setQuery] = useState("");
  const [size, setSize] = useState<"S" | "M" | "L">("M");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selected, setSelected] = useState<string>(GLYPH_ICONS[0].name);
  const [copied, setCopied] = useState<string | null>(null);

  const SIZE_PX = { S: 22, M: 32, L: 48 } as const;

  const ICONS = SECTIONS[section].icons;

  const isFonts = section === "fonts";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICONS;
    return ICONS.filter(
      (i) => i.name.toLowerCase().includes(q) || i.tag.toLowerCase().includes(q),
    );
  }, [query, ICONS]);

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
      }}
    >
      {/* Editorial / specimen fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,500;1,300;1,500&family=Playfair+Display:ital,wght@0,400;1,400&family=JetBrains+Mono:wght@300;500&display=swap"
        rel="stylesheet"
      />

      <style>{`
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
            Atlas / Iconography / {SECTIONS[section].label}
          </span>
          <div className="ml-4 flex items-center gap-1">
            {(Object.keys(SECTIONS) as SectionKey[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setSection(k);
                  setSelected(SECTIONS[k].icons[0].name);
                  setQuery("");
                }}
                className={`mono text-[10px] uppercase tracking-[0.2em] h-7 px-3 transition-colors ${
                  section === k ? "text-black bg-white" : "text-white/55 hover:text-white"
                }`}
              >
                {SECTIONS[k].label}
              </button>
            ))}
          </div>
          <div className="ml-auto mono text-[10px] uppercase tracking-[0.28em] text-white/40">
            {isFonts
              ? `${String(FONTS.length).padStart(3, "0")} / ${String(FONTS.length).padStart(3, "0")}`
              : `${String(filtered.length).padStart(3, "0")} / ${String(ICONS.length).padStart(3, "0")}`}
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
              <div className="text-white/85 text-[11px]">512px</div>
              <div className="mt-0.5">Master</div>
            </div>
            <div>
              <div className="text-white/85 text-[11px]">PNG · 1c</div>
              <div className="mt-0.5">Format</div>
            </div>
          </div>
        </div>
      </section>

      {/* Controls */}
      {!isFonts && (
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

          {/* theme segmented */}
          <div className="flex items-center gap-1 px-5 h-14">
            <span className="mono text-[10px] uppercase tracking-[0.24em] text-white/45 mr-2">Theme</span>
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`mono text-[10px] uppercase tracking-[0.2em] h-7 px-2.5 transition-colors ${
                  theme === t ? "text-black bg-white" : "text-white/55 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
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
      )}

      {/* Grid */}
      <section className="max-w-[1400px] mx-auto px-6 pb-40">
        {isFonts ? (
          <div className="border-t border-white/[0.06]">
            {FONTS.map((f, idx) => (
              <article
                key={f.tag}
                className="group grid grid-cols-1 md:grid-cols-[180px_1fr_140px] gap-6 md:gap-10 items-baseline border-b border-white/[0.06] py-12 md:py-16 transition-colors hover:bg-white/[0.02]"
                style={{ animation: `io-rise 0.5s ${idx * 40}ms both ease-out` }}
              >
                <div className="mono text-[10px] uppercase tracking-[0.28em] text-white/40">
                  <div className="text-white/85 text-[11px]">
                    {String(idx + 1).padStart(3, "0")}
                  </div>
                  <div className="mt-1">{f.tag}</div>
                </div>

                <div
                  className="text-white/95 leading-[0.95]"
                  style={{
                    fontFamily: f.stack,
                    fontWeight: f.weight,
                    fontStyle: f.italic ? "italic" : "normal",
                    letterSpacing: f.tracking,
                    fontSize: f.size,
                    textTransform: f.transform ?? "none",
                  }}
                >
                  {f.sample}
                </div>

                <div className="mono text-[10px] uppercase tracking-[0.24em] text-white/45 md:text-right">
                  {f.caption}
                </div>
              </article>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mono text-[11px] uppercase tracking-[0.24em] text-white/40 py-24 text-center">
            No glyphs match “{query}”.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 border-b border-white/[0.06]">
            {filtered.map(({ name, tag, src }, idx) => {
              const isActive = name === selected;
              const num = String(ICONS.findIndex((i) => i.name === name) + 1).padStart(3, "0");
              const lightCell = theme === "light";
              return (
                <button
                  key={name}
                  onClick={() => setSelected(name)}
                  className={`group relative aspect-square border-t border-l border-white/[0.06] -mr-px -mb-px flex flex-col items-center justify-center transition-colors ${
                    isActive
                      ? "bg-white text-black"
                      : lightCell
                        ? "bg-white/[0.96] text-black hover:bg-white"
                        : "text-white/85 hover:bg-white/[0.04] hover:text-white"
                  }`}
                  style={{ animation: `io-rise 0.4s ${idx * 12}ms both ease-out` }}
                >
                  <span
                    className="mono text-[9px] uppercase tracking-[0.22em] absolute top-2 left-2 opacity-50"
                  >
                    {num}
                  </span>

                  <span
                    className={`block transition-transform duration-300 group-hover:scale-110 ${
                      isActive || lightCell ? "invert" : ""
                    }`}
                    style={{ width: SIZE_PX[size], height: SIZE_PX[size] }}
                  >
                    <Glyph src={src} alt={name} />
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
      {!isFonts && (
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-black/90 backdrop-blur-2xl">
        <div className="max-w-[1400px] mx-auto px-6 py-5 flex items-center gap-6">
          {/* preview */}
          <div className="shrink-0 w-20 h-20 border border-white/[0.08] flex items-center justify-center">
            <span className="block w-12 h-12">
              <Glyph src={current.src} alt={current.name} />
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
      )}
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