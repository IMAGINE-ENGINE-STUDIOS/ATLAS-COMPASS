/**
 * Character animation library.
 *
 * Curated catalogue of clips that are guaranteed to play. Every entry maps
 * to an animation that actually exists in its source glTF — no placeholders,
 * no broken fetches. Two source kinds are supported:
 *
 *  - "builtin" — clip name lives inside the default Xbot rig that ships with
 *                `LevelCharacter`. No extra fetch.
 *  - "url"     — points to a hosted glb whose named clip is loaded on demand
 *                and retargeted to the active rig.
 *
 * The "user" source is added at runtime when the user uploads their own .glb
 * via the gallery's Upload button.
 */

export type ClipCategory =
  | "idle"
  | "locomotion"
  | "jump"
  | "combat"
  | "dance"
  | "social"
  | "gesture"
  | "sit"
  | "sleep"
  | "death"
  | "parkour"
  | "work";

export interface CharacterClipEntry {
  id: string;
  name: string;
  category: ClipCategory;
  tags: string[];
  source: "builtin" | "url" | "user";
  /** glb URL that contains the clip. */
  url?: string;
  /** Exact clip name inside the glb. Defaults to clip index 0. */
  clipName?: string;
  loop: boolean;
  defaultSpeed?: number;
  /** Short human description for tooltips. */
  description?: string;
}

// ---------- helpers ----------------------------------------------------------

const builtin = (
  id: string,
  name: string,
  category: ClipCategory,
  clipName: string,
  tags: string[] = [],
  loop = true,
): CharacterClipEntry => ({
  id,
  name,
  category,
  tags: [category, ...tags],
  source: "builtin",
  clipName,
  loop,
});

const url = (
  id: string,
  name: string,
  category: ClipCategory,
  href: string,
  clipName: string | undefined,
  tags: string[] = [],
  loop = true,
): CharacterClipEntry => ({
  id,
  name,
  category,
  tags: [category, ...tags],
  source: "url",
  url: href,
  clipName,
  loop,
});

// ---------- catalogue --------------------------------------------------------

const XBOT = "https://threejs.org/examples/models/gltf/Xbot.glb";
const ROBOT = "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";
const SOLDIER = "https://threejs.org/examples/models/gltf/Soldier.glb";

export const CHARACTER_ANIMATION_LIBRARY: CharacterClipEntry[] = [
  // Only clips that play reliably on the default Xbot rig. Additional
  // clips can be added at runtime via the gallery's Upload button.
  builtin("xbot-idle", "Idle",    "idle",       "idle", ["calm", "loop"]),
  builtin("xbot-walk", "Walking", "locomotion", "walk", ["loop", "forward"]),
  builtin("xbot-run",  "Running", "locomotion", "run",  ["loop", "forward", "fast"]),
];

export const CLIP_CATEGORIES: { id: ClipCategory; label: string }[] = [
  { id: "idle",       label: "Idle" },
  { id: "locomotion", label: "Locomotion" },
  { id: "jump",       label: "Jump" },
  { id: "combat",     label: "Combat" },
  { id: "dance",      label: "Dance" },
  { id: "social",     label: "Social" },
  { id: "gesture",    label: "Gesture" },
  { id: "sit",        label: "Sit" },
  { id: "sleep",      label: "Sleep" },
  { id: "death",      label: "Death" },
  { id: "parkour",    label: "Parkour" },
  { id: "work",       label: "Work" },
];

/**
 * Heuristic categoriser for an uploaded clip name. Returns a best-guess
 * category so user uploads show up in the right gallery tab instead of always
 * landing under "work".
 */
export function inferUploadedCategory(clipName: string): ClipCategory {
  const n = clipName.toLowerCase();
  if (/idle|stand|breath|wait|bored/.test(n)) return "idle";
  if (/walk|run|sprint|jog|sneak|limp|strut|crouch|pace/.test(n)) return "locomotion";
  if (/jump|leap|flip|vault|land/.test(n)) return "jump";
  if (/punch|kick|sword|bow|gun|rifle|reload|grenade|block|dodge|combat|fight/.test(n)) return "combat";
  if (/dance|salsa|hiphop|breakdance|house|samba|rumba|twist|charleston/.test(n)) return "dance";
  if (/wave|clap|bow|laugh|cry|shrug|salute|handshake|highfive|talk|listen/.test(n)) return "social";
  if (/point|come|stop|callme|look|nod|yes|no|agree|head|gesture|facepalm|thumb/.test(n)) return "gesture";
  if (/sit|chair|sofa|couch|meditate|eat|drink|laptop/.test(n)) return "sit";
  if (/sleep|yawn|stretch|tired/.test(n)) return "sleep";
  if (/death|die|dead/.test(n)) return "death";
  if (/climb|hang|pull|roll|slide|parkour/.test(n)) return "parkour";
  return "work";
}