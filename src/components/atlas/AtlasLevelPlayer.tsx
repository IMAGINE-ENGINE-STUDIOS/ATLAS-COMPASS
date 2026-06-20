/**
 * AtlasLevelPlayer
 * ----------------
 * Renders a placed Level inside the Atlas. The level scene is mounted in
 * a transparent R3F <Canvas> overlaid on top of Cesium, so the city tiles
 * remain visible behind the level while the user plays.
 *
 * The level is wrapped in a single THREE.Group so heading + scale can be
 * applied at the placement (the "movable group" the user asked for). The
 * level's own ambient + directional lights are stripped (skipAmbient +
 * skipDirectional) — a single hemisphere light keeps the geometry visible
 * regardless of time-of-day in the Atlas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { X, Loader2, Edit3, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_SCENE, LevelScene } from "@/lib/levelTypes";
import { LevelSceneContents } from "@/components/level/LevelScene3D";
import type { LevelPlacement } from "@/lib/useAtlasLevelLayer";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  placement: LevelPlacement;
  onClose: () => void;
}

export default function AtlasLevelPlayer({ placement, onClose }: Props) {
  const [scene, setScene] = useState<LevelScene | null>(null);
  const [playing, setPlaying] = useState(true);
  const [maximized, setMaximized] = useState(true);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const controlsRef = useRef<any>(null);

  // Load the level scene JSONB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("levels")
          .select("scene,name")
          .eq("id", placement.level_id)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data?.scene) {
          toast.error("Couldn't load level scene.");
          setScene({ ...EMPTY_SCENE });
        } else {
          setScene(data.scene as unknown as LevelScene);
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Couldn't load level.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [placement.level_id]);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const headingRad = useMemo(() => ((placement.heading ?? 0) * Math.PI) / 180, [placement.heading]);
  const placementScale = placement.scale > 0 ? placement.scale : 1;

  return (
    <div
      className={
        maximized
          ? "fixed inset-0 z-[60] pointer-events-auto"
          : "fixed bottom-6 right-6 z-[60] w-[520px] h-[340px] rounded-2xl overflow-hidden shadow-2xl border border-white/15"
      }
    >
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-2 bg-gradient-to-b from-black/60 to-transparent">
        <span className="text-white text-sm font-semibold drop-shadow">
          ▣ {placement.levels?.name ?? "Level"}
        </span>
        <span className="text-white/60 text-[11px]">
          {placement.lat.toFixed(4)}, {placement.lng.toFixed(4)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant={playing ? "default" : "secondary"}
            className="h-7"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-7 w-7"
            title="Open editor"
            onClick={() => navigate(`/level/${placement.level_id}`)}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-7 w-7"
            title={maximized ? "Minimize" : "Maximize"}
            onClick={() => setMaximized((m) => !m)}
          >
            {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-7 w-7"
            title="Close (Esc)"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {loading || !scene ? (
        <div className="w-full h-full flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
        </div>
      ) : (
        <Canvas
          shadows
          camera={{ position: [40, 25, 40], fov: 50, near: 0.1, far: 5000 }}
          gl={{ alpha: true, antialias: true }}
          style={{ background: "transparent" }}
        >
          {/* Atlas-style key + fill lighting (replaces stripped level lights) */}
          <hemisphereLight args={["#cfe6ff", "#3d5c3d", 0.6]} />
          <directionalLight position={[80, 120, 40]} intensity={1.4} castShadow />

          <group rotation={[0, headingRad, 0]} scale={placementScale}>
            <LevelSceneContents
              scene={scene}
              playing={playing}
              skipAmbient
              skipDirectional
              controlsRef={controlsRef}
            />
          </group>

          <OrbitControls ref={controlsRef} makeDefault enableDamping />
        </Canvas>
      )}

      {/* Minimized footer hint */}
      {!maximized && (
        <div className="absolute bottom-1 left-0 right-0 text-center text-[10px] text-white/60">
          Esc to close · Cities visible behind
        </div>
      )}
    </div>
  );
}