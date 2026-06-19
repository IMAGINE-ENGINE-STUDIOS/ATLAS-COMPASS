import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, ArrowLeft, Layers, Globe2, Lock, Pencil, Footprints, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureLevelSession, withTimeout } from "@/lib/levelSession";
import { EMPTY_SCENE } from "@/lib/levelTypes";
import { buildObstacleCourseScene } from "@/lib/obstacleCoursePreset";
import { createLocalLevel, deleteLocalLevel, getLocalLevelOwnerId, isLocalLevelId, listLocalLevels } from "@/lib/localLevels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import LevelWizardModal from "@/components/level/wizard/LevelWizardModal";

interface LevelRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  updated_at: string;
  owner_id: string;
}

export default function LevelsListPage() {
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const uid = await ensureLevelSession({ allowAnonymous: false });
      setUserId(uid ?? getLocalLevelOwnerId());
      const localLevels = listLocalLevels();
      setLevels(localLevels);
      setLoading(false);
      const { data, error } = await withTimeout(
        supabase
          .from("levels")
          .select("id,name,description,thumbnail_url,is_public,updated_at,owner_id")
          .order("updated_at", { ascending: false }),
        5000,
        { data: null, error: { message: "Levels request timed out", details: "", hint: "", code: "TIMEOUT" } } as any,
      );
      if (error) console.warn("[levels] backend list failed", error.message);
      else setLevels([...localLevels, ...((data ?? []) as LevelRow[])]);
    })();
  }, []);

  const createLevel = async () => {
    const uid = await ensureLevelSession({ allowAnonymous: false });
    if (!uid) {
      const local = createLocalLevel(EMPTY_SCENE);
      navigate(`/level/${local.id}`);
      return;
    }
    const { data, error } = await withTimeout(
      supabase
        .from("levels")
        .insert({ owner_id: uid, name: "Untitled Level", scene: EMPTY_SCENE as any })
        .select("id")
        .single(),
      5000,
      { data: null, error: { message: "Level creation timed out", details: "", hint: "", code: "TIMEOUT" } } as any,
    );
    if (error || !data) {
      toast.error("Backend is unreachable, creating a local draft");
      const local = createLocalLevel(EMPTY_SCENE);
      navigate(`/level/${local.id}`);
    } else {
      navigate(`/level/${data.id}`);
    }
  };

  const createObstacleCourse = async () => {
    const scene = buildObstacleCourseScene();
    const uid = await ensureLevelSession({ allowAnonymous: false });
    if (!uid) {
      const local = createLocalLevel(scene);
      // give it a recognisable name in local storage
      try {
        const { updateLocalLevel } = await import("@/lib/localLevels");
        updateLocalLevel(local.id, { name: "Locomotion Obstacle Course" });
      } catch {}
      navigate(`/level/${local.id}`);
      return;
    }
    const { data, error } = await withTimeout(
      supabase
        .from("levels")
        .insert({ owner_id: uid, name: "Locomotion Obstacle Course", scene: scene as any })
        .select("id")
        .single(),
      5000,
      { data: null, error: { message: "Level creation timed out", details: "", hint: "", code: "TIMEOUT" } } as any,
    );
    if (error || !data) {
      toast.error("Backend unreachable, creating a local draft");
      const local = createLocalLevel(scene);
      navigate(`/level/${local.id}`);
    } else {
      navigate(`/level/${data.id}`);
    }
  };

  const deleteLevel = async (id: string) => {
    if (!confirm("Delete this level? This cannot be undone.")) return;
    if (isLocalLevelId(id)) {
      deleteLocalLevel(id);
      setLevels((prev) => prev.filter((l) => l.id !== id));
      toast.success("Level deleted");
      return;
    }
    const { error } = await supabase.from("levels").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setLevels((prev) => prev.filter((l) => l.id !== id));
    toast.success("Level deleted");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 backdrop-blur-xl bg-background/60 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link to="/atlas" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Layers className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Levels</h1>
          <div className="ml-auto">
            <div className="flex items-center gap-2">
              <Button onClick={() => setWizardOpen(true)} size="sm" variant="outline" className="border-primary/40">
                <Sparkles className="w-4 h-4 mr-1 text-primary" /> Level Wizard
              </Button>
              <Button onClick={createObstacleCourse} size="sm" variant="outline">
                <Footprints className="w-4 h-4 mr-1" /> Obstacle Course
              </Button>
              <Button onClick={createLevel} size="sm">
                <Plus className="w-4 h-4 mr-1" /> New Level
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : levels.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <Layers className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-1">No levels yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Create a Level to design 3D scenes, homes, props or animations — then drop them onto the Atlas.
            </p>
            <Button onClick={createLevel}>
              <Plus className="w-4 h-4 mr-1" /> Create your first Level
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {levels.map((l) => (
              <Card key={l.id} className="group relative overflow-hidden hover:border-primary/60 transition-colors">
                <Link to={`/level/${l.id}`} className="block">
                  <div className="aspect-video bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                    {l.thumbnail_url ? (
                      <img src={l.thumbnail_url} alt={l.name} className="w-full h-full object-cover" />
                    ) : (
                      <Layers className="w-10 h-10 text-primary/60" />
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold truncate">{l.name}</h3>
                      {l.is_public ? (
                        <Globe2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-1" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                      )}
                    </div>
                    {l.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{l.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Updated {new Date(l.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={() => navigate(`/level/${l.id}`)}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {l.owner_id === userId && (
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-7 w-7"
                      onClick={() => deleteLevel(l.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
      <LevelWizardModal open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}