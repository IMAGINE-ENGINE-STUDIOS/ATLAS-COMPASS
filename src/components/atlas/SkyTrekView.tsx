/**
 * Sky Trek — a true tiled celestial dome.
 *
 * Rather than six cube-map faces of a fixed mosaic, this view streams the HiPS
 * (HEALPix) tile pyramid of the selected survey and keeps loading deeper tiles
 * as the field narrows, right down to each archive's native pixel scale.
 */
import { useEffect, useRef, useState } from "react";
import { X, Loader2, Crosshair, Minus, Plus, Search } from "lucide-react";
import { loadAladin } from "@/lib/sky/aladinLoader";
import { SKY_SURVEY_BY_ID, trekHips, type SkySurveyId } from "@/lib/sky/skySurveys";
import { STAR_TARGETS, type StarTarget } from "@/lib/sky/starTargets";

interface Props {
  survey: SkySurveyId;
  initial?: { ra: number; dec: number; fov: number } | null;
  onClose: () => void;
}

function fmtFov(f: number) {
  if (f >= 1) return `${f.toFixed(2)}°`;
  if (f >= 1 / 60) return `${(f * 60).toFixed(2)}′`;
  return `${(f * 3600).toFixed(2)}″`;
}

export default function SkyTrekView({ survey, initial, onClose }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const aladin = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fov, setFov] = useState(initial?.fov ?? 60);
  const [pos, setPos] = useState({ ra: initial?.ra ?? 0, dec: initial?.dec ?? 0 });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let dead = false;
    loadAladin()
      .then((A) => {
        if (dead || !host.current) return;
        const inst = A.aladin(host.current, {
          survey: trekHips(survey),
          fov: initial?.fov ?? 60,
          target: `${initial?.ra ?? 0} ${initial?.dec ?? 0}`,
          cooFrame: "ICRSd",
          projection: "SIN",
          showReticle: true,
          showZoomControl: false,
          showFullscreenControl: false,
          showLayersControl: false,
          showGotoControl: false,
          showShareControl: false,
          showSimbadPointerControl: true,
          showCooGrid: false,
          showFrame: false,
          fullScreen: false,
        });
        aladin.current = inst;
        const sync = () => {
          try {
            const [ra, dec] = inst.getRaDec();
            setPos({ ra, dec });
            setFov(inst.getFov()[0]);
          } catch {}
        };
        inst.on?.("positionChanged", sync);
        inst.on?.("zoomChanged", sync);
        sync();
        setReady(true);
      })
      .catch((e: any) => { if (!dead) setError(e?.message ?? "HiPS client unavailable"); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow survey changes coming from the Star Gazer panel.
  useEffect(() => {
    if (!ready || !aladin.current) return;
    try { aladin.current.setImageSurvey(trekHips(survey)); } catch {}
  }, [ready, survey]);

  const zoom = (k: number) => {
    const inst = aladin.current;
    if (!inst) return;
    const next = Math.min(180, Math.max(0.0015, fov * k));
    inst.setFoV(next);
    setFov(next);
  };

  const goto = (t: StarTarget) => {
    const inst = aladin.current;
    if (!inst) return;
    inst.gotoRaDec(t.ra, t.dec);
    inst.setFoV(t.fov);
    setFov(t.fov);
    setPos({ ra: t.ra, dec: t.dec });
  };

  const q = query.trim().toLowerCase();
  const list = q ? STAR_TARGETS.filter((t) => t.name.toLowerCase().includes(q) || t.kind.includes(q)) : STAR_TARGETS;
  const meta = SKY_SURVEY_BY_ID[survey];

  return (
    <div className="fixed inset-0 z-[90] bg-black">
      <div ref={host} className="absolute inset-0" />

      {(!ready || error) && (
        <div className="absolute inset-0 flex items-center justify-center text-white/80 text-[13px] gap-2">
          {error ? <span className="text-rose-200">{error}</span> : <><Loader2 size={15} className="animate-spin" /> Mounting tiled sky dome…</>}
        </div>
      )}

      {/* Header */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl border border-white/15 bg-black/70 backdrop-blur-2xl px-3.5 py-2.5 text-white">
          <div className="text-[13px] font-semibold leading-tight">Sky Trek · tiled HiPS dome</div>
          <div className="text-[10px] text-white/55 mt-0.5">{meta.instrument} · {meta.attribution}</div>
          <div className="mt-1.5 text-[11px] tabular-nums text-sky-200">
            RA {pos.ra.toFixed(4)}° · Dec {pos.dec.toFixed(4)}° · field {fmtFov(fov)}
          </div>
        </div>
        <button
          onClick={onClose}
          className="pointer-events-auto h-9 w-9 rounded-full border border-white/15 bg-black/70 backdrop-blur-2xl text-white flex items-center justify-center hover:bg-black/90"
        >
          <X size={16} />
        </button>
      </div>

      {/* Targets */}
      <div className="absolute bottom-3 left-3 w-[260px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-black/75 backdrop-blur-2xl text-white overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <Search size={13} className="text-white/45" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Point at…"
            className="flex-1 bg-transparent text-[12px] placeholder:text-white/35 focus:outline-none"
          />
        </div>
        <div className="max-h-[38vh] overflow-y-auto py-1">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => goto(t)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/10"
            >
              <Crosshair size={11} className="text-sky-300/80 shrink-0" />
              <span className="text-[12px] flex-1 truncate">{t.name}</span>
              <span className="text-[10px] text-white/40 tabular-nums">{t.distance}</span>
            </button>
          ))}
          {!list.length && <div className="px-3 py-2 text-[11px] text-white/45">No matching sky object.</div>}
        </div>
      </div>

      {/* Zoom */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
        <button onClick={() => zoom(0.5)} className="h-10 w-10 rounded-full border border-white/15 bg-black/70 backdrop-blur-2xl text-white flex items-center justify-center hover:bg-black/90"><Plus size={16} /></button>
        <button onClick={() => zoom(2)} className="h-10 w-10 rounded-full border border-white/15 bg-black/70 backdrop-blur-2xl text-white flex items-center justify-center hover:bg-black/90"><Minus size={16} /></button>
      </div>
    </div>
  );
}