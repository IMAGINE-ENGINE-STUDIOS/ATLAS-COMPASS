import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Telescope, X, Crosshair, Minus, Plus } from "lucide-react";
import { useMilkyWaySky } from "@/lib/sky/useMilkyWaySky";
import {
  BAND_COLOR, BAND_LABEL, SKY_SURVEYS, SKY_SURVEY_BY_ID,
  type SkyBand, type SkySurveyId,
} from "@/lib/sky/skySurveys";
import { SKY_RESOLUTION_LABEL, type SkyResolution } from "@/lib/sky/milkyWaySky";
import {
  MAX_FOV_DEG, MIN_FOV_DEG, STAR_TARGETS,
  cameraSkyCoords, currentFovDeg, pointCameraAtSky, setSkyFov, type StarTarget,
} from "@/lib/sky/starTargets";
import { useDeepField } from "@/lib/sky/useDeepField";
import { DEEP_FIELD_MAX_FOV } from "@/lib/sky/deepField";
import DeepFieldOverlay from "./DeepFieldOverlay";

interface Props {
  viewer: any;
  onClose: () => void;
}

const BANDS: SkyBand[] = ["visible", "infrared", "microwave", "xray", "gamma", "radio"];

function formatRa(ra: number) {
  const totalHours = ra / 15;
  const h = Math.floor(totalHours);
  const m = Math.floor((totalHours - h) * 60);
  const s = Math.round((((totalHours - h) * 60) - m) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function formatDec(dec: number) {
  const sign = dec < 0 ? "−" : "+";
  const a = Math.abs(dec);
  const d = Math.floor(a);
  const m = Math.round((a - d) * 60);
  return `${sign}${d}° ${String(m).padStart(2, "0")}′`;
}

export default function StarGazerPanel({ viewer, onClose }: Props) {
  const sky = useMilkyWaySky(viewer);
  const [band, setBand] = useState<SkyBand>("visible");
  const [fov, setFov] = useState(() => currentFovDeg(viewer));
  const [target, setTarget] = useState<StarTarget | null>(null);
  const [coords, setCoords] = useState<{ ra: number; dec: number } | null>(null);
  const [query, setQuery] = useState("");
  const [deep, setDeep] = useState(true);
  const restoreFov = useRef(currentFovDeg(viewer));

  const deepField = useDeepField(viewer, sky.survey, deep);

  // Restore the normal wide field when the tool closes.
  useEffect(() => {
    const initial = restoreFov.current;
    return () => setSkyFov(viewer, initial);
  }, [viewer]);

  useEffect(() => {
    const id = window.setInterval(() => setCoords(cameraSkyCoords(viewer)), 400);
    return () => window.clearInterval(id);
  }, [viewer]);

  const surveys = useMemo(() => SKY_SURVEYS.filter((s) => s.band === band), [band]);
  const targets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? STAR_TARGETS.filter((t) => t.name.toLowerCase().includes(q) || t.kind.includes(q)) : STAR_TARGETS;
  }, [query]);

  const active = SKY_SURVEY_BY_ID[sky.survey];

  const applyFov = (next: number) => {
    const clamped = Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, next));
    setFov(clamped);
    setSkyFov(viewer, clamped);
  };

  const gaze = (t: StarTarget) => {
    setTarget(t);
    if (!sky.enabled) sky.setEnabled(true);
    pointCameraAtSky(viewer, t.ra, t.dec);
    applyFov(t.fov);
  };

  const pickSurvey = (id: SkySurveyId) => {
    if (!sky.enabled) sky.setEnabled(true);
    sky.chooseSurvey(id);
  };

  return (
    <>
    {deep && <DeepFieldOverlay frame={deepField.frame} />}
    <div className="fixed top-16 right-3 z-[74] w-[344px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-black/85 backdrop-blur-2xl text-white shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Telescope size={15} className="text-sky-300" />
          <div>
            <div className="text-[13px] font-semibold leading-tight">Star Gazer</div>
            <div className="text-[10px] text-white/50">Trek the sky in any wavelength</div>
          </div>
        </div>
        <button onClick={onClose} className="opacity-60 hover:opacity-100"><X size={15} /></button>
      </div>

      <div className="max-h-[72vh] overflow-y-auto">
        {/* Sky imagery on/off */}
        <div className="px-3.5 py-2.5 border-b border-white/10">
          <button onClick={() => sky.setEnabled(!sky.enabled)} className="w-full flex items-center gap-2 text-left">
            <span className="flex-1 text-[12px] font-medium">All-sky imagery</span>
            <span className={`h-4 w-8 rounded-full relative transition-colors ${sky.enabled ? "bg-sky-400/80" : "bg-white/20"}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${sky.enabled ? "left-4" : "left-0.5"}`} />
            </span>
          </button>
        </div>

        {/* Dataset picker */}
        <div className="px-3.5 py-3 border-b border-white/10 space-y-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Radiation datasets</div>
          <div className="flex flex-wrap gap-1.5">
            {BANDS.map((b) => (
              <button
                key={b}
                onClick={() => setBand(b)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium border transition-colors ${
                  band === b ? "border-white/40 bg-white/15 text-white" : "border-white/10 text-white/60 hover:bg-white/10"
                }`}
                style={band === b ? { borderColor: BAND_COLOR[b], color: BAND_COLOR[b] } : undefined}
              >
                {BAND_LABEL[b]}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            {surveys.map((s) => {
              const on = sky.survey === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => pickSurvey(s.id)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-left transition-colors ${
                    on ? "border-sky-300/60 bg-sky-400/10" : "border-white/10 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: BAND_COLOR[s.band], boxShadow: `0 0 10px ${BAND_COLOR[s.band]}` }} />
                    <span className="text-[12px] font-medium flex-1 truncate">{s.label}</span>
                    <span className="text-[10px] text-white/45 tabular-nums">{s.spectrum}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-white/50 leading-snug">{s.description}</div>
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-white/40 leading-snug">
            {sky.error
              ? <span className="text-rose-200">{sky.error}</span>
              : sky.loading
                ? `Projecting ${active.label} all-sky render…`
                : `${active.instrument} · ${active.attribution}`}
          </div>
          {sky.survey === "tycho" && sky.enabled && (
            <div className="flex gap-1.5">
              {(["4k", "8k", "16k"] as SkyResolution[]).map((r) => (
                <button
                  key={r}
                  onClick={() => sky.chooseRes(r)}
                  title={SKY_RESOLUTION_LABEL[r]}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] border transition-colors ${
                    sky.res === r ? "border-sky-300/60 bg-sky-400/15 text-sky-100" : "border-white/10 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Telescope zoom */}
        <div className="px-3.5 py-3 border-b border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Telescope field</div>
            <div className="text-[12px] font-semibold tabular-nums text-sky-200">
              {fov < 1 ? `${(fov * 60).toFixed(1)}′` : `${fov.toFixed(1)}°`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => applyFov(fov * 1.6)} className="h-8 w-8 rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10"><Minus size={14} /></button>
            <input
              type="range"
              min={Math.log(MIN_FOV_DEG)}
              max={Math.log(MAX_FOV_DEG)}
              step={0.01}
              value={Math.log(fov)}
              onChange={(e) => applyFov(Math.exp(Number(e.target.value)))}
              className="flex-1 accent-sky-400"
            />
            <button onClick={() => applyFov(fov / 1.6)} className="h-8 w-8 rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10"><Plus size={14} /></button>
          </div>
          <div className="text-[10px] text-white/40 leading-snug">
            Narrowing the field keeps resolving finer survey pixels — a straight line out to infinity.
          </div>
          {coords && (
            <div className="text-[10px] text-white/55 tabular-nums">
              Looking at RA {formatRa(coords.ra)} · Dec {formatDec(coords.dec)}
            </div>
          )}
        </div>

        {/* Deep field streaming */}
        <div className="px-3.5 py-3 border-b border-white/10 space-y-2">
          <button onClick={() => setDeep(!deep)} className="w-full flex items-center gap-2 text-left">
            <span className="flex-1 text-[12px] font-medium">Deep field trekking</span>
            <span className={`h-4 w-8 rounded-full relative transition-colors ${deep ? "bg-sky-400/80" : "bg-white/20"}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${deep ? "left-4" : "left-0.5"}`} />
            </span>
          </button>
          <div className="text-[10px] text-white/45 leading-snug">
            Below {DEEP_FIELD_MAX_FOV}° the panel stops using the all-sky mosaic and streams live archive
            cutouts of the exact patch you're aimed at — the same way a telescope archive serves pixels,
            refining every time you pan or zoom.
          </div>
          {deep && (
            <div className="text-[10px] tabular-nums">
              {deepField.error ? (
                <span className="text-rose-200">{deepField.error}</span>
              ) : !deepField.live ? (
                <span className="text-white/45">Standby — zoom past {DEEP_FIELD_MAX_FOV}° to start streaming</span>
              ) : deepField.loading ? (
                <span className="text-sky-200">Resolving archive pixels…</span>
              ) : deepField.frame ? (
                <span className="text-sky-200">
                  Streaming {deepField.frame.fov < 1 ? `${(deepField.frame.fov * 60).toFixed(1)}′` : `${deepField.frame.fov.toFixed(2)}°`} field
                  {sky.survey === "tycho" ? " · DSS2 deep plates" : ` · ${active.label}`}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Targets */}
        <div className="px-3.5 py-3 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Point at</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nebulae, galaxies, clusters…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[12px] placeholder:text-white/35 focus:outline-none focus:border-sky-300/50"
          />
          <div className="space-y-1">
            {targets.map((t) => (
              <button
                key={t.id}
                onClick={() => gaze(t)}
                className={`w-full rounded-xl px-2.5 py-2 text-left transition-colors ${
                  target?.id === t.id ? "bg-sky-400/12 border border-sky-300/40" : "border border-transparent hover:bg-white/[0.07]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Crosshair size={12} className="text-sky-300/80 shrink-0" />
                  <span className="text-[12px] font-medium flex-1 truncate">{t.name}</span>
                  <span className="text-[10px] text-white/45 tabular-nums">{t.distance}</span>
                </div>
                <div className="mt-0.5 pl-[1.15rem] text-[10px] text-white/50 leading-snug">{t.note}</div>
              </button>
            ))}
            {!targets.length && <div className="text-[11px] text-white/45 px-1 py-2">No matching sky object.</div>}
          </div>
        </div>
      </div>

      {sky.loading && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/70 px-3.5 py-2 text-[10px] text-sky-100">
          <Loader2 size={12} className="animate-spin" /> Loading {active.label}
        </div>
      )}
    </div>
    </>
  );
}
