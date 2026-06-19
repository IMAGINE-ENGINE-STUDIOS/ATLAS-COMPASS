/**
 * Automated retarget-quality scorer.
 *
 * Given a baked AnimationClip and a target rig, runs the clip through a
 * temporary mixer, samples per-frame bone world transforms, and grades:
 *
 *   - footSlide  : horizontal speed of each foot during ground contact
 *                  (frames where that foot is within ε of its lowest Y).
 *                  Real walks/dances keep the planted foot stationary;
 *                  a sliding foot means the hip translation/scale is wrong.
 *   - hipDrift   : in-place clips should loop with start≈end hip XZ. We
 *                  report end-vs-start XZ distance, normalised by rig height.
 *   - quatJitter : worst per-frame angular jump on any bone (rad). Large
 *                  jumps indicate axis/bind-pose mismatch on that bone.
 *
 * Returns numeric metrics, a coarse grade, the issues seen, and concrete
 * remediation suggestions wired to options the retargeter can re-bake with.
 */

import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

export type QualityGrade = "good" | "warn" | "bad";

export interface ClipQualityReport {
  grade: QualityGrade;
  footSlideMps: number;       // average planted-foot horizontal speed (m/s)
  hipDriftMeters: number;     // start→end hip XZ delta (m)
  worstQuatJumpRad: number;   // largest single-frame angular jump (rad)
  worstQuatBone: string | null;
  issues: string[];
  suggestions: string[];
  /** Options the retargeter can re-apply to try to repair the clip. */
  repair: {
    preserveHipPosition?: boolean;
    zeroHipXZ?: boolean;
    excludeBones?: string[];
  };
}

const FPS = 24;
const FOOT_PATTERNS = [/leftfoot$/i, /lfoot$/i, /rightfoot$/i, /rfoot$/i];
const HIP_PATTERNS  = [/^hips$/i, /^mixamorighips$/i, /pelvis/i];

function findBone(skel: THREE.Skeleton, patterns: RegExp[]): THREE.Bone | null {
  for (const b of skel.bones) {
    const n = b.name.replace(/[_\-:]/g, "");
    if (patterns.some((p) => p.test(n))) return b;
  }
  return null;
}

function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((n: any) => { if (!found && n.isSkinnedMesh) found = n; });
  return found;
}

function rigHeight(skel: THREE.Skeleton): number {
  let minY = Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const b of skel.bones) {
    b.updateWorldMatrix(true, false);
    v.setFromMatrixPosition(b.matrixWorld);
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  const h = maxY - minY;
  return h > 1e-3 ? h : 1.8;
}

export function scoreClipQuality(
  clip: THREE.AnimationClip,
  targetRoot: THREE.Object3D,
): ClipQualityReport {
  // Work on an isolated clone so we never disturb the live preview's
  // skeleton (the live mixer would fight us otherwise).
  const root = SkeletonUtils.clone(targetRoot);
  const mesh = findSkinnedMesh(root);
  const skel = mesh?.skeleton ?? null;

  const empty: ClipQualityReport = {
    grade: "warn",
    footSlideMps: 0,
    hipDriftMeters: 0,
    worstQuatJumpRad: 0,
    worstQuatBone: null,
    issues: ["No skinned mesh found on target rig"],
    suggestions: ["Ensure the rig has a SkinnedMesh (Mixamo/RPM/GLTF default)"],
    repair: {},
  };
  if (!skel) return empty;

  const height = rigHeight(skel);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();

  const dur = Math.max(0.1, clip.duration);
  const nFrames = Math.min(48, Math.max(8, Math.round(dur * FPS)));
  const dt = dur / nFrames;

  const leftFoot  = findBone(skel, [FOOT_PATTERNS[0], FOOT_PATTERNS[1]]);
  const rightFoot = findBone(skel, [FOOT_PATTERNS[2], FOOT_PATTERNS[3]]);
  const hip       = findBone(skel, HIP_PATTERNS) ?? skel.bones[0];

  const lPos: THREE.Vector3[] = [];
  const rPos: THREE.Vector3[] = [];
  const hPos: THREE.Vector3[] = [];
  const lastQuat = new Map<string, THREE.Quaternion>();
  const jumps = new Map<string, number>();
  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();

  for (let i = 0; i < nFrames; i++) {
    mixer.setTime(i * dt);
    root.updateMatrixWorld(true);
    if (leftFoot)  { tmp.setFromMatrixPosition(leftFoot.matrixWorld);  lPos.push(tmp.clone()); }
    if (rightFoot) { tmp.setFromMatrixPosition(rightFoot.matrixWorld); rPos.push(tmp.clone()); }
    if (hip)       { tmp.setFromMatrixPosition(hip.matrixWorld);       hPos.push(tmp.clone()); }
    for (const b of skel.bones) {
      q.copy(b.quaternion);
      const prev = lastQuat.get(b.name);
      if (prev) {
        const d = Math.abs(prev.angleTo(q));
        const cur = jumps.get(b.name) ?? 0;
        if (d > cur) jumps.set(b.name, d);
      }
      lastQuat.set(b.name, q.clone());
    }
  }
  mixer.uncacheClip(clip);

  // Foot slide: while a foot is at its low-Y plant zone, accumulate horizontal speed.
  const footSlide = (samples: THREE.Vector3[]): number => {
    if (samples.length < 2) return 0;
    const ys = samples.map((s) => s.y);
    const minY = Math.min(...ys);
    const plantEps = 0.04 * height;
    let totalSpeed = 0, plantedFrames = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].y - minY > plantEps) continue;
      const dx = samples[i].x - samples[i - 1].x;
      const dz = samples[i].z - samples[i - 1].z;
      totalSpeed += Math.hypot(dx, dz) / dt;
      plantedFrames++;
    }
    return plantedFrames > 0 ? totalSpeed / plantedFrames : 0;
  };
  const footSlideMps = Math.max(footSlide(lPos), footSlide(rPos));

  // Hip drift: end-vs-start XZ for in-place clips.
  let hipDrift = 0;
  if (hPos.length >= 2) {
    const a = hPos[0], b = hPos[hPos.length - 1];
    hipDrift = Math.hypot(b.x - a.x, b.z - a.z);
  }

  // Worst-bone quaternion jump.
  let worstBone: string | null = null, worstJump = 0;
  for (const [name, v] of jumps) {
    if (v > worstJump) { worstJump = v; worstBone = name; }
  }

  // ----- thresholds (normalised to rig height) -----
  const slideRel = footSlideMps / Math.max(0.5, height);  // m/s per meter of rig height
  const driftRel = hipDrift / Math.max(0.5, height);

  const issues: string[] = [];
  const suggestions: string[] = [];
  const repair: ClipQualityReport["repair"] = {};

  if (slideRel > 0.35) {
    issues.push(`Foot sliding ${footSlideMps.toFixed(2)} m/s during ground contact`);
    suggestions.push("Re-bake with preserveHipPosition (drop forward translation, root motion stays at origin)");
    repair.preserveHipPosition = true;
  }
  if (driftRel > 0.20) {
    issues.push(`Hip drifted ${hipDrift.toFixed(2)} m by clip end — in-place loop broken`);
    suggestions.push("Zero the hip XZ translation track (keeps height, removes wander)");
    repair.zeroHipXZ = true;
  }
  if (worstJump > 1.6 && worstBone) {
    issues.push(`Bone "${worstBone}" jumps ${worstJump.toFixed(2)} rad/frame — axis/bind mismatch`);
    suggestions.push(`Exclude "${worstBone}" from the retarget (lets target bind hold instead of distorting)`);
    repair.excludeBones = [worstBone];
  }

  let grade: QualityGrade = "good";
  if (issues.length === 1) grade = "warn";
  if (issues.length >= 2 || slideRel > 0.7 || driftRel > 0.5 || worstJump > 2.6) grade = "bad";

  return {
    grade,
    footSlideMps,
    hipDriftMeters: hipDrift,
    worstQuatJumpRad: worstJump,
    worstQuatBone: worstBone,
    issues,
    suggestions,
    repair,
  };
}

/**
 * Apply the report's repair recommendations to a baked clip (no re-bake
 * required for these — they're cheap in-place track edits).
 */
export function applyClipRepairs(
  clip: THREE.AnimationClip,
  repair: ClipQualityReport["repair"],
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    const dot = t.name.indexOf(".");
    const bone = dot >= 0 ? t.name.slice(0, dot) : t.name;
    const prop = dot >= 0 ? t.name.slice(dot + 1) : "";
    if (repair.excludeBones?.some((b) => bone === b)) continue;
    if ((repair.preserveHipPosition || repair.zeroHipXZ) && /position$/i.test(prop) && /hips?$|pelvis/i.test(bone)) {
      if (t instanceof THREE.VectorKeyframeTrack) {
        const values = (t.values as Float32Array).slice();
        for (let i = 0; i < values.length; i += 3) {
          if (repair.preserveHipPosition) {
            values[i] = 0;
            values[i + 2] = 0;
          } else if (repair.zeroHipXZ) {
            values[i] = 0;
            values[i + 2] = 0;
          }
        }
        tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times.slice() as any, values));
        continue;
      }
    }
    tracks.push(t);
  }
  return new THREE.AnimationClip(clip.name + "*repaired", clip.duration, tracks, clip.blendMode);
}