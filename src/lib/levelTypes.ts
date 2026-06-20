// Scene model for LEVEL files. Kept JSON-serialisable so it can live in jsonb.

export type Vec3 = [number, number, number];
export type RGBA = [number, number, number, number]; // 0..1

/**
 * A bound keyboard combo, e.g. "E", "7", "Shift+F". Captured via the
 * `KeyCaptureInput` widget so the format stays consistent (no whitespace,
 * canonical case for letters, "Shift|Ctrl|Alt|Meta+<KEY>").
 */
export type PlayKey = string;

/**
 * Per-object Play-mode behavior. Authored in the editor, consumed by the
 * Play runtime (`PlayBehaviorRuntime` + `PlayInputManager`). All fields are
 * optional except `collision`. When `playBehavior` is omitted the object
 * defaults to walkable scenery with no interactions.
 */
export interface PlayBehavior {
  /**
   * Movement vs the object:
   *  - "walkable": player can stand on / collide with it (default).
   *  - "blocking": player collides but the surface is not pickable as ground
   *                (use for invisible walls — currently aliased to walkable
   *                in the raycast; semantics will be refined later).
   *  - "none":     ghost — player passes straight through (`__nocast`).
   */
  collision: "walkable" | "blocking" | "none";
  /** Hide the mesh while in Play mode (collision still applies unless `none`). */
  invisibleInPlay?: boolean;
  /** Picked up / dropped with `key`. Parents the object to the player root. */
  grabbable?: { key: PlayKey; carryOffset?: Vec3 };
  /** Player can push this object on contact. */
  pushable?: { mass?: number; friction?: number };
  /** Press `key` within `interactRadius` to emit `eventId` on the level bus. */
  event?: { key: PlayKey; eventId: string; once?: boolean };
  /** Sit on this object (`key`, default "E"). */
  sittable?: { key: PlayKey };
  /** Generic "use" hook (`key`, optional HUD label). */
  usable?: { key: PlayKey; label?: string };
  /** Proximity radius (m) for all key-triggered actions. Default 2.5m. */
  interactRadius?: number;
}

/**
 * Best-effort migration from the legacy `interaction` enum + `physics.gravity`
 * to the structured `playBehavior` block. Callers pass the raw scene object
 * and receive the behavior to use at runtime (without mutating the object).
 */
export function resolvePlayBehavior(obj: BaseObject): PlayBehavior {
  if (obj.playBehavior) return obj.playBehavior;
  const legacy = obj.interaction;
  if (legacy === "pushable") {
    return { collision: "walkable", pushable: { mass: 1, friction: 0.92 } };
  }
  if (legacy === "sit") {
    return { collision: "walkable", sittable: { key: "E" }, interactRadius: 1.6 };
  }
  if (legacy === "use") {
    return { collision: "walkable", usable: { key: "E" }, interactRadius: 1.6 };
  }
  return { collision: "walkable" };
}

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
   * Optional group membership. When set, the editor treats any selection of
   * a group member as a selection of the entire group: transforms / lock /
   * visibility / duplicate / delete fan out across every member, and the
   * Play runtime parents the members into a shared rigid `THREE.Group`.
   */
  groupId?: string;
  /**
   * Locomotion / interaction role for play mode.
   *  - "pushable": small-object dynamics; the player can push/kick it.
   *  - "sit":      acts as a sit marker (proximity prompt → sit animation).
   *  - "use":      acts as a "use" marker (proximity prompt → use animation).
   *  - omitted:    static (walkable / collidable scenery).
   */
  interaction?: "pushable" | "sit" | "use";
  /**
   * Authored Play-mode behavior. When present, this fully describes how the
   * object reacts at Play time (collision, visibility, key-triggered actions)
   * and supersedes the legacy `interaction` enum. Legacy field is kept for
   * back-compat and migrated on read by `migrateInteractionToPlayBehavior`.
   */
  playBehavior?: PlayBehavior;
  /**
   * Lightweight physics toggles applied at Play time. All flags default to
   * OFF so authored placement is preserved unless the user opts in.
   */
  physics?: {
    /** When true and `interaction === "pushable"`, gravity pulls the object down. */
    gravity?: boolean;
  };
  /**
   * Bindings to scene-level splines (see `LevelScene.scenePaths`). Each
   * binding references a path by id and is either a movement binding
   * (object travels along the path) or a trigger binding (the path acts
   * as a volume; entering it fires `actionId`).
   */
  splineBindings?: SplineBinding[];
  /**
   * Programmed interactions attached to this object. Kinds:
   *  - "preset"  — pick from a library (move, rotate, toggleVisibility, …)
   *  - "script"  — small condition→action block list (when X then Y)
   *  - "js"      — free-form sandboxed JS snippet (advanced)
   * Each interaction has an `id` so action buttons / triggers can call it.
   */
  interactions?: ObjectInteraction[];
  /**
   * Floating action buttons / prompts. Rendered in-world during Play and
   * previewable from the inspector. A button can be triggered by a click,
   * by walking through the object's bounds, by approaching with a prompt,
   * or by pressing a key combo. Each button invokes one interaction by id.
   */
  actionButtons?: ActionButton[];
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
  /**
   * Optional role inside the Train System (see `LevelScene.trainSystem`).
   * Tags an object as the locomotive, a car, a door, the driver's cabin,
   * the track centreline marker, or a station stop marker. The TrainRuntime
   * reads these to drive motion, doors, and boarding during Play mode.
   */
  trainRole?: "locomotive" | "car" | "door" | "cabin" | "stopMarker";
  /**
   * When `trainRole === "door"`, the world-space offset added to the door's
   * authored position while the door is fully open. Defaults to [0, 0, 1.2]
   * (slides 1.2m along the door's local +Z). Closed = authored position.
   */
  doorOpenOffset?: Vec3;
}

export interface ScenePath {
  id: string;
  name: string;
  /** Control points in world space. Linear-interpolated between waypoints. */
  waypoints: Vec3[];
  /** Hex color for the rendered overlay polyline. */
  color: string;
  /** When the path acts as a trigger volume, this is its capture radius (m). */
  triggerRadius?: number;
  /** True to close the loop (last waypoint connects to first). */
  closed?: boolean;
}

export interface SplineBinding {
  id: string;
  pathId: string;
  mode: "movement" | "trigger";
  /** Movement: travel speed along the path (m/s). */
  speed?: number;
  /** Movement: loop when reaching the end. */
  loop?: boolean;
  /** Movement: align the object's yaw to the path tangent. */
  orientToPath?: boolean;
  /** Trigger: action id (matches `ObjectInteraction.id`) fired on enter. */
  actionId?: string;
}

export type PresetActionType =
  | "rotateContinuously"
  | "toggleVisibility"
  | "teleportPlayer"
  | "playSound"
  | "openUrl"
  | "spawnGeometry";

export interface PresetAction {
  type: PresetActionType;
  /** Rotation axis (rotateContinuously) — defaults to [0,1,0]. */
  axis?: Vec3;
  /** Rotation speed in rad/s (rotateContinuously). */
  speed?: number;
  /** Target world position (teleportPlayer). */
  target?: Vec3;
  /** Optional snap-to-object target id (teleportPlayer). When set, the player
   *  teleports to this object's world position instead of `target`. */
  targetObjectId?: string;
  /** URL (openUrl or playSound). */
  url?: string;
  /** Geometry CSV (spawnGeometry). */
  csv?: string;
}

export interface ScriptBlock {
  /** Condition: e.g. "onPlayerNear", "onClick", "onWalkThrough", "always". */
  when: "onClick" | "onPlayerNear" | "onWalkThrough" | "always";
  /** Distance for `onPlayerNear`. */
  distance?: number;
  /** Action to run. Reuses PresetAction shape for simplicity. */
  then: PresetAction;
}

export interface ObjectInteraction {
  id: string;
  name: string;
  kind: "preset" | "script" | "js";
  /** When kind === "preset": how the action is triggered. */
  trigger?: "onClick" | "onPlayerNear" | "onWalkThrough" | "always" | "key";
  /** Distance for onPlayerNear trigger. */
  triggerDistance?: number;
  /** Key for key trigger, e.g. "E" or "Shift+E". */
  triggerKey?: string;
  /** When kind === "preset". */
  preset?: PresetAction;
  /** When kind === "script": list of when→then blocks. */
  blocks?: ScriptBlock[];
  /** When kind === "js": sandboxed snippet. Receives ({ obj, scene, ctx }). */
  js?: string;
}

export interface ActionButton {
  id: string;
  label: string;
  /** Human-readable hint shown on the floating pin, e.g. "Press E to open". */
  pinText?: string;
  /** When false, the pin is hidden and the action runs implicitly. */
  pinVisible: boolean;
  /** Vertical offset above the object for the pin (m). */
  pinOffset?: number;
  /** How the action is triggered. */
  trigger:
    | { kind: "click" }
    | { kind: "key"; keys: string[] }
    | { kind: "proximity"; distance: number }
    | { kind: "walkThrough" };
  /** Interaction id (matches `ObjectInteraction.id`) to invoke. */
  actionId: string;
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

/**
 * A rigged, animated character actor in the scene.
 *
 * Defaults to the Three.js example **Xbot** glTF, which ships with a Mixamo
 * humanoid skeleton (full finger bones + foot/toe bones) and ~14 baked
 * animation clips (Idle, Walk, Run, Dance, Wave, Death, ThumbsUp, …).
 *
 * The user can swap in any other rigged glTF/GLB by URL and the animation
 * picker auto-discovers clips from the file.
 */
export interface CharacterObject extends BaseObject {
  kind: "character";
  /** URL of the rigged glTF/GLB. */
  url: string;
  /** Human-readable source label, e.g. "Xbot (Mixamo)". */
  source?: string;
  /** Name of the active animation clip (must match one in the glTF). */
  currentAnimation?: string;
  /**
   * Optional URL of an external .glb whose first clip is retargeted onto
   * this character's existing rig and played instead of (or alongside) the
   * built-in clips. Used by the Mixamo/RPM gallery so picking an animation
   * never swaps the actual character model.
   */
  externalClipUrl?: string;
  /** Playback speed multiplier (1 = normal). */
  animationSpeed: number;
  /** True to freeze on the current frame. */
  paused: boolean;
  /** Crossfade duration in seconds when swapping clips. */
  crossfade?: number;
  /**
   * Optional saved bone pose authored in the Rig Controller Room. When
   * present, it's applied to the skeleton after the model loads so any
   * skeleton edits (custom rest pose, fixed limb adjustments) carry over
   * into gameplay. Shape matches `BonePose` in `@/lib/rigSaves`.
   */
  pose?: Array<{
    n: string;
    p: [number, number, number];
    q: [number, number, number, number];
    s: [number, number, number];
  }>;
  /** Id of the rig save this character was last bound to (for re-sync). */
  rigSaveId?: string;
  /**
   * When true (and the editor is in Play mode), this character is driven by
   * the LocomotionRuntime (input + physics + camera). Only one playable
   * character is active at a time — the first match in scene order wins.
   */
  playable?: boolean;
  /** Input source for the playable character. Default: "both". */
  controlScheme?: "keyboard" | "gamepad" | "both";
  /** Follow camera mode while controlled. Default: "third". */
  cameraMode?: "third" | "first";
  /** Tunable locomotion params. */
  locomotion?: {
    walkSpeed?: number;   // m/s, default 2.2
    runSpeed?: number;    // m/s, default 5.0
    jumpHeight?: number;  // m, default 1.2
    gravity?: number;     // m/s^2, default 18 (snappy game feel)
    height?: number;      // capsule total height, default 1.7
    radius?: number;      // capsule radius, default 0.32
    /** Tallest step the character climbs without a full climb tween (m). */
    maxStepHeight?: number;
  };
  /**
   * When true, the editor renders a walkability heatmap over the scene:
   * green tiles = the character can stand here, red tiles = blocked
   * (no ground, ceiling too low, or a step too tall to climb).
   */
  showNavMap?: boolean;
}

/**
 * Editable trajectory spline. The world-space path is built from `points`
 * (each in object-local space; the object's own position/rotation/scale
 * still applies on top). At Play time, every entry in `followers` is
 * advanced along the curve by length, modulated per-section.
 */
export interface TrajectorySection {
  id: string;
  /** Start parameter along the curve (0..1, inclusive). */
  tStart: number;
  /** End parameter along the curve (0..1, exclusive). */
  tEnd: number;
  /** Multiplier on the trajectory's base speed inside this section. */
  speedMul: number;
  /** World-Y offset added to the curve while inside this section. */
  altitude: number;
  /** Visual color for the section (hex). */
  color: string;
}

export interface TrajectoryObject extends BaseObject {
  kind: "trajectory";
  /** Control points in object-local space. */
  points: Vec3[];
  closed: boolean;
  /** Catmull-Rom tension (0..1). */
  tension: number;
  /** Base travel speed in world units / second. */
  speed: number;
  /** Colored / accelerated segments along the curve. */
  sections: TrajectorySection[];
  /** Object ids that follow this curve during Play mode. */
  followers: string[];
  /** When true, follower yaw is aligned to the curve tangent. */
  orientToPath: boolean;
  /** When true, follower loops on reaching the end (open curves). */
  loop: boolean;
  /** Base curve color (used outside any section). */
  color: string;
  /**
   * Smart-path mode. When true, the follower walks the terrain instead of
   * floating on the abstract curve:
   *  - Y is snapped to surface via a down-raycast against terrain + scenery.
   *  - Pitch is aligned to the surface slope (orientToPath also controls yaw).
   *  - Travel speed is scaled by `slopeSpeedFactor` on inclines so uphill
   *    is slower and downhill is faster (still capped at 2x base).
   *  - Vertical jumps greater than `maxStepHeight` are smoothed over multiple
   *    frames, so the character "steps" up/down stairs instead of teleporting.
   */
  smartPath?: boolean;
  /** Max vertical step the character can climb instantly (m). Default 0.4. */
  maxStepHeight?: number;
  /** Speed scale per radian of slope (0 = ignore slope). Default 0.6. */
  slopeSpeedFactor?: number;
}

/** Default Xbot character (Three.js examples — MIT-licensed Mixamo rig). */
export const DEFAULT_CHARACTER_URL =
  "https://threejs.org/examples/models/gltf/Xbot.glb";

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

export type SceneObject =
  | PrimitiveObject
  | PolygonObject
  | ModelObject
  | CharacterObject
  | TrajectoryObject;

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

/**
 * A named collection of scene objects that move and behave together. Members
 * carry a back-pointer (`BaseObject.groupId`) so cheap lookups don't need to
 * scan the group list. Groups are flat (no nesting) for v1.
 */
export interface SceneGroup {
  id: string;
  name: string;
  /** Hex chip color shown in the Layers / Groups outline. */
  color?: string;
  memberIds: string[];
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
  /**
   * Optional id of the character (`CharacterObject.id`) that should act as
   * the playable avatar at Play time. When set, the Play runtime drives
   * THIS character with input/camera regardless of per-character `playable`
   * flags. When unset, the first character flagged `playable` wins (legacy).
   * Used by the Atlas to "pose" a player inside the level on entry.
   */
  mainCharacterId?: string;
  /** Reusable rigid-group bindings between scene objects. */
  groups?: SceneGroup[];
  terrain?: SceneTerrain;
  /** Scene-wide named splines reusable by object spline bindings. */
  scenePaths?: ScenePath[];
  /**
   * Persisted character animation clips uploaded by the user for this level.
   * Each entry mirrors `CharacterClipEntry` from the library — kept here so
   * the gallery can show them again after a reload. (Blob URLs don't survive
   * a reload; we store the original `.glb` as a data URL.)
   */
  userClipLibrary?: Array<{
    id: string;
    name: string;
    category: string;
    tags: string[];
    url: string;        // data URL
    clipName?: string;
    loop: boolean;
  }>;
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
  /**
   * Optional Train System configuration. When present, the TrainRuntime
   * mounts during Play mode and drives a locomotive + its cars along the
   * referenced scene path, holding at stop markers, opening doors for
   * `stopDurationSeconds`, and parenting any character that walks through
   * an open door so they ride along.
   */
  trainSystem?: TrainSystemConfig;
}

/**
 * Train System config. IDs reference `scene.objects[].id`; `trackPathId`
 * references `scene.scenePaths[].id`. Speeds are in metres/second. Stops
 * are scheduled by their curve parameter `t` (0..1 along the closed path).
 */
export interface TrainSystemConfig {
  /** Scene path id whose waypoints form the rail centreline. */
  trackPathId: string;
  /** Object id of the locomotive (drives the train). */
  locomotiveId: string;
  /** Object ids of attached cars, ordered head→tail. */
  carIds: string[];
  /** Object ids of door panels (move on open). */
  doorIds: string[];
  /** Object id of the driver's cabin trigger (used for possession). */
  cabinId?: string;
  /** Stop markers along the loop (each at curve parameter t∈[0,1]). */
  stops: Array<{ t: number; name?: string }>;
  /** Cruising speed (m/s). */
  baseSpeed: number;
  /** Distance before each stop where the train starts braking (m). */
  brakeDistance: number;
  /** How long the train sits with doors open at each stop (s). */
  stopDurationSeconds: number;
  /** Door open animation duration (s). */
  doorAnimSeconds: number;
  /** Spacing between attached cars (m, including locomotive). */
  carSpacing: number;
  /** Key used to toggle cabin possession (default "P"). */
  possessKey?: string;
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
  environment: {
    background: "#0b0f1a",
    ambient: 0.4,
    gi: {
      enabled: true,
      skyColor: "#87ceeb",
      groundColor: "#3d5c3d",
      hemisphereIntensity: 0.6,
      contactShadows: true,
      contactOpacity: 0.4,
      contactBlur: 2.5,
    },
  },
};

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}