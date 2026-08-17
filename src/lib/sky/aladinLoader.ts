/**
 * Loader for Aladin Lite v3 (CDS) — a WebGL2 HiPS/HEALPix client.
 *
 * The Atlas skybox re-projects an all-sky mosaic onto six cube-map faces, which
 * is fine for a wide field but tops out at the mosaic resolution. Aladin Lite
 * instead streams the real HiPS tile pyramid (NASA/ESA/CDS survey archives)
 * tile-by-tile as you zoom, exactly like the Atlas Earth terrain/imagery LOD but
 * projected on the inside of the celestial sphere — so zoom keeps resolving new
 * tiles down to each survey's native pixel scale.
 */
const SRC = "https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js";

let promise: Promise<any> | null = null;

export function loadAladin(): Promise<any> {
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    const existing = (window as any).A;
    const finish = () => {
      const A = (window as any).A;
      if (!A) { reject(new Error("Aladin Lite failed to initialise")); return; }
      (A.init ? Promise.resolve(A.init) : Promise.resolve()).then(() => resolve(A)).catch(reject);
    };
    if (existing) { finish(); return; }
    const tag = document.createElement("script");
    tag.src = SRC;
    tag.async = true;
    tag.onload = finish;
    tag.onerror = () => reject(new Error("Could not reach the CDS HiPS client"));
    document.head.appendChild(tag);
  });
  return promise;
}