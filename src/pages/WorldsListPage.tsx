import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Brain, Globe2, Layers, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureLevelSession, withTimeout } from "@/lib/levelSession";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createLocalWorld,
  deleteLocalWorld,
  getLocalWorldOwnerId,
  isLocalWorldId,
  listLocalWorlds,
} from "@/lib/worldModel/localWorlds";
import { defaultWorldConfig, generateArena, type ArenaSpec } from "@/lib/worldModel/types";
import type { LevelScene, PrimitiveObject } from "@/lib/levelTypes";

interface WorldRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  updated_at: string;
  owner_id: string;
  metrics?: unknown;
}

/** Turn an existing Imagine Engine scene into an observable arena for the model. */
function arenaFromScene(scene: LevelScene, seed: number): ArenaSpec {
  const base = generateArena(seed, 0);
  const blocks = (scene.objects ?? [])
    .filter((o): o is PrimitiveObject => o.kind === "primitive")
    .slice(0, 60)
    .map((o) => ({
      p: o.position as [number, number, number],
      s: (o.scale ?? [1, 1, 1]) as [number, number, number],
      c: `rgb(${Math.round((o.color?.[0] ?? 0.6) * 255)},${Math.round((o.color?.[1] ?? 0.7) * 255)},${Math.round(
        (o.color?.[2] ?? 0.9) * 255,
      )})`,
    }));
  return { ...base, blocks: blocks.length ? blocks : generateArena(seed).blocks };
}

export default function WorldsListPage() {
  const [worlds, setWorlds] = useState<WorldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [levels, setLevels] = useState<Array<{ id: string; name: string }>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "World Model Engine — Imagine Engine";
    (async () => {
      const uid = await ensureLevelSession({ allowAnonymous: false });
      setUserId(uid ?? getLocalWorldOwnerId());
      const local = listLocalWorlds();
      setWorlds(local);
      setLoading(false);
      const { data, error } = await withTimeout(
        supabase
          .from("world_models")
          .select("id,name,description,thumbnail_url,is_public,updated_at,owner_id,metrics")
          .order("updated_at", { ascending: false }),
        5000,
        { data: null, error: { message: "timeout" } } as never,
      );
      if (error) console.warn("[worlds] backend list failed", error.message);
      else setWorlds([...local, ...((data ?? []) as WorldRow[])]);
      const { data: lvl } = await supabase.from("levels").select("id,name").limit(30);
      setLevels((lvl ?? []) as Array<{ id: string; name: string }>);
    })();
  }, []);

  const createWorld = async (opts?: { name?: string; arena?: ArenaSpec; sourceLevelId?: string }) => {
    const config = defaultWorldConfig();
    if (opts?.arena) config.arena = opts.arena;
    const uid = await ensureLevelSession({ allowAnonymous: false });
    if (!uid) {
      const local = createLocalWorld({ name: opts?.name ?? "Untitled World", config });
      navigate(`/world/${local.id}`);
      return;
    }
    const { data, error } = await withTimeout(
      supabase
        .from("world_models")
        .insert({
          owner_id: uid,
          name: opts?.name ?? "Untitled World",
          config: config as never,
          source_level_id: opts?.sourceLevelId ?? null,
        })
        .select("id")
        .single(),
      5000,
      { data: null, error: { message: "timeout" } } as never,
    );
    if (error || !data) {
      toast.error("Backend unreachable — created a local draft");
      const local = createLocalWorld({ name: opts?.name ?? "Untitled World", config });
      navigate(`/world/${local.id}`);
    } else {
      navigate(`/world/${data.id}`);
    }
  };

  const importFromLevel = async (levelId: string, levelName: string) => {
    const { data, error } = await supabase.from("levels").select("scene").eq("id", levelId).maybeSingle();
    if (error || !data) return toast.error("Could not read that experience");
    const arena = arenaFromScene(data.scene as unknown as LevelScene, Math.floor(Math.random() * 1e9));
    await createWorld({ name: `${levelName} — world model`, arena, sourceLevelId: levelId });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this world model? Learned weights on this device stay until overwritten.")) return;
    if (isLocalWorldId(id)) {
      deleteLocalWorld(id);
      setWorlds((prev) => prev.filter((w) => w.id !== id));
      return;
    }
    const { error } = await supabase.from("world_models").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setWorlds((prev) => prev.filter((w) => w.id !== id));
    toast.success("World model deleted");
  };

  return (
    <div className="min-h-screen bg-[#05070f] text-foreground">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#05070f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-4">
          <Link to="/atlas" className="text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Brain className="h-5 w-5 text-sky-300" />
          <h1 className="text-lg font-semibold">World Model Engine</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/levels">
                <Layers className="mr-1 h-4 w-4" /> Experiences
              </Link>
            </Button>
            <Button size="sm" onClick={() => createWorld()}>
              <Plus className="mr-1 h-4 w-4" /> New World Model
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <section className="mb-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
          <h2 className="text-xl font-semibold">A world that learns itself</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Each world model here follows Ha &amp; Schmidhuber&apos;s <em>World Models</em>: a variational
            autoencoder <strong>V</strong> compresses what the agent sees into a 32-dimensional latent, an
            MDN-RNN <strong>M</strong> learns to predict the next latent from the last action, and a tiny
            linear controller <strong>C</strong> is evolved inside M&apos;s dream. Everything trains in your
            browser on frames captured from the live 3D viewport.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["V — vision", "Conv VAE, real pixels → z"],
              ["M — memory", "LSTM + mixture density, z,a → p(z′)"],
              ["C — controller", "Linear policy evolved with CMA-ES"],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold">{t}</div>
                <div className="text-xs text-muted-foreground">{d}</div>
              </div>
            ))}
          </div>
        </section>

        {levels.length > 0 && (
          <section className="mb-8">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Import from an Experience
            </h3>
            <div className="flex flex-wrap gap-2">
              {levels.map((l) => (
                <Button
                  key={l.id}
                  size="sm"
                  variant="outline"
                  onClick={() => importFromLevel(l.id, l.name)}
                  className="border-white/10"
                >
                  {l.name}
                </Button>
              ))}
            </div>
          </section>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : worlds.length === 0 ? (
          <Card className="border-dashed border-white/10 bg-white/[0.03] p-10 text-center">
            <Brain className="mx-auto mb-3 h-10 w-10 text-sky-300/70" />
            <h2 className="mb-1 text-lg font-semibold">No world models yet</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Create one, explore its 3D world for a minute, then train it until it can dream the world back
              to you with the renderer switched off.
            </p>
            <Button onClick={() => createWorld()}>
              <Plus className="mr-1 h-4 w-4" /> Create your first World Model
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.map((w) => (
              <Card
                key={w.id}
                className="group relative overflow-hidden border-white/10 bg-white/[0.04] transition-colors hover:border-sky-300/50"
              >
                <Link to={`/world/${w.id}`} className="block">
                  <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-[#0b1226] via-[#101a33] to-[#070b16]">
                    {w.thumbnail_url ? (
                      <img
                        src={w.thumbnail_url}
                        alt={`${w.name} learned reconstruction`}
                        className="h-full w-full object-cover"
                        style={{ imageRendering: "pixelated" }}
                        loading="lazy"
                      />
                    ) : (
                      <Brain className="h-10 w-10 text-sky-300/60" />
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-semibold">{w.name}</h3>
                      {w.is_public ? (
                        <Globe2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    {w.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{w.description}</p>
                    )}
                    <p className="mt-2 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {metricLine(w.metrics)} · updated {new Date(w.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => navigate(`/world/${w.id}`)} title="Open">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {(w.owner_id === userId || isLocalWorldId(w.id)) && (
                    <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => remove(w.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function metricLine(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "untrained";
  const metrics = raw as Record<string, unknown>;
  const frames = Number(metrics.frames ?? 0);
  const vae = Number(metrics.vaeSteps ?? 0);
  const rnn = Number(metrics.rnnSteps ?? 0);
  if (!frames && !vae && !rnn) return "untrained";
  return `${frames} frames · V ${vae} · M ${rnn}`;
}
