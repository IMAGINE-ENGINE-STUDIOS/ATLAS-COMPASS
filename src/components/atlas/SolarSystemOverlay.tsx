import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BoundingSphere,
  CallbackProperty,
  Cartesian3,
  Cartesian2,
  Color,
  HeadingPitchRange,
  ImageMaterialProperty,
  JulianDate,
  LabelStyle,
  Matrix3,
  Matrix4,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  VerticalOrigin,
} from "cesium";
import { Loader2, LocateFixed, Rocket, X } from "lucide-react";
import {
  fetchSolarEphemeris,
  SOLAR_BODIES,
  SOLAR_BODY_BY_ID,
  type SolarBodyDefinition,
  type SolarBodyId,
  type SolarEphemerisVector,
} from "@/lib/solarSystem";

type CentralBody = "earth" | "moon";

interface Props {
  viewer: any;
  centralBody: CentralBody;
}

const textureCache = new Map<string, string>();

function makeBodyTexture(body: SolarBodyDefinition) {
  const cached = textureCache.get(body.id);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const base = body.color;
  const accent = body.accent;
  const bg = ctx.createLinearGradient(0, 0, 256, 128);
  bg.addColorStop(0, base);
  bg.addColorStop(0.55, accent);
  bg.addColorStop(1, base);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);

  const seed = body.id.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const rnd = (i: number) => {
    const x = Math.sin(seed * 99 + i * 41.77) * 10_000;
    return x - Math.floor(x);
  };

  if (body.texture === "star") {
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = `rgba(255, ${180 + Math.floor(rnd(i) * 70)}, 60, ${0.08 + rnd(i + 2) * 0.16})`;
      ctx.beginPath();
      ctx.arc(rnd(i) * 256, rnd(i + 1) * 128, 1 + rnd(i + 3) * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (body.texture === "gas") {
    for (let y = 0; y < 128; y += 7) {
      ctx.fillStyle = y % 21 === 0 ? "rgba(255,255,255,0.20)" : "rgba(40,20,0,0.12)";
      ctx.fillRect(0, y + Math.sin(y * 0.15) * 3, 256, 3 + rnd(y) * 5);
    }
  } else if (body.texture === "earth") {
    ctx.fillStyle = "rgba(10,80,42,0.72)";
    [[58, 42, 28, 19], [85, 78, 17, 30], [145, 45, 38, 16], [155, 76, 22, 28], [205, 77, 18, 10]].forEach(([x, y, rx, ry]) => {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rnd(x) * Math.PI, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    for (let i = 0; i < 24; i++) {
      ctx.beginPath(); ctx.ellipse(rnd(i) * 256, rnd(i + 9) * 128, 12 + rnd(i + 2) * 22, 2 + rnd(i + 4) * 5, rnd(i + 5) * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = body.texture === "moon" ? "rgba(30,28,24,0.16)" : "rgba(30,10,0,0.11)";
      ctx.beginPath();
      ctx.arc(rnd(i) * 256, rnd(i + 1) * 128, 1 + rnd(i + 3) * (body.texture === "moon" ? 8 : 5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const url = canvas.toDataURL("image/jpeg", 0.72);
  textureCache.set(body.id, url);
  return url;
}

function fixedPositionFromIcrf(vec: SolarEphemerisVector, central: CentralBody, moon?: SolarEphemerisVector) {
  const rel = central === "moon" && moon
    ? new Cartesian3(vec.xM - moon.xM, vec.yM - moon.yM, vec.zM - moon.zM)
    : new Cartesian3(vec.xM, vec.yM, vec.zM);
  const time = JulianDate.now();
  const matrix = central === "moon"
    ? Transforms.computeIcrfToMoonFixedMatrix(time, new Matrix3())
    : Transforms.computeIcrfToFixedMatrix(time, new Matrix3());
  if (!matrix) return rel;
  return Matrix3.multiplyByVector(matrix, rel, new Cartesian3());
}

function routeForBody(id: SolarBodyId): string | null {
  if (id === "earth") return "/atlas";
  if (id === "moon") return "/moon";
  if (id === "mars") return "/mars";
  if (id === "sun") return null; // no surface — keep fly-to
  return `/planet/${id}`;
}

function travelToBody(viewer: any, body: SolarBodyDefinition, position: Cartesian3) {
  if (!viewer || viewer.isDestroyed?.()) return;
  viewer.trackedEntity = undefined;
  viewer.selectedEntity = undefined;
  try { viewer.camera.lookAtTransform?.(Matrix4.IDENTITY); } catch {}
  const radius = body.radiusM;
  const range = body.id === "sun"
    ? radius * 5.5
    : Math.max(radius * 7, 5_000_000);
  viewer.camera.flyToBoundingSphere(new BoundingSphere(position, Math.max(radius, 1_000_000)), {
    duration: body.id === "moon" ? 3.8 : 4.8,
    offset: new HeadingPitchRange(0, -0.42, range),
  });
}

export default function SolarSystemOverlay({ viewer, centralBody }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vectors, setVectors] = useState<SolarEphemerisVector[]>([]);
  const positionsRef = useRef<Record<string, Cartesian3>>({});

  const openBody = (body: SolarBodyDefinition, position: Cartesian3) => {
    const route = routeForBody(body.id);
    if (route) {
      setOpen(false);
      navigate(route);
      return;
    }
    travelToBody(viewer, body, position);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSolarEphemeris();
        if (!cancelled) setVectors(data.vectors);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Ephemeris unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 120_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const rows = useMemo(() => {
    const moon = vectors.find((v) => v.id === "moon");
    return vectors
      .filter((v) => v.id !== centralBody)
      .map((v) => {
        const body = SOLAR_BODY_BY_ID[v.id];
        const position = fixedPositionFromIcrf(v, centralBody, moon);
        positionsRef.current[v.id] = position;
        return { body, vector: v, position, distanceM: Cartesian3.magnitude(position) };
      })
      .filter((r) => !!r.body)
      .sort((a, b) => a.body.priority - b.body.priority);
  }, [vectors, centralBody]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.() || !rows.length) return;
    const entities: any[] = [];
    rows.forEach(({ body }) => {
      const positionCb = new CallbackProperty(() => positionsRef.current[body.id] ?? Cartesian3.ZERO, false);
      const material = new ImageMaterialProperty({ image: makeBodyTexture(body) });
      const ent = viewer.entities.add({
        id: `solar-body-${body.id}`,
        name: body.name,
        position: positionCb,
        ellipsoid: {
          radii: new Cartesian3(body.radiusM, body.radiusM, body.radiusM),
          material,
          outline: body.id !== "sun",
          outlineColor: Color.fromCssColorString(body.accent).withAlpha(0.65),
        },
        point: {
          pixelSize: body.id === "sun" ? 6 : 8,
          color: Color.fromCssColorString(body.accent),
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(1.0e7, 1.6, 1.0e12, 0.55),
        },
        label: {
          text: body.name.toUpperCase(),
          font: "600 11px system-ui",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: { x: 0, y: -14 } as any,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(1.0e7, 1.0, 1.0e12, 0.4),
        },
        properties: { solarBodyId: body.id },
      });
      entities.push(ent);
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e: any) => {
      const picked = viewer.scene.pick(e.position);
      const id = picked?.id?.properties?.solarBodyId?.getValue?.() as SolarBodyId | undefined;
      if (!id) return;
      const body = SOLAR_BODY_BY_ID[id];
      const position = positionsRef.current[id];
      if (body && position) openBody(body, position);
    }, ScreenSpaceEventType.LEFT_CLICK);

    try { viewer.scene.requestRender?.(); } catch {}
    return () => {
      try { handler.destroy(); } catch {}
      entities.forEach((e) => { try { viewer.entities.remove(e); } catch {} });
      try { viewer.scene.requestRender?.(); } catch {}
    };
  }, [viewer, rows]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed top-16 left-3 z-[72] h-10 px-3 rounded-full border border-white/15 bg-black/65 backdrop-blur-xl text-white shadow-2xl flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] hover:bg-black/80"
        title="Live solar system — NASA/JPL Horizons positions"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
        Solar
      </button>
      {open && (
        <div className="fixed top-28 left-3 z-[72] w-[330px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-black/82 backdrop-blur-2xl text-white shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div>
              <div className="text-xs font-semibold">Live solar system</div>
              <div className="text-[10px] text-white/55">NASA/JPL Horizons · exact current vectors</div>
            </div>
            <button onClick={() => setOpen(false)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
          <div className="max-h-[48vh] overflow-y-auto p-1.5">
            {error && <div className="p-2 text-[11px] text-rose-200">{error}</div>}
            {rows.map(({ body, position, distanceM }) => (
              <button
                key={body.id}
                onClick={() => openBody(body, position)}
                className="w-full flex items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/10 transition-colors"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: body.color, boxShadow: `0 0 14px ${body.accent}` }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium truncate">{body.name}</span>
                  <span className="block text-[10px] text-white/50 tabular-nums">
                    {(distanceM / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km from {centralBody}
                  </span>
                </span>
                <LocateFixed size={13} className="opacity-60 shrink-0" />
              </button>
            ))}
            {!rows.length && !error && (
              <div className="p-2 text-[11px] text-white/55">Loading current positions…</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

void SOLAR_BODIES;