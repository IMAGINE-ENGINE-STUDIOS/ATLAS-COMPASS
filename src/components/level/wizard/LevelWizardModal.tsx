/**
 * Level Wizard — fully configurable scene generator.
 *
 * Phase 1: pick a preset card.
 * Phase 2: tweak every knob (world size, terrain, plaza, roads, buildings,
 *          park, station, train, characters, environment) and generate.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Building2, Trees, Sun, Loader2, ChevronLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { ensureLevelSession, withTimeout } from "@/lib/levelSession";
import { createLocalLevel, updateLocalLevel } from "@/lib/localLevels";
import {
  MASTER_LEVEL_PRESET,
  buildMasterLevelScene,
  DEFAULT_WIZARD_CONFIG,
  WizardConfig,
  WizardFacade,
} from "@/lib/wizard/masterLevelPreset";
import { toast } from "sonner";

interface Preset {
  id: string;
  name: string;
  blurb: string;
  icon: React.ReactNode;
  status: "ready" | "soon";
  accent: string;
}

const PRESETS: Preset[] = [
  {
    id: MASTER_LEVEL_PRESET.id,
    name: MASTER_LEVEL_PRESET.name,
    blurb: MASTER_LEVEL_PRESET.blurb,
    icon: <Building2 className="w-5 h-5" />,
    status: "ready",
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

const FACADES: WizardFacade[] = ["brick", "glass", "stone", "concrete", "wood"];

function freshConfig(): WizardConfig {
  return JSON.parse(JSON.stringify(DEFAULT_WIZARD_CONFIG));
}

export default function LevelWizardModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Preset | null>(null);
  const [cfg, setCfg] = useState<WizardConfig>(freshConfig);

  const reset = () => {
    setSelected(null);
    setCfg(freshConfig());
  };

  const pick = (p: Preset) => {
    if (p.status !== "ready") {
      toast.info(`${p.name} is on the roadmap — pick Eastlight Town for now.`);
      return;
    }
    setSelected(p);
    setCfg(freshConfig());
  };

  const generate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const scene = buildMasterLevelScene(cfg);
      const name = cfg.name?.trim() || selected.name;
      const uid = await ensureLevelSession({ allowAnonymous: false });
      if (!uid) {
        try {
          const local = createLocalLevel(scene);
          try { updateLocalLevel(local.id, { name }); } catch {}
          toast.success(`Generated ${name} (local draft)`);
          navigate(`/level/${local.id}`);
        } catch (err: any) {
          if (/quota/i.test(String(err?.message ?? err?.name))) {
            toast.error("Browser storage is full. Delete old local drafts from /levels and retry.");
          } else throw err;
        }
        return;
      }
      const { data, error } = await withTimeout(
        supabase
          .from("levels")
          .insert({ owner_id: uid, name, scene: scene as any })
          .select("id")
          .single(),
        8000,
        { data: null, error: { message: "timeout", details: "", hint: "", code: "TIMEOUT" } } as any,
      );
      if (error || !data) {
        try {
          const local = createLocalLevel(scene);
          try { updateLocalLevel(local.id, { name }); } catch {}
          toast.warning("Backend unreachable — saved as local draft.");
          navigate(`/level/${local.id}`);
        } catch (err: any) {
          if (/quota/i.test(String(err?.message ?? err?.name))) {
            toast.error("Backend unreachable and browser storage is full.");
          } else toast.error(err?.message ?? "Couldn't save.");
        }
      } else {
        toast.success(`Generated ${name}`);
        navigate(`/level/${data.id}`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  // Small helpers
  const update = <K extends keyof WizardConfig>(key: K, patch: Partial<WizardConfig[K]> | WizardConfig[K]) => {
    setCfg((c) => {
      const cur = c[key];
      if (typeof cur === "object" && cur !== null && !Array.isArray(cur) && typeof patch === "object") {
        return { ...c, [key]: { ...(cur as any), ...(patch as any) } };
      }
      return { ...c, [key]: patch as any };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selected && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={reset}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <Sparkles className="w-5 h-5 text-primary" />
            {selected ? `Configure: ${selected.name}` : "Level Wizard"}
          </DialogTitle>
          <DialogDescription>
            {selected
              ? "Tune every knob, then click Generate."
              : "Pick a preset to start, then customize world size, density, train, lighting and more."}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            {PRESETS.map((p) => (
              <Card
                key={p.id}
                className={`relative overflow-hidden border-border/60 transition-all ${
                  p.status === "ready" ? "hover:border-primary/60 cursor-pointer" : "opacity-70"
                }`}
                onClick={() => pick(p)}
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
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs w-20">Name</Label>
              <Input
                value={cfg.name}
                onChange={(e) => setCfg((c) => ({ ...c, name: e.target.value }))}
                className="h-8 text-sm"
              />
              <Button variant="ghost" size="sm" onClick={() => setCfg(freshConfig())} title="Reset to defaults">
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
              </Button>
            </div>

            <Tabs defaultValue="world" className="w-full">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="world">World</TabsTrigger>
                <TabsTrigger value="buildings">Buildings</TabsTrigger>
                <TabsTrigger value="train">Train</TabsTrigger>
                <TabsTrigger value="characters">Chars</TabsTrigger>
                <TabsTrigger value="env">Env</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[340px] mt-3 pr-3">
                <TabsContent value="world" className="space-y-4 m-0">
                  <NumRow label="World size (m)" value={cfg.worldSize} min={200} max={800} step={20}
                    onChange={(v) => setCfg((c) => ({ ...c, worldSize: v }))} />
                  <SwitchRow label="Terrain heightmap" checked={cfg.terrain.enabled}
                    onChange={(v) => update("terrain", { enabled: v })} />
                  <NumRow label="Terrain resolution" value={cfg.terrain.resolution} min={32} max={192} step={8}
                    onChange={(v) => update("terrain", { resolution: v })} />
                  <NumRow label="Hill amplitude" value={cfg.terrain.hillAmplitude} min={0} max={3} step={0.1}
                    onChange={(v) => update("terrain", { hillAmplitude: v })} />
                  <NumRow label="Ridge intensity" value={cfg.terrain.ridgeIntensity} min={0} max={3} step={0.1}
                    onChange={(v) => update("terrain", { ridgeIntensity: v })} />
                  <SwitchRow label="Central plaza" checked={cfg.plaza.enabled}
                    onChange={(v) => update("plaza", { enabled: v })} />
                  <NumRow label="Plaza width" value={cfg.plaza.width} min={10} max={120} step={2}
                    onChange={(v) => update("plaza", { width: v })} />
                  <NumRow label="Plaza depth" value={cfg.plaza.depth} min={10} max={120} step={2}
                    onChange={(v) => update("plaza", { depth: v })} />
                  <SwitchRow label="Roads" checked={cfg.roads.enabled}
                    onChange={(v) => update("roads", { enabled: v })} />
                  <SwitchRow label="Lane markings" checked={cfg.roads.laneMarks}
                    onChange={(v) => update("roads", { laneMarks: v })} />
                  <SwitchRow label="Park & trees" checked={cfg.park.enabled}
                    onChange={(v) => update("park", { enabled: v })} />
                  <NumRow label="Tree count" value={cfg.park.treeCount} min={0} max={60} step={1}
                    onChange={(v) => update("park", { treeCount: v })} />
                </TabsContent>

                <TabsContent value="buildings" className="space-y-4 m-0">
                  <NumRow label="Density scale" value={cfg.buildings.densityScale} min={0} max={2} step={0.1}
                    onChange={(v) => update("buildings", { densityScale: v })} />
                  <NumRow label="Height scale" value={cfg.buildings.heightScale} min={0.5} max={2.5} step={0.1}
                    onChange={(v) => update("buildings", { heightScale: v })} />
                  <div>
                    <Label className="text-xs">Allowed facades</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {FACADES.map((f) => (
                        <label key={f} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-border/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cfg.buildings.facades[f]}
                            onChange={(e) => update("buildings", {
                              facades: { ...cfg.buildings.facades, [f]: e.target.checked },
                            })}
                          />
                          <span className="capitalize">{f}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <SwitchRow label="Industrial cluster (warehouses)" checked={cfg.buildings.includeIndustrial}
                    onChange={(v) => update("buildings", { includeIndustrial: v })} />
                  <SwitchRow label="Tall spire tower" checked={cfg.buildings.includeTallSpire}
                    onChange={(v) => update("buildings", { includeTallSpire: v })} />
                  <SwitchRow label="Plaza shops" checked={cfg.buildings.includePlazaShops}
                    onChange={(v) => update("buildings", { includePlazaShops: v })} />
                </TabsContent>

                <TabsContent value="train" className="space-y-4 m-0">
                  <SwitchRow label="Train station" checked={cfg.station.enabled}
                    onChange={(v) => update("station", { enabled: v })} />
                  <SwitchRow label="Train (loco + cars + track)" checked={cfg.train.enabled}
                    onChange={(v) => update("train", { enabled: v })} />
                  <NumRow label="Car count" value={cfg.train.carCount} min={0} max={8} step={1}
                    onChange={(v) => update("train", { carCount: v })} />
                  <NumRow label="Base speed (m/s)" value={cfg.train.baseSpeed} min={1} max={40} step={1}
                    onChange={(v) => update("train", { baseSpeed: v })} />
                  <NumRow label="Stop duration (s)" value={cfg.train.stopDurationSeconds} min={0} max={60} step={1}
                    onChange={(v) => update("train", { stopDurationSeconds: v })} />
                  <NumRow label="Door animation (s)" value={cfg.train.doorAnimSeconds} min={0.2} max={5} step={0.1}
                    onChange={(v) => update("train", { doorAnimSeconds: v })} />
                  <NumRow label="Car spacing (m)" value={cfg.train.carSpacing} min={6} max={20} step={0.5}
                    onChange={(v) => update("train", { carSpacing: v })} />
                </TabsContent>

                <TabsContent value="characters" className="space-y-4 m-0">
                  <SwitchRow label="Playable character on plaza" checked={cfg.characters.includePlayable}
                    onChange={(v) => update("characters", { includePlayable: v })} />
                  <NumRow label="NPC commuters" value={cfg.characters.npcCount} min={0} max={20} step={1}
                    onChange={(v) => update("characters", { npcCount: v })} />
                </TabsContent>

                <TabsContent value="env" className="space-y-4 m-0">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs w-40">Sky / background</Label>
                    <Input type="color" value={cfg.environment.background} className="h-8 w-16 p-1"
                      onChange={(e) => update("environment", { background: e.target.value })} />
                    <Input value={cfg.environment.background} className="h-8 text-xs"
                      onChange={(e) => update("environment", { background: e.target.value })} />
                  </div>
                  <SwitchRow label="Fog" checked={cfg.environment.fogEnabled}
                    onChange={(v) => update("environment", { fogEnabled: v })} />
                  <NumRow label="Fog near" value={cfg.environment.fogNear} min={10} max={500} step={10}
                    onChange={(v) => update("environment", { fogNear: v })} />
                  <NumRow label="Fog far" value={cfg.environment.fogFar} min={50} max={1500} step={10}
                    onChange={(v) => update("environment", { fogFar: v })} />
                  <NumRow label="Sun intensity" value={cfg.environment.sunIntensity} min={0} max={4} step={0.1}
                    onChange={(v) => update("environment", { sunIntensity: v })} />
                  <NumRow label="Ambient intensity" value={cfg.environment.ambientIntensity} min={0} max={2} step={0.05}
                    onChange={(v) => update("environment", { ambientIntensity: v })} />
                </TabsContent>
              </ScrollArea>
            </Tabs>

            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border/40">
              <Button variant="outline" onClick={reset} disabled={busy}>Back</Button>
              <Button onClick={generate} disabled={busy}>
                {busy ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5 mr-1" /> Generate</>
                )}
              </Button>
            </div>
          </div>
        )}

        {!selected && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Tip: each preset opens a full configuration panel — adjust density, train, terrain and lighting before generating.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NumRow({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-xs w-40 shrink-0">{label}</Label>
      <Slider
        className="flex-1"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(arr) => onChange(arr[0])}
      />
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        className="h-8 w-20 text-xs"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </div>
  );
}

function SwitchRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}