/**
 * AtlasSplatUploader — drag/drop a .splat / .ksplat / .ply file and pin it
 * to a lat/lng on the globe. Prefills coords from current Cesium camera, or
 * from a click event (window.dispatchEvent(new CustomEvent("atlas-splat-pin", {detail:{lng,lat}}))).
 */
import { useEffect, useState } from "react";
import { Upload, X, MapPin, Loader2 } from "lucide-react";
import { Cartographic, Ellipsoid, Math as CesiumMath, type Viewer } from "cesium";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "splat-landmarks";
const ACCEPT = ".splat,.ksplat,.ply";
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB hard limit
const WARN_BYTES = 80 * 1024 * 1024;

export const SPLAT_PIN_EVENT = "atlas-splat-pin";
export const SPLAT_OPEN_EVENT = "atlas-splat-open";

export default function AtlasSplatUploader({
  viewer,
  world = "earth",
  ellipsoid = Ellipsoid.WGS84,
}: {
  viewer: Viewer | null;
  world?: string;
  ellipsoid?: Ellipsoid;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [lng, setLng] = useState(0);
  const [lat, setLat] = useState(0);
  const [altitude, setAltitude] = useState(0);
  const [scale, setScale] = useState(1);
  const [heading, setHeading] = useState(0);
  const [radius, setRadius] = useState(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open via custom events
  useEffect(() => {
    const onPin = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (typeof d.lng === "number") setLng(d.lng);
      if (typeof d.lat === "number") setLat(d.lat);
      if (typeof d.altitude === "number") setAltitude(d.altitude);
      setOpen(true);
    };
    const onOpen = () => prefillFromCamera();
    window.addEventListener(SPLAT_PIN_EVENT, onPin as any);
    window.addEventListener(SPLAT_OPEN_EVENT, onOpen as any);
    return () => {
      window.removeEventListener(SPLAT_PIN_EVENT, onPin as any);
      window.removeEventListener(SPLAT_OPEN_EVENT, onOpen as any);
    };
  }, [viewer]);

  const prefillFromCamera = () => {
    if (!viewer || viewer.isDestroyed()) return;
    try {
      const c = Cartographic.fromCartesian(viewer.camera.positionWC, ellipsoid);
      setLng(CesiumMath.toDegrees(c.longitude));
      setLat(CesiumMath.toDegrees(c.latitude));
      setAltitude(0);
      setOpen(true);
    } catch {}
  };

  const reset = () => {
    setFile(null);
    setName("");
    setError(null);
    setBusy(false);
  };

  const upload = async () => {
    setError(null);
    if (!file) return setError("Pick a splat file first.");
    if (file.size > MAX_BYTES) return setError(`File too large (max ${MAX_BYTES / 1024 / 1024} MB).`);
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        setError("Sign in required to upload splats.");
        setBusy(false);
        return;
      }
      const ext = file.name.split(".").pop() || "splat";
      const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: ext === "ply" ? "application/octet-stream" : "application/octet-stream",
        upsert: false,
      });
      if (up.error) throw up.error;

      const { error: insErr } = await supabase.from("splat_landmarks").insert({
        owner_id: uid,
        name: name || file.name.replace(/\.[^.]+$/, ""),
        longitude: lng,
        latitude: lat,
        altitude,
        heading,
        pitch: 0,
        roll: 0,
        scale,
        radius_m: radius,
        world,
        file_path: path,
        file_size_bytes: file.size,
      });
      if (insErr) throw insErr;
      setOpen(false);
      reset();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={prefillFromCamera}
        title="Pin a 3D Gaussian Splat at the current camera position"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-black/55 backdrop-blur-md text-white/80 hover:text-white hover:bg-black/70 shadow-lg"
      >
        <Upload className="w-3 h-3" />
        <span className="text-[9px] font-mono uppercase tracking-wider">Pin Splat</span>
      </button>
    );
  }

  const sizeMb = file ? (file.size / 1024 / 1024).toFixed(1) : null;
  const overWarn = file && file.size > WARN_BYTES;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
      <div className="w-[420px] max-h-[90vh] overflow-y-auto rounded-xl bg-zinc-950/95 border border-white/10 shadow-2xl p-4 text-white/90">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">Pin Gaussian Splat</h2>
          </div>
          <button onClick={() => { setOpen(false); reset(); }} className="p-1 rounded hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-white/60 mb-1">Splat file (.splat / .ksplat / .ply)</div>
          <input
            type="file"
            accept={ACCEPT}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
            }}
            className="block w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-emerald-500/30 file:text-emerald-100 file:cursor-pointer hover:file:bg-emerald-500/40"
          />
          {sizeMb && (
            <div className={`text-[10px] mt-1 ${overWarn ? "text-amber-400" : "text-white/50"}`}>
              {sizeMb} MB {overWarn ? "— large file, slow to load" : ""}
            </div>
          )}
        </label>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs" />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Longitude">
            <input type="number" step="0.0000001" value={lng} onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono" />
          </Field>
          <Field label="Latitude">
            <input type="number" step="0.0000001" value={lat} onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono" />
          </Field>
        </div>

        <Slider label="Altitude offset" value={altitude} min={-50} max={200} step={0.5} suffix="m" onChange={setAltitude} />
        <Slider label="Heading" value={heading} min={-180} max={180} step={1} suffix="°" onChange={setHeading} />
        <Slider label="Scale" value={scale} min={0.1} max={10} step={0.1} suffix="x" onChange={setScale} />
        <Slider label="Visible radius" value={radius} min={50} max={2000} step={25} suffix="m" onChange={setRadius} />

        {error && (
          <div className="mt-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
            {error}
          </div>
        )}

        <button
          onClick={upload}
          disabled={busy || !file}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-semibold"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {busy ? "Uploading…" : "Pin splat here"}
        </button>
        <p className="text-[9px] text-white/40 mt-2">
          Files capped at 200 MB. Only the 3 nearest splats are loaded at a time.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wider text-white/60 mb-1">{label}</div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-white/60">{label}</span>
        <span className="text-[10px] font-mono tabular-nums text-emerald-300">
          {value.toFixed(step < 1 ? 2 : 0)}{suffix ?? ""}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-emerald-400 cursor-pointer" />
    </div>
  );
}
