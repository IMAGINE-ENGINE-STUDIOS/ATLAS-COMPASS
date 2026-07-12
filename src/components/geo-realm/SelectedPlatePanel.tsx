import type { SelectedPlate } from "./VolumetricPlates";

function fmt(n: number, d = 2) {
  return n.toFixed(d);
}

function compass(azDeg: number) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const a = ((azDeg % 360) + 360) % 360;
  return dirs[Math.round(a / 22.5) % 16];
}

export function SelectedPlatePanel({
  plate,
  onClose,
}: {
  plate: SelectedPlate | null;
  onClose: () => void;
}) {
  if (!plate) return null;
  const { pole, velocity } = plate;
  return (
    <div className="pointer-events-auto w-[300px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-2xl">
      <div
        className="flex items-start justify-between gap-2 px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${plate.color}33 0%, transparent 100%)`,
          borderBottom: `1px solid ${plate.color}55`,
        }}
      >
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.32em] text-white/50">Plate selected</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ background: plate.color, boxShadow: `0 0 12px ${plate.color}` }}
            />
            <div className="truncate text-base font-semibold tracking-wide text-white">
              {plate.name}
            </div>
            <span className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-white/70">
              {plate.code}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close plate panel"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3 px-4 py-3 text-[11px]">
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-[0.28em] text-white/40">Centroid</div>
          <div className="tabular-nums text-white/85">
            {fmt(plate.centroid.lat)}° · {fmt(plate.centroid.lon)}°
          </div>
        </div>

        <div>
          <div className="mb-1 text-[9px] uppercase tracking-[0.28em] text-white/40">
            Euler pole
          </div>
          {pole ? (
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
              <div className="grid grid-cols-3 gap-2 tabular-nums">
                <Stat label="Lat" value={`${fmt(pole.lat)}°`} />
                <Stat label="Lon" value={`${fmt(pole.lon)}°`} />
                <Stat label="ω" value={`${fmt(pole.omega, 3)}°/Myr`} />
              </div>
              <div className="mt-2 text-[9px] leading-snug text-white/45">
                Source · <span className="text-white/70">{plate.source}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-2.5 text-[10px] text-white/40">
              No MORVEL Euler pole assigned to this plate.
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-[9px] uppercase tracking-[0.28em] text-white/40">
            Surface velocity at centroid
          </div>
          {velocity ? (
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-semibold tabular-nums text-white">
                  {fmt(velocity.speed_mm_yr, 1)}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">mm / yr</div>
                <div className="ml-auto text-[10px] uppercase tracking-widest text-white/60">
                  {compass(velocity.azimuth_deg)} · {fmt(((velocity.azimuth_deg % 360) + 360) % 360, 0)}°
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] tabular-nums text-white/75">
                <div className="rounded border border-white/5 bg-black/30 px-2 py-1">
                  <span className="text-white/40">E</span> {velocity.east_mm_yr >= 0 ? "+" : ""}
                  {fmt(velocity.east_mm_yr, 1)}
                </div>
                <div className="rounded border border-white/5 bg-black/30 px-2 py-1">
                  <span className="text-white/40">N</span> {velocity.north_mm_yr >= 0 ? "+" : ""}
                  {fmt(velocity.north_mm_yr, 1)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-2.5 text-[10px] text-white/40">
              Velocity unavailable — needs an Euler pole.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-[10px] leading-snug text-white/55">
          Computed live via <span className="text-white/80">v = ω × r</span> in the Earth-centred
          Cartesian frame, then rotated into local east / north components — no interpolation, no
          simulation shortcut.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/5 bg-black/25 px-2 py-1">
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="text-[11px] font-semibold text-white/90">{value}</div>
    </div>
  );
}

export default SelectedPlatePanel;