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

// ---------- catalogue --------------------------------------------------------

export const CHARACTER_ANIMATION_LIBRARY: CharacterClipEntry[] = [
  // Only clips that play reliably on the default Xbot rig. Additional
  // clips can be added at runtime via the gallery's Upload button.
  builtin("xbot-idle", "Idle",    "idle",       "idle", ["calm", "loop"]),
  builtin("xbot-walk", "Walking", "locomotion", "walk", ["loop", "forward"]),
  builtin("xbot-run",  "Running", "locomotion", "run",  ["loop", "forward", "fast"]),
];

  // ===== Ready Player Me — Mixamo-rigged animation library =====
  // Source: github.com/readyplayerme/animation-library (CC-BY 4.0).
  // Each entry points to a hosted .glb whose first AnimationClip
  // is played by retargeting onto the active rig.
  { id: "rpm-f-dances-001", name: "Dances 001", category: "dance", tags: ["dance", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/F_Dances_001.glb", loop: true },
  { id: "rpm-f-dances-004", name: "Dances 004", category: "dance", tags: ["dance", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/F_Dances_004.glb", loop: true },
  { id: "rpm-f-dances-005", name: "Dances 005", category: "dance", tags: ["dance", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/F_Dances_005.glb", loop: true },
  { id: "rpm-f-dances-006", name: "Dances 006", category: "dance", tags: ["dance", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/F_Dances_006.glb", loop: true },
  { id: "rpm-f-dances-007", name: "Dances 007", category: "dance", tags: ["dance", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/F_Dances_007.glb", loop: true },
  { id: "rpm-m-dances-001", name: "Dances 001*", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_001.glb", loop: true },
  { id: "rpm-m-dances-002", name: "Dances 002", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_002.glb", loop: true },
  { id: "rpm-m-dances-003", name: "Dances 003", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_003.glb", loop: true },
  { id: "rpm-m-dances-004", name: "Dances 004*", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_004.glb", loop: true },
  { id: "rpm-m-dances-005", name: "Dances 005*", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_005.glb", loop: true },
  { id: "rpm-m-dances-006", name: "Dances 006*", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_006.glb", loop: true },
  { id: "rpm-m-dances-007", name: "Dances 007*", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_007.glb", loop: true },
  { id: "rpm-m-dances-008", name: "Dances 008", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_008.glb", loop: true },
  { id: "rpm-m-dances-009", name: "Dances 009", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_009.glb", loop: true },
  { id: "rpm-m-dances-011", name: "Dances 011", category: "dance", tags: ["dance", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/dance/M_Dances_011.glb", loop: true },
  { id: "rpm-f-talking-variations-001", name: "Talking Variations 001", category: "social", tags: ["social", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/F_Talking_Variations_001.glb", loop: true },
  { id: "rpm-f-talking-variations-002", name: "Talking Variations 002", category: "social", tags: ["social", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/F_Talking_Variations_002.glb", loop: true },
  { id: "rpm-f-talking-variations-003", name: "Talking Variations 003", category: "social", tags: ["social", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/F_Talking_Variations_003.glb", loop: true },
  { id: "rpm-f-talking-variations-004", name: "Talking Variations 004", category: "social", tags: ["social", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/F_Talking_Variations_004.glb", loop: true },
  { id: "rpm-f-talking-variations-005", name: "Talking Variations 005", category: "social", tags: ["social", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/F_Talking_Variations_005.glb", loop: true },
  { id: "rpm-f-talking-variations-006", name: "Talking Variations 006", category: "social", tags: ["social", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/F_Talking_Variations_006.glb", loop: true },
  { id: "rpm-m-standing-expressions-001", name: "Standing Expressions 001", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_001.glb", loop: true },
  { id: "rpm-m-standing-expressions-002", name: "Standing Expressions 002", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_002.glb", loop: true },
  { id: "rpm-m-standing-expressions-004", name: "Standing Expressions 004", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_004.glb", loop: true },
  { id: "rpm-m-standing-expressions-005", name: "Standing Expressions 005", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_005.glb", loop: true },
  { id: "rpm-m-standing-expressions-006", name: "Standing Expressions 006", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_006.glb", loop: true },
  { id: "rpm-m-standing-expressions-007", name: "Standing Expressions 007", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_007.glb", loop: true },
  { id: "rpm-m-standing-expressions-008", name: "Standing Expressions 008", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_008.glb", loop: true },
  { id: "rpm-m-standing-expressions-009", name: "Standing Expressions 009", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_009.glb", loop: true },
  { id: "rpm-m-standing-expressions-010", name: "Standing Expressions 010", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_010.glb", loop: true },
  { id: "rpm-m-standing-expressions-011", name: "Standing Expressions 011", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_011.glb", loop: true },
  { id: "rpm-m-standing-expressions-012", name: "Standing Expressions 012", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_012.glb", loop: true },
  { id: "rpm-m-standing-expressions-013", name: "Standing Expressions 013", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_013.glb", loop: true },
  { id: "rpm-m-standing-expressions-014", name: "Standing Expressions 014", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_014.glb", loop: true },
  { id: "rpm-m-standing-expressions-015", name: "Standing Expressions 015", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_015.glb", loop: true },
  { id: "rpm-m-standing-expressions-016", name: "Standing Expressions 016", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_016.glb", loop: true },
  { id: "rpm-m-standing-expressions-017", name: "Standing Expressions 017", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_017.glb", loop: true },
  { id: "rpm-m-standing-expressions-018", name: "Standing Expressions 018", category: "gesture", tags: ["gesture", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Standing_Expressions_018.glb", loop: true },
  { id: "rpm-m-talking-variations-001", name: "Talking Variations 001*", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_001.glb", loop: true },
  { id: "rpm-m-talking-variations-002", name: "Talking Variations 002*", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_002.glb", loop: true },
  { id: "rpm-m-talking-variations-003", name: "Talking Variations 003*", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_003.glb", loop: true },
  { id: "rpm-m-talking-variations-004", name: "Talking Variations 004*", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_004.glb", loop: true },
  { id: "rpm-m-talking-variations-005", name: "Talking Variations 005*", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_005.glb", loop: true },
  { id: "rpm-m-talking-variations-006", name: "Talking Variations 006*", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_006.glb", loop: true },
  { id: "rpm-m-talking-variations-007", name: "Talking Variations 007", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_007.glb", loop: true },
  { id: "rpm-m-talking-variations-008", name: "Talking Variations 008", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_008.glb", loop: true },
  { id: "rpm-m-talking-variations-009", name: "Talking Variations 009", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_009.glb", loop: true },
  { id: "rpm-m-talking-variations-010", name: "Talking Variations 010", category: "social", tags: ["social", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/expression/M_Talking_Variations_010.glb", loop: true },
  { id: "rpm-f-standing-idle-001", name: "Standing Idle 001", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_001.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-001", name: "Standing Idle Variations 001", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_001.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-002", name: "Standing Idle Variations 002", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_002.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-003", name: "Standing Idle Variations 003", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_003.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-004", name: "Standing Idle Variations 004", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_004.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-005", name: "Standing Idle Variations 005", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_005.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-006", name: "Standing Idle Variations 006", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_006.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-007", name: "Standing Idle Variations 007", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_007.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-008", name: "Standing Idle Variations 008", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_008.glb", loop: true },
  { id: "rpm-f-standing-idle-variations-009", name: "Standing Idle Variations 009", category: "idle", tags: ["idle", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/F_Standing_Idle_Variations_009.glb", loop: true },
  { id: "rpm-m-standing-idle-001", name: "Standing Idle 001*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_001.glb", loop: true },
  { id: "rpm-m-standing-idle-002", name: "Standing Idle 002", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_002.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-001", name: "Standing Idle Variations 001*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_001.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-002", name: "Standing Idle Variations 002*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_002.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-003", name: "Standing Idle Variations 003*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_003.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-004", name: "Standing Idle Variations 004*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_004.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-005", name: "Standing Idle Variations 005*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_005.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-006", name: "Standing Idle Variations 006*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_006.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-007", name: "Standing Idle Variations 007*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_007.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-008", name: "Standing Idle Variations 008*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_008.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-009", name: "Standing Idle Variations 009*", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_009.glb", loop: true },
  { id: "rpm-m-standing-idle-variations-010", name: "Standing Idle Variations 010", category: "idle", tags: ["idle", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/idle/M_Standing_Idle_Variations_010.glb", loop: true },
  { id: "rpm-f-crouch-strafe-left", name: "Crouch Strafe Left", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Crouch_Strafe_Left.glb", loop: true },
  { id: "rpm-f-crouch-strafe-right", name: "Crouch Strafe Right", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Crouch_Strafe_Right.glb", loop: true },
  { id: "rpm-f-crouch-walk-001", name: "Crouch Walk 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Crouch_Walk_001.glb", loop: true },
  { id: "rpm-f-crouchedwalk-backwards-001", name: "CrouchedWalk Backwards 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_CrouchedWalk_Backwards_001.glb", loop: true },
  { id: "rpm-f-falling-idle-000", name: "Falling Idle 000", category: "jump", tags: ["jump", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Falling_Idle_000.glb", loop: true },
  { id: "rpm-f-falling-idle-001", name: "Falling Idle 001", category: "jump", tags: ["jump", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Falling_Idle_001.glb", loop: true },
  { id: "rpm-f-jog-001", name: "Jog 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Jog_001.glb", loop: true },
  { id: "rpm-f-jog-backwards-001", name: "Jog Backwards 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Jog_Backwards_001.glb", loop: true },
  { id: "rpm-f-jog-jump-small-001", name: "Jog Jump Small 001", category: "jump", tags: ["jump", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Jog_Jump_Small_001.glb", loop: true },
  { id: "rpm-f-jog-strafe-left-002", name: "Jog Strafe Left 002", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Jog_Strafe_Left_002.glb", loop: true },
  { id: "rpm-f-jog-strafe-right-002", name: "Jog Strafe Right 002", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Jog_Strafe_Right_002.glb", loop: true },
  { id: "rpm-f-run-001", name: "Run 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Run_001.glb", loop: true },
  { id: "rpm-f-run-backwards-001", name: "Run Backwards 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Run_Backwards_001.glb", loop: true },
  { id: "rpm-f-run-jump-001", name: "Run Jump 001", category: "jump", tags: ["jump", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Run_Jump_001.glb", loop: true },
  { id: "rpm-f-run-strafe-left-001", name: "Run Strafe Left 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Run_Strafe_Left_001.glb", loop: true },
  { id: "rpm-f-run-strafe-right-001", name: "Run Strafe Right 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Run_Strafe_Right_001.glb", loop: true },
  { id: "rpm-f-walk-002", name: "Walk 002", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Walk_002.glb", loop: true },
  { id: "rpm-f-walk-003", name: "Walk 003", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Walk_003.glb", loop: true },
  { id: "rpm-f-walk-backwards-001", name: "Walk Backwards 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Walk_Backwards_001.glb", loop: true },
  { id: "rpm-f-walk-jump-001", name: "Walk Jump 001", category: "jump", tags: ["jump", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Walk_Jump_001.glb", loop: true },
  { id: "rpm-f-walk-jump-002", name: "Walk Jump 002", category: "jump", tags: ["jump", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Walk_Jump_002.glb", loop: true },
  { id: "rpm-f-walk-strafe-left-001", name: "Walk Strafe Left 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Walk_Strafe_Left_001.glb", loop: true },
  { id: "rpm-f-walk-strafe-right-001", name: "Walk Strafe Right 001", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "female"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/F_Walk_Strafe_Right_001.glb", loop: true },
  { id: "rpm-m-crouch-strafe-left-002", name: "Crouch Strafe Left 002", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/M_Crouch_Strafe_Left_002.glb", loop: true },
  { id: "rpm-m-crouch-strafe-right-002", name: "Crouch Strafe Right 002", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/M_Crouch_Strafe_Right_002.glb", loop: true },
  { id: "rpm-m-crouch-walk-003", name: "Crouch Walk 003", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/M_Crouch_Walk_003.glb", loop: true },
  { id: "rpm-m-crouchedwalk-backwards-002", name: "CrouchedWalk Backwards 002", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/M_CrouchedWalk_Backwards_002.glb", loop: true },
  { id: "rpm-m-falling-idle-002", name: "Falling Idle 002", category: "jump", tags: ["jump", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/M_Falling_Idle_002.glb", loop: true },
  { id: "rpm-m-jog-001", name: "Jog 001*", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/M_Jog_001.glb", loop: true },
  { id: "rpm-m-jog-003", name: "Jog 003", category: "locomotion", tags: ["locomotion", "mixamo", "rpm", "male"], source: "url", url: "https://raw.githubusercontent.com/readyplayerme/animation-library/master/masculine/glb/locomotion/M_Jog_003.glb", loop: true },

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
  if (/walk|run|sprint|jog|limp|strut|crouch|pace/.test(n)) return "locomotion";
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