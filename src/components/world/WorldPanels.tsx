import { useEffect, useRef } from "react";

const num = "font-mono tabular-nums";

export function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

/** 32 signed bars — the compressed "what I see" vector z. */
export function LatentBars({ z }: { z: Float32Array | null }) {
  if (!z || !z.length) {
    return <p className="text-xs text-muted-foreground">No latent yet — explore or dream to produce z.</p>;
  }
  const max = Math.max(1e-3, ...Array.from(z, (v) => Math.abs(v)));
  return (
    <div className="flex items-end gap-[3px] h-20">
      {Array.from(z).map((v, i) => {
        const h = Math.max(2, (Math.abs(v) / max) * 100);
        return (
          <div key={i} className="flex-1 flex flex-col justify-end h-full">
            <div
              className="w-full rounded-sm transition-[height] duration-150"
              style={{
                height: `${h}%`,
                background: v >= 0 ? "hsl(199 90% 62% / 0.85)" : "hsl(330 85% 66% / 0.85)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** LSTM hidden state as a heatmap — the model's memory of the world. */
export function HiddenHeatmap({ h }: { h: Float32Array | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cols = 32;
    const rows = h ? Math.ceil(h.length / cols) : 8;
    canvas.width = cols;
    canvas.height = rows;
    const img = ctx.createImageData(cols, rows);
    for (let i = 0; i < cols * rows; i++) {
      const v = h && i < h.length ? Math.tanh(h[i]) : 0;
      const pos = Math.max(0, v);
      const neg = Math.max(0, -v);
      img.data[i * 4] = Math.round(40 + neg * 215);
      img.data[i * 4 + 1] = Math.round(60 + pos * 140);
      img.data[i * 4 + 2] = Math.round(90 + pos * 165);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [h]);
  return (
    <canvas
      ref={ref}
      className="w-full rounded-lg"
      style={{ imageRendering: "pixelated", aspectRatio: "4 / 1" }}
    />
  );
}

export function LossChart({ history, label }: { history: number[]; label: string }) {
  if (!history.length) return <p className="text-xs text-muted-foreground">No {label} steps yet.</p>;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = Math.max(1e-6, max - min);
  const pts = history
    .map((v, i) => `${(i / Math.max(1, history.length - 1)) * 100},${100 - ((v - min) / span) * 100}`)
    .join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-24">
        <polyline points={pts} fill="none" stroke="hsl(199 90% 62%)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={`mt-1 flex justify-between text-[10px] text-muted-foreground ${num}`}>
        <span>min {min.toFixed(3)}</span>
        <span>last {history[history.length - 1].toFixed(3)}</span>
        <span>max {max.toFixed(3)}</span>
      </div>
    </div>
  );
}

export function MixtureBars({ weights }: { weights: Float32Array | null }) {
  if (!weights || !weights.length) {
    return <p className="text-xs text-muted-foreground">Mixture weights appear while dreaming.</p>;
  }
  const max = Math.max(...Array.from(weights));
  return (
    <div className="flex items-end gap-2 h-16">
      {Array.from(weights).map((w, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
          <div
            className="w-full rounded-t bg-[hsl(268_84%_70%/0.85)] transition-[height] duration-150"
            style={{ height: `${Math.max(2, (w / Math.max(1e-6, max)) * 100)}%` }}
          />
          <span className={`text-[9px] text-muted-foreground ${num}`}>{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`text-lg ${num}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
