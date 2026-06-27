import { useEffect, useRef, useState } from "react";
import { Settings2, X, RotateCcw } from "lucide-react";

interface Props {
  viewer: any | null;
  visible: boolean;
}

type Settings = {
  sse: number;            // maximumScreenSpaceError (lower = sharper, more bandwidth)
  cacheMiB: number;       // cacheBytes in MiB
  preloadWhenHidden: boolean;
  loadSiblings: boolean;
  preloadFlightDestinations: boolean;
  dynamicSSE: boolean;
  dynamicSSEDensity: number;
  dynamicSSEFactor: number;
  skipLOD: boolean;
  immediatelyLoad: boolean;
  shadows: boolean;
  showCredits: boolean;
};

const DEFAULTS: Settings = {
  // Performance-first defaults: foveated + progressive loading keeps the
  // viewport realistic without flooding the network/GPU with off-screen tiles.
  sse: 14,
  cacheMiB: 1024,
  preloadWhenHidden: false,
  loadSiblings: false,
  preloadFlightDestinations: false,
  dynamicSSE: true,
  dynamicSSEDensity: 0.00278,
  dynamicSSEFactor: 4,
  skipLOD: false,
  immediatelyLoad: false,
  shadows: false,
  showCredits: true,
};

const LS_KEY = "atlas.google3d.settings.v4";

function load(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { return { ...DEFAULTS }; }
}

export default function Google3DController({ viewer, visible }: Props) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings>(() => load());
  const popRef = useRef<HTMLDivElement | null>(null);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  }, [s]);

  // Push settings into the live tileset every change.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;
    const ts: any = (viewer as any)._googleDirectTileset;
    if (!ts) return;
    try {
      ts.maximumScreenSpaceError = Math.max(1, s.sse);
      ts.cacheBytes = Math.max(64, s.cacheMiB) * 1024 * 1024;
      ts.maximumMemoryUsage = Math.min(1024, Math.max(128, s.cacheMiB));
      ts.maximumNumberOfLoadedTiles = 512;
      ts.preloadWhenHidden = s.preloadWhenHidden;
      ts.loadSiblings = s.loadSiblings;
      ts.preloadFlightDestinations = s.preloadFlightDestinations;
      ts.dynamicScreenSpaceError = s.dynamicSSE;
      ts.dynamicScreenSpaceErrorDensity = s.dynamicSSEDensity;
      ts.dynamicScreenSpaceErrorFactor = s.dynamicSSEFactor;
      ts.skipLevelOfDetail = s.skipLOD;
      ts.immediatelyLoadDesiredLevelOfDetail = s.immediatelyLoad;
      ts.shadows = s.shadows ? 1 : 0; // ShadowMode.ENABLED=1, DISABLED=0
      ts.showCreditsOnScreen = s.showCredits;
      viewer.scene.requestRender?.();
    } catch (e) {
      console.warn("[Google3DController] apply failed", e);
    }
  }, [viewer, s]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!visible) return null;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="relative self-end mb-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Google 3D Tiles settings"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md shadow-lg transition-colors ${
          open
            ? "bg-emerald-500/25 border-emerald-400/40 text-emerald-200"
            : "bg-black/55 border-white/10 text-white/80 hover:text-white"
        }`}
      >
        <Settings2 className="w-3 h-3" />
        <span className="text-[9px] font-mono uppercase tracking-wider">G3D Controls</span>
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute bottom-full right-0 mb-2 w-[300px] rounded-xl bg-black/85 backdrop-blur-xl border border-white/10 shadow-2xl text-white/90 p-3 z-50"
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-semibold tracking-wide uppercase">Google 3D Tiles</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                title="Reset to defaults"
                onClick={() => setS({ ...DEFAULTS })}
                className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            <Slider label="Screen-space error" hint="Lower = sharper, more bandwidth"
              min={1} max={32} step={1} value={s.sse}
              onChange={(v) => set("sse", v)} suffix="px" />

            <Slider label="Tile cache" hint="GPU + RAM tile memory budget"
              min={128} max={4096} step={64} value={s.cacheMiB}
              onChange={(v) => set("cacheMiB", v)} suffix="MiB" />

            <Slider label="Dynamic SSE density" hint="Higher = more aggressive distance fog skip"
              min={0} max={0.02} step={0.0005} value={s.dynamicSSEDensity}
              disabled={!s.dynamicSSE}
              onChange={(v) => set("dynamicSSEDensity", v)} suffix="" digits={4} />

            <Slider label="Dynamic SSE factor" hint="Distance multiplier when above is active"
              min={1} max={16} step={1} value={s.dynamicSSEFactor}
              disabled={!s.dynamicSSE}
              onChange={(v) => set("dynamicSSEFactor", v)} suffix="x" />

            <div className="h-px bg-white/10 my-1" />

            <Toggle label="Preload hidden tiles" value={s.preloadWhenHidden}
              onChange={(v) => set("preloadWhenHidden", v)} />
            <Toggle label="Load sibling tiles" value={s.loadSiblings}
              onChange={(v) => set("loadSiblings", v)} />
            <Toggle label="Preload flight destinations" value={s.preloadFlightDestinations}
              onChange={(v) => set("preloadFlightDestinations", v)} />
            <Toggle label="Dynamic screen-space error" value={s.dynamicSSE}
              onChange={(v) => set("dynamicSSE", v)} />
            <Toggle label="Skip LOD (faster traversal)" value={s.skipLOD}
              onChange={(v) => set("skipLOD", v)} />
            <Toggle label="Force top LOD immediately" value={s.immediatelyLoad}
              onChange={(v) => set("immediatelyLoad", v)} />
            <Toggle label="Cast shadows" value={s.shadows}
              onChange={(v) => set("shadows", v)} />
            <Toggle label="Show Google credits on screen" value={s.showCredits}
              onChange={(v) => set("showCredits", v)} />
          </div>

          <p className="text-[8px] text-white/40 mt-2 leading-relaxed">
            Settings persist locally and apply live to the tile.googleapis.com feed.
            Per Google ToS the attribution must remain visible.
          </p>
        </div>
      )}
    </div>
  );
}

function Slider({
  label, hint, min, max, step, value, onChange, suffix, digits, disabled,
}: {
  label: string; hint?: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; suffix?: string; digits?: number; disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-white/85">{label}</span>
        <span className="text-[10px] font-mono tabular-nums text-emerald-300">
          {digits != null ? value.toFixed(digits) : value}{suffix ? ` ${suffix}` : ""}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-emerald-400 cursor-pointer"
      />
      {hint && <p className="text-[8px] text-white/40 mt-0.5">{hint}</p>}
    </div>
  );
}

function Toggle({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-[10px] text-white/85 group-hover:text-white">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-7 h-3.5 rounded-full transition-colors ${value ? "bg-emerald-500/70" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${value ? "translate-x-3.5" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}