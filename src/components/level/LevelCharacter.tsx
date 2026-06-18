import { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { CharacterObject } from "@/lib/levelTypes";

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
      <primitive object={cloned} />
    </group>
  );
}

/**
 * Lightweight helper for the inspector: returns the list of animation clip
 * names declared in a glTF without instantiating a full LevelCharacter.
 */
export function useCharacterAnimationNames(url: string): string[] {
  const gltf = useGLTF(url);
  return useMemo(() => gltf.animations.map((c) => c.name), [gltf.animations]);
}