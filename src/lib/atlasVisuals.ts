/**
 * Atlas visual controls. Keep the default path clean and fast: no custom
 * post-process stages, no HDR tonemap override, no SSAO/sharpen overlay.
 */
import { Color } from "cesium";

export type AtlasVisualsPreset = "off" | "balanced" | "cinematic";
export const ATLAS_VISUALS_KEY = "atlas.visuals.v2";

const SHARPEN_NAME = "atlas_unsharp_mask";

export function getAtlasVisualsPreset(): AtlasVisualsPreset {
  try {
    const v = localStorage.getItem(ATLAS_VISUALS_KEY);
    if (v === "off" || v === "balanced" || v === "cinematic") return v;
  } catch {}
  return "off";
}

export function setAtlasVisualsPreset(p: AtlasVisualsPreset) {
  try { localStorage.setItem(ATLAS_VISUALS_KEY, p); } catch {}
}

export function applyAtlasVisuals(
  viewer: any,
  preset: AtlasVisualsPreset = getAtlasVisualsPreset()
) {
  if (!viewer || viewer.isDestroyed?.()) return;
  const scene = viewer.scene;
  const stages = scene.postProcessStages;
  const safePreset: AtlasVisualsPreset = preset === "off" ? "off" : "balanced";

  // Tonemapping / HDR. Keep photoreal tiles in Cesium's neutral path by
  // default; ACES/SSAO/sharpen made close-range tiles look dark and duplicated.
  try {
    scene.highDynamicRange = false;
    if (stages) stages.tonemapper = "PBR_NEUTRAL";
  } catch {}

  // FXAA / MSAA
  try {
    if (stages?.fxaa) stages.fxaa.enabled = false;
    if (typeof scene.msaaSamples !== "undefined") scene.msaaSamples = 1;
  } catch {}

  // SSAO (built-in)
  try {
    const ao: any = stages?.ambientOcclusion;
    if (ao) {
      ao.enabled = false;
      const u = ao.uniforms;
      if (u) {
        u.intensity = 0;
        u.ambientOcclusionOnly = false;
      }
    }
  } catch {}

  // Remove old persisted custom sharpen stage. It caused seam halos that look
  // like copied/overlapping tile edges when walking close to photoreal meshes.
  try {
    const existing = stages?.getStageByName?.(SHARPEN_NAME);
    if (existing) stages.remove(existing);
  } catch {}

  // Daylight atmosphere
  try {
    const globe = scene.globe;
    globe.enableLighting = false;
    globe.showGroundAtmosphere = safePreset !== "off";
    globe.atmosphereLightIntensity = 10;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.hueShift = -0.05;
      scene.skyAtmosphere.saturationShift = 0.04;
      scene.skyAtmosphere.brightnessShift = 0.08;
    }
    try { scene.backgroundColor = Color.fromCssColorString("#0b1020"); } catch {}
  } catch {}

  scene.requestRender?.();
}
