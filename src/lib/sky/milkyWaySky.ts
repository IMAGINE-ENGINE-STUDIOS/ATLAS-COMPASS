/**
 * Milky Way skybox — NASA all-sky imagery wrapped around the solar system.
 *
 * Cesium renders its background as a cube map, while every published all-sky
 * survey ships as a single equirectangular (RA/Dec) panorama. This module
 * downloads the NASA/SVS Tycho Skymap II mosaic through the `sky-imagery`
 * edge function and re-projects it into the six cube faces on the GPU, then
 * installs the result as `scene.skyBox`. Because Cesium rotates the skybox by
 * the ICRF→fixed matrix every frame, the stars stay inertially fixed: planets
 * placed from Horizons vectors sit *inside* the real galaxy, and narrowing the
 * field of view keeps resolving finer NASA pixels the further you zoom.
 */
import { SkyBox } from "cesium";
import type { SkySurveyId } from "./skySurveys";
import { SKY_SURVEY_BY_ID } from "./skySurveys";

export type SkyResolution = "4k" | "8k" | "16k";

/** Equirectangular source size and the cube-face size it can feed 1:1. */
const FACE_SIZE: Record<SkyResolution, number> = {
  "4k": 1024,
  "8k": 2048,
  "16k": 4096,
};

export const SKY_RESOLUTION_LABEL: Record<SkyResolution, string> = {
  "4k": "4K · 4 MB",
  "8k": "8K · 16 MB",
  "16k": "16K · 68 MB",
};

export const SKY_ATTRIBUTION = "NASA/SVS · Tycho Skymap II (ESA Hipparcos/Tycho-2)";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export function skyMosaicUrl(res: SkyResolution, survey: SkySurveyId = "tycho"): string {
  return `${SUPABASE_URL}/functions/v1/sky-imagery?res=${res}&survey=${survey}&apikey=${ANON}`;
}

/**
 * HiPS-rendered surveys top out at a 4096×2048 all-sky render (hips2fits gets
 * slow beyond that), so their cube faces cap at 1024 px.
 */
function faceSize(res: SkyResolution, survey: SkySurveyId): number {
  if (SKY_SURVEY_BY_ID[survey]?.hips) return res === "4k" ? 512 : 1024;
  return FACE_SIZE[res];
}

/* ────────────────────────── equirect → cube map ────────────────────────── */

const VERT = `#version 100
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Fragment shader: rebuild the view direction for this cube-face texel from the
 * face basis, convert it to right ascension / declination, and sample the
 * equirectangular mosaic there.
 */
const FRAG = `#version 100
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_sky;
uniform vec3 u_right;
uniform vec3 u_up;
uniform vec3 u_fwd;
const float PI = 3.14159265358979;
void main() {
  // Cube-map texels run left→right, top→bottom, so flip t into [-1, 1].
  float s = v_uv.x * 2.0 - 1.0;
  float t = 1.0 - v_uv.y * 2.0;
  vec3 dir = normalize(u_fwd + u_right * s + u_up * t);
  float ra = atan(dir.y, dir.x);           // -PI..PI, 0 at the vernal equinox
  float dec = asin(clamp(dir.z, -1.0, 1.0));
  vec2 uv = vec2(0.5 + ra / (2.0 * PI), 0.5 - dec / PI);
  gl_FragColor = vec4(texture2D(u_sky, uv).rgb, 1.0);
}`;

/**
 * Per-face orthonormal bases in the OpenGL cube-map convention. `fwd` points
 * out of the face; `right`/`up` span it in texel order.
 */
const FACES: { key: keyof CubeSources; right: number[]; up: number[]; fwd: number[] }[] = [
  { key: "positiveX", right: [0, 0, -1], up: [0, -1, 0], fwd: [1, 0, 0] },
  { key: "negativeX", right: [0, 0, 1], up: [0, -1, 0], fwd: [-1, 0, 0] },
  { key: "positiveY", right: [1, 0, 0], up: [0, 0, 1], fwd: [0, 1, 0] },
  { key: "negativeY", right: [1, 0, 0], up: [0, 0, -1], fwd: [0, -1, 0] },
  { key: "positiveZ", right: [1, 0, 0], up: [0, -1, 0], fwd: [0, 0, 1] },
  { key: "negativeZ", right: [-1, 0, 0], up: [0, -1, 0], fwd: [0, 0, -1] },
];

export interface CubeSources {
  positiveX: HTMLCanvasElement;
  negativeX: HTMLCanvasElement;
  positiveY: HTMLCanvasElement;
  negativeY: HTMLCanvasElement;
  positiveZ: HTMLCanvasElement;
  negativeZ: HTMLCanvasElement;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`sky shader: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("sky mosaic failed to load"));
    img.src = url;
  });
}

const faceCache = new Map<string, Promise<CubeSources>>();

/** Re-project an all-sky panorama into six cube-face canvases (GPU, cached). */
export function buildMilkyWayFaces(res: SkyResolution, survey: SkySurveyId = "tycho"): Promise<CubeSources> {
  const key = `${survey}:${res}`;
  const cached = faceCache.get(key);
  if (cached) return cached;

  const job = (async () => {
    const img = await loadImage(skyMosaicUrl(res, survey));

    const work = document.createElement("canvas");
    const gl = (work.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true }) ||
      work.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL unavailable for sky projection");

    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const size = Math.min(faceSize(res, survey), Math.floor(maxTex / 2));
    work.width = size;
    work.height = size;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`sky program: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    // The panorama wraps in RA, so repeat horizontally and clamp at the poles.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(prog, "u_sky"), 0);

    const uRight = gl.getUniformLocation(prog, "u_right");
    const uUp = gl.getUniformLocation(prog, "u_up");
    const uFwd = gl.getUniformLocation(prog, "u_fwd");
    gl.viewport(0, 0, size, size);

    const out = {} as CubeSources;
    for (const face of FACES) {
      gl.uniform3fv(uRight, new Float32Array(face.right));
      gl.uniform3fv(uUp, new Float32Array(face.up));
      gl.uniform3fv(uFwd, new Float32Array(face.fwd));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d")!.drawImage(work, 0, 0);
      out[face.key] = canvas;
    }

    gl.deleteTexture(tex);
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    return out;
  })().catch((err) => {
    faceCache.delete(key);
    throw err;
  });

  faceCache.set(key, job);
  return job;
}

/**
 * Install the Milky Way skybox on a Cesium viewer.
 * Returns a restore function that puts the previous skybox back.
 */
export async function applyMilkyWaySkyBox(
  viewer: any,
  res: SkyResolution,
  survey: SkySurveyId = "tycho",
): Promise<() => void> {
  const sources = await buildMilkyWayFaces(res, survey);
  if (!viewer || viewer.isDestroyed?.()) return () => {};

  const previous = viewer.scene.skyBox;
  const sky = new SkyBox({ sources: sources as any, show: true });
  viewer.scene.skyBox = sky;
  try { viewer.scene.requestRender?.(); } catch {}

  return () => {
    try {
      if (!viewer.isDestroyed?.() && viewer.scene.skyBox === sky) {
        viewer.scene.skyBox = previous;
        viewer.scene.requestRender?.();
      }
      sky.destroy?.();
    } catch {}
  };
}
