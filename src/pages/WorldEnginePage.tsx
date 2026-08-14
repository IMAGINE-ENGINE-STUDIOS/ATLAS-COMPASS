import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";
import {
  ArrowLeft,
  Brain,
  CircleDot,
  Cpu,
  Eye,
  Gamepad2,
  Loader2,
  Moon,
  Save,
  Sparkles,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import WorldArena, { useKeyboardAction } from "@/components/world/WorldArena";
import TouchControls from "@/components/world/TouchControls";
import { HiddenHeatmap, LatentBars, LossChart, MixtureBars, Panel, Stat } from "@/components/world/WorldPanels";
import { WorldModelEngine } from "@/lib/worldModel/engine";
import { defaultWorldConfig, type WorldConfig } from "@/lib/worldModel/types";
import { getLocalWorld, isLocalWorldId, updateLocalWorld } from "@/lib/worldModel/localWorlds";

type Mode = "explore" | "train" | "dream" | "agent";

const MODES: Array<{ id: Mode; label: string; icon: typeof Eye; blurb: string }> = [
  { id: "explore", label: "Explore", icon: Eye, blurb: "Drive the real world. Every frame + action is recorded." },
  { id: "train", label: "Train", icon: Cpu, blurb: "Fit V on pixels, then M on latent dynamics." },
  { id: "dream", label: "Dream", icon: Moon, blurb: "Renderer off. M hallucinates the world forward." },
  { id: "agent", label: "Agent", icon: Gamepad2, blurb: "Evolve C inside the dream, then transfer it." },
];

const num = "font-mono tabular-nums";

export default function WorldEnginePage() {
  const { id = "" } = useParams();
  const isMobile = useIsMobile();
  const [name, setName] = useState("World Model");
  const [config, setConfig] = useState<WorldConfig | null>(null);
  const [mode, setMode] = useState<Mode>("explore");
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [frames, setFrames] = useState(0);
  const [rollouts, setRollouts] = useState(0);
  const [temperature, setTemperature] = useState(1);
  const [latent, setLatent] = useState<Float32Array | null>(null);
  const [hidden, setHidden] = useState<Float32Array | null>(null);
  const [mixtures, setMixtures] = useState<Float32Array | null>(null);
  const [vaeHistory, setVaeHistory] = useState<number[]>([]);
  const [rnnHistory, setRnnHistory] = useState<number[]>([]);
  const [progress, setProgress] = useState<{ step: number; total: number } | null>(null);
  const [gen, setGen] = useState<{ generation: number; best: number; mean: number; sigma: number } | null>(null);
  const [agentDriving, setAgentDriving] = useState(false);
  const [dreaming, setDreaming] = useState(false);
  const [backend, setBackend] = useState<string>("");
  const [engineReady, setEngineReady] = useState(false);
  const [realReward, setRealReward] = useState(0);

  const engineRef = useRef<WorldModelEngine | null>(null);
  const actionRef = useRef<Float32Array>(new Float32Array(4));
  const poseRef = useRef({ x: 0, z: 0, yaw: 0 });
  const lastFrameRef = useRef<Uint8Array | null>(null);
  const sourceCanvas = useRef<HTMLCanvasElement>(null);
  const reconCanvas = useRef<HTMLCanvasElement>(null);
  const dreamCanvas = useRef<HTMLCanvasElement>(null);
  const frameTick = useRef(0);

  /* -------- load the record -------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      await tf.ready();
      if (alive) setBackend(tf.getBackend());
      if (isLocalWorldId(id)) {
        const row = getLocalWorld(id);
        if (row) {
          setName(row.name);
          setConfig(row.config);
          setTemperature(row.config.temperature ?? 1);
          return;
        }
      }
      const { data } = await supabase
        .from("world_models")
        .select("id,name,config")
        .eq("id", id)
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setName(data.name);
        const cfg = (data.config ?? {}) as Partial<WorldConfig>;
        const merged = cfg.arena ? (cfg as WorldConfig) : defaultWorldConfig();
        setConfig(merged);
        setTemperature(merged.temperature ?? 1);
      } else {
        setConfig(defaultWorldConfig());
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
    // Build V/M/C off the mount path: allocating the nets is heavy enough to
    // stall the first paint, which made the page look frozen.
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
      if (!cancelled && ok) toast.success("Loaded saved weights from this device");
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

  useKeyboardAction(actionRef, (mode === "explore" && !agentDriving) || mode === "dream");

  /* -------- explore: record frames, show live latent -------- */
  const drawSource = useCallback((rgb: Uint8Array, size: number) => {
    const canvas = sourceCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
      if (frameTick.current % 4 === 0) {
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

  const toggleCapture = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (capturing) {
      engine.endRollout();
      setCapturing(false);
      setRollouts(engine.rollouts.length);
    } else {
      engine.beginRollout();
      setCapturing(true);
    }
  };

  /* -------- training -------- */
  const trainVae = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setBusy("Training V (autoencoder)");
    try {
      await engine.trainVae(240, 16, (p) => {
        setProgress({ step: p.step, total: p.total });
        if (p.step % 4 === 0) setVaeHistory([...engine.vaeLossHistory]);
      });
      setVaeHistory([...engine.vaeLossHistory]);
      if (lastFrameRef.current) {
        const z = engine.encodeFrame(lastFrameRef.current);
        setLatent(z);
        if (reconCanvas.current) engine.decodeToCanvas(z, reconCanvas.current);
      }
      toast.success(`V trained — ${engine.vaeSteps} steps, loss ${engine.lastVaeLoss?.toFixed(2)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Training failed");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const trainRnn = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setBusy("Training M (MDN-RNN)");
    try {
      await engine.trainRnn(150, 8, 24, (p) => {
        setProgress({ step: p.step, total: p.total });
        if (p.step % 4 === 0) setRnnHistory([...engine.rnnLossHistory]);
      });
      setRnnHistory([...engine.rnnLossHistory]);
      toast.success(`M trained — ${engine.rnnSteps} steps, NLL ${engine.lastRnnLoss?.toFixed(3)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Training failed");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const stopWork = () => {
    if (engineRef.current) engineRef.current.abortFlag = true;
  };

  /* -------- dream loop -------- */
  useEffect(() => {
    if (mode !== "dream" || !dreaming) return;
    const engine = engineRef.current;
    if (!engine) return;
    if (!engine.rnnTrained) {
      toast.error("Train the dynamics model first — the dream is produced by M.");
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
  }, [mode, dreaming, temperature]);

  /* -------- agent -------- */
  const evolve = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setBusy("Evolving C in the dream");
    try {
      await engine.evolveInDream(12, 60, (g) => setGen(g));
      toast.success(`C evolved — ${engine.generations} generations, best ${engine.bestReward?.toFixed(2)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Evolution failed");
    } finally {
      setBusy(null);
    }
  };

  /* Controller drives the real scene: z from the live frame, h from M. */
  useEffect(() => {
    if (!agentDriving) return;
    const engine = engineRef.current;
    if (!engine || !engine.vaeTrained) {
      toast.error("The controller reads z — train V first.");
      setAgentDriving(false);
      return;
    }
    let stop = false;
    let state = engine.rnn.zeroState(1);
    let hiddenVec: Float32Array = new Float32Array(engine.config.rnnSize);
    const visited: Float32Array[] = [];
    let reward = 0;
    const tickMs = 120;
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
      reward += WorldModelEngine.realNovelty(z, visited);
      visited.push(z);
      setLatent(z);
      setGen((g) => (g ? { ...g, best: g.best } : g));
      setRealReward(reward);
    }, tickMs);
    return () => {
      stop = true;
      window.clearInterval(timer);
      state.h.dispose();
      state.c.dispose();
      actionRef.current = new Float32Array(engine.config.actionDim);
    };
  }, [agentDriving, temperature]);

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
      toast.success("World model saved — weights live in this browser");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const params = engineRef.current?.paramSummary ?? { vae: 0, rnn: 0, controller: 0 };
  const activeMode = MODES.find((m) => m.id === mode)!;

  const console_ = (
    <div className="space-y-3">
      <Panel
        title="Latent z"
        right={<span className={`text-[10px] text-muted-foreground ${num}`}>{config?.latentDim ?? 0}-D</span>}
      >
        <LatentBars z={latent} />
      </Panel>

      <Panel title="Vision · V" right={<span className="text-[10px] text-muted-foreground">frame → z → frame</span>}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <canvas ref={sourceCanvas} width={128} height={128} className="w-full rounded-lg bg-black/40" />
            <p className="mt-1 text-[10px] text-muted-foreground">Observed 64×64</p>
          </div>
          <div>
            <canvas ref={reconCanvas} width={128} height={128} className="w-full rounded-lg bg-black/40" />
            <p className="mt-1 text-[10px] text-muted-foreground">Reconstruction</p>
          </div>
        </div>
        <div className="mt-3">
          <LossChart history={vaeHistory} label="V" />
        </div>
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

      <Panel title="Temperature τ" right={<span className={`text-[10px] ${num}`}>{temperature.toFixed(2)}</span>}>
        <Slider
          value={[temperature]}
          min={0.1}
          max={2}
          step={0.05}
          onValueChange={(v) => setTemperature(v[0])}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Uncertainty of the dream. Low τ collapses onto the most likely future; high τ makes the world
          model hallucinate freely, which stops the controller exploiting its flaws.
        </p>
      </Panel>

      <Panel title="Model card">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Frames" value={frames.toLocaleString()} hint={`${rollouts} rollouts`} />
          <Stat label="V params" value={params.vae.toLocaleString()} hint={`${engineRef.current?.vaeSteps ?? 0} steps`} />
          <Stat label="M params" value={params.rnn.toLocaleString()} hint={`${engineRef.current?.rnnSteps ?? 0} steps`} />
          <Stat label="C params" value={params.controller.toLocaleString()} hint={`${gen?.generation ?? 0} generations`} />
        </div>
        <p className={`mt-2 text-[10px] text-muted-foreground ${num}`}>
          tfjs backend: {backend || "…"}
        </p>
      </Panel>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#05070f] text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#05070f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
          <Link to="/worlds" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Brain className="h-5 w-5 text-sky-300" />
          <h1 className="truncate text-base font-semibold">{name}</h1>
          <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
            V · M · C
          </span>
          <div className="ml-auto flex items-center gap-2">
            {busy ? (
              <Button size="sm" variant="outline" onClick={stopWork}>
                <Square className="mr-1 h-3.5 w-3.5" /> Stop
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={save} disabled={!!busy}>
              <Save className="mr-1 h-4 w-4" /> Save
            </Button>
            {isMobile && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="sm">Console</Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh] overflow-y-auto border-white/10 bg-[#05070f]">
                  {console_}
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
        <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 pb-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id);
                  if (m.id !== "dream") setDreaming(false);
                  if (m.id !== "agent") setAgentDriving(false);
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  mode === m.id
                    ? "border-sky-300/50 bg-sky-400/15 text-sky-100"
                    : "border-white/10 text-white/60 hover:bg-white/5"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {m.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
            {config && (mode === "explore" || mode === "agent" || mode === "train") && (
              <WorldArena
                arena={config.arena}
                actionRef={actionRef}
                poseRef={poseRef}
                frameSize={config.frameSize}
                capturing={capturing || mode === "agent"}
                onFrame={onFrame}
                className="h-full w-full"
              />
            )}
            {mode === "dream" && (
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
            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] backdrop-blur">
              {mode === "dream" ? "renderer off · dreamed by M" : "real renderer · frames → V"}
            </div>
            {capturing && mode !== "dream" && (
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] text-rose-200">
                <CircleDot className="h-3 w-3 animate-pulse" /> recording
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-sm text-muted-foreground">{activeMode.blurb}</p>
              {mode === "explore" && (
                <>
                  <Button size="sm" variant={capturing ? "destructive" : "default"} onClick={toggleCapture}>
                    {capturing ? "End rollout" : "Start rollout"}
                  </Button>
                  <span className={`text-xs text-muted-foreground ${num}`}>
                    {frames.toLocaleString()} frames · {rollouts} rollouts
                  </span>
                </>
              )}
              {mode === "train" && (
                <>
                  <Button size="sm" onClick={trainVae} disabled={!!busy}>
                    {busy?.includes("V") ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Cpu className="mr-1 h-4 w-4" />}
                    Train V · 240 steps
                  </Button>
                  <Button size="sm" variant="outline" onClick={trainRnn} disabled={!!busy}>
                    {busy?.includes("M") ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                    Train M · 150 steps
                  </Button>
                </>
              )}
              {mode === "dream" && (
                <Button size="sm" variant={dreaming ? "destructive" : "default"} onClick={() => setDreaming(!dreaming)}>
                  {dreaming ? "Stop dream" : "Start dream"}
                </Button>
              )}
              {mode === "agent" && (
                <>
                  <Button size="sm" onClick={evolve} disabled={!!busy}>
                    {busy?.includes("C") ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Gamepad2 className="mr-1 h-4 w-4" />}
                    Evolve C · 12 generations
                  </Button>
                  <Button
                    size="sm"
                    variant={agentDriving ? "destructive" : "outline"}
                    onClick={() => setAgentDriving(!agentDriving)}
                  >
                    {agentDriving ? "Stop transfer" : "Play in real world"}
                  </Button>
                </>
              )}
            </div>

            {progress && (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-[width] duration-150"
                    style={{ width: `${(progress.step / progress.total) * 100}%` }}
                  />
                </div>
                <p className={`mt-1 text-[11px] text-muted-foreground ${num}`}>
                  {busy} · step {progress.step}/{progress.total}
                </p>
              </div>
            )}

            {mode === "agent" && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Generation" value={String(gen?.generation ?? 0)} />
                <Stat label="Best (dream)" value={(gen?.best ?? 0).toFixed(2)} />
                <Stat label="Mean (dream)" value={(gen?.mean ?? 0).toFixed(2)} />
                <Stat label="Real transfer" value={realReward.toFixed(2)} hint="same novelty objective" />
              </div>
            )}

            {mode !== "dream" && mode !== "agent" && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Controls · <span className={num}>W A S D</span> move ·{" "}
                <span className={num}>Q E</span> or arrows turn · <span className={num}>R F</span> look
              </p>
            )}
            {mode === "dream" && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                You are steering a hallucination — the same keys feed actions straight into M, no renderer
                involved.
              </p>
            )}
          </div>
        </div>

        {!isMobile && <aside className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1">{console_}</aside>}
      </main>
    </div>
  );
}
