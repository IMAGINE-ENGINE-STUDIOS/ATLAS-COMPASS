/**
 * Animation retargeting helpers.
 *
 * The character library mixes clips from several different rigs (Xbot,
 * RobotExpressive, Soldier, user uploads). The track names embedded in each
 * `AnimationClip` reference the source rig's bone names — e.g. Mixamo exports
 * use `mixamorigHips.position`. When the active rig uses a different naming
 * scheme, the tracks must be renamed before they can drive the new skeleton.
 *
 * This module:
 *   - exposes a humanoid alias table (common <-> Mixamo <-> three.js examples);
 *   - rewrites a clip's track names so unknown bones are dropped (not played
 *     against bones that don't exist), and known aliases are mapped to the
 *     target rig's actual bone names;
 *   - never throws — clips that can't be retargeted just play whatever tracks
 *     do match.
 */

import * as THREE from "three";

/** Canonical humanoid bone keys we care about. */
type HumanoidBone =
  | "Hips" | "Spine" | "Spine1" | "Spine2" | "Neck" | "Head"
  | "LeftShoulder" | "LeftArm" | "LeftForeArm" | "LeftHand"
  | "RightShoulder" | "RightArm" | "RightForeArm" | "RightHand"
  | "LeftUpLeg" | "LeftLeg" | "LeftFoot" | "LeftToeBase"
  | "RightUpLeg" | "RightLeg" | "RightFoot" | "RightToeBase";

/** Maps a normalised bone key → an ordered list of probable bone names in the wild. */
const ALIASES: Record<HumanoidBone, string[]> = {
  Hips:          ["Hips", "mixamorigHips", "Root", "Armature_Hips"],
  Spine:         ["Spine", "mixamorigSpine"],
  Spine1:        ["Spine1", "mixamorigSpine1", "Chest"],
  Spine2:        ["Spine2", "mixamorigSpine2", "UpperChest"],
  Neck:          ["Neck", "mixamorigNeck"],
  Head:          ["Head", "mixamorigHead"],
  LeftShoulder:  ["LeftShoulder", "mixamorigLeftShoulder"],
  LeftArm:       ["LeftArm", "mixamorigLeftArm", "LeftUpperArm"],
  LeftForeArm:   ["LeftForeArm", "mixamorigLeftForeArm", "LeftLowerArm"],
  LeftHand:      ["LeftHand", "mixamorigLeftHand"],
  RightShoulder: ["RightShoulder", "mixamorigRightShoulder"],
  RightArm:      ["RightArm", "mixamorigRightArm", "RightUpperArm"],
  RightForeArm:  ["RightForeArm", "mixamorigRightForeArm", "RightLowerArm"],
  RightHand:     ["RightHand", "mixamorigRightHand"],
  LeftUpLeg:     ["LeftUpLeg", "mixamorigLeftUpLeg", "LeftThigh"],
  LeftLeg:       ["LeftLeg", "mixamorigLeftLeg", "LeftShin"],
  LeftFoot:      ["LeftFoot", "mixamorigLeftFoot"],
  LeftToeBase:   ["LeftToeBase", "mixamorigLeftToeBase", "LeftToes"],
  RightUpLeg:    ["RightUpLeg", "mixamorigRightUpLeg", "RightThigh"],
  RightLeg:      ["RightLeg", "mixamorigRightLeg", "RightShin"],
  RightFoot:    ["RightFoot", "mixamorigRightFoot"],
  RightToeBase: ["RightToeBase", "mixamorigRightToeBase", "RightToes"],
};

/** Strip mixamorig/prefixes, collapse case, ignore separators. */
function normalise(name: string): string {
  return name
    .replace(/^mixamorig:?/i, "")
    .replace(/[_\-:]/g, "")
    .toLowerCase();
}

/** Build a fast lookup of every bone in a skeleton, keyed by normalised name. */
function indexBones(root: THREE.Object3D): Map<string, string> {
  const map = new Map<string, string>();
  root.traverse((n) => {
    if ((n as any).isBone || n.name) {
      map.set(normalise(n.name), n.name);
    }
  });
  return map;
}

/** Pick the best target bone name for a given source bone name. */
function findTargetBone(
  sourceName: string,
  targetIndex: Map<string, string>,
): string | null {
  // 1. Direct match on normalised name.
  const norm = normalise(sourceName);
  const direct = targetIndex.get(norm);
  if (direct) return direct;

  // 2. Walk alias table — if the source matches any alias for a humanoid bone,
  //    try every other alias for the same bone against the target.
  for (const aliases of Object.values(ALIASES)) {
    if (aliases.some((a) => normalise(a) === norm)) {
      for (const alias of aliases) {
        const found = targetIndex.get(normalise(alias));
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * Returns a NEW `AnimationClip` whose track names are remapped to bone names
 * that exist on `targetRoot`. Tracks that can't be mapped are dropped.
 * The source clip is left untouched.
 */
export function retargetClip(
  clip: THREE.AnimationClip,
  targetRoot: THREE.Object3D,
): THREE.AnimationClip {
  const index = indexBones(targetRoot);
  const newTracks: THREE.KeyframeTrack[] = [];
  let dropped = 0;

  for (const track of clip.tracks) {
    // Track names look like "BoneName.position" or "BoneName.quaternion".
    const dot = track.name.indexOf(".");
    if (dot < 0) {
      newTracks.push(track);
      continue;
    }
    const bone = track.name.slice(0, dot);
    const property = track.name.slice(dot);
    const mapped = findTargetBone(bone, index);
    if (!mapped) {
      dropped++;
      continue;
    }
    if (mapped === bone) {
      newTracks.push(track);
    } else {
      const cloned = track.clone();
      cloned.name = mapped + property;
      newTracks.push(cloned);
    }
  }

  if (dropped > 0 && newTracks.length === 0) {
    console.warn(`[retarget] no tracks survived for clip "${clip.name}"`);
  }

  const out = new THREE.AnimationClip(clip.name, clip.duration, newTracks, clip.blendMode);
  return out;
}