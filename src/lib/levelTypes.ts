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

export interface LevelScene {
  objects: SceneObject[];
  lights: SceneLight[];
  animations: AnimationTrack[];
  environment: {
    background: string;
    ambient: number;
    fog?: { color: string; near: number; far: number };
  };
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
  environment: { background: "#0b0f1a", ambient: 0.4 },
};

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}