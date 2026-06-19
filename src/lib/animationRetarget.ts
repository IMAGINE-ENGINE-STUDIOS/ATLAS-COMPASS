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
import { SkeletonUtils } from "three-stdlib";

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

// ---------- bind-pose aware retargeting -------------------------------------

/**
 * Snapshot every bone's local bind transform (the local TRS that is set on
 * the rig BEFORE any animation runs). We treat the current local transform
 * as bind — callers must pass a freshly cloned, unanimated skeleton.
 */
type BindPose = Map<
  string,
  {
    name: string;
    quat: THREE.Quaternion;
    pos: THREE.Vector3;
    bone: THREE.Object3D;
  }
>;

function snapshotBindPose(root: THREE.Object3D): BindPose {
  const map: BindPose = new Map();
  root.traverse((n: any) => {
    if (!n.isBone) return;
    map.set(normalise(n.name), {
      name: n.name,
      quat: n.quaternion.clone(),
      pos: n.position.clone(),
      bone: n,
    });
  });
  return map;
}

/** World Y of a bone — used to scale Hips position tracks across rigs. */
function worldY(bone: THREE.Object3D): number {
  const v = new THREE.Vector3();
  bone.updateWorldMatrix(true, false);
  v.setFromMatrixPosition(bone.matrixWorld);
  return v.y;
}

/**
 * Bind-pose aware retargeting.
 *
 * For each quaternion track we recompute the local rotation so the target
 * bone applies the SAME delta from its bind pose that the source bone
 * applied from ITS bind pose:
 *
 *     Rt(t) = Bt · Bs⁻¹ · Rs(t)
 *
 * For the Hips position track we scale by the ratio of target/source hip
 * height (in world units), and rebase the offset so the source bind hip
 * position maps to the target bind hip position. This avoids the classic
 * "Mixamo cm vs RPM m" explosion as well as the "RPM hip height vs Xbot hip
 * height" foot-clipping.
 *
 * `sourceRoot` MUST be the un-animated source skeleton (the clip's own glTF
 * scene, freshly cloned). `targetRoot` is the rig the clip will play on.
 */
export function retargetClipWithBind(
  clip: THREE.AnimationClip,
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
): THREE.AnimationClip {
  const targetIndex = indexBones(targetRoot);
  const sourceBind = snapshotBindPose(sourceRoot);
  const targetBind = snapshotBindPose(targetRoot);

  // Compute Hips scale once (positions are local-space, so we use parent-relative
  // bind translation magnitudes as a fallback when world Y is unavailable).
  let hipScale = 1;
  let hipDelta = new THREE.Vector3();
  const srcHips = Array.from(sourceBind.values()).find((b) =>
    ALIASES.Hips.some((a) => normalise(a) === normalise(b.name)),
  );
  const tgtHipsName = findTargetBone("Hips", targetIndex);
  const tgtHips = tgtHipsName ? targetBind.get(normalise(tgtHipsName)) : undefined;
  if (srcHips && tgtHips) {
    const sy = worldY(srcHips.bone);
    const ty = worldY(tgtHips.bone);
    if (sy > 1e-3 && ty > 1e-3) hipScale = ty / sy;
    hipDelta = tgtHips.pos.clone().sub(srcHips.pos.clone().multiplyScalar(hipScale));
  }

  const newTracks: THREE.KeyframeTrack[] = [];
  const _q = new THREE.Quaternion();
  const _bsInv = new THREE.Quaternion();

  for (const track of clip.tracks) {
    const dot = track.name.indexOf(".");
    if (dot < 0) { newTracks.push(track); continue; }
    const sourceBoneName = track.name.slice(0, dot);
    const property = track.name.slice(dot);
    const mappedTargetName = findTargetBone(sourceBoneName, targetIndex);
    if (!mappedTargetName) continue;

    const sBind = sourceBind.get(normalise(sourceBoneName));
    const tBind = targetBind.get(normalise(mappedTargetName));

    if (property === ".quaternion" && sBind && tBind && track instanceof THREE.QuaternionKeyframeTrack) {
      const values = (track.values as Float32Array).slice();
      _bsInv.copy(sBind.quat).invert();
      for (let i = 0; i < values.length; i += 4) {
        _q.set(values[i], values[i + 1], values[i + 2], values[i + 3]);
        // Rt = Bt · Bs⁻¹ · Rs
        _q.premultiply(_bsInv).premultiply(tBind.quat);
        values[i] = _q.x; values[i + 1] = _q.y; values[i + 2] = _q.z; values[i + 3] = _q.w;
      }
      newTracks.push(new THREE.QuaternionKeyframeTrack(mappedTargetName + property, track.times.slice() as any, values));
      continue;
    }

    if (property === ".position" && track instanceof THREE.VectorKeyframeTrack) {
      // Only meaningful on the Hips (root motion). For every other bone the
      // bone-local translation is bind data, not animation, so dropping it
      // is safer than scaling it across rigs.
      const isHips = ALIASES.Hips.some((a) => normalise(a) === normalise(sourceBoneName));
      if (!isHips) continue;
      const values = (track.values as Float32Array).slice();
      for (let i = 0; i < values.length; i += 3) {
        values[i]     = values[i]     * hipScale + hipDelta.x;
        values[i + 1] = values[i + 1] * hipScale + hipDelta.y;
        values[i + 2] = values[i + 2] * hipScale + hipDelta.z;
      }
      newTracks.push(new THREE.VectorKeyframeTrack(mappedTargetName + property, track.times.slice() as any, values));
      continue;
    }

    // Scale tracks etc. — pass through with renamed bone.
    const cloned = track.clone();
    cloned.name = mappedTargetName + property;
    newTracks.push(cloned);
  }

  return new THREE.AnimationClip(clip.name, clip.duration, newTracks, clip.blendMode);
}

// ---------- proper SkeletonUtils-based retargeting --------------------------

function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((n: any) => {
    if (!found && n.isSkinnedMesh) found = n as THREE.SkinnedMesh;
  });
  return found;
}

/**
 * Build `{ targetBoneName: sourceBoneName }` using the humanoid alias table.
 * Only includes target bones we could resolve to an existing source bone.
 */
function buildBoneNameMap(
  targetSkel: THREE.Skeleton,
  sourceSkel: THREE.Skeleton,
): { names: Record<string, string>; hipTargetName: string | null } {
  const sourceIndex = new Map<string, string>();
  for (const b of sourceSkel.bones) sourceIndex.set(normalise(b.name), b.name);

  const names: Record<string, string> = {};
  let hipTargetName: string | null = null;

  for (const tBone of targetSkel.bones) {
    const tNorm = normalise(tBone.name);
    // Direct hit on normalised name.
    let srcName = sourceIndex.get(tNorm);
    if (!srcName) {
      // Walk alias table.
      for (const aliases of Object.values(ALIASES)) {
        if (aliases.some((a) => normalise(a) === tNorm)) {
          for (const alias of aliases) {
            const hit = sourceIndex.get(normalise(alias));
            if (hit) { srcName = hit; break; }
          }
        }
        if (srcName) break;
      }
    }
    if (srcName) {
      names[tBone.name] = srcName;
      if (!hipTargetName && ALIASES.Hips.some((a) => normalise(a) === tNorm)) {
        hipTargetName = tBone.name;
      }
    }
  }
  return { names, hipTargetName };
}

/**
 * Properly retarget a clip from `sourceRoot` (the rig the clip was authored on)
 * onto `targetRoot` (the rig you want to play it on).
 *
 * Internally uses three-stdlib's `SkeletonUtils.retargetClip`, which samples
 * the source mixer frame-by-frame and writes correct LOCAL rotations on the
 * target skeleton via world-space delta math. This handles different bind
 * poses, different bone scales, and different unit systems (Mixamo cm vs
 * RPM m), which is what naive track-renaming cannot fix.
 *
 * Output track names are rewritten to plain "<boneName>.property" so a
 * standard `new AnimationMixer(targetRoot)` resolves them by node name —
 * no `.bones[...]` selector required.
 */
export function retargetClipProper(
  clip: THREE.AnimationClip,
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
): THREE.AnimationClip | null {
  const tMesh = findSkinnedMesh(targetRoot);
  const sMesh = findSkinnedMesh(sourceRoot);
  if (!tMesh || !sMesh || !tMesh.skeleton || !sMesh.skeleton) return null;

  const { names, hipTargetName } = buildBoneNameMap(tMesh.skeleton, sMesh.skeleton);
  if (Object.keys(names).length === 0) return null;

  let baked: THREE.AnimationClip;
  try {
    // SkeletonUtils expects: retargetClip(target, source, clip, options).
    // `target` and `source` may each be a SkinnedMesh (has .skeleton) or a
    // helper Object3D — SkinnedMesh is the simpler/faster path.
    baked = (SkeletonUtils as any).retargetClip(tMesh, sMesh, clip, {
      fps: 30,
      names,
      hip: hipTargetName ?? "Hips",
      useFirstFramePosition: true,
      preserveHipPosition: false,
    });
  } catch (err) {
    console.warn("[retarget] SkeletonUtils.retargetClip failed", err);
    return null;
  }

  // Strip the ".bones[name].property" prefix so this clip plays through a
  // standard AnimationMixer rooted at `targetRoot` (which is a Group, not
  // the SkinnedMesh that owns .skeleton).
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of baked.tracks) {
    const m = /^\.bones\[(.+?)\]\.(.+)$/.exec(t.name);
    if (m) {
      const cloned = t.clone();
      cloned.name = `${m[1]}.${m[2]}`;
      tracks.push(cloned);
    } else {
      tracks.push(t);
    }
  }
  return new THREE.AnimationClip(clip.name, baked.duration, tracks, baked.blendMode);
}