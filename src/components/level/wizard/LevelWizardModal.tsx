/**
 * Level Wizard — first launch surface.
 *
 * Lives in the Levels gallery. Lets the user pick a preset (currently the
 * Master Level "Eastlight Town") and spin up a fully populated scene with
 * one click. Future iterations will expose size / biome / density sliders;
 * for now we offer the Master preset plus two stubs so the gallery hints
 * at the growing roadmap.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Building2, Trees, Sun, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ensureLevelSession, withTimeout } from "@/lib/levelSession";
import { createLocalLevel, updateLocalLevel } from "@/lib/localLevels";
import { MASTER_LEVEL_PRESET, buildMasterLevelScene } from "@/lib/wizard/masterLevelPreset";
import { toast } from "sonner";

interface Preset {
  id: string;
  name: string;
  blurb: string;
  icon: React.ReactNode;
  status: "ready" | "soon";
  build?: () => ReturnType<typeof buildMasterLevelScene>;
  accent: string;
}

const PRESETS: Preset[] = [
  {
    id: MASTER_LEVEL_PRESET.id,
    name: MASTER_LEVEL_PRESET.name,
    blurb: MASTER_LEVEL_PRESET.blurb,
    icon: <Building2 className="w-5 h-5" />,
    status: "ready",
    build: MASTER_LEVEL_PRESET.build,
    accent: "from-amber-400/30 to-rose-500/20",
  },
  {
    id: "wizard_forest_outpost",
    name: "Forest Outpost",
    blurb: "Pine valley with cabins, a campfire ring and a logging path. Coming soon.",
    icon: <Trees className="w-5 h-5" />,
    status: "soon",
    accent: "from-emerald-400/25 to-teal-500/10",
  },
  {
    id: "wizard_desert_freeway",
    name: "Desert Freeway",
    blurb: "Sun-bleached highway, gas stations and dunes. Coming soon.",
    icon: <Sun className="w-5 h-5" />,
    status: "soon",
    accent: "from-orange-400/25 to-yellow-500/10",
  },
];

export default function LevelWizardModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const generate = async (preset: Preset) => {
    if (preset.status !== "ready" || !preset.build) {
      toast.info(`${preset.name} is on the roadmap — pick Eastlight Town for now.`);
      return;
    }
    setBusy(preset.id);
    try {
      const scene = preset.build();
      const uid = await ensureLevelSession({ allowAnonymous: false });
      if (!uid) {
        try {
          const local = createLocalLevel(scene);
          try { updateLocalLevel(local.id, { name: preset.name }); } catch {}
          toast.success(`Generated ${preset.name} (local draft)`);
          navigate(`/level/${local.id}`);
        } catch (err: any) {
          if (/quota/i.test(String(err?.message ?? err?.name))) {
            toast.error("Browser storage is full. Delete old local drafts from /levels and retry.");
          } else {
            throw err;
          }
        }
        return;
      }
      const { data, error } = await withTimeout(
        supabase
          .from("levels")
          .insert({ owner_id: uid, name: preset.name, scene: scene as any })
          .select("id")
          .single(),
        8000,
        { data: null, error: { message: "Level creation timed out", details: "", hint: "", code: "TIMEOUT" } } as any,
      );
      if (error || !data) {
        try {
          const local = createLocalLevel(scene);
          try { updateLocalLevel(local.id, { name: preset.name }); } catch {}
          toast.warning("Backend unreachable — saved as local draft.");
          navigate(`/level/${local.id}`);
        } catch (err: any) {
          if (/quota/i.test(String(err?.message ?? err?.name))) {
            toast.error(
              "Couldn't save: backend unreachable and browser storage is full. Delete some local drafts from /levels and try again.",
            );
          } else {
            toast.error(err?.message ?? "Couldn't save the generated level.");
          }
        }
      } else {
        toast.success(`Generated ${preset.name}`);
        navigate(`/level/${data.id}`);
      }
    } catch (e: any) {
      if (/quota/i.test(String(e?.message ?? e?.name))) {
        toast.error("Browser storage is full. Delete old local drafts from /levels and retry.");
      } else {
        toast.error(e?.message ?? "Generation failed");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Level Wizard
          </DialogTitle>
          <DialogDescription>
            Generate a fully populated scene — terrain, buildings, props, animations and a working train system — in one click.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          {PRESETS.map((p) => (
            <Card
              key={p.id}
              className={`relative overflow-hidden border-border/60 transition-all ${
                p.status === "ready" ? "hover:border-primary/60 cursor-pointer" : "opacity-70"
              }`}
              onClick={() => p.status === "ready" && generate(p)}
            >
              <div className={`h-24 bg-gradient-to-br ${p.accent} flex items-center justify-center`}>
                <div className="text-foreground/80">{p.icon}</div>
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{p.name}</h3>
                  {p.status === "soon" && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Soon</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.blurb}</p>
                {p.status === "ready" && (
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    disabled={busy !== null}
                    onClick={(e) => { e.stopPropagation(); generate(p); }}
                  >
                    {busy === p.id ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Generating…</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5 mr-1" /> Generate</>
                    )}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Tip: the Master Level ships with a working train. In Play mode, walk into an open door to board, or stand near the locomotive cabin and press <kbd>P</kbd> to drive.
        </p>
      </DialogContent>
    </Dialog>
  );
}