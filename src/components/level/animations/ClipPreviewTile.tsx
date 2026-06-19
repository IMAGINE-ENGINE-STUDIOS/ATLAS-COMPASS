import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { Film } from "lucide-react";
import type { CharacterClipEntry } from "@/lib/characterAnimationLibrary";
import { retargetClip, retargetClipProper } from "@/lib/animationRetarget";
import { scoreClipQuality, applyClipRepairs, type ClipQualityReport } from "@/lib/animationQuality";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

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
  const [quality, setQuality] = useState<ClipQualityReport | null>(null);

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
      {quality && quality.grade !== "good" && (
        <QualityBadge report={quality} />
      )}
    </div>
  );
}

function PreviewRig({
  entry,
  onQuality,
}: {
  entry: CharacterClipEntry;
  onQuality?: (r: ClipQualityReport) => void;
}) {
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

    // Score the baked clip and — if quality is bad — auto-apply repairs and
    // re-score. Whichever scores better wins. Deferred via requestIdleCallback
    // so we don't block the first paint of the preview canvas.
    const schedule = (cb: () => void) =>
      (window as any).requestIdleCallback?.(cb, { timeout: 600 }) ?? setTimeout(cb, 80);
    const clipToPlay = { current: retargeted };
    schedule(() => {
      try {
        let report = scoreClipQuality(retargeted!, cloned);
        if (report.grade === "bad" && Object.keys(report.repair).length > 0) {
          const fixed = applyClipRepairs(retargeted!, report.repair);
          const fixedReport = scoreClipQuality(fixed, cloned);
          const score = (r: typeof report) =>
            (r.grade === "good" ? 0 : r.grade === "warn" ? 1 : 2) + r.issues.length * 0.1;
          if (score(fixedReport) < score(report)) {
            // Hot-swap the playing action with the repaired clip.
            try { mixer.uncacheClip(clipToPlay.current); } catch {}
            const newAction = mixer.clipAction(fixed);
            mixer.stopAllAction();
            newAction.reset().play();
            clipToPlay.current = fixed;
            report = { ...fixedReport, issues: ["auto-repaired: " + fixedReport.issues.join("; ")] };
          }
        }
        onQuality?.(report);
      } catch (err) {
        console.warn("[clip-quality] scoring failed", err);
      }
    });

    const action = mixer.clipAction(retargeted);
    action.reset().play();
    return () => {
      action.stop();
      mixer.stopAllAction();
    };
  }, [entry.source, entry.clipName, clipGltf.animations, baseGltf.animations, mixer, cloned, sourceClone, onQuality]);

  useFrame((_, dt) => mixer.update(dt));

  return (
    <group position={[0, -0.95, 0]} scale={1}>
      <primitive object={cloned} />
    </group>
  );
}

function QualityBadge({ report }: { report: ClipQualityReport }) {
  const color =
    report.grade === "bad"  ? "bg-red-500/90 text-white" :
    report.grade === "warn" ? "bg-amber-500/90 text-black" :
                              "bg-emerald-500/90 text-black";
  const label = report.grade === "bad" ? "QUALITY" : "CHECK";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`absolute top-1 right-1 z-10 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${color} shadow-md`}
            aria-label="Retarget quality report"
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[280px] text-[10px] leading-relaxed">
          <p className="font-semibold mb-1">
            Retarget quality: <span className="uppercase">{report.grade}</span>
          </p>
          <ul className="space-y-0.5 mb-1">
            <li>foot slide: <span className="tabular-nums">{report.footSlideMps.toFixed(2)} m/s</span></li>
            <li>hip drift: <span className="tabular-nums">{report.hipDriftMeters.toFixed(2)} m</span></li>
            <li>worst bone jump: <span className="tabular-nums">{report.worstQuatJumpRad.toFixed(2)} rad</span>{report.worstQuatBone ? ` (${report.worstQuatBone})` : ""}</li>
          </ul>
          {report.issues.length > 0 && (
            <>
              <p className="font-semibold mt-1.5">Issues</p>
              <ul className="list-disc list-inside text-muted-foreground">
                {report.issues.map((i, k) => <li key={k}>{i}</li>)}
              </ul>
            </>
          )}
          {report.suggestions.length > 0 && (
            <>
              <p className="font-semibold mt-1.5">Suggested fixes</p>
              <ul className="list-disc list-inside text-muted-foreground">
                {report.suggestions.map((s, k) => <li key={k}>{s}</li>)}
              </ul>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}