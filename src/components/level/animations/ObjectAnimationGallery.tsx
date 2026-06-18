import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Check, Zap, Sliders } from "lucide-react";
import type { AnimationTrack, SceneObject } from "@/lib/levelTypes";
import {
  OBJECT_ANIMATION_PRESETS,
  PRESET_CATEGORIES,
  presetDefaults,
  type ObjectAnimationPreset,
} from "@/lib/objectAnimationPresets";
import PresetPreviewTile from "./PresetPreviewTile";

/**
 * Modal gallery of object animation presets.
 *
 *  - Quick presets tab: one click on a tile applies that preset with its
 *    defaults to the targeted object.
 *  - Parametric tab: pick a preset on the left, tweak sliders/axes on the
 *    right, see the preview update live, then Apply.
 */
export default function ObjectAnimationGallery({
  open,
  onOpenChange,
  target,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The object the new track will animate. */
  target: SceneObject | null;
  onApply: (track: AnimationTrack) => void;
}) {
  const [tab, setTab] = useState<"quick" | "params">("quick");
  const [selectedId, setSelectedId] = useState<string | null>(
    OBJECT_ANIMATION_PRESETS[0]?.id ?? null,
  );
  const [params, setParams] = useState<Record<string, any>>(
    presetDefaults(OBJECT_ANIMATION_PRESETS[0]),
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const selected = useMemo(
    () => OBJECT_ANIMATION_PRESETS.find((p) => p.id === selectedId) ?? null,
    [selectedId],
  );

  const filtered = useMemo(
    () =>
      categoryFilter === "all"
        ? OBJECT_ANIMATION_PRESETS
        : OBJECT_ANIMATION_PRESETS.filter((p) => p.category === categoryFilter),
    [categoryFilter],
  );

  const base = useMemo(
    () => ({
      position: target?.position ?? [0, 0, 0],
      rotation: target?.rotation ?? [0, 0, 0],
      scale: target?.scale ?? [1, 1, 1],
    }),
    [target],
  );

  const applyPreset = (preset: ObjectAnimationPreset, customParams?: Record<string, any>) => {
    if (!target) return;
    const track = preset.build(
      target.id,
      customParams ?? presetDefaults(preset),
      base as any,
    );
    onApply(track);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border/40">
          <DialogTitle className="text-base">
            Object animation gallery
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {target
              ? `Target: ${target.name} · ${OBJECT_ANIMATION_PRESETS.length} presets`
              : "Select an object first"}
          </p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-5 mt-2 self-start">
            <TabsTrigger value="quick" className="text-[11px]">
              <Zap className="w-3 h-3 mr-1" /> Quick presets
            </TabsTrigger>
            <TabsTrigger value="params" className="text-[11px]">
              <Sliders className="w-3 h-3 mr-1" /> Parametric
            </TabsTrigger>
          </TabsList>

          {/* --------- Quick presets --------- */}
          <TabsContent value="quick" className="flex-1 min-h-0 m-0">
            <div className="flex items-center gap-1 px-5 py-2 border-b border-border/40 overflow-x-auto">
              <CategoryPill active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
                All
              </CategoryPill>
              {PRESET_CATEGORIES.map((c) => (
                <CategoryPill
                  key={c.id}
                  active={categoryFilter === c.id}
                  onClick={() => setCategoryFilter(c.id)}
                >
                  {c.label}
                </CategoryPill>
              ))}
            </div>
            <div className="overflow-auto p-4" style={{ maxHeight: "calc(80vh - 200px)" }}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    disabled={!target}
                    className="text-left flex flex-col gap-1 rounded-lg p-1.5 ring-1 ring-border/30 hover:ring-primary/70 transition-all bg-card/40 disabled:opacity-50"
                  >
                    <PresetPreviewTile preset={p} />
                    <p className="text-[11px] font-medium px-1 pt-0.5 truncate">{p.name}</p>
                    <p className="text-[9px] text-muted-foreground px-1 truncate">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* --------- Parametric --------- */}
          <TabsContent value="params" className="flex-1 min-h-0 m-0 flex">
            <div className="w-56 border-r border-border/40 overflow-auto p-2 space-y-1">
              {OBJECT_ANIMATION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setParams(presetDefaults(p));
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors ${
                    selectedId === p.id
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-card text-foreground/80"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="grid grid-cols-2 gap-4 p-5 flex-1 overflow-auto">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</Label>
                  <div className="mt-2 w-full max-w-xs">
                    {selected && <PresetPreviewTile preset={selected} params={params} />}
                  </div>
                  {selected && (
                    <p className="text-[11px] text-muted-foreground mt-2">{selected.description}</p>
                  )}
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Parameters</Label>
                  {selected?.params.map((p) => (
                    <div key={p.key}>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[11px]">{p.label}</Label>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {String(params[p.key])}
                        </span>
                      </div>
                      {p.type === "number" && (
                        <Slider
                          min={p.min ?? 0}
                          max={p.max ?? 10}
                          step={p.step ?? 0.1}
                          value={[Number(params[p.key])]}
                          onValueChange={([v]) => setParams((s) => ({ ...s, [p.key]: v }))}
                        />
                      )}
                      {p.type === "axis" && (
                        <Select
                          value={String(params[p.key])}
                          onValueChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="x" className="text-xs">X</SelectItem>
                            <SelectItem value="y" className="text-xs">Y</SelectItem>
                            <SelectItem value="z" className="text-xs">Z</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border/40">
          <p className="text-[10px] text-muted-foreground">
            {tab === "quick"
              ? "Click a tile to apply with defaults."
              : "Tweak parameters, then Apply."}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {tab === "params" && (
              <Button
                size="sm"
                disabled={!selected || !target}
                onClick={() => selected && applyPreset(selected, params)}
              >
                <Check className="w-3.5 h-3.5 mr-1" /> Apply
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 rounded-full text-[11px] whitespace-nowrap transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-card"
      }`}
    >
      {children}
    </button>
  );
}