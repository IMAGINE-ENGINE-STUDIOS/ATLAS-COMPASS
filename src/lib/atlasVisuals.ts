/**
 * Atlas visual polish: HDR + ACES tonemap, SSAO, FXAA/MSAA, unsharp-mask,
 * tuned daylight atmosphere. Idempotent — safe to call multiple times.
 */
import { PostProcessStage, Color } from "cesium";

export type AtlasVisualsPreset = "off" | "balanced" | "cinematic";
export const ATLAS_VISUALS_KEY = "atlas.visuals.v1";

const SHARPEN_NAME = "atlas_unsharp_mask";

const SHARPEN_FS = [
  "uniform sampler2D colorTexture;",
  "in vec2 v_textureCoordinates;",
  "uniform float u_amount;",
  "void main() {",
  "  vec2 px = 1.0 / czm_viewport.zw;",
  "  vec3 c  = texture(colorTexture, v_textureCoordinates).rgb;",
  "  vec3 n  = texture(colorTexture, v_textureCoordinates + vec2( 0.0,  px.y)).rgb;",
  "  vec3 s  = texture(colorTexture, v_textureCoordinates + vec2( 0.0, -px.y)).rgb;",
  "  vec3 e  = texture(colorTexture, v_textureCoordinates + vec2( px.x, 0.0)).rgb;",
  "  vec3 w  = texture(colorTexture, v_textureCoordinates + vec2(-px.x, 0.0)).rgb;",
  "  vec3 blur = (n + s + e + w) * 0.25;",
  "  vec3 sharp = c + (c - blur) * u_amount;",
  "  out_FragColor = vec4(clamp(sharp, 0.0, 1.0), 1.0);",
  "}",
].join("\n");

export function getAtlasVisualsPreset(): AtlasVisualsPreset {
  try {
    const v = localStorage.getItem(ATLAS_VISUALS_KEY);
    if (v === "off" || v === "balanced" || v === "cinematic") return v;
  } catch {}
  return "balanced";
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

  // Tonemapping / HDR
  try {
    scene.highDynamicRange = preset !== "off";
    if (stages) stages.tonemapper = preset === "off" ? "PBR_NEUTRAL" : "ACES";
  } catch {}

  // FXAA / MSAA
  try {
    if (stages?.fxaa) stages.fxaa.enabled = preset !== "off";
    const dpr = window.devicePixelRatio || 1;
    if (typeof scene.msaaSamples !== "undefined") {
      scene.msaaSamples = preset === "off" ? 1 : dpr <= 1.5 ? 4 : 2;
    }
  } catch {}

  // SSAO (built-in)
  try {
    const ao: any = stages?.ambientOcclusion;
    if (ao) {
      ao.enabled = preset !== "off";
      const u = ao.uniforms;
      if (u) {
        // Softer AO — high intensity + short lengthCap caused dark outlines
        // along photoreal tile seams when the camera was close to buildings.
        u.intensity = preset === "cinematic" ? 1.6 : 1.1;
        u.bias = 0.25;
        u.lengthCap = 0.26;
        u.stepSize = preset === "cinematic" ? 2.0 : 2.5;
        u.frustumLength = 500.0;
        u.ambientOcclusionOnly = false;
      }
    }
  } catch {}

  // Unsharp mask
  try {
    const existing = stages?.getStageByName?.(SHARPEN_NAME);
    if (preset === "off") {
      if (existing) stages.remove(existing);
    } else {
      // Much lower sharpen — anything above ~0.2 produces visible halo/ring
      // artifacts on the seams between Google 3D tiles at close range.
      const amount = preset === "cinematic" ? 0.18 : 0.1;
      if (existing) {
        existing.uniforms.u_amount = amount;
        existing.enabled = true;
      } else {
        const stage = new PostProcessStage({
          name: SHARPEN_NAME,
          fragmentShader: SHARPEN_FS,
          uniforms: { u_amount: amount },
        });
        stages.add(stage);
      }
    }
  } catch {}

  // Daylight atmosphere
  try {
    const globe = scene.globe;
    if (preset === "off") {
      globe.atmosphereLightIntensity = 10;
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.hueShift = -0.05;
        scene.skyAtmosphere.saturationShift = 0.1;
        scene.skyAtmosphere.brightnessShift = 0.05;
      }
    } else {
      globe.enableLighting = true;
      globe.showGroundAtmosphere = true;
      globe.atmosphereLightIntensity = preset === "cinematic" ? 14 : 12;
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.show = true;
        scene.skyAtmosphere.hueShift = 0.0;
        scene.skyAtmosphere.saturationShift = preset === "cinematic" ? 0.2 : 0.1;
        scene.skyAtmosphere.brightnessShift = preset === "cinematic" ? 0.15 : 0.08;
      }
      try { scene.backgroundColor = Color.fromCssColorString("#0d1326"); } catch {}
    }
  } catch {}

  scene.requestRender?.();
}
