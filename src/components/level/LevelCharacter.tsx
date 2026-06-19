import { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { CharacterObject } from "@/lib/levelTypes";
import { modelForwardYawOffset } from "@/lib/modelOrientation";
import { applyPose } from "@/lib/rigSaves";
import { retargetClipProper } from "@/lib/animationRetarget";

/**
 * Rigged character renderer.
 *
 * - Clones the source glTF with SkeletonUtils so each instance has its own
 *   skeleton (multiple characters in the scene don't share bones).
 * - Enables shadows on every skinned mesh.
 * - Plays the named `currentAnimation` clip (or the first available) at
 *   `animationSpeed`, crossfading on swap. Honors `paused`.
 */
export default function LevelCharacter({
  obj,
  onSelect,
}: {
  obj: CharacterObject;
  onSelect?: (id: string) => void;
}) {
  const gltf = useGLTF(obj.url);

  // Per-instance skeleton clone — required for SkinnedMesh.
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const groupRef = useRef<THREE.Group>(null);

  // Bind GLTF animations to OUR cloned root.
  const { actions, names, mixer } = useAnimations(gltf.animations, cloned);

  useEffect(() => {
    cloned.traverse((n: any) => {
      if (n.isMesh || n.isSkinnedMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        n.frustumCulled = false; // prevent skinned-mesh culling pop-out
      }
    });
  }, [cloned]);

  // Apply any author-saved bone pose from the Rig Controller Room.
  // We re-apply whenever the pose array, current clip, or pause state
  // changes so a paused character with no clip still shows the saved pose
  // (the mixer would otherwise overwrite local transforms on the next tick).
  useEffect(() => {
    if (!obj.pose || obj.pose.length === 0) return;
    try { applyPose(cloned, obj.pose as any); } catch {}
  }, [cloned, obj.pose, obj.currentAnimation, obj.paused]);

  // Drive the current animation clip.
  useEffect(() => {
    if (!actions || names.length === 0) return;
    const wanted =
      (obj.currentAnimation && actions[obj.currentAnimation]) ||
      actions[names[0]];
    if (!wanted) return;

    // Fade out everything else, fade in target.
    const fade = obj.crossfade ?? 0.25;
    Object.values(actions).forEach((a) => {
      if (a && a !== wanted && a.isRunning()) a.fadeOut(fade);
    });
    wanted.reset().fadeIn(fade).play();
    wanted.timeScale = obj.animationSpeed ?? 1;
    wanted.paused = !!obj.paused;
    return () => { wanted.fadeOut(fade); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, names.join("|"), obj.currentAnimation]);

  // Live updates: speed / pause without restarting the clip.
  useEffect(() => {
    const name = obj.currentAnimation || names[0];
    const a = name ? actions[name] : null;
    if (!a) return;
    a.timeScale = obj.animationSpeed ?? 1;
    a.paused = !!obj.paused;
  }, [actions, names, obj.animationSpeed, obj.paused, obj.currentAnimation]);

  // Stash the clip list on the cloned root so the inspector can read it
  // back without re-loading the glTF.
  useEffect(() => {
    (cloned as any).userData.__animationNames = names;
    (cloned as any).userData.__objId = obj.id;
    (cloned as any).userData.__actions = actions;
    (cloned as any).userData.__mixer = mixer;
  }, [cloned, names, obj.id, actions, mixer]);

  return (
    <group
      ref={groupRef}
      visible={obj.visible}
      onClick={(e: any) => {
        e.stopPropagation();
        onSelect?.(obj.id);
      }}
    >
      <group rotation={[0, modelForwardYawOffset(obj.url), 0]}>
        <primitive object={cloned} />
        {obj.externalClipUrl && (
          <ExternalClipPlayer
            key={obj.externalClipUrl}
            url={obj.externalClipUrl}
            target={cloned}
            mixer={mixer}
            actions={actions as any}
            speed={obj.animationSpeed ?? 1}
            paused={!!obj.paused}
            crossfade={obj.crossfade ?? 0.25}
          />
        )}
      </group>
    </group>
  );
}

/**
 * Loads an external .glb (e.g. Ready Player Me / Mixamo clip pack), retargets
 * its first clip onto the parent character's existing skeleton, and plays it
 * through that character's mixer. Never mutates the host model — this is the
 * path used by the Animation Gallery so picking a clip can't crash by
 * swapping the host glTF.
 */
function ExternalClipPlayer({
  url,
  target,
  mixer,
  actions,
  speed,
  paused,
  crossfade,
}: {
  url: string;
  target: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction | null>;
  speed: number;
  paused: boolean;
  crossfade: number;
}) {
  const src = useGLTF(url);
  const actionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!src?.scene || !src.animations?.length || !mixer) return;
    let cancelled = false;
    const sourceClone = SkeletonUtils.clone(src.scene);
    let retargeted: THREE.AnimationClip | null = null;
    try {
      retargeted = retargetClipProper(src.animations[0], sourceClone, target);
    } catch (err) {
      console.warn("[ExternalClipPlayer] retarget failed", err);
    }
    if (cancelled || !retargeted) return;

    // Fade out any builtin actions still running on the host mixer.
    Object.values(actions || {}).forEach((a) => {
      if (a && a.isRunning()) a.fadeOut(crossfade);
    });

    const action = mixer.clipAction(retargeted, target);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(crossfade).play();
    action.timeScale = speed;
    action.paused = paused;
    actionRef.current = action;

    return () => {
      cancelled = true;
      try { action.fadeOut(crossfade); } catch {}
      try { mixer.uncacheClip(retargeted!); } catch {}
      actionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, target, mixer]);

  useEffect(() => {
    const a = actionRef.current;
    if (!a) return;
    a.timeScale = speed;
    a.paused = paused;
  }, [speed, paused]);

  return null;
}

/**
 * Lightweight helper for the inspector: returns the list of animation clip
 * names declared in a glTF without instantiating a full LevelCharacter.
 */
export function useCharacterAnimationNames(url: string): string[] {
  const gltf = useGLTF(url);
  return useMemo(() => gltf.animations.map((c) => c.name), [gltf.animations]);
}