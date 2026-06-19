import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Play, Route, Zap, MousePointerClick, Crosshair } from "lucide-react";
import type {
  SceneObject,
  ScenePath,
  SplineBinding,
  ObjectInteraction,
  ActionButton,
  PresetAction,
  PresetActionType,
} from "@/lib/levelTypes";
import { newId } from "@/lib/levelTypes";
import { toast } from "sonner";
import { runPresetAction } from "./runtime";
import { requestTeleportPick } from "@/components/level/teleportPicker";

const PRESET_TYPES: { value: PresetActionType; label: string }[] = [
  { value: "rotateContinuously", label: "Rotate continuously" },
  { value: "toggleVisibility", label: "Toggle visibility" },
  { value: "teleportPlayer", label: "Teleport player" },
  { value: "playSound", label: "Play sound (URL)" },
  { value: "openUrl", label: "Open URL" },
  { value: "spawnGeometry", label: "Spawn geometry (CSV)" },
];

export function InteractionsPanel({
  obj,
  paths,
  onPatch,
  onPatchPaths,
  disabled,
}: {
  obj: SceneObject;
  paths: ScenePath[];
  onPatch: (patch: Partial<SceneObject>) => void;
  onPatchPaths: (next: ScenePath[]) => void;
  disabled?: boolean;
}) {
  const bindings = obj.splineBindings ?? [];
  const interactions = obj.interactions ?? [];
  const buttons = obj.actionButtons ?? [];

  return (
    <div className="space-y-2 pt-2 border-t border-border/40">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Zap className="w-3 h-3" /> Behaviour
      </span>
      <Tabs defaultValue="splines">
        <TabsList className="grid grid-cols-3 h-7">
          <TabsTrigger value="splines" className="text-[10px] gap-1"><Route className="w-3 h-3" /> Splines</TabsTrigger>
          <TabsTrigger value="actions" className="text-[10px] gap-1"><Zap className="w-3 h-3" /> Interactions</TabsTrigger>
          <TabsTrigger value="buttons" className="text-[10px] gap-1"><MousePointerClick className="w-3 h-3" /> Buttons</TabsTrigger>
        </TabsList>

        <TabsContent value="splines" className="mt-2 space-y-2">
          <SplinesTab
            obj={obj}
            paths={paths}
            bindings={bindings}
            interactions={interactions}
            onPatch={onPatch}
            onPatchPaths={onPatchPaths}
            disabled={disabled}
          />
        </TabsContent>

        <TabsContent value="actions" className="mt-2 space-y-2">
          <InteractionsTab
            obj={obj}
            interactions={interactions}
            onPatch={onPatch}
            disabled={disabled}
          />
        </TabsContent>

        <TabsContent value="buttons" className="mt-2 space-y-2">
          <ButtonsTab
            buttons={buttons}
            interactions={interactions}
            onPatch={onPatch}
            disabled={disabled}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ──────────────────────────  Splines tab  ────────────────────────── */

function SplinesTab({
  obj, paths, bindings, interactions, onPatch, onPatchPaths, disabled,
}: {
  obj: SceneObject;
  paths: ScenePath[];
  bindings: SplineBinding[];
  interactions: ObjectInteraction[];
  onPatch: (patch: Partial<SceneObject>) => void;
  onPatchPaths: (next: ScenePath[]) => void;
  disabled?: boolean;
}) {
  const addPath = () => {
    const p: ScenePath = {
      id: newId("path"),
      name: `Path ${paths.length + 1}`,
      color: "#22ff88",
      closed: false,
      waypoints: [
        [obj.position[0], obj.position[1] + 0.5, obj.position[2]],
        [obj.position[0] + 2, obj.position[1] + 0.5, obj.position[2]],
      ],
    };
    onPatchPaths([...paths, p]);
    onPatch({
      splineBindings: [
        ...bindings,
        { id: newId("bind"), pathId: p.id, mode: "movement", speed: 1, loop: true, orientToPath: false },
      ],
    });
  };

  const patchBinding = (id: string, patch: Partial<SplineBinding>) => {
    onPatch({ splineBindings: bindings.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  };
  const removeBinding = (id: string) => {
    onPatch({ splineBindings: bindings.filter((b) => b.id !== id) });
  };

  const patchPath = (id: string, patch: Partial<ScenePath>) => {
    onPatchPaths(paths.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const addWaypoint = (pathId: string) => {
    const path = paths.find((p) => p.id === pathId);
    if (!path) return;
    const last = path.waypoints[path.waypoints.length - 1] ?? obj.position;
    patchPath(pathId, { waypoints: [...path.waypoints, [last[0] + 1, last[1], last[2]]] });
  };

  return (
    <>
      <Button size="sm" variant="outline" className="w-full h-7 text-[10px]" disabled={disabled} onClick={addPath}>
        <Plus className="w-3 h-3 mr-1" /> Add new spline
      </Button>
      {bindings.length === 0 && <p className="text-[10px] text-muted-foreground italic">No splines bound.</p>}
      {bindings.map((b) => {
        const path = paths.find((p) => p.id === b.pathId);
        return (
          <div key={b.id} className="rounded-md border border-border/40 bg-muted/20 p-1.5 space-y-1.5">
            <div className="flex items-center gap-1">
              <Select value={b.pathId} onValueChange={(v) => patchBinding(b.id, { pathId: v })} disabled={disabled}>
                <SelectTrigger className="h-6 text-[10px] flex-1"><SelectValue placeholder="Path…" /></SelectTrigger>
                <SelectContent>
                  {paths.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={b.mode} onValueChange={(v) => patchBinding(b.id, { mode: v as any })} disabled={disabled}>
                <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="movement" className="text-xs">Movement</SelectItem>
                  <SelectItem value="trigger" className="text-xs">Trigger</SelectItem>
                </SelectContent>
              </Select>
              <button onClick={() => removeBinding(b.id)} disabled={disabled} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            {b.mode === "movement" && (
              <div className="grid grid-cols-3 gap-1 items-center">
                <Label className="text-[10px]">Speed</Label>
                <Input type="number" step={0.1} value={b.speed ?? 1} onChange={(e) => patchBinding(b.id, { speed: parseFloat(e.target.value) || 0 })} className="h-6 text-[10px] col-span-2" disabled={disabled} />
                <Label className="text-[10px]">Loop</Label>
                <div className="col-span-2"><Switch checked={!!b.loop} onCheckedChange={(v) => patchBinding(b.id, { loop: v })} disabled={disabled} /></div>
                <Label className="text-[10px]">Face path</Label>
                <div className="col-span-2"><Switch checked={!!b.orientToPath} onCheckedChange={(v) => patchBinding(b.id, { orientToPath: v })} disabled={disabled} /></div>
              </div>
            )}
            {b.mode === "trigger" && (
              <div className="grid grid-cols-[1fr_1.4fr] gap-1 items-center">
                <Label className="text-[10px]">Trigger radius</Label>
                <Input type="number" step={0.1} value={path?.triggerRadius ?? 1} onChange={(e) => path && patchPath(path.id, { triggerRadius: parseFloat(e.target.value) || 0 })} className="h-6 text-[10px]" disabled={disabled} />
                <Label className="text-[10px]">Fires action</Label>
                <Select value={b.actionId ?? ""} onValueChange={(v) => patchBinding(b.id, { actionId: v || undefined })} disabled={disabled}>
                  <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="Pick interaction…" /></SelectTrigger>
                  <SelectContent>
                    {interactions.map((i) => <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {path && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase text-muted-foreground">Waypoints · {path.waypoints.length}</span>
                  <button onClick={() => addWaypoint(path.id)} disabled={disabled} className="text-[10px] text-primary hover:underline">+ add</button>
                </div>
                <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                  {path.waypoints.map((w, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-1 items-center">
                      <span className="text-[9px] text-muted-foreground w-3">{i + 1}</span>
                      {([0, 1, 2] as const).map((axis) => (
                        <Input
                          key={axis}
                          type="number"
                          step={0.1}
                          value={w[axis]}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = path.waypoints.map((p, j) => {
                              if (j !== i) return p;
                              const c = [...p] as [number, number, number];
                              c[axis] = parseFloat(e.target.value) || 0;
                              return c;
                            });
                            patchPath(path.id, { waypoints: next });
                          }}
                          className="h-5 text-[9px] px-1"
                        />
                      ))}
                      <button
                        onClick={() => patchPath(path.id, { waypoints: path.waypoints.filter((_, j) => j !== i) })}
                        disabled={disabled}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ─────────────────────  Interactions tab  ───────────────────── */

function InteractionsTab({
  obj, interactions, onPatch, disabled,
}: {
  obj: SceneObject;
  interactions: ObjectInteraction[];
  onPatch: (patch: Partial<SceneObject>) => void;
  disabled?: boolean;
}) {
  const setList = (list: ObjectInteraction[]) => onPatch({ interactions: list });
  const add = (kind: ObjectInteraction["kind"]) => {
    const base: ObjectInteraction = {
      id: newId("act"),
      name: `Action ${interactions.length + 1}`,
      kind,
    };
    if (kind === "preset") base.preset = { type: "rotateContinuously", axis: [0, 1, 0], speed: 1 };
    if (kind === "script") base.blocks = [{ when: "onClick", then: { type: "toggleVisibility" } }];
    if (kind === "js") base.js = "// (obj, scene, ctx) => { ... }\nctx.toast('Hello from ' + obj.name);";
    setList([...interactions, base]);
  };
  const patch = (id: string, p: Partial<ObjectInteraction>) =>
    setList(interactions.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const remove = (id: string) => setList(interactions.filter((i) => i.id !== id));

  const preview = (i: ObjectInteraction) => {
    if (i.kind === "preset" && i.preset) {
      runPresetAction(i.preset, obj, "preview");
      return;
    }
    if (i.kind === "script" && i.blocks?.length) {
      i.blocks.forEach((b) => runPresetAction(b.then, obj, "preview"));
      return;
    }
    if (i.kind === "js" && i.js) {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("obj", "ctx", i.js);
        fn(obj, { toast: (m: string) => toast.message(m) });
      } catch (e) {
        toast.error(`Script error: ${(e as Error).message}`);
      }
      return;
    }
    toast.message("Nothing to preview");
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        <Button size="sm" variant="outline" className="h-6 text-[9px]" disabled={disabled} onClick={() => add("preset")}>+ Preset</Button>
        <Button size="sm" variant="outline" className="h-6 text-[9px]" disabled={disabled} onClick={() => add("script")}>+ Script</Button>
        <Button size="sm" variant="outline" className="h-6 text-[9px]" disabled={disabled} onClick={() => add("js")}>+ JS</Button>
      </div>
      {interactions.length === 0 && <p className="text-[10px] text-muted-foreground italic">No interactions defined.</p>}
      {interactions.map((i) => (
        <div key={i.id} className="rounded-md border border-border/40 bg-muted/20 p-1.5 space-y-1.5">
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="h-4 text-[9px] uppercase">{i.kind}</Badge>
            <Input value={i.name} onChange={(e) => patch(i.id, { name: e.target.value })} className="h-6 text-[10px] flex-1" disabled={disabled} />
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={disabled} onClick={() => preview(i)} title="Test action">
              <Play className="w-3 h-3" />
            </Button>
            <button onClick={() => remove(i.id)} disabled={disabled} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          {i.kind === "preset" && (
            <PresetEditor preset={i.preset!} onChange={(p) => patch(i.id, { preset: p })} disabled={disabled} />
          )}

          {i.kind === "script" && (
            <div className="space-y-1">
              {(i.blocks ?? []).map((b, bi) => (
                <div key={bi} className="rounded border border-border/30 p-1 space-y-1">
                  <div className="flex items-center gap-1">
                    <Label className="text-[9px] uppercase">When</Label>
                    <Select
                      value={b.when}
                      onValueChange={(v) => patch(i.id, {
                        blocks: (i.blocks ?? []).map((x, j) => j === bi ? { ...x, when: v as any } : x),
                      })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-5 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onClick" className="text-xs">on click</SelectItem>
                        <SelectItem value="onPlayerNear" className="text-xs">player nearby</SelectItem>
                        <SelectItem value="onWalkThrough" className="text-xs">walked through</SelectItem>
                        <SelectItem value="always" className="text-xs">always</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => patch(i.id, { blocks: (i.blocks ?? []).filter((_, j) => j !== bi) })}
                      disabled={disabled}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <Label className="text-[9px] uppercase">Then</Label>
                  <PresetEditor
                    preset={b.then}
                    onChange={(p) => patch(i.id, {
                      blocks: (i.blocks ?? []).map((x, j) => j === bi ? { ...x, then: p } : x),
                    })}
                    disabled={disabled}
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[9px] w-full"
                disabled={disabled}
                onClick={() => patch(i.id, {
                  blocks: [...(i.blocks ?? []), { when: "onClick", then: { type: "toggleVisibility" } }],
                })}
              >
                <Plus className="w-3 h-3 mr-1" /> Add block
              </Button>
            </div>
          )}

          {i.kind === "js" && (
            <Textarea
              value={i.js ?? ""}
              onChange={(e) => patch(i.id, { js: e.target.value })}
              className="h-24 text-[10px] font-mono"
              disabled={disabled}
              placeholder="// ctx.toast('hello')"
            />
          )}
        </div>
      ))}
    </>
  );
}

function PresetEditor({
  preset, onChange, disabled,
}: {
  preset: PresetAction;
  onChange: (p: PresetAction) => void;
  disabled?: boolean;
}) {
  const set = (p: Partial<PresetAction>) => onChange({ ...preset, ...p });
  return (
    <div className="space-y-1">
      <Select value={preset.type} onValueChange={(v) => set({ type: v as PresetActionType })} disabled={disabled}>
        <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRESET_TYPES.map((p) => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {preset.type === "rotateContinuously" && (
        <div className="grid grid-cols-[1fr_2fr] gap-1 items-center">
          <Label className="text-[10px]">Speed (rad/s)</Label>
          <Input type="number" step={0.1} value={preset.speed ?? 1} onChange={(e) => set({ speed: parseFloat(e.target.value) || 0 })} className="h-5 text-[10px]" disabled={disabled} />
        </div>
      )}
      {preset.type === "teleportPlayer" && (
        <div className="space-y-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={async () => {
              toast.message("Click on the scene to set teleport destination", {
                description: "Esc to cancel",
              });
              const r = await requestTeleportPick();
              if (!r) return;
              const t: [number, number, number] = [
                +r.point[0].toFixed(2),
                +r.point[1].toFixed(2),
                +r.point[2].toFixed(2),
              ];
              set({ target: t, targetObjectId: r.objectId });
              toast.success(
                r.objectId
                  ? `Teleport set to object @ ${t.join(", ")}`
                  : `Teleport set to ${t.join(", ")}`,
              );
            }}
            className="w-full h-6 text-[10px] border-amber-400/40 text-amber-200 hover:bg-amber-500/10"
          >
            <Crosshair className="w-3 h-3 mr-1" /> Pick destination in scene
          </Button>
          <div className="grid grid-cols-3 gap-1">
            {(["x", "y", "z"] as const).map((k, i) => (
              <div key={k} className="flex flex-col gap-0.5">
                <Label className="text-[9px] uppercase text-muted-foreground text-center">{k}</Label>
                <Input
                  type="number"
                  step={0.1}
                  value={(preset.target ?? [0, 0, 0])[i]}
                  onChange={(e) => {
                    const t: [number, number, number] = [...(preset.target ?? [0, 0, 0])] as any;
                    t[i] = parseFloat(e.target.value) || 0;
                    set({ target: t, targetObjectId: undefined });
                  }}
                  className="h-5 text-[10px]"
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
          {preset.targetObjectId && (
            <div className="flex items-center justify-between text-[9px] text-amber-300/80 bg-amber-500/10 border border-amber-400/30 rounded px-1.5 py-0.5">
              <span>📍 Snapped to object {preset.targetObjectId.slice(0, 8)}</span>
              <button
                type="button"
                className="hover:text-amber-100"
                onClick={() => set({ targetObjectId: undefined })}
              >
                clear
              </button>
            </div>
          )}
        </div>
      )}
      {(preset.type === "openUrl" || preset.type === "playSound") && (
        <Input value={preset.url ?? ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" className="h-5 text-[10px]" disabled={disabled} />
      )}
      {preset.type === "spawnGeometry" && (
        <Textarea value={preset.csv ?? ""} onChange={(e) => set({ csv: e.target.value })} placeholder="box,Brick,0,0.5,0,1,1,1,0,0,0,#ffaa44" className="h-16 text-[10px] font-mono" disabled={disabled} />
      )}
    </div>
  );
}

/* ───────────────────────  Buttons tab  ─────────────────────── */

function ButtonsTab({
  buttons, interactions, onPatch, disabled,
}: {
  buttons: ActionButton[];
  interactions: ObjectInteraction[];
  onPatch: (patch: Partial<SceneObject>) => void;
  disabled?: boolean;
}) {
  const setList = (list: ActionButton[]) => onPatch({ actionButtons: list });
  const add = () => setList([...buttons, {
    id: newId("btn"),
    label: `Button ${buttons.length + 1}`,
    pinVisible: true,
    pinText: "Press E",
    pinOffset: 1.2,
    trigger: { kind: "proximity", distance: 2 },
    actionId: interactions[0]?.id ?? "",
  }]);
  const patch = (id: string, p: Partial<ActionButton>) =>
    setList(buttons.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const remove = (id: string) => setList(buttons.filter((b) => b.id !== id));

  return (
    <>
      <Button size="sm" variant="outline" className="w-full h-6 text-[10px]" disabled={disabled} onClick={add}>
        <Plus className="w-3 h-3 mr-1" /> Add action button
      </Button>
      {buttons.length === 0 && <p className="text-[10px] text-muted-foreground italic">No buttons.</p>}
      {buttons.map((b) => (
        <div key={b.id} className="rounded-md border border-border/40 bg-muted/20 p-1.5 space-y-1">
          <div className="flex items-center gap-1">
            <Input value={b.label} onChange={(e) => patch(b.id, { label: e.target.value })} className="h-6 text-[10px] flex-1" disabled={disabled} placeholder="Label" />
            <button onClick={() => remove(b.id)} disabled={disabled} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-1 items-center">
            <Label className="text-[10px]">Pin</Label>
            <div className="flex items-center gap-1">
              <Switch checked={b.pinVisible} onCheckedChange={(v) => patch(b.id, { pinVisible: v })} disabled={disabled} />
              <Input value={b.pinText ?? ""} onChange={(e) => patch(b.id, { pinText: e.target.value })} placeholder="hint" className="h-5 text-[10px] flex-1" disabled={disabled} />
            </div>
            <Label className="text-[10px]">Trigger</Label>
            <Select
              value={b.trigger.kind}
              onValueChange={(v) => {
                const next: ActionButton["trigger"] =
                  v === "click" ? { kind: "click" } :
                  v === "walkThrough" ? { kind: "walkThrough" } :
                  v === "key" ? { kind: "key", keys: ["E"] } :
                  { kind: "proximity", distance: 2 };
                patch(b.id, { trigger: next });
              }}
              disabled={disabled}
            >
              <SelectTrigger className="h-5 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="click" className="text-xs">click</SelectItem>
                <SelectItem value="proximity" className="text-xs">player nearby</SelectItem>
                <SelectItem value="key" className="text-xs">key combo</SelectItem>
                <SelectItem value="walkThrough" className="text-xs">walk through</SelectItem>
              </SelectContent>
            </Select>
            {b.trigger.kind === "proximity" && (
              <>
                <Label className="text-[10px]">Distance</Label>
                <Input type="number" step={0.1} value={b.trigger.distance} onChange={(e) => patch(b.id, { trigger: { kind: "proximity", distance: parseFloat(e.target.value) || 0 } })} className="h-5 text-[10px]" disabled={disabled} />
              </>
            )}
            {b.trigger.kind === "key" && (
              <>
                <Label className="text-[10px]">Keys</Label>
                <Input value={b.trigger.keys.join("+")} onChange={(e) => patch(b.id, { trigger: { kind: "key", keys: e.target.value.split("+").map((s) => s.trim()).filter(Boolean) } })} placeholder="E or Shift+E" className="h-5 text-[10px]" disabled={disabled} />
              </>
            )}
            <Label className="text-[10px]">Action</Label>
            <Select value={b.actionId} onValueChange={(v) => patch(b.id, { actionId: v })} disabled={disabled}>
              <SelectTrigger className="h-5 text-[10px]"><SelectValue placeholder="Pick interaction…" /></SelectTrigger>
              <SelectContent>
                {interactions.map((i) => <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </>
  );
}