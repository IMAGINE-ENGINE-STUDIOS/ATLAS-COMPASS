/**
 * Export any glTF/GLB URL (blob URL, data URL, or same-origin URL) to a
 * USDZ Blob using three.js's built-in USDZExporter.
 *
 * USDZ is Apple's zero-install AR format and increasingly the
 * industry-neutral choice for shipping 3D assets between DCC tools.
 * We keep the render pipeline on glTF (best WebGL support) and only
 * emit USDZ on user request (download / share).
 *
 * For heavy Pixar-USD features that three's exporter can't cover
 * (skeletal anim, complex material graphs, VariantSets, etc.) the
 * server-side `usd-convert` edge function forwards to a hosted
 * `google/usd_from_gltf` worker — see supabase/functions/usd-convert.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";

async function loadGltfScene(url: string): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => reject(err),
    );
  });
}

/**
 * USDZExporter only supports MeshStandardMaterial. Downgrade any
 * exotic materials so nothing renders as pink in Quick Look.
 */
function ensureStandardMaterials(root: THREE.Object3D) {
  root.traverse((n: any) => {
    if (!n.isMesh) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    const upgraded = mats.map((m: any) => {
      if (!m || m.isMeshStandardMaterial) return m ?? new THREE.MeshStandardMaterial();
      const color = m.color ? m.color.clone() : new THREE.Color(0xcccccc);
      const map = m.map ?? null;
      return new THREE.MeshStandardMaterial({
        color,
        map,
        metalness: m.metalness ?? 0.1,
        roughness: m.roughness ?? 0.8,
        transparent: !!m.transparent,
        opacity: m.opacity ?? 1,
      });
    });
    n.material = Array.isArray(n.material) ? upgraded : upgraded[0];
  });
}

export async function gltfUrlToUsdz(url: string): Promise<Blob> {
  const scene = await loadGltfScene(url);
  ensureStandardMaterials(scene);
  const exporter = new USDZExporter();
  const bytes = await exporter.parseAsync(scene);
  return new Blob([bytes as BlobPart], { type: "model/vnd.usdz+zip" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * One-shot helper for the editor: convert an imported model URL to
 * USDZ and trigger a browser download. Falls back to invoking the
 * server-side `usd-convert` edge function when the client-side
 * exporter fails (e.g. unsupported material graph).
 */
export async function downloadAsUsdz(
  url: string,
  baseName: string,
  serverFallback?: (gltfBase64: string, fileName: string) => Promise<Blob | null>,
): Promise<void> {
  const outName = baseName.replace(/\.[^.]+$/, "") + ".usdz";
  try {
    const blob = await gltfUrlToUsdz(url);
    downloadBlob(blob, outName);
    return;
  } catch (clientErr) {
    if (!serverFallback) throw clientErr;
    // Attempt server-side conversion via usd_from_gltf worker.
    const res = await fetch(url);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const blob = await serverFallback(b64, baseName);
    if (!blob) throw clientErr;
    downloadBlob(blob, outName);
  }
}