/**
 * Client-side 3D model converter using three.js
 * Converts various 3D formats to glTF blob URLs for use with CesiumJS
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// Formats that can be loaded natively by Cesium
const CESIUM_NATIVE = new Set(["glb", "gltf"]);

// Formats we can convert via three.js
const CONVERTIBLE = new Set(["obj", "fbx", "dae", "stl", "ply", "3ds"]);

// All accepted extensions for the file input
export const ACCEPTED_EXTENSIONS = [
  ".glb", ".gltf",          // Native Cesium
  ".obj", ".fbx",            // Common 3D
  ".dae",                    // Collada
  ".stl", ".ply",            // Mesh formats
  ".3ds",                    // Legacy
  ".usdz", ".usda", ".usd", // USD (best-effort)
  ".dwg", ".dxf",           // AutoCAD
  ".vwx",                    // Vectorworks
  ".3dm",                    // Rhino
  ".skp",                    // SketchUp
  ".blend",                  // Blender
  ".max",                    // 3ds Max
  ".ma", ".mb",              // Maya
  ".c4d",                    // Cinema 4D
  ".ai", ".psd",             // Adobe
  ".uasset", ".umap",        // Unreal
];

export const ACCEPT_STRING = ACCEPTED_EXTENSIONS.join(",");

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export function isNativelySupportedByCesium(filename: string): boolean {
  return CESIUM_NATIVE.has(getExtension(filename));
}

export function isConvertible(filename: string): boolean {
  return CONVERTIBLE.has(getExtension(filename));
}

export function getFormatCategory(filename: string): "native" | "convertible" | "unsupported" {
  const ext = getExtension(filename);
  if (CESIUM_NATIVE.has(ext)) return "native";
  if (CONVERTIBLE.has(ext)) return "convertible";
  return "unsupported";
}

export function getFormatLabel(filename: string): string {
  const ext = getExtension(filename);
  const labels: Record<string, string> = {
    glb: "glTF Binary", gltf: "glTF", obj: "Wavefront OBJ", fbx: "Autodesk FBX",
    dae: "Collada", stl: "STL Mesh", ply: "PLY Point Cloud", "3ds": "3D Studio",
    usdz: "USD (Apple)", usda: "USD ASCII", usd: "USD", dwg: "AutoCAD DWG",
    dxf: "AutoCAD DXF", vwx: "Vectorworks", "3dm": "Rhino 3D", skp: "SketchUp",
    blend: "Blender", max: "3ds Max", ma: "Maya ASCII", mb: "Maya Binary",
    c4d: "Cinema 4D", ai: "Adobe Illustrator", psd: "Adobe Photoshop",
    uasset: "Unreal Asset", umap: "Unreal Map",
  };
  return labels[ext] || ext.toUpperCase();
}

/**
 * Convert a 3D model file to a glTF/glB blob URL.
 * For native formats (glb/gltf), returns a blob URL directly.
 * For convertible formats, uses three.js to load & re-export as glB.
 * For unsupported formats, throws with a helpful message.
 */
export async function convertToGltfBlob(
  file: File,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  const ext = getExtension(file.name);

  // Native - just create blob URL
  if (CESIUM_NATIVE.has(ext)) {
    onProgress?.("Using native glTF format");
    return file;
  }

  // Not convertible client-side
  if (!CONVERTIBLE.has(ext)) {
    throw new Error(
      `${getFormatLabel(file.name)} files cannot be converted in the browser. ` +
      `Please export your model as glTF/glB from your 3D software and re-upload.`
    );
  }

  onProgress?.(`Loading ${getFormatLabel(file.name)} file...`);
  const arrayBuffer = await file.arrayBuffer();
  const blobUrl = URL.createObjectURL(file);

  let scene: THREE.Object3D;

  try {
    switch (ext) {
      case "obj": {
        const loader = new OBJLoader();
        const text = new TextDecoder().decode(arrayBuffer);
        scene = loader.parse(text);
        break;
      }
      case "fbx": {
        const loader = new FBXLoader();
        scene = loader.parse(arrayBuffer, "");
        break;
      }
      case "dae": {
        const loader = new ColladaLoader();
        const text = new TextDecoder().decode(arrayBuffer);
        const result = loader.parse(text, "");
        scene = result.scene;
        break;
      }
      case "stl": {
        const loader = new STLLoader();
        const geometry = loader.parse(arrayBuffer);
        const material = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.3, roughness: 0.7 });
        scene = new THREE.Mesh(geometry, material);
        break;
      }
      case "ply": {
        const loader = new PLYLoader();
        const geometry = loader.parse(arrayBuffer);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: 0x888888, vertexColors: geometry.hasAttribute("color") });
        scene = new THREE.Mesh(geometry, material);
        break;
      }
      default:
        throw new Error(`Unexpected format: ${ext}`);
    }
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  onProgress?.("Converting to glTF...");

  // Ensure the scene has proper transforms
  scene.updateMatrixWorld(true);

  // Export to glB
  const exporter = new GLTFExporter();
  const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          // JSON result - convert to blob
          const json = JSON.stringify(result);
          const blob = new Blob([json], { type: "model/gltf+json" });
          blob.arrayBuffer().then(resolve).catch(reject);
        }
      },
      (error) => reject(error),
      { binary: true }
    );
  });

  onProgress?.("Model ready!");
  return new Blob([glbBuffer], { type: "model/gltf-binary" });
}

export async function convertToGltfBlobUrl(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string> {
  const blob = await convertToGltfBlob(file, onProgress);
  return URL.createObjectURL(blob);
}
