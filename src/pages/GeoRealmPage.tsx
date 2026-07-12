import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GeoRealmScene from "@/components/geo-realm/GeoRealmScene";
import GeoRealmCompiler from "@/components/geo-realm/GeoRealmCompiler";
import { CANONICAL_DATASETS, CRUST1_LAYERS, HYPOCENTER_FEEDS } from "@/lib/geoRealm/dataSources";
import { supabase } from "@/integrations/supabase/client";
import type { GeoRealmBundle } from "@/lib/geoRealm/types";

export default function GeoRealmPage() {
  const [active, setActive] = useState<string[]>(["pb2002_plates", "pb2002_boundaries"]);
  const [showCrust, setShowCrust] = useState(true);
  const [showSurface, setShowSurface] = useState(true);
  const [hypo, setHypo] = useState<string | null>("usgs_m45_month");
  const [cam, setCam] = useState<{ alt: number; lat: number; lon: number }>({ alt: 1.6, lat: 0, lon: 0 });
  const [bundles, setBundles] = useState<GeoRealmBundle[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

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
    return () => {
      cancel = true;
    };
  }, [refreshTick]);

  function toggle(id: string) {
    setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#04070f] text-white font-mono">
      <GeoRealmScene
        activeCanonical={active}
        showCrust={showCrust}
        showSurface={showSurface}
        activeHypocenter={hypo}
        onCamera={setCam}
      />

      {/* Top rail */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(255,140,66,0.8)]" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-white/45">Geo Realm</div>
              <div className="text-sm font-semibold tracking-wide">Subsurface Compiler · M1</div>
            </div>
          </div>
        </div>
        <Link
          to="/atlas"
          className="pointer-events-auto rounded-full border border-white/10 bg-black/40 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/80 backdrop-blur-xl hover:bg-white/10"
        >
          ← Return to Atlas
        </Link>
      </div>

      {/* Left rail — layers + library */}
      <div className="pointer-events-auto absolute left-4 top-24 bottom-16 w-72 overflow-y-auto rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-2xl">
        <div className="mb-3 text-[10px] uppercase tracking-[0.28em] text-white/45">Canonical layers</div>
        <div className="flex flex-col gap-1.5">
          {CANONICAL_DATASETS.map((d) => {
            const on = active.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggle(d.id)}
                className={`group flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[11px] transition ${
                  on
                    ? "border-orange-400/40 bg-orange-400/10"
                    : "border-white/5 bg-white/[0.02] hover:border-white/15"
                }`}
              >
                <span
                  className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: d.color, boxShadow: on ? `0 0 8px ${d.color}` : "none" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-white/90">{d.label}</div>
                  <div className="text-[10px] leading-snug text-white/40">{d.description}</div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-wider text-white/25">
                    {d.citation}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 mb-2 text-[10px] uppercase tracking-[0.28em] text-white/45">Structural shells</div>
        <label className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-[11px]">
          <input
            type="checkbox"
            checked={showCrust}
            onChange={(e) => setShowCrust(e.target.checked)}
            className="accent-orange-400"
          />
          Concentric crust · mantle · core
        </label>
        <label className="mt-1 flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-[11px]">
          <input
            type="checkbox"
            checked={showSurface}
            onChange={(e) => setShowSurface(e.target.checked)}
            className="accent-orange-400"
          />
          Opaque surface (off = X-ray)
        </label>

        <div className="mt-5 mb-2 text-[10px] uppercase tracking-[0.28em] text-white/45">
          Hypocenter cloud
        </div>
        <div className="flex flex-col gap-1">
          {[{ id: null as string | null, label: "Off" }, ...HYPOCENTER_FEEDS.map((f) => ({ id: f.id, label: f.label }))].map((opt) => {
            const on = hypo === opt.id;
            return (
              <button
                key={opt.id ?? "off"}
                type="button"
                onClick={() => setHypo(opt.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition ${
                  on
                    ? "border-orange-400/40 bg-orange-400/10 text-white"
                    : "border-white/5 bg-white/[0.02] text-white/70 hover:border-white/15"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
          <div className="mt-1 text-[9px] leading-snug text-white/35">
            Points plotted at real hypocenter depth reveal Wadati-Benioff subduction slabs.
          </div>
        </div>

        <div className="mt-5 mb-2 text-[10px] uppercase tracking-[0.28em] text-white/45">
          CRUST1.0 legend
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          {CRUST1_LAYERS.map((l) => (
            <div key={l.id} className="flex items-center gap-2 py-0.5 text-[10px]">
              <span
                className="h-2 w-2 rounded-sm flex-shrink-0"
                style={{ background: l.color }}
              />
              <span className="flex-1 truncate text-white/75">{l.label}</span>
              <span className="tabular-nums text-white/45">
                {l.thickness_km > 0 ? `${l.thickness_km.toFixed(1)} km` : "—"}
              </span>
            </div>
          ))}
          <div className="mt-1.5 text-[9px] text-white/35">
            Laske, Masters, Ma, Pasyanos (2013) — global mean thicknesses.
          </div>
        </div>

        <div className="mt-5 mb-2 text-[10px] uppercase tracking-[0.28em] text-white/45">
          Your bundles · {bundles.length}
        </div>
        {bundles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-3 text-[10px] text-white/40">
            Compile a bundle to save subsurface data here.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {bundles.map((b) => (
              <div
                key={b.id}
                className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-semibold text-white/90">{b.name}</span>
                  <span className="text-[9px] uppercase tracking-widest text-white/30">{b.kind}</span>
                </div>
                <div className="text-[10px] text-white/40">
                  {b.layers.length} layer{b.layers.length === 1 ? "" : "s"}
                  {b.is_public ? " · public" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right rail — compiler */}
      <div className="pointer-events-auto absolute right-4 top-24 bottom-16 w-80 overflow-y-auto rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-2xl">
        <GeoRealmCompiler onBundleAdded={() => setRefreshTick((t) => t + 1)} />
      </div>

      {/* Bottom HUD */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-6 rounded-full border border-white/10 bg-black/50 px-5 py-2 text-[11px] tabular-nums text-white/75 backdrop-blur-xl">
          <span>
            <span className="text-white/40">LAT</span> {cam.lat.toFixed(2)}°
          </span>
          <span>
            <span className="text-white/40">LON</span> {cam.lon.toFixed(2)}°
          </span>
          <span>
            <span className="text-white/40">ALT</span> {(cam.alt * 6371).toFixed(0)} km
          </span>
          <span className="text-white/40">·</span>
          <span>{active.length} layers active</span>
          {hypo ? <><span className="text-white/40">·</span><span>hypocenter feed on</span></> : null}
        </div>
      </div>
    </div>
  );
}