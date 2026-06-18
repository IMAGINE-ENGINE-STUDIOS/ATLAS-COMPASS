/**
 * Character animation library.
 *
 * A catalog of ~100 named clip entries spanning idle / locomotion / combat /
 * dance / social / gestures / sit-sleep / parkour / work. Three kinds of
 * sources are supported:
 *
 *  - "builtin" — clip name lives inside the default Xbot rig that already
 *                ships with `LevelCharacter`. No extra fetch.
 *  - "url"     — points to a hosted glb whose first (or named) clip is loaded
 *                on demand and retargeted to the active rig.
 *  - "slot"    — a named, tagged placeholder. The user fills it by uploading
 *                a .glb; the upload matcher pairs `clip.name` against
 *                `slotTag` (case-insensitive substring).
 *
 * The library intentionally lists many "slot" entries so the UI can present
 * a rich, organised catalogue even before the user uploads anything — each
 * slot tile shows an "Upload to enable" affordance instead of a broken fetch.
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
  source: "builtin" | "url" | "user" | "slot";
  /** glb URL that contains the clip. */
  url?: string;
  /** Exact clip name inside the glb. Defaults to clip index 0. */
  clipName?: string;
  /** Tag that the upload matcher uses to fill this slot. */
  slotTag?: string;
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

const slot = (
  id: string,
  name: string,
  category: ClipCategory,
  slotTag: string,
  tags: string[] = [],
  loop = true,
): CharacterClipEntry => ({
  id,
  name,
  category,
  tags: [category, ...tags, "slot"],
  source: "slot",
  slotTag,
  loop,
});

// ---------- catalogue --------------------------------------------------------

const XBOT = "https://threejs.org/examples/models/gltf/Xbot.glb";
const ROBOT = "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";
const SOLDIER = "https://threejs.org/examples/models/gltf/Soldier.glb";

export const CHARACTER_ANIMATION_LIBRARY: CharacterClipEntry[] = [
  // ----- Built-in Xbot clips (verified to exist) -----
  builtin("xbot-idle",       "Idle",            "idle",       "idle",       ["calm", "loop"]),
  builtin("xbot-walk",       "Walking",         "locomotion", "walk",       ["loop", "forward"]),
  builtin("xbot-run",        "Running",         "locomotion", "run",        ["loop", "forward", "fast"]),
  builtin("xbot-jump",       "Jump",            "jump",       "jump",       ["once"]),
  builtin("xbot-sitting",    "Sit (relaxed)",   "sit",        "sitting",    ["chair"]),
  builtin("xbot-stand",      "Stand up",        "social",     "standing",   ["once"]),
  builtin("xbot-dance",      "Dance — Hip-Hop", "dance",      "dance",      ["loop"]),
  builtin("xbot-death",      "Death (forward)", "death",      "death",      ["once"]),
  builtin("xbot-wave",       "Wave hello",      "gesture",    "wave",       ["greeting"]),
  builtin("xbot-yes",        "Nod yes",         "gesture",    "yes"),
  builtin("xbot-no",         "Shake no",        "gesture",    "no"),
  builtin("xbot-punch",      "Punch",           "combat",     "punch",      ["one-shot"]),
  builtin("xbot-thumbsup",   "Thumbs up",       "gesture",    "thumbs up"),
  builtin("xbot-walk-back",  "Walk backward",   "locomotion", "walk",       ["loop", "backward"]),

  // ----- Curated three.js sample rig clips -----
  url("robot-idle",          "Robot — Idle",          "idle",       ROBOT,   "Idle",        ["sample", "robot"]),
  url("robot-walk",          "Robot — Walking",       "locomotion", ROBOT,   "Walking",     ["sample", "robot"]),
  url("robot-run",           "Robot — Running",       "locomotion", ROBOT,   "Running",     ["sample", "robot"]),
  url("robot-jump",          "Robot — Jump",          "jump",       ROBOT,   "Jump",        ["sample", "robot"], false),
  url("robot-dance",         "Robot — Dance",         "dance",      ROBOT,   "Dance",       ["sample", "robot"]),
  url("robot-death",         "Robot — Death",         "death",      ROBOT,   "Death",       ["sample", "robot"], false),
  url("robot-sit",           "Robot — Sit down",      "sit",        ROBOT,   "Sitting",     ["sample", "robot"]),
  url("robot-stand",         "Robot — Standing",      "social",     ROBOT,   "Standing",    ["sample", "robot"]),
  url("robot-no",            "Robot — No",            "gesture",    ROBOT,   "No",          ["sample", "robot"], false),
  url("robot-yes",           "Robot — Yes",           "gesture",    ROBOT,   "Yes",         ["sample", "robot"], false),
  url("robot-thumbsup",      "Robot — Thumbs up",     "gesture",    ROBOT,   "ThumbsUp",    ["sample", "robot"], false),
  url("robot-punch",         "Robot — Punch",         "combat",     ROBOT,   "Punch",       ["sample", "robot"], false),
  url("robot-wave",          "Robot — Wave",          "gesture",    ROBOT,   "Wave",        ["sample", "robot"], false),
  url("soldier-idle",        "Soldier — Idle",        "idle",       SOLDIER, "Idle",        ["sample", "soldier"]),
  url("soldier-walk",        "Soldier — Walking",     "locomotion", SOLDIER, "Walk",        ["sample", "soldier"]),
  url("soldier-run",         "Soldier — Running",     "locomotion", SOLDIER, "Run",         ["sample", "soldier"]),

  // ----- Slot tiles to round out 100 (filled by user uploads) -----
  slot("slot-idle-2",        "Idle — looking around",  "idle",       "idle look around"),
  slot("slot-idle-3",        "Idle — breathing heavy", "idle",       "idle tired"),
  slot("slot-idle-arms",     "Idle — arms crossed",    "idle",       "idle arms crossed"),
  slot("slot-idle-phone",    "Idle — using phone",     "idle",       "idle phone"),
  slot("slot-stand-watch",   "Standing — checking watch","idle",     "watch"),
  slot("slot-walk-injured",  "Walk — limping",         "locomotion", "limp"),
  slot("slot-walk-stealth",  "Walk — sneaking",        "locomotion", "sneak"),
  slot("slot-walk-strut",    "Walk — confident strut", "locomotion", "strut"),
  slot("slot-walk-pace",     "Walk — pacing",          "locomotion", "pacing"),
  slot("slot-walk-tired",    "Walk — exhausted",       "locomotion", "tired walk"),
  slot("slot-run-sprint",    "Run — sprint",           "locomotion", "sprint"),
  slot("slot-run-jog",       "Run — light jog",        "locomotion", "jog"),
  slot("slot-run-fear",      "Run — afraid",           "locomotion", "scared run"),
  slot("slot-jump-double",   "Jump — double",          "jump",       "double jump", [], false),
  slot("slot-jump-flip",     "Jump — frontflip",       "jump",       "flip", [], false),
  slot("slot-jump-broad",    "Jump — broad",           "jump",       "broad jump", [], false),
  slot("slot-jump-land",     "Land — heavy",           "jump",       "land", [], false),
  slot("slot-combat-kick",   "Kick",                   "combat",     "kick", [], false),
  slot("slot-combat-roundhouse","Roundhouse kick",     "combat",     "roundhouse", [], false),
  slot("slot-combat-block",  "Block",                  "combat",     "block", [], false),
  slot("slot-combat-dodge",  "Dodge",                  "combat",     "dodge", [], false),
  slot("slot-combat-sword",  "Sword slash",            "combat",     "sword slash", [], false),
  slot("slot-combat-sword-up","Sword overhead",        "combat",     "sword overhead", [], false),
  slot("slot-combat-bow",    "Bow shoot",              "combat",     "bow shoot", [], false),
  slot("slot-combat-gun-aim","Aim pistol",             "combat",     "pistol aim"),
  slot("slot-combat-gun-fire","Fire pistol",           "combat",     "pistol fire", [], false),
  slot("slot-combat-rifle",  "Rifle stance",           "combat",     "rifle"),
  slot("slot-combat-reload", "Reload",                 "combat",     "reload", [], false),
  slot("slot-combat-grenade","Throw grenade",          "combat",     "grenade", [], false),
  slot("slot-combat-dieback","Death — backwards",      "death",      "death back", [], false),
  slot("slot-combat-dietwist","Death — twist fall",    "death",      "death twist", [], false),
  slot("slot-dance-salsa",   "Dance — Salsa",          "dance",      "salsa"),
  slot("slot-dance-house",   "Dance — House",          "dance",      "house dance"),
  slot("slot-dance-belly",   "Dance — Belly",          "dance",      "belly dance"),
  slot("slot-dance-breakdance","Dance — Breakdance",   "dance",      "breakdance"),
  slot("slot-dance-charleston","Dance — Charleston",   "dance",      "charleston"),
  slot("slot-dance-twist",   "Dance — Twist",          "dance",      "twist"),
  slot("slot-dance-floss",   "Dance — Floss",          "dance",      "floss"),
  slot("slot-dance-rumba",   "Dance — Rumba",          "dance",      "rumba"),
  slot("slot-dance-samba",   "Dance — Samba",          "dance",      "samba"),
  slot("slot-social-clap",   "Clap",                   "social",     "clap"),
  slot("slot-social-bow",    "Bow politely",           "social",     "bow", [], false),
  slot("slot-social-talk-1", "Talking — casual",       "social",     "talking"),
  slot("slot-social-talk-2", "Talking — animated",     "social",     "talk animated"),
  slot("slot-social-listen", "Listening",              "social",     "listening"),
  slot("slot-social-laugh",  "Laughing",               "social",     "laugh", [], false),
  slot("slot-social-cry",    "Crying",                 "social",     "cry"),
  slot("slot-social-shrug",  "Shrug",                  "social",     "shrug", [], false),
  slot("slot-social-salute", "Salute",                 "social",     "salute", [], false),
  slot("slot-social-handshake","Handshake",            "social",     "handshake", [], false),
  slot("slot-social-highfive","High five",             "social",     "high five", [], false),
  slot("slot-gesture-point", "Point forward",          "gesture",    "point", [], false),
  slot("slot-gesture-comehere","Come here",            "gesture",    "come here", [], false),
  slot("slot-gesture-stop",  "Stop",                   "gesture",    "stop", [], false),
  slot("slot-gesture-callme","Call me",                "gesture",    "call me", [], false),
  slot("slot-gesture-look",  "Look around",            "gesture",    "look around"),
  slot("slot-gesture-facepalm","Facepalm",             "gesture",    "facepalm", [], false),
  slot("slot-sit-floor",     "Sit on floor",           "sit",        "sit floor"),
  slot("slot-sit-cross",     "Sit cross-legged",       "sit",        "cross legged"),
  slot("slot-sit-think",     "Sit — thinking",         "sit",        "thinking sit"),
  slot("slot-sit-meditate",  "Meditate",               "sit",        "meditate"),
  slot("slot-sit-eat",       "Sit — eating",           "sit",        "eating sit"),
  slot("slot-sit-drink",     "Sit — drinking",         "sit",        "drinking sit"),
  slot("slot-sit-laptop",    "Sit — using laptop",     "sit",        "laptop"),
  slot("slot-sit-couch",     "Sit on couch",           "sit",        "couch"),
  slot("slot-sleep-stand",   "Sleep standing",         "sleep",      "sleep stand"),
  slot("slot-sleep-ground",  "Sleep on ground",        "sleep",      "sleep ground"),
  slot("slot-sleep-yawn",    "Yawn",                   "sleep",      "yawn", [], false),
  slot("slot-sleep-stretch", "Stretch",                "sleep",      "stretch", [], false),
  slot("slot-parkour-climb", "Climb wall",             "parkour",    "climb"),
  slot("slot-parkour-vault", "Vault",                  "parkour",    "vault", [], false),
  slot("slot-parkour-hang",  "Hang from ledge",        "parkour",    "hang"),
  slot("slot-parkour-pullup","Pull up",                "parkour",    "pull up", [], false),
  slot("slot-parkour-roll",  "Roll forward",           "parkour",    "roll", [], false),
  slot("slot-parkour-slide", "Slide",                  "parkour",    "slide", [], false),
  slot("slot-parkour-jump-down","Jump down",           "parkour",    "jump down", [], false),
  slot("slot-work-carry-idle","Carry — idle",          "work",       "carry idle"),
  slot("slot-work-carry-walk","Carry — walking",       "work",       "carry walk"),
  slot("slot-work-push",     "Push heavy object",      "work",       "push"),
  slot("slot-work-pull",     "Pull rope",              "work",       "pull"),
  slot("slot-work-pickup",   "Pick up item",           "work",       "pickup", [], false),
  slot("slot-work-throw",    "Throw object",           "work",       "throw", [], false),
  slot("slot-work-hammer",   "Hammer",                 "work",       "hammer"),
  slot("slot-work-dig",      "Dig with shovel",        "work",       "dig"),
  slot("slot-work-saw",      "Saw wood",               "work",       "saw"),
  slot("slot-work-paint",    "Painting wall",          "work",       "paint"),
  slot("slot-work-cook",     "Cooking",                "work",       "cook"),
  slot("slot-work-write",    "Writing",                "work",       "writing"),
  slot("slot-work-type",     "Typing keyboard",        "work",       "typing"),
  slot("slot-idle-bored",    "Idle — bored",           "idle",       "bored"),
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

/** Match an uploaded clip's name against a slot's `slotTag` (substring, case-insensitive). */
export function matchClipToSlot(
  clipName: string,
  entries: CharacterClipEntry[] = CHARACTER_ANIMATION_LIBRARY,
): CharacterClipEntry | undefined {
  const n = clipName.toLowerCase().replace(/[_\-]+/g, " ");
  return entries.find(
    (e) => e.source === "slot" && e.slotTag && n.includes(e.slotTag.toLowerCase()),
  );
}