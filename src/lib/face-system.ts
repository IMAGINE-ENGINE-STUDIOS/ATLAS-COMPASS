import * as THREE from "three";
import type { FaceOverride, PrimitiveObject, PolygonObject, SceneObject, RGBA } from "./levelTypes";

/** Returns the ordered face-key list for a given primitive shape. The
 * order matches the geometry's material group order in three.js so the
 * Nth face key corresponds to materialIndex N. */
export function primitiveFaceKeys(shape: PrimitiveObject["shape"]): string[] {
  switch (shape) {
    // BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
    case "box":
      return ["px", "nx", "py", "ny", "pz", "nz"];
    // CylinderGeometry: side, top cap, bottom cap
    case "cylinder":
      return ["side", "top", "bottom"];
    // ConeGeometry: side, bottom cap
    case "cone":
      return ["side", "bottom"];
    default:
      return ["all"];
  }
}

/** Friendly label for a face key (for the UI chips). */
export function faceKeyLabel(key: string): string {
  if (key.startsWith("side_")) return `Side ${parseInt(key.slice(5), 10) + 1}`;
  if (key.startsWith("mesh:")) return key.slice(5);
  const map: Record<string, string> = {
    cap: "Face", top: "Top", bottom: "Bottom",
    px: "Right (+X)", nx: "Left (-X)",
    py: "Top (+Y)", ny: "Bottom (-Y)",
    pz: "Front (+Z)", nz: "Back (-Z)",
    side: "Side", all: "All",
  };
  return map[key] || key;
}

/** All face keys for an object (model meshes resolved by caller). */
export function objectFaceKeys(obj: SceneObject): string[] {
  if (obj.kind === "primitive") return primitiveFaceKeys(obj.shape);
  if (obj.kind === "polygon") {
    if ((obj.extrude || 0) > 0) {
      const sides = obj.points.map((_, i) => `side_${i}`);
      return ["top", "bottom", ...sides];
    }
    return ["cap"];
  }
  return [];
}

/** Loads a texture once and applies UV transform. */
const textureCache = new Map<string, THREE.Texture>();
export function loadFaceTexture(url: string, ov: FaceOverride): THREE.Texture {
  let tex = textureCache.get(url);
  if (!tex) {
    tex = new THREE.TextureLoader().load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(url, tex);
  }
  // Clone so per-face UV transforms don't fight each other.
  const clone = tex.clone();
  clone.needsUpdate = true;
  clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
  clone.colorSpace = THREE.SRGBColorSpace;
  clone.center.set(0.5, 0.5);
  if (ov.repeat) clone.repeat.set(ov.repeat[0], ov.repeat[1]);
  if (ov.offset) clone.offset.set(ov.offset[0], ov.offset[1]);
  if (ov.rotation) clone.rotation = ov.rotation;
  return clone;
}

interface DefaultProps {
  color: RGBA;
  metalness?: number;
  roughness?: number;
}

/** Build a per-face material array honoring face overrides + selection tint. */
export function buildFaceMaterials(
  faceKeys: string[],
  defaultsByKey: Record<string, DefaultProps> | DefaultProps,
  overrides: Record<string, FaceOverride> | undefined,
  selectedFaces: Set<string> | null,
  opts?: { doubleSide?: boolean },
): THREE.MeshStandardMaterial[] {
  return faceKeys.map((key) => {
    const def: DefaultProps =
      "color" in defaultsByKey
        ? (defaultsByKey as DefaultProps)
        : (defaultsByKey as Record<string, DefaultProps>)[key] ||
          { color: [0.7, 0.7, 0.75, 1] as RGBA };
    const ov = overrides?.[key];
    const baseColor = ov?.color ?? def.color;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor[0], baseColor[1], baseColor[2]),
      metalness: ov?.metalness ?? def.metalness ?? 0.1,
      roughness: ov?.roughness ?? def.roughness ?? 0.8,
      transparent: (ov?.opacity ?? baseColor[3] ?? 1) < 1,
      opacity: ov?.opacity ?? baseColor[3] ?? 1,
      side: opts?.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (ov?.textureUrl) mat.map = loadFaceTexture(ov.textureUrl, ov);
    if (selectedFaces?.has(key)) {
      mat.emissive = new THREE.Color("#22c55e");
      mat.emissiveIntensity = 0.55;
    }
    return mat;
  });
}

/** Resolve the face key from a raycast intersection against an object's mesh.
 * The mesh must have userData.__faceKeys = string[] indexed by materialIndex. */
export function resolveFaceKeyFromHit(hit: THREE.Intersection): string | null {
  const mesh = hit.object as THREE.Mesh;
  const keys: string[] | undefined = (mesh.userData as any)?.__faceKeys;
  if (!keys || keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  const mi = (hit.face as any)?.materialIndex;
  if (typeof mi === "number" && keys[mi]) return keys[mi];
  return keys[0];
}