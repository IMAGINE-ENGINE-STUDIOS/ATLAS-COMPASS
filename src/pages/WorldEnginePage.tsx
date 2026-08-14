import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronDown,
  CircleDot,
  Gamepad2,
  Image as ImageIcon,
  Loader2,
  Moon,
  Play,
  Save,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import WorldArena, { useKeyboardAction, type Pose } from "@/components/world/WorldArena";
import TouchControls from "@/components/world/TouchControls";
import { HiddenHeatmap, LatentBars, LossChart, MixtureBars, Panel, Stat } from "@/components/world/WorldPanels";
import { WorldModelEngine } from "@/lib/worldModel/engine";
import { defaultWorldConfig, type WorldConfig } from "@/lib/worldModel/types";
import { getLocalWorld, isLocalWorldId, updateLocalWorld } from "@/lib/worldModel/localWorlds";
import { SCENARIOS, arenaFromImage, generateScenario, type ScenarioId } from "@/lib/worldModel/scenarios";
import {
  ExplorerPolicy,
  IDLE_PIPELINE,
  PRESETS,
  runPipeline,
  STAGES,
  type PipelineState,
  type StageId,
} from "@/lib/worldModel/pipeline";

type View = "live" | "dream";
type PresetKey = keyof typeof PRESETS;

const num = "font-mono tabular-nums";

export default function WorldEnginePage() {
  const { id = "" } = useParams();
  const isMobile = useIsMobile();
  const [name, setName] = useState("World Model");
  const [config, setConfig] = useState<WorldConfig | null>(null);
  const [view, setView] = useState<View>("live");
  const [preset, setPreset] = useState<PresetKey>("standard");
  const [pipeline, setPipeline] = useState<PipelineState>(IDLE_PIPELINE);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  const [frames, setFrames] = useState(0);
  const [rollouts, setRollouts] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [temperature, setTemperature] = useState(1);
  const [latent, setLatent] = useState<Float32Array | null>(null);
  const [hidden, setHidden] = useState<Float32Array | null>(null);
  const [mixtures, setMixtures] = useState<Float32Array | null>(null);
  const [vaeHistory, setVaeHistory] = useState<number[]>([]);
  const [rnnHistory, setRnnHistory] = useState<number[]>([]);
  const [metricsTick, setMetricsTick] = useState(0);
  const [agentDriving, setAgentDriving] = useState(false);
  const [dreaming, setDreaming] = useState(false);
  const [backend, setBackend] = useState<string>("");
  const [engineReady, setEngineReady] = useState(false);
  const [explorerOn, setExplorerOn] = useState(false);

  const engineRef = useRef<WorldModelEngine | null>(null);
  const actionRef = useRef<Float32Array>(new Float32Array(4));
  const poseRef = useRef<Pose>({ x: 0, z: 0, yaw: 0 });
  const lastFrameRef = useRef<Uint8Array | null>(null);
  const sourceCanvas = useRef<HTMLCanvasElement>(null);
  const reconCanvas = useRef<HTMLCanvasElement>(null);
  const dreamCanvas = useRef<HTMLCanvasElement>(null);
  const frameTick = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  /* -------- load the record -------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      await tf.ready();
      if (alive) setBackend(tf.getBackend());
      if (isLocalWorldId(id)) {
        const row = getLocalWorld(id);
        if (row && alive) {
          setName(row.name);
          setConfig(hydrate(row.config));
          setTemperature(row.config.temperature ?? 1);
          return;
        }
      }
      const { data } = await supabase.from("world_models").select("id,name,config").eq("id", id).maybeSingle();
      if (!alive) return;
      if (data) {
        setName(data.name);
        const cfg = (data.config ?? {}) as Partial<WorldConfig>;
        const merged = cfg.arena ? hydrate(cfg as WorldConfig) : freshConfig("neon-city");
        setConfig(merged);
        setTemperature(merged.temperature ?? 1);
      } else {
        setConfig(freshConfig("neon-city"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  /* -------- build the engine once we know the config -------- */
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let engine: WorldModelEngine | null = null;
    document.title = `${name} — World Model Engine`;
    setEngineReady(false);
    (async () => {
      await tf.ready();
      if (cancelled) return;
      setBackend(tf.getBackend());
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled) return;
      engine = new WorldModelEngine(config);
      if (cancelled) {
        engine.dispose();
        return;
      }
      engineRef.current = engine;
      setEngineReady(true);
      const ok = await engine.loadWeights(id);
      if (!cancelled && ok) {
        setMetricsTick((t) => t + 1);
        toast.success("Loaded saved weights from this device");
      }
    })();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
      setEngineReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.config.temperature = temperature;
  }, [temperature]);

  const manualControl = (view === "live" && !agentDriving && !explorerOn) || (view === "dream" && dreaming);
  useKeyboardAction(actionRef, manualControl);

  /* -------- frame intake -------- */
  const drawSource = useCallback((rgb: Uint8Array, size: number) => {
    const canvas = sourceCanvas.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      img.data[i * 4] = rgb[i * 3];
      img.data[i * 4 + 1] = rgb[i * 3 + 1];
      img.data[i * 4 + 2] = rgb[i * 3 + 2];
      img.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement("canvas");
    tmp.width = size;
    tmp.height = size;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  }, []);

  const onFrame = useCallback(
    (rgb: Uint8Array) => {
      const engine = engineRef.current;
      if (!engine) return;
      lastFrameRef.current = rgb;
      engine.pushFrame(rgb, actionRef.current);
      frameTick.current++;
      if (frameTick.current % 5 === 0) {
        setFrames(engine.frameCount);
        setRollouts(engine.rollouts.length);
        drawSource(rgb, engine.config.frameSize);
        if (engine.vaeTrained) {
          const z = engine.encodeFrame(rgb);
          setLatent(z);
          if (reconCanvas.current) engine.decodeToCanvas(z, reconCanvas.current);
        }
      }
    },
    [drawSource],
  );

  /* -------- autonomous explorer (drives collection) -------- */
  useEffect(() => {
    if (!explorerOn) return;
    const policy = new ExplorerPolicy(config?.arena.bounds ?? 44);
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      actionRef.current = policy.step(dt, poseRef.current);
    }, 60);
    return () => {
      window.clearInterval(timer);
      actionRef.current = new Float32Array(4);
    };
  }, [explorerOn, config]);

  /* -------- the one-button pipeline -------- */
  const collect = useCallback(
    (target: number, onProgress: (frames: number) => void) =>
      new Promise<void>((resolve) => {
        const engine = engineRef.current;
        if (!engine) return resolve();
        const startFrames = engine.frameCount;
        engine.beginRollout();
        setCapturing(true);
        setExplorerOn(true);
        setView("live");
        let rolloutFrames = 0;
        const timer = window.setInterval(() => {
          const gathered = engine.frameCount - startFrames;
          onProgress(engine.frameCount);
          rolloutFrames++;
          // split experience into episodes so M never learns across a jump cut
          if (rolloutFrames % 40 === 0) {
            engine.endRollout();
            engine.beginRollout();
          }
          if (gathered >= target || engine.abortFlag || engine.frameCount >= 3000) {
            window.clearInterval(timer);
            engine.endRollout();
            setCapturing(false);
            setExplorerOn(false);
            setFrames(engine.frameCount);
            setRollouts(engine.rollouts.length);
            resolve();
          }
        }, 250);
      }),
    [],
  );

  const startPipeline = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.abortFlag = false;
    setPipeline(IDLE_PIPELINE);
    setRunning(true);
    try {
      await runPipeline(engine, PRESETS[preset].opts, {
        collect,
        onStage: (stageId: StageId, patch) =>
          setPipeline((prev) => ({ ...prev, [stageId]: { ...prev[stageId], ...patch } })),
        onMetrics: () => {
          setVaeHistory([...engine.vaeLossHistory]);
          setRnnHistory([...engine.rnnLossHistory]);
          setMetricsTick((t) => t + 1);
          if (lastFrameRef.current && engine.vaeTrained) {
            const z = engine.encodeFrame(lastFrameRef.current);
            setLatent(z);
            if (reconCanvas.current) engine.decodeToCanvas(z, reconCanvas.current);
          }
        },
      });
      if (!engine.abortFlag) toast.success("World learned — open the Dream view to walk inside it");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pipeline failed");
    } finally {
      setRunning(false);
      setCapturing(false);
      setExplorerOn(false);
    }
  };

  const stopWork = () => {
    if (engineRef.current) engineRef.current.abortFlag = true;
    setRunning(false);
    setExplorerOn(false);
    setCapturing(false);
  };

  /* -------- manual stages (advanced) -------- */
  const runStage = async (label: string, fn: () => Promise<unknown>) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.abortFlag = false;
    setBusy(label);
    try {
      await fn();
      setVaeHistory([...engine.vaeLossHistory]);
      setRnnHistory([...engine.rnnLossHistory]);
      setMetricsTick((t) => t + 1);
      toast.success(`${label} done`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  /* -------- dream loop -------- */
  useEffect(() => {
    if (view !== "dream" || !dreaming) return;
    const engine = engineRef.current;
    if (!engine) return;
    if (!engine.rnnTrained) {
      toast.error("Learn the world first — the dream is produced by M.");
      setDreaming(false);
      return;
    }
    let stop = false;
    let { z, state } = engine.newDream();
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (stop) return;
      if (t - last > 90) {
        last = t;
        const step = engine.dreamStep(z, actionRef.current, state, temperature);
        z = step.z;
        state = step.state;
        setLatent(z);
        setHidden(step.hidden);
        setMixtures(step.mixtures);
        if (dreamCanvas.current) engine.decodeToCanvas(z, dreamCanvas.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      state.h.dispose();
      state.c.dispose();
    };
  }, [view, dreaming, temperature]);

  /* -------- controller plays the real world -------- */
  useEffect(() => {
    if (!agentDriving) return;
    const engine = engineRef.current;
    if (!engine || !engine.vaeTrained) {
      toast.error("The controller reads z — learn the world first.");
      setAgentDriving(false);
      return;
    }
    let stop = false;
    let state = engine.rnn.zeroState(1);
    let hiddenVec: Float32Array = new Float32Array(engine.config.rnnSize);
    const visited: Float32Array[] = [];
    const timer = window.setInterval(() => {
      if (stop || !lastFrameRef.current) return;
      const z = engine.encodeFrame(lastFrameRef.current);
      const input = new Float32Array(engine.controller.inputDim);
      input.set(z, 0);
      input.set(hiddenVec, z.length);
      const a = engine.controller.act(input);
      actionRef.current = a;
      if (engine.rnnTrained) {
        const step = engine.dreamStep(z, a, state, temperature);
        state = step.state;
        hiddenVec = step.hidden;
        setHidden(step.hidden);
      }
      visited.push(z);
      setLatent(z);
    }, 120);
    return () => {
      stop = true;
      window.clearInterval(timer);
      state.h.dispose();
      state.c.dispose();
      actionRef.current = new Float32Array(engine.config.actionDim);
    };
  }, [agentDriving, temperature]);

  /* -------- world building -------- */
  const applyScenario = (scenario: ScenarioId) => {
    if (scenario === "seed-image") {
      fileInput.current?.click();
      return;
    }
    setConfig((prev) => ({
      ...(prev ?? defaultWorldConfig()),
      arena: generateScenario(scenario, Math.floor(Math.random() * 1e9)),
    }));
    setPipeline(IDLE_PIPELINE);
    toast.success("New world built — models reset for it");
  };

  const onSeedImage = async (file: File) => {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Could not read the file"));
        fr.readAsDataURL(file);
      });
      const arena = await arenaFromImage(dataUrl);
      setConfig((prev) => ({ ...(prev ?? defaultWorldConfig()), arena }));
      setPipeline(IDLE_PIPELINE);
      toast.success(`Seed world built from ${file.name} — ${arena.blocks.length} columns`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not use that image");
    }
  };

  /* -------- save -------- */
  const save = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setBusy("Saving");
    try {
      await engine.save(id);
      const metrics = {
        frames: engine.frameCount,
        rollouts: engine.rollouts.length,
        vaeSteps: engine.vaeSteps,
        vaeLoss: engine.lastVaeLoss,
        rnnSteps: engine.rnnSteps,
        rnnLoss: engine.lastRnnLoss,
        generations: engine.generations,
        bestReward: engine.bestReward,
      };
      const thumb = reconCanvas.current?.toDataURL("image/jpeg", 0.6) ?? null;
      if (isLocalWorldId(id)) {
        updateLocalWorld(id, {
          config: { ...engine.config, temperature },
          metrics,
          weights_ref: `indexeddb://wm-${id}`,
          thumbnail_url: thumb,
        });
      } else {
        await supabase
          .from("world_models")
          .update({
            config: { ...engine.config, temperature } as never,
            metrics: metrics as never,
            weights_ref: `indexeddb://wm-${id}`,
          })
          .eq("id", id);
      }
      toast.success("Saved — weights live in this browser");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const engine = engineRef.current;
  const params = engine?.paramSummary ?? { vae: 0, rnn: 0, controller: 0 };
  const scenarioId = (config?.arena.preset ?? "neon-city") as ScenarioId;
  const scenarioMeta = SCENARIOS.find((s) => s.id === scenarioId);
  const learned = !!engine?.rnnTrained;
  const overall = useMemo(() => {
    const vals = STAGES.map((s) => pipeline[s.id].progress);
    return vals.reduce((a, b) => a + b, 0) / STAGES.length;
  }, [pipeline]);

  const inspector = (
    <div className="space-y-3">
      <Panel title="Vision · V" right={<span className="text-[10px] text-muted-foreground">frame → z → frame</span>}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <canvas ref={sourceCanvas} width={128} height={128} className="w-full rounded-lg bg-black/40" />
            <p className="mt-1 text-[10px] text-muted-foreground">What it sees</p>
          </div>
          <div>
            <canvas ref={reconCanvas} width={128} height={128} className="w-full rounded-lg bg-black/40" />
            <p className="mt-1 text-[10px] text-muted-foreground">What it remembers</p>
          </div>
        </div>
        <div className="mt-3">
          <LossChart history={vaeHistory} label="V" />
        </div>
      </Panel>

      <Panel title="Latent z" right={<span className={`text-[10px] text-muted-foreground ${num}`}>{config?.latentDim ?? 0}-D</span>}>
        <LatentBars z={latent} />
      </Panel>

      <Panel title="Memory · M" right={<span className={`text-[10px] text-muted-foreground ${num}`}>{config?.rnnSize ?? 0} units</span>}>
        <HiddenHeatmap h={hidden} />
        <div className="mt-3">
          <LossChart history={rnnHistory} label="M" />
        </div>
        <div className="mt-3">
          <MixtureBars weights={mixtures} />
        </div>
      </Panel>

      <Panel title="Quality" key={metricsTick}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Recon (held out)" value={engine?.valLoss != null ? engine.valLoss.toFixed(1) : "—"} hint="lower is sharper" />
          <Stat label="Dream error" value={engine?.dreamError != null ? engine.dreamError.toFixed(3) : "—"} hint="open-loop, 24 steps" />
          <Stat label="Frames kept" value={frames.toLocaleString()} hint={`${engine?.skippedFrames ?? 0} duplicates dropped`} />
          <Stat label="Episodes" value={String(rollouts)} />
        </div>
      </Panel>

      <Panel title="Temperature τ" right={<span className={`text-[10px] ${num}`}>{temperature.toFixed(2)}</span>}>
        <Slider value={[temperature]} min={0.1} max={2} step={0.05} onValueChange={(v) => setTemperature(v[0])} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          How uncertain the dream is. Low τ gives the single most likely future; high τ makes the world model
          hallucinate freely.
        </p>
      </Panel>

      <Panel title="Model card">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="V params" value={params.vae.toLocaleString()} hint={`${engine?.vaeSteps ?? 0} steps`} />
          <Stat label="M params" value={params.rnn.toLocaleString()} hint={`${engine?.rnnSteps ?? 0} steps`} />
          <Stat label="C params" value={params.controller.toLocaleString()} hint={`${engine?.generations ?? 0} generations`} />
          <Stat label="Backend" value={backend || "…"} />
        </div>
      </Panel>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#05070f] text-foreground">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onSeedImage(f);
          e.target.value = "";
        }}
      />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#05070f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
          <Link to="/worlds" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Brain className="h-5 w-5 text-sky-300" />
          <h1 className="truncate text-base font-semibold">{name}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-full border border-white/10 p-0.5 sm:flex">
              {(["live", "dream"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setView(v);
                    if (v !== "dream") setDreaming(false);
                    if (v !== "live") setAgentDriving(false);
                  }}
                  className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
                    view === v ? "bg-sky-400/20 text-sky-100" : "text-white/60 hover:text-white"
                  }`}
                >
                  {v === "live" ? "Live world" : "Dream"}
                </button>
              ))}
            </div>
            {running || busy ? (
              <Button size="sm" variant="outline" onClick={stopWork}>
                <Square className="mr-1 h-3.5 w-3.5" /> Stop
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={save} disabled={!!busy || running}>
              <Save className="mr-1 h-4 w-4" /> Save
            </Button>
            {isMobile && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="sm">Inspect</Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh] overflow-y-auto border-white/10 bg-[#05070f]">
                  {inspector}
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
            {config && view === "live" && (
              <WorldArena
                arena={config.arena}
                actionRef={actionRef}
                poseRef={poseRef}
                frameSize={config.frameSize}
                capturing={capturing || agentDriving}
                onFrame={onFrame}
                className="h-full w-full"
              />
            )}
            {view === "dream" && (
              <div className="flex h-full w-full items-center justify-center bg-black">
                <canvas
                  ref={dreamCanvas}
                  width={512}
                  height={512}
                  className="h-full max-h-full rounded-xl"
                  style={{ imageRendering: "pixelated", aspectRatio: "1 / 1" }}
                />
              </div>
            )}
            <div className="pointer-events-none absolute left-3 top-3 flex gap-2">
              <span className="rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] backdrop-blur">
                {view === "dream" ? "renderer off · dreamed by M" : scenarioMeta?.label ?? "live world"}
              </span>
              {explorerOn && (
                <span className="rounded-full bg-sky-500/20 px-2.5 py-1 text-[10px] text-sky-100">explorer driving</span>
              )}
            </div>
            <TouchControls actionRef={actionRef} enabled={manualControl} />
            {!engineReady && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                <span className="flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> allocating V · M · C
                </span>
              </div>
            )}
            {capturing && view === "live" && (
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] text-rose-200">
                <CircleDot className="h-3 w-3 animate-pulse" /> recording · {frames.toLocaleString()}
              </div>
            )}
          </div>

          {/* ---- the single control surface ---- */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <h2 className="text-sm font-semibold">Teach this world</h2>
                <p className="text-[11px] text-muted-foreground">
                  One run: explore → see → predict → act. You can walk around while it learns.
                </p>
              </div>
              <div className="flex rounded-full border border-white/10 p-0.5">
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setPreset(k)}
                    title={PRESETS[k].blurb}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      preset === k ? "bg-white/15 text-white" : "text-white/55 hover:text-white"
                    }`}
                  >
                    {PRESETS[k].label}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={startPipeline} disabled={running || !engineReady || !!busy}>
                {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                {running ? `Learning · ${(overall * 100).toFixed(0)}%` : "Start learning"}
              </Button>
            </div>

            <ol className="mt-4 space-y-2">
              {STAGES.map((s, i) => {
                const st = pipeline[s.id];
                return (
                  <li key={s.id} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                        st.status === "done"
                          ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-200"
                          : st.status === "running"
                            ? "border-sky-400/60 bg-sky-400/20 text-sky-100"
                            : st.status === "error"
                              ? "border-rose-400/60 bg-rose-400/20 text-rose-200"
                              : "border-white/15 text-white/50"
                      }`}
                    >
                      {st.status === "done" ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium">{s.label}</span>
                        <span className={`truncate text-[10px] text-muted-foreground ${num}`}>{st.detail}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{s.blurb}</p>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-[width] duration-200 ${
                            st.status === "error" ? "bg-rose-400" : "bg-sky-400"
                          }`}
                          style={{ width: `${st.progress * 100}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              {view === "live" ? (
                <>
                  <Button
                    size="sm"
                    variant={agentDriving ? "destructive" : "outline"}
                    onClick={() => setAgentDriving(!agentDriving)}
                    disabled={running || !learned}
                  >
                    <Gamepad2 className="mr-1 h-4 w-4" /> {agentDriving ? "Take back control" : "Let the agent play"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const e = engineRef.current;
                      if (!e) return;
                      if (capturing) {
                        e.endRollout();
                        setCapturing(false);
                      } else {
                        e.beginRollout();
                        setCapturing(true);
                      }
                    }}
                    disabled={running}
                  >
                    <CircleDot className="mr-1 h-4 w-4" /> {capturing ? "Stop recording" : "Record my own run"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant={dreaming ? "destructive" : "default"}
                  onClick={() => setDreaming(!dreaming)}
                  disabled={!learned}
                >
                  {dreaming ? <Square className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
                  {dreaming ? "Stop dream" : "Walk inside the dream"}
                </Button>
              )}
              <span className="text-[11px] text-muted-foreground">
                {view === "dream"
                  ? "No renderer — every pixel is predicted by M and painted by V."
                  : "W A S D move · Q E turn · R F look"}
              </span>
            </div>
          </div>

          {/* ---- world builder ---- */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-300" />
              <h2 className="text-sm font-semibold">World</h2>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {config?.arena.blocks.length ?? 0} structures · {(config?.arena.agents ?? []).length} moving ·{" "}
                {(config?.arena.beacons ?? []).length} beacons
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => applyScenario(s.id)}
                  disabled={running}
                  className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-40 ${
                    scenarioId === s.id
                      ? "border-sky-400/50 bg-sky-400/10"
                      : "border-white/10 hover:border-white/25 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {s.needsImage && <ImageIcon className="h-3.5 w-3.5" />} {s.label}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{s.blurb}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setAdvanced(!advanced)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs text-white/70 hover:bg-white/5"
          >
            Advanced · run stages by hand
            <ChevronDown className={`h-4 w-4 transition-transform ${advanced ? "rotate-180" : ""}`} />
          </button>
          {advanced && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || running}
                onClick={() => runStage("Train V", () => engineRef.current!.trainVae(300, 24))}
              >
                Train V · 300
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || running}
                onClick={() => runStage("Train M", () => engineRef.current!.trainRnn(300, 12, 24))}
              >
                Train M · 300
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || running}
                onClick={() => runStage("Evolve C", () => engineRef.current!.evolveInDream(12, 60))}
              >
                Evolve C · 12 gens
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || running}
                onClick={() => runStage("Score dream", () => engineRef.current!.evaluateDream(24))}
              >
                Score dream
              </Button>
              {busy && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}
                </span>
              )}
            </div>
          )}
        </div>

        {!isMobile && <aside className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1">{inspector}</aside>}
      </main>
    </div>
  );
}

/* -------- config helpers -------- */

function freshConfig(scenario: ScenarioId): WorldConfig {
  return { ...defaultWorldConfig(), arena: generateScenario(scenario, Math.floor(Math.random() * 1e9)) };
}

/** Older records only stored blocks — give them the new scene fields. */
function hydrate(config: WorldConfig): WorldConfig {
  if (config.arena?.preset) return config;
  return { ...config, arena: generateScenario("neon-city", config.arena?.seed ?? 1) };
}
