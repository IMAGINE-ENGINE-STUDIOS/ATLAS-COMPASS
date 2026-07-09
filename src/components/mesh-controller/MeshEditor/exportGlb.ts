/**
 * GLTFExporter helper — bakes an in-memory `THREE.Object3D` back into a
 * binary GLB `Blob` suitable for reloading into Cesium.
 */
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { Object3D } from "three";

export function exportGlb(root: Object3D): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const exporter = new GLTFExporter();
      exporter.parse(
        root,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(new Blob([result], { type: "model/gltf-binary" }));
          } else {
            // JSON fallback — encode to a UTF-8 Blob so callers still get a
            // uploadable payload. Consumers know to name it .gltf if they
            // key off the Blob type.
            const json = JSON.stringify(result);
            resolve(new Blob([json], { type: "model/gltf+json" }));
          }
        },
        (err) => reject(err),
        { binary: true, embedImages: true },
      );
    } catch (e) {
      reject(e);
    }
  });
}