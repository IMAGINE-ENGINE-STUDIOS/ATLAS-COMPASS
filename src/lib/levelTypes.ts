// Scene model for LEVEL files. Kept JSON-serialisable so it can live in jsonb.

export type Vec3 = [number, number, number];
export type RGBA = [number, number, number, number]; // 0..1

export interface BaseObject {
  id: string;
  name: string;
  position: Vec3;
  rotation: Vec3; // euler in radians
  scale: Vec3;
  visible: boolean;
  layerId?: string; // optional; falls back to default layer
  locked?: boolean;
  /**
   * Per-face material overrides. Keys are stable face identifiers that
   * depend on the object's shape:
   *  - Polygon flat:      "cap"
   *  - Polygon extruded:  "top" | "bottom" | "side_<i>"
   *  - Primitive box:     "px" | "nx" | "py" | "ny" | "pz" | "nz"
   *  - Primitive cylinder:"side" | "top" | "bottom"
   *  - Primitive cone:    "side" | "bottom"
   *  - Other primitives:  "all"
   *
   * Models use `materialOverrides` (per-mesh) instead.
   */
  faceOverrides?: Record<string, FaceOverride>;
}

export interface FaceOverride {
  color?: RGBA;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  /** Albedo texture (data URL or remote URL). */
  textureUrl?: string;
  /** UV tiling (default [1, 1]). */
  repeat?: [number, number];
  /** UV offset (default [0, 0]). */
  offset?: [number, number];
  /** UV rotation in radians (default 0). */
  rotation?: number;
}

export interface PrimitiveObject extends BaseObject {
  kind: "primitive";
  shape: "box" | "sphere" | "plane" | "cylinder" | "cone" | "torus";
  color: RGBA;
  metalness: number;
  roughness: number;
}

export interface PolygonFace {
  // index into the polygon's vertex ring; describes a triangle [a,b,c]
  // (auto-triangulated client-side from spline points)
  color?: RGBA;
  textureUrl?: string;
}

export interface PolygonObject extends BaseObject {
  kind: "polygon";
  // 2D spline points in XZ plane (Y is extrusion height direction)
  points: Array<[number, number]>;
  // Optional per-point offset of the BOTTOM ring (orange handles) from the
  // TOP ring (yellow handles). Same shape units as `points`. When any entry
  // is non-zero, the polygon mesh is built as a custom prism whose top and
  // bottom contours differ — useful for tapered/skewed shapes.
  bottomOffsets?: Array<[number, number]>;
  /**
   * Per-point vertical offset for the TOP ring (yellow handles). Index aligns
   * with `points`. When omitted or 0, the top vertex sits at y = `extrude`
   * (or y = 0 when the polygon is flat). Allows splines to slide on the
   * vertical axis to create ramps / non-planar tops.
   */
  pointHeights?: number[];
  /**
   * Per-point vertical offset for the BOTTOM ring (orange handles). When
   * omitted or 0, the bottom vertex sits at y = 0. Only meaningful when
   * `extrude > 0`.
   */
  bottomHeights?: number[];
  extrude: number; // 0 = flat, >0 = extruded prism
  bevel: number;
  closed: boolean;
  fillColor: RGBA;
  sideColor: RGBA;
  topColor: RGBA;
  // optional per-side overrides keyed by side index
  sideOverrides?: Record<number, { color?: RGBA; textureUrl?: string }>;
}

export interface ModelObject extends BaseObject {
  kind: "model";
  url: string; // glb/gltf url (data url or storage url)
  fileName?: string;
  /**
   * Original source format BEFORE conversion to glTF. Useful for the UI
   * (badge / re-export) and for round-tripping through the APS pipeline.
   * Examples: "glb", "gltf", "obj", "fbx", "stl", "dae", "3ds", "ply",
   * "dxf", "skp", "step", "iges", "ifc", "rvt", "max".
   */
  sourceFormat?: string;
  /**
   * Per-mesh material overrides keyed by mesh.name (or a stable index
   * fallback "mesh_<n>" when names collide / are empty). When a mesh has
   * an entry, the GLTFModelMesh applies the override on top of the
   * loader's original PBR material — original is preserved untouched in
   * memory so removing the override restores the look.
   */
  materialOverrides?: Record<string, ModelMaterialOverride>;
}

export interface ModelMaterialOverride {
  color?: RGBA;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  /** Albedo / base color map, stored as a data URL. */
  map?: string;
  normalMap?: string;
  roughnessMap?: string;
  /** UV tiling (default [1, 1]). */
  repeat?: [number, number];
  /** UV offset (default [0, 0]). */
  offset?: [number, number];
  /** UV rotation in radians (default 0). */
  rotation?: number;
}

export type SceneObject = PrimitiveObject | PolygonObject | ModelObject;

export interface SceneLight {
  id: string;
  name: string;
  kind: "directional" | "point" | "spot" | "ambient";
  position: Vec3;
  target?: Vec3;
  color: RGBA;
  intensity: number;
  castShadow?: boolean;
}

export interface AnimationKeyframe {
  t: number; // seconds
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}

export interface AnimationTrack {
  id: string;
  name: string;
  targetId: string; // SceneObject.id
  keyframes: AnimationKeyframe[];
  loop: boolean;
  duration: number;
}

export interface SceneLayer {
  id: string;
  name: string;
  color?: string; // hex chip color
  visible: boolean;
  locked?: boolean;
  collapsed?: boolean;
}

export interface SceneTerrain {
  enabled: boolean;
  source: "primitive" | "model";
  shape: "plane" | "box" | "sphere"; // used when source === "primitive"
  size: Vec3;        // width / height / depth (or radius in x for sphere)
  position: Vec3;
  rotation: Vec3;
  color: RGBA;
  wireframe: boolean;
  modelUrl?: string;
  modelFileName?: string;
  visible: boolean;
  snapToSurface: boolean; // when true, dragged objects snap to terrain surface
  /**
   * Optional sculpted heightmap for the `plane` primitive shape. Stores a
   * (resolution+1) × (resolution+1) grid of per-vertex height offsets along
   * the plane normal (local Z, which becomes world Y after the plane's
   * -PI/2 X rotation).
   */
  heightmap?: {
    resolution: number;
    data: number[];
  };
  /** Optional surface texture (color map) applied to the terrain material. */
  texture?: {
    url: string;
    name: string;
    /** UV tiling repeat (uniform on both axes). */
    repeat: number;
  };
  /**
   * Optional depth / displacement map. Drives `meshStandardMaterial`'s
   * `displacementMap` so brighter pixels push vertices up. Only visibly
   * effective on the `plane` primitive (which has enough subdivisions).
   */
  depthMap?: {
    url: string;
    name: string;
    /** World-unit displacement scale at full white (1.0). */
    scale: number;
  };
  /** PBR material parameters applied to the terrain surface. */
  material?: {
    /** 0 = dielectric (plastic/wood/stone), 1 = pure metal. */
    metalness: number;
    /** 0 = mirror smooth, 1 = fully diffuse. */
    roughness: number;
    /** Multiplier on environment reflections (0–4). */
    reflectivity: number;
    /** Optional preset name for quick presets like plastic / metal / wood. */
    preset?: "plastic" | "metal" | "wood" | "stone" | "glass" | "rubber" | "custom";
  };
}

export function defaultTerrain(): SceneTerrain {
  return {
    enabled: false,
    source: "primitive",
    shape: "plane",
    size: [20, 1, 20],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    color: [0.18, 0.22, 0.3, 1],
    wireframe: false,
    visible: true,
    snapToSurface: true,
  };
}

export interface LevelScene {
  objects: SceneObject[];
  lights: SceneLight[];
  animations: AnimationTrack[];
  layers?: SceneLayer[];
  terrain?: SceneTerrain;
  environment: {
    background: string;
    ambient: number;
    fog?: { color: string; near: number; far: number };
    /** HDRI environment / image-based lighting. */
    hdri?: HDRIEnvironment;
    /** Global illumination approximation (hemisphere + contact shadows). */
    gi?: {
      enabled: boolean;
      /** Sky hemisphere color (default #87ceeb). */
      skyColor: string;
      /** Ground hemisphere color (default #3d5c3d). */
      groundColor: string;
      /** Intensity of the hemisphere light. */
      hemisphereIntensity: number;
      /** Render cheap contact-shadow overlay for AO-like grounding. */
      contactShadows: boolean;
      /** Opacity of the contact-shadow plane (0–1). */
      contactOpacity: number;
      /** Blur radius of the contact shadows (0–10). */
      contactBlur: number;
    };
  };
}

/** A single HDRI map (high-dynamic-range equirectangular image). */
export interface HDRIMap {
  id: string;
  name: string;
  /** Data URL or remote URL to the .hdr or .exr file. */
  url: string;
  /** File extension, used to pick the right loader. */
  ext: "hdr" | "exr";
}

/** Active HDRI environment configuration. A "pack" is just a list of HDRIs the user can switch between. */
export interface HDRIEnvironment {
  /** Available HDRIs in the user's pack. */
  maps: HDRIMap[];
  /** Currently active map id (must match one of `maps[].id`). */
  activeId?: string;
  /** Light contribution multiplier (drei/three `environmentIntensity`). */
  intensity: number;
  /** Y-axis rotation of both environment + background, in radians. */
  rotation: number;
  /** When true, the HDRI is also drawn as the scene background. */
  asBackground: boolean;
}

export const DEFAULT_LAYER_ID = "layer_default";
export function defaultLayers(): SceneLayer[] {
  return [
    { id: DEFAULT_LAYER_ID, name: "Default", color: "#64748b", visible: true },
  ];
}

export const EMPTY_SCENE: LevelScene = {
  objects: [],
  lights: [
    {
      id: "lvl-light-key",
      name: "Key light",
      kind: "directional",
      position: [6, 10, 6],
      color: [1, 1, 1, 1],
      intensity: 1.2,
      castShadow: true,
    },
  ],
  animations: [],
  layers: defaultLayers(),
  environment: { background: "#0b0f1a", ambient: 0.4 },
};

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}