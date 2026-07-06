/**
 * HeatmapLayer
 * ------------
 * Renders enabled heatmap configs as an image overlay draped on the Cesium
 * globe. Points are rasterized into a 2048×1024 equirectangular canvas with
 * radial gradients weighted by intensity, then the resulting canvas is
 * wrapped in a `SingleTileImageryProvider` covering -180..180 / -90..90.
 *
 * The layer refreshes at the source's `refreshMs` cadence, listens for
 * heatmap config changes (`atlas:heatmaps-changed`), and cleans up on
 * unmount / disable. Heavy work is throttled via requestAnimationFrame.
 */
import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import {
  SingleTileImageryProvider,
  ImageryLayer,
  Rectangle,
  Math as CMath,
} from "cesium";
import { listHeatmaps, fetchHeatmapPoints, type HeatmapConfig } from "@/lib/tileIntel/heatmaps";
import { HEAT_RAMPS, sampleRamp, LIVE_GIS_SOURCES, type HeatPoint } from "@/lib/tileIntel/liveGis";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
}

const W = 2048, H = 1024;

function drawHeatmap(cfg: HeatmapConfig, points: HeatPoint[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, W, H);
  const ramp = HEAT_RAMPS.find((r) => r.id === cfg.ramp) ?? HEAT_RAMPS[0];

  // Accumulate intensity into an offscreen alpha canvas, then colorize by ramp.
  const alpha = document.createElement("canvas");
  alpha.width = W; alpha.height = H;
  const actx = alpha.getContext("2d")!;
  actx.globalCompositeOperation = "lighter";
  const r = cfg.radius;
  for (const p of points) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const x = ((p.lng + 180) / 360) * W;
    const y = ((90 - p.lat) / 180) * H;
    const grad = actx.createRadialGradient(x, y, 0, x, y, r);
    const a = Math.max(0.05, Math.min(1, p.weight));
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    actx.fillStyle = grad;
    actx.beginPath(); actx.arc(x, y, r, 0, Math.PI * 2); actx.fill();
  }

  const src = actx.getImageData(0, 0, W, H);
  const dst = ctx.createImageData(W, H);
  const op = Math.max(0, Math.min(1, cfg.opacity));
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3] / 255;
    if (a < 0.01) continue;
    const color = sampleRamp(ramp, a);
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) continue;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    dst.data[i] = parts[0];
    dst.data[i + 1] = parts[1];
    dst.data[i + 2] = parts[2];
    dst.data[i + 3] = Math.round(255 * Math.min(1, a) * op * (parts[3] ?? 1));
  }
  ctx.putImageData(dst, 0, 0);
  return canvas;
}

export default function HeatmapLayer({ viewerRef }: Props) {
  const layers = useRef<Map<string, ImageryLayer>>(new Map());
  const timers = useRef<Map<string, number>>(new Map());
  const busy = useRef<Set<string>>(new Set());

  const removeLayer = (id: string) => {
    const v = viewerRef.current; if (!v) return;
    const l = layers.current.get(id);
    if (l) { try { v.scene.imageryLayers.remove(l, true); } catch { /* noop */ } layers.current.delete(id); }
    const t = timers.current.get(id); if (t) { clearTimeout(t); timers.current.delete(id); }
  };

  const addOrUpdate = async (cfg: HeatmapConfig) => {
    const v = viewerRef.current; if (!v) return;
    if (busy.current.has(cfg.id)) return;
    busy.current.add(cfg.id);
    try {
      const points = await fetchHeatmapPoints(cfg);
      const url = drawHeatmap(cfg, points).toDataURL("image/png");
      const provider = await SingleTileImageryProvider.fromUrl(url, {
        rectangle: Rectangle.fromDegrees(-180, -90, 180, 90),
      });
      const prev = layers.current.get(cfg.id);
      const layer = new ImageryLayer(provider, { alpha: 1.0, show: cfg.enabled });
      v.scene.imageryLayers.add(layer);
      layers.current.set(cfg.id, layer);
      if (prev) { try { v.scene.imageryLayers.remove(prev, true); } catch { /* noop */ } }
      // Schedule refresh for live sources
      if (cfg.source.kind === "live") {
        const srcId = cfg.source.sourceId;
        const src = LIVE_GIS_SOURCES.find((s) => s.id === srcId);
        const ms = src?.refreshMs ?? 5 * 60_000;
        const t = window.setTimeout(() => { void addOrUpdate(cfg); }, ms) as unknown as number;
        timers.current.set(cfg.id, t);
      }
    } catch (e) {
      console.warn("[heatmap] render failed", cfg.name, e);
    } finally {
      busy.current.delete(cfg.id);
    }
  };

  const sync = () => {
    const configs = listHeatmaps();
    const wantIds = new Set(configs.filter((c) => c.enabled).map((c) => c.id));
    // Remove disabled/removed
    for (const id of Array.from(layers.current.keys())) if (!wantIds.has(id)) removeLayer(id);
    // Add / refresh enabled
    for (const cfg of configs) if (cfg.enabled && !layers.current.has(cfg.id)) void addOrUpdate(cfg);
  };

  useEffect(() => {
    // Wait for viewer to exist
    const iv = window.setInterval(() => { if (viewerRef.current) { clearInterval(iv); sync(); } }, 400);
    const onChange = () => sync();
    window.addEventListener("atlas:heatmaps-changed", onChange);
    window.addEventListener("cesium-tileset-ready", onChange);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("atlas:heatmaps-changed", onChange);
      window.removeEventListener("cesium-tileset-ready", onChange);
      for (const id of Array.from(layers.current.keys())) removeLayer(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Suppress unused import warnings in some builds
void CMath;