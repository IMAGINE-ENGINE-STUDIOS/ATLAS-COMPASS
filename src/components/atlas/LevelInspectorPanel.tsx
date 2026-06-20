/**
 * LevelInspectorPanel
 * -------------------
 * Floating glass panel that opens when the user clicks a placed Level in
 * the Atlas. Shows the level's metadata, exposes live control bars
 * (heading / scale / altitude) that write back to atlas_level_placements,
 * and offers actions: ▶ Play here (in-world), Open editor, Re-spawn,
 * Delete. Also surfaces the Main Character read-out from the level's
 * scene so the user knows who will be posed on Play.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  X, Play, Edit3, Trash2, MapPin, Compass, Ruler, ArrowUpDown,
  Loader2, User, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import type { LevelPlacement } from "@/lib/useAtlasLevelLayer";
import { LEVEL_PLAY_EVENT } from "@/lib/useAtlasLevelLayer";
import type { LevelScene } from "@/lib/levelTypes";
import { toast } from "sonner";

interface Props {
  placement: LevelPlacement;
  onClose: () => void;
  onChanged: () => void;
}

export default function LevelInspectorPanel({ placement, onClose, onChanged }: Props) {
  const [heading, setHeading] = useState(placement.heading ?? 0);
  const [scale, setScale] = useState(placement.scale > 0 ? placement.scale : 1);
  const [altitude, setAltitude] = useState(placement.altitude ?? 0);
  const [scene, setScene] = useState<LevelScene | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-sync local state when a different placement is selected
  useEffect(() => {
    setHeading(placement.heading ?? 0);
    setScale(placement.scale > 0 ? placement.scale : 1);
    setAltitude(placement.altitude ?? 0);
  }, [placement.id]);

  // Load the scene so we can surface the Main Character
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("levels")
        .select("scene")
        .eq("id", placement.level_id)
        .maybeSingle();
      if (!cancelled) setScene((data?.scene as unknown as LevelScene) ?? null);
    })();
    return () => { cancelled = true; };
  }, [placement.level_id]);

  const characters = useMemo(
    () => (scene?.objects ?? []).filter((o) => o.kind === "character"),
    [scene],
  );
  const mainChar = useMemo(() => {
    if (!scene) return null;
    if (scene.mainCharacterId) {
      return characters.find((c) => c.id === scene.mainCharacterId) ?? null;
    }
    return characters.find((c: any) => c.playable) ?? characters[0] ?? null;
  }, [scene, characters]);

  // Debounced save on slider release
  const saveTransform = async (patch: Partial<{ heading: number; scale: number; altitude: number }>) => {
    setSaving(true);
    const { error } = await supabase
      .from("atlas_level_placements")
      .update(patch)
      .eq("id", placement.id);
    setSaving(false);
    if (error) toast.error(`Save failed: ${error.message}`);
    else {
      onChanged();
      window.dispatchEvent(new CustomEvent("atlas-level-placements-refresh"));
    }
  };

  const playHere = () => {
    window.dispatchEvent(new CustomEvent(LEVEL_PLAY_EVENT, { detail: { id: placement.id } }));
    toast.message("Entering level — Esc to exit");
  };

  const deletePlacement = async () => {
    if (!confirm("Remove this level placement from the Atlas?")) return;
    const { error } = await supabase
      .from("atlas_level_placements")
      .delete()
      .eq("id", placement.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else {
      toast.success("Placement removed");
      window.dispatchEvent(new CustomEvent("atlas-level-placements-refresh"));
      onClose();
    }
  };

  return (
    <div className="fixed top-20 right-4 z-[55] w-[320px] max-h-[calc(100vh-120px)] overflow-y-auto rounded-2xl border border-emerald-400/20 bg-slate-950/90 backdrop-blur-xl shadow-2xl text-white">
      {/* Header */}
      <div className="flex items-start gap-2 p-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-md bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 text-xs font-bold">
          ▣
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{placement.levels?.name ?? "Level"}</div>
          {placement.levels?.description && (
            <div className="text-[11px] text-white/60 line-clamp-2">{placement.levels.description}</div>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Info table */}
      <div className="p-3 space-y-1 text-[11px] border-b border-white/10">
        <Row icon={<MapPin className="w-3 h-3" />} label="Coordinates" value={`${placement.lat.toFixed(5)}, ${placement.lng.toFixed(5)}`} />
        <Row icon={<ArrowUpDown className="w-3 h-3" />} label="Altitude" value={`${altitude.toFixed(1)} m`} />
        <Row icon={<Compass className="w-3 h-3" />} label="Heading" value={`${heading.toFixed(0)}°`} />
        <Row icon={<Ruler className="w-3 h-3" />} label="Scale" value={`${scale.toFixed(2)}×`} />
      </div>

      {/* Main Character */}
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <User className="w-3.5 h-3.5 text-emerald-300" />
          <div className="text-[11px] uppercase tracking-wider text-white/70">Main Character</div>
        </div>
        {scene === null ? (
          <div className="text-[11px] text-white/50 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading scene…
          </div>
        ) : mainChar ? (
          <div className="rounded-md bg-emerald-500/10 border border-emerald-400/20 px-2 py-1.5 text-xs">
            {mainChar.name || mainChar.id}
            <div className="text-[10px] text-white/50">
              Posed as the player when you enter the level.
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-white/60">
            No character in this level. Add one in the editor and pick it as the Main Character.
          </div>
        )}
      </div>

      {/* Control bars */}
      <div className="p-3 space-y-3 border-b border-white/10">
        <SliderRow
          label={`Heading ${heading.toFixed(0)}°`}
          value={heading}
          min={0} max={360} step={1}
          onChange={setHeading}
          onCommit={(v) => saveTransform({ heading: v })}
        />
        <div className="flex gap-1">
          {[0, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              onClick={() => { setHeading(deg); saveTransform({ heading: deg }); }}
              className="flex-1 text-[10px] px-1 py-1 rounded bg-white/5 hover:bg-white/15 border border-white/10"
            >{deg}°</button>
          ))}
        </div>
        <SliderRow
          label={`Scale ${scale.toFixed(2)}×`}
          value={scale}
          min={0.1} max={10} step={0.05}
          onChange={setScale}
          onCommit={(v) => saveTransform({ scale: v })}
        />
        <SliderRow
          label={`Altitude ${altitude.toFixed(1)} m`}
          value={altitude}
          min={-200} max={2000} step={1}
          onChange={setAltitude}
          onCommit={(v) => saveTransform({ altitude: v })}
        />
        {saving && (
          <div className="flex items-center gap-2 text-[10px] text-emerald-300">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 grid grid-cols-2 gap-2">
        <Button size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-white col-span-2" onClick={playHere}>
          <Play className="w-3.5 h-3.5 mr-1" /> Play here
        </Button>
        <Link to={`/level/${placement.level_id}`} className="col-span-1">
          <Button size="sm" variant="secondary" className="w-full">
            <Edit3 className="w-3.5 h-3.5 mr-1" /> Editor
          </Button>
        </Link>
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={() => {
            setHeading(0); setScale(1); setAltitude(0);
            saveTransform({ heading: 0, scale: 1, altitude: 0 });
          }}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reset
        </Button>
        <Button size="sm" variant="destructive" className="col-span-2" onClick={deletePlacement}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove placement
        </Button>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-white/60">
        {icon}<span>{label}</span>
      </div>
      <div className="font-mono text-white/90">{value}</div>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, onChange, onCommit,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; onCommit: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-white/70">{label}</div>
      <Slider
        value={[value]}
        min={min} max={max} step={step}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={([v]) => onCommit(v)}
      />
    </div>
  );
}
