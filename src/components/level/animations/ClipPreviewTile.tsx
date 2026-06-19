import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { Film } from "lucide-react";
import type { CharacterClipEntry } from "@/lib/characterAnimationLibrary";
import { retargetClip, retargetClipProper } from "@/lib/animationRetarget";

const DEFAULT_PREVIEW_RIG = "https://threejs.org/examples/models/gltf/Xbot.glb";

/**
 * One small autoplay preview canvas per gallery tile.
 *
 * Strategy:
 *  - Mount nothing until the tile enters the viewport (IntersectionObserver).
 *  - Once visible, load the source glb on demand via `useGLTF` (drei caches it).
 *  - Play the requested clip in a loop on a cheap shared Xbot preview rig
 *    (cloned with SkeletonUtils so each tile has its own skeleton).
 *  - Tear the canvas back down when the tile leaves the viewport so we don't
 *    burn frames for off-screen previews.
 */
export default function ClipPreviewTile({ entry }: { entry: CharacterClipEntry }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!rootRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setVisible(e.isIntersecting);
      },
      { rootMargin: "200px" },
    );
    io.observe(rootRef.current);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative w-full aspect-square rounded-md overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 border border-border/40"
    >
      {!visible ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
          <Film className="w-5 h-5" />
        </div>
      ) : (
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 1.2, 2.4], fov: 35 }}
          gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
          frameloop="always"
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[2, 4, 3]} intensity={0.7} />
          <PreviewRig entry={entry} />
        </Canvas>
      )}
    </div>
  );
}

function PreviewRig({ entry }: { entry: CharacterClipEntry }) {
  // The rig: always Xbot for previews (the user's actual rig is what we
  // retarget *to* in the scene). For "builtin" clips the rig already contains
  // the clip. For "url" clips we additionally load the source glb to extract
  // its animation.
  const baseGltf = useGLTF(DEFAULT_PREVIEW_RIG);
  const clipGltf = useGLTF(entry.source === "url" && entry.url ? entry.url : DEFAULT_PREVIEW_RIG);

  const cloned = useMemo(() => SkeletonUtils.clone(baseGltf.scene), [baseGltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(cloned), [cloned]);

  // Un-animated clone of the SOURCE rig — used as the bind-pose reference
  // when retargeting clips whose source rig differs from the preview rig.
  const sourceClone = useMemo(() => {
    if (entry.source !== "url") return null;
    try { return SkeletonUtils.clone(clipGltf.scene); } catch { return null; }
  }, [entry.source, clipGltf.scene]);

  useEffect(() => {
    const pool = entry.source === "url" ? clipGltf.animations : baseGltf.animations;
    if (!pool || pool.length === 0) return;
    const wanted = entry.clipName
      ? pool.find((c) => c.name.toLowerCase() === entry.clipName!.toLowerCase()) || pool[0]
      : pool[0];
    if (!wanted) return;
    let retargeted: THREE.AnimationClip | null = null;
    if (sourceClone) {
      // Proper world-space retarget via SkeletonUtils. Falls back to the
      // naive track-rename pass if the source rig has no skinned mesh or
      // the bone maps don't overlap at all.
      retargeted = retargetClipProper(wanted, sourceClone, cloned);
    }
    if (!retargeted) retargeted = retargetClip(wanted, cloned);
    const action = mixer.clipAction(retargeted);
    action.reset().play();
    return () => {
      action.stop();
      mixer.stopAllAction();
    };
  }, [entry.source, entry.clipName, clipGltf.animations, baseGltf.animations, mixer, cloned, sourceClone]);

  useFrame((_, dt) => mixer.update(dt));

  return (
    <group position={[0, -0.95, 0]} scale={1}>
      <primitive object={cloned} />
    </group>
  );
}