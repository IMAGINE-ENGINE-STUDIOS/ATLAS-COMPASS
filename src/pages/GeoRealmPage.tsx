/**
 * Geo Realm — subsurface + tectonics workbench.
 *
 * Layout rebuild: the globe is the interface. Controls live in one collapsible
 * left rail with a single open section at a time, the compiler is an on-demand
 * slide-over (drag-and-drop works anywhere on the globe), the selected-plate
 * inspector only exists while something is selected, and a single readout bar
 * carries coordinates + feed status. On mobile the rail and compiler become
 * bottom sheets. Animation is CSS only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ChevronDown, Layers as LayersIcon, Mountain, Activity,
  Boxes, UploadCloud, PanelLeftClose, PanelLeftOpen, X, Globe2,
} from "lucide-react";
import GeoRealmScene from "@/components/geo-realm/GeoRealmScene";
import GeoRealmCompiler from "@/components/geo-realm/GeoRealmCompiler";
import SelectedPlatePanel from "@/components/geo-realm/SelectedPlatePanel";
import type { SelectedPlate } from "@/components/geo-realm/VolumetricPlates";
import { CANONICAL_DATASETS, CRUST1_LAYERS, HYPOCENTER_FEEDS } from "@/lib/geoRealm/dataSources";
import { supabase } from "@/integrations/supabase/client";
import type { GeoRealmBundle } from "@/lib/geoRealm/types";

type SectionId = "layers" | "structure" | "plates" | "seismicity";

const SECTIONS: { id: SectionId; label: string; icon: typeof LayersIcon }[] = [
  { id: "layers", label: "Layers", icon: LayersIcon },
  { id: "structure", label: "Structure", icon: Mountain },
  { id: "plates", label: "Plates", icon: Boxes },
  { id: "seismicity", label: "Seismicity", icon: Activity },
];

export default function GeoRealmPage() {
  const [active, setActive] = useState<string[]>(["pb2002_plates", "pb2002_boundaries"]);
  const [showCrust, setShowCrust] = useState(true);
  const [showSurface, setShowSurface] = useState(true);
  const [realistic, setRealistic] = useState(true);
  const [hypo, setHypo] = useState<string | null>("usgs_m45_month");
  const [showVolumetric, setShowVolumetric] = useState(true);
  const [showMotion, setShowMotion] = useState(true);
  const [thicknessKm, setThicknessKm] = useState(100);
  const [plateColorMode, setPlateColorMode] = useState<"plate" | "activity">("plate");
  const [selectedPlate, setSelectedPlate] = useState<SelectedPlate | null>(null);
  const [cam, setCam] = useState<{ alt: number; lat: number; lon: number }>({ alt: 1.6, lat: 0, lon: 0 });
  const [bundles, setBundles] = useState<GeoRealmBundle[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  // UI shell state
  const [railOpen, setRailOpen] = useState(true);
  const [section, setSection] = useState<SectionId>("layers");
  const [compilerOpen, setCompilerOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<null | "controls" | "compiler">(null);

  useEffect(() => {
    let cancel = false;
    supabase
      .from("geo_realm_bundles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancel || error) return;
        setBundles((data ?? []) as unknown as GeoRealmBundle[]);
      });
    return () => { cancel = true; };
  }, [refreshTick]);

  const toggle = useCallback((id: string) => {
    setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }, []);

  const onBundleAdded = useCallback(() => setRefreshTick((t) => t + 1), []);

  const controls = useMemo(
    () => ({
      active, toggle, showCrust, setShowCrust, showSurface, setShowSurface,
      realistic, setRealistic, hypo, setHypo, showVolumetric, setShowVolumetric,
      showMotion, setShowMotion, thicknessKm, setThicknessKm,
      plateColorMode, setPlateColorMode, bundles,
    }),
    [active, toggle, showCrust, showSurface, realistic, hypo, showVolumetric,
     showMotion, thicknessKm, plateColorMode, bundles],
  );

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#04070f] text-white">
      <GeoRealmScene
        activeCanonical={active}
        showCrust={showCrust}
        showSurface={showSurface}
        realistic={realistic}
        activeHypocenter={hypo}
        showVolumetricPlates={showVolumetric}
        showPlateMotion={showMotion}
        plateThicknessKm={thicknessKm}
        selectedPlateCode={selectedPlate?.code ?? null}
        onSelectPlate={setSelectedPlate}
        plateColorMode={plateColorMode}
        onCamera={setCam}
      />

      {/* ── Top bar ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            to="/atlas"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/50 text-white/70 backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Return to Atlas"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-xl">
            <Globe2 className="h-4 w-4 text-orange-300" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Geo Realm</div>
              <div className="text-[10px] text-white/45">Tectonics &amp; subsurface</div>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCompilerOpen((v) => !v)}
            className={`hidden items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium backdrop-blur-xl transition-colors lg:flex ${
              compilerOpen
                ? "border-orange-400/40 bg-orange-400/15 text-orange-100"
                : "border-white/10 bg-black/50 text-white/80 hover:bg-white/10"
            }`}
          >
            <UploadCloud className="h-4 w-4" />
            Compiler
          </button>
        </div>
      </header>

      {/* ── Left rail (desktop) ── */}
      <div className="pointer-events-none absolute left-3 top-[4.75rem] z-30 hidden lg:block">
        {railOpen ? (
          <div className="pointer-events-auto flex max-h-[calc(100dvh-9.5rem)] w-[19rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/55 backdrop-blur-2xl animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="flex items-center gap-1 border-b border-white/10 p-1.5">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const on = section === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSection(s.id)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors ${
                      on ? "bg-orange-400/15 text-orange-100" : "text-white/55 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {s.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setRailOpen(false)}
                className="ml-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/45 hover:bg-white/5 hover:text-white"
                aria-label="Collapse panel"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <SectionBody id={section} {...controls} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/55 text-white/70 backdrop-blur-xl hover:bg-white/10 hover:text-white"
            aria-label="Open panel"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Compiler slide-over (desktop) ── */}
      {compilerOpen && (
        <div className="pointer-events-auto absolute right-3 top-[4.75rem] z-30 hidden max-h-[calc(100dvh-9.5rem)] w-[21rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/60 backdrop-blur-2xl animate-in fade-in slide-in-from-right-2 duration-200 lg:flex">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold tracking-tight">Data compiler</span>
            <button
              type="button"
              onClick={() => setCompilerOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Close compiler"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <GeoRealmCompiler onBundleAdded={onBundleAdded} />
          </div>
        </div>
      )}

      {/* ── Plate inspector ── */}
      {selectedPlate && (
        <div
          className={`pointer-events-none absolute left-1/2 top-[4.75rem] z-30 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-200 lg:left-auto lg:translate-x-0 ${
            compilerOpen ? "lg:right-[22.5rem]" : "lg:right-3"
          }`}
        >
          <SelectedPlatePanel plate={selectedPlate} onClose={() => setSelectedPlate(null)} />
        </div>
      )}

      {/* ── Mobile sheets ── */}
      {mobilePanel && (
        <div
          className="absolute inset-0 z-40 flex items-end bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobilePanel(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl border-t border-white/10 bg-[#080c16]/95 backdrop-blur-2xl animate-in slide-in-from-bottom duration-200"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
            {mobilePanel === "controls" ? (
              <>
                <div className="flex items-center gap-1 border-b border-white/10 p-1.5">
                  {SECTIONS.map((s) => {
                    const Icon = s.icon;
                    const on = section === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSection(s.id)}
                        className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors ${
                          on ? "bg-orange-400/15 text-orange-100" : "text-white/55"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <div className="max-h-[64dvh] overflow-y-auto p-3">
                  <SectionBody id={section} {...controls} />
                </div>
              </>
            ) : (
              <div className="max-h-[70dvh] overflow-y-auto p-3">
                <GeoRealmCompiler onBundleAdded={onBundleAdded} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Readout bar ── */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex w-full items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobilePanel("controls")}
            className="flex-1 rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-xs font-medium text-white/85 backdrop-blur-xl active:bg-white/10"
          >
            Controls
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel("compiler")}
            className="flex-1 rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-2.5 text-xs font-medium text-orange-100 backdrop-blur-xl active:bg-orange-400/20"
          >
            Compiler
          </button>
        </div>
        <div className="pointer-events-auto flex max-w-full items-center gap-4 overflow-x-auto rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[11px] tabular-nums text-white/75 backdrop-blur-xl">
          <span className="whitespace-nowrap"><span className="text-white/40">LAT</span> {cam.lat.toFixed(2)}°</span>
          <span className="whitespace-nowrap"><span className="text-white/40">LON</span> {cam.lon.toFixed(2)}°</span>
          <span className="whitespace-nowrap"><span className="text-white/40">ALT</span> {(cam.alt * 6371).toFixed(0)} km</span>
          <span className="hidden whitespace-nowrap sm:inline">
            <span className="text-white/40">LAYERS</span> {active.length}
          </span>
          <span className="hidden items-center gap-1.5 whitespace-nowrap sm:inline-flex">
            <span className={`h-1.5 w-1.5 rounded-full ${hypo ? "bg-emerald-400" : "bg-white/25"}`} />
            {hypo ? "live seismicity" : "seismicity off"}
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────── Rail sections ─────────────────────────── */

interface ControlProps {
  active: string[];
  toggle: (id: string) => void;
  showCrust: boolean; setShowCrust: (v: boolean) => void;
  showSurface: boolean; setShowSurface: (v: boolean) => void;
  realistic: boolean; setRealistic: (v: boolean) => void;
  hypo: string | null; setHypo: (v: string | null) => void;
  showVolumetric: boolean; setShowVolumetric: (v: boolean) => void;
  showMotion: boolean; setShowMotion: (v: boolean) => void;
  thicknessKm: number; setThicknessKm: (v: number) => void;
  plateColorMode: "plate" | "activity"; setPlateColorMode: (v: "plate" | "activity") => void;
  bundles: GeoRealmBundle[];
}

function SectionBody({ id, ...p }: ControlProps & { id: SectionId }) {
  if (id === "layers") return <LayersSection {...p} />;
  if (id === "structure") return <StructureSection {...p} />;
  if (id === "plates") return <PlatesSection {...p} />;
  return <SeismicitySection {...p} />;
}

function LayersSection({ active, toggle, bundles }: ControlProps) {
  const [showCitations, setShowCitations] = useState(false);
  return (
    <div className="space-y-3">
      <SectionTitle>Canonical datasets</SectionTitle>
      <div className="space-y-1.5">
        {CANONICAL_DATASETS.map((d) => {
          const on = active.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => toggle(d.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                on ? "border-orange-400/40 bg-orange-400/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: d.color, boxShadow: on ? `0 0 10px ${d.color}` : "none" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white/90">{d.label}</span>
                {showCitations && (
                  <span className="mt-0.5 block text-[10px] leading-snug text-white/45">{d.citation}</span>
                )}
              </span>
              <Switch on={on} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setShowCitations((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white/80"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${showCitations ? "rotate-180" : ""}`} />
        {showCitations ? "Hide sources" : "Show sources"}
      </button>

      <SectionTitle>Saved bundles · {bundles.length}</SectionTitle>
      {bundles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
          Drop a SEG-Y, NetCDF, GeoTIFF or GeoJSON file into the compiler to build your first bundle.
        </p>
      ) : (
        <div className="space-y-1.5">
          {bundles.map((b) => (
            <div key={b.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-white/90">{b.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/35">{b.kind}</span>
              </div>
              <div className="text-[11px] text-white/45">
                {b.layers.length} layer{b.layers.length === 1 ? "" : "s"}{b.is_public ? " · public" : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StructureSection({
  showCrust, setShowCrust, showSurface, setShowSurface, realistic, setRealistic,
}: ControlProps) {
  return (
    <div className="space-y-3">
      <SectionTitle>Globe surface</SectionTitle>
      <Row label="Blue Marble imagery" hint="NASA topo + bathymetry" on={realistic} onChange={setRealistic} />
      <Row label="Opaque surface" hint="Off reveals the X-ray interior" on={showSurface} onChange={setShowSurface} />

      <SectionTitle>Interior shells</SectionTitle>
      <Row label="Crust · mantle · core" hint="CRUST1.0 + PREM radii" on={showCrust} onChange={setShowCrust} />

      <SectionTitle>CRUST1.0 thicknesses</SectionTitle>
      <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        {CRUST1_LAYERS.map((l) => (
          <div key={l.id} className="flex items-center gap-2.5 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: l.color }} />
            <span className="flex-1 truncate text-white/75">{l.label}</span>
            <span className="tabular-nums text-white/45">
              {l.thickness_km > 0 ? `${l.thickness_km.toFixed(1)} km` : "—"}
            </span>
          </div>
        ))}
        <p className="pt-1 text-[10px] text-white/35">Laske, Masters, Ma &amp; Pasyanos (2013) global means.</p>
      </div>
    </div>
  );
}

function PlatesSection({
  showVolumetric, setShowVolumetric, showMotion, setShowMotion,
  thicknessKm, setThicknessKm, plateColorMode, setPlateColorMode,
}: ControlProps) {
  return (
    <div className="space-y-3">
      <SectionTitle>Volumetric plates</SectionTitle>
      <Row label="Extruded lithosphere" hint="Click a plate to inspect it" on={showVolumetric} onChange={setShowVolumetric} />
      <Row label="Motion vectors" hint="NNR-MORVEL 2010 Euler poles" on={showMotion} onChange={setShowMotion} />

      <SectionTitle>Colour by</SectionTitle>
      <div className="flex gap-1.5">
        {(["plate", "activity"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setPlateColorMode(m)}
            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
              plateColorMode === m
                ? "border-orange-400/40 bg-orange-400/15 text-white"
                : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.06]"
            }`}
          >
            {m === "plate" ? "Identity" : "Velocity"}
          </button>
        ))}
      </div>
      {plateColorMode === "activity" && (
        <div>
          <div
            className="h-2 w-full rounded-full"
            style={{
              background:
                "linear-gradient(to right,rgb(27,60,122),rgb(42,143,216),rgb(61,214,154),rgb(255,208,58),rgb(255,122,31),rgb(255,45,45))",
            }}
          />
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/45">
            <span>0</span><span>30</span><span>60</span><span>90</span><span>130+ mm/yr</span>
          </div>
        </div>
      )}

      <SectionTitle>Lithosphere thickness</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-white/70">Extrusion depth</span>
          <span className="tabular-nums text-white/95">{thicknessKm} km</span>
        </div>
        <input
          type="range"
          min={20}
          max={250}
          step={5}
          value={thicknessKm}
          onChange={(e) => setThicknessKm(Number(e.target.value))}
          className="w-full accent-orange-400"
        />
        <p className="mt-1.5 text-[10px] leading-snug text-white/35">
          Conrad &amp; Lithgow-Bertelloni (2006): ~100 km oceanic, ~200 km continental.
        </p>
      </div>
    </div>
  );
}

function SeismicitySection({ hypo, setHypo }: ControlProps) {
  const options = [{ id: null as string | null, label: "Off" }, ...HYPOCENTER_FEEDS.map((f) => ({ id: f.id, label: f.label }))];
  return (
    <div className="space-y-3">
      <SectionTitle>Hypocenter cloud</SectionTitle>
      <div className="space-y-1.5">
        {options.map((opt) => {
          const on = hypo === opt.id;
          return (
            <button
              key={opt.id ?? "off"}
              type="button"
              onClick={() => setHypo(opt.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                on ? "border-orange-400/40 bg-orange-400/10 text-white" : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.06]"
              }`}
            >
              {opt.label}
              <Switch on={on} />
            </button>
          );
        })}
      </div>
      <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
        Events plot at their real hypocenter depth, so dipping clusters trace
        Wadati-Benioff subduction slabs. Colour ramps shallow (orange) to
        700 km deep (violet). Live from USGS.
      </p>
    </div>
  );
}

/* ─────────────────────────── Primitives ─────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="pt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">{children}</div>;
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-orange-400" : "bg-white/15"}`}>
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${on ? "translate-x-3.5" : "translate-x-0.5"}`}
      />
    </span>
  );
}

function Row({
  label, hint, on, onChange,
}: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        on ? "border-orange-400/30 bg-orange-400/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-white/90">{label}</span>
        {hint && <span className="block text-[10px] text-white/45">{hint}</span>}
      </span>
      <Switch on={on} />
    </button>
  );
}
