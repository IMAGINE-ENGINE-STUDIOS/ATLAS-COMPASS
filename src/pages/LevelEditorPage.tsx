import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Save, Plus, Trash2, Box, Circle, Square, Cylinder, Cone,
  Upload, Sun, Lightbulb, Film, Play, Pause, MapPin, Layers, Eye, EyeOff,
  Loader2, Globe2, Lock as LockIcon, ChevronDown, ChevronRight, Pencil, Magnet,
  SunMedium, FlashlightIcon as Spotlight, Undo2, Redo2,
  Move3d, Rotate3d, Scaling,
  Layers as LayersIcon, FolderPlus,
  Unlock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureLevelSession } from "@/lib/levelSession";
import {
  EMPTY_SCENE, LevelScene, SceneObject, SceneLight, AnimationTrack,
  PrimitiveObject, PolygonObject, ModelObject, newId, Vec3, RGBA,
  SceneLayer, DEFAULT_LAYER_ID, defaultLayers,
  SceneTerrain, defaultTerrain,
} from "@/lib/levelTypes";
import LevelScene3D from "@/components/level/LevelScene3D";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

function rgbaToHex(c: RGBA): string {
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}
function hexToRgba(hex: string, a = 1): RGBA {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    a,
  ];
}

function makePrimitive(shape: PrimitiveObject["shape"]): PrimitiveObject {
  return {
    id: newId("obj"),
    kind: "primitive",
    name: shape[0].toUpperCase() + shape.slice(1),
    shape,
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    color: [0.4, 0.6, 1, 1],
    metalness: 0.1,
    roughness: 0.6,
  };
}

function makePolygon(): PolygonObject {
  return {
    id: newId("obj"),
    kind: "polygon",
    name: "Polygon",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    points: [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    extrude: 1,
    bevel: 0,
    closed: true,
    fillColor: [0.6, 0.7, 0.9, 1],
    sideColor: [0.5, 0.55, 0.7, 1],
    topColor: [0.7, 0.75, 0.95, 1],
  };
}

function makeLight(kind: SceneLight["kind"]): SceneLight {
  return {
    id: newId("lgt"),
    name: kind[0].toUpperCase() + kind.slice(1) + " Light",
    kind,
    position: [4, 6, 4],
    color: [1, 1, 1, 1],
    intensity: kind === "ambient" ? 0.4 : 1,
    castShadow: kind !== "ambient",
  };
}

export default function LevelEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [name, setName] = useState("Untitled Level");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [scene, setScene] = useState<LevelScene>(EMPTY_SCENE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [placeLat, setPlaceLat] = useState("40.7580");
  const [placeLng, setPlaceLng] = useState("-73.9855");
  const [placeScale, setPlaceScale] = useState("1");
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [selectedLightIds, setSelectedLightIds] = useState<Set<string>>(new Set());
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapSize, setSnapSize] = useState(0.5);
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [addingPointMode, setAddingPointMode] = useState<boolean>(false);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale" | null>("translate");
  const [currentLayerId, setCurrentLayerId] = useState<string>(DEFAULT_LAYER_ID);

  const snap = snapEnabled ? snapSize : 0;

  const isOwner = userId && ownerId && userId === ownerId;

  const selectObject = (oid: string, multi = false) => {
    if (multi) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(oid)) next.delete(oid);
        else next.add(oid);
        return next;
      });
      setSelectedId(oid);
      setSelectedLightIds(new Set());
      setSelectedLightId(null);
    } else {
      setSelectedIds(new Set([oid]));
      setSelectedId(oid);
      setSelectedLightIds(new Set());
      setSelectedLightId(null);
    }
  };

  const selectLight = (lid: string, multi = false) => {
    if (multi) {
      setSelectedLightIds((prev) => {
        const next = new Set(prev);
        if (next.has(lid)) next.delete(lid);
        else next.add(lid);
        return next;
      });
      setSelectedLightId(lid);
      setSelectedIds(new Set());
      setSelectedId(null);
    } else {
      setSelectedLightIds(new Set([lid]));
      setSelectedLightId(lid);
      setSelectedIds(new Set());
      setSelectedId(null);
    }
  };

  // ---------- undo/redo history ----------
  const historyRef = useRef<{ past: LevelScene[]; future: LevelScene[] }>({ past: [], future: [] });
  const [historyTick, setHistoryTick] = useState(0);
  const HISTORY_LIMIT = 100;
  const pushHistory = useCallback((prev: LevelScene) => {
    const h = historyRef.current;
    h.past.push(prev);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    setHistoryTick((t) => t + 1);
  }, []);
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length) return;
    setScene((cur) => {
      const prev = h.past.pop()!;
      h.future.push(cur);
      setHistoryTick((t) => t + 1);
      return prev;
    });
  }, []);
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    setScene((cur) => {
      const next = h.future.pop()!;
      h.past.push(cur);
      setHistoryTick((t) => t + 1);
      return next;
    });
  }, []);

  // load
  useEffect(() => {
    if (!id) return;
    (async () => {
      const uid = await ensureLevelSession();
      setUserId(uid);
      const { data, error } = await supabase
        .from("levels")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error(error?.message ?? "Level not found");
        navigate("/levels");
        return;
      }
      setName(data.name);
      setDescription(data.description ?? "");
      setIsPublic(data.is_public);
      setOwnerId(data.owner_id);
      setScene({ ...EMPTY_SCENE, ...(data.scene as any) });
      setLoading(false);
    })();
  }, [id, navigate]);

  const lastSavedAtRef = useRef<number>(0);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");

  const save = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!id || !isOwner) return;
      setSaving(true);
      setAutosaveStatus("saving");
      const { error } = await supabase
        .from("levels")
        .update({ name, description, is_public: isPublic, scene: scene as any })
        .eq("id", id);
      setSaving(false);
      if (error) {
        setAutosaveStatus("error");
        toast.error(error.message);
      } else {
        lastSavedAtRef.current = Date.now();
        setAutosaveStatus("saved");
        if (!opts.silent) toast.success("Saved");
      }
    },
    [id, name, description, isPublic, scene, isOwner],
  );

  // -------- Autosave: persist every change so nothing is lost --------
  // Skip the initial load (when scene is hydrated from the server) by
  // gating on `loading` and a small ready ref.
  const autosaveReadyRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    // First post-load render — mark ready but don't save (no changes yet).
    if (!autosaveReadyRef.current) {
      autosaveReadyRef.current = true;
      return;
    }
    if (!isOwner) return;
    setAutosaveStatus("dirty");
    const t = window.setTimeout(() => {
      save({ silent: true });
    }, 600);
    return () => window.clearTimeout(t);
  }, [scene, name, description, isPublic, loading, isOwner, save]);

  // Best-effort flush on tab close / navigation so the last edit isn't lost.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (autosaveStatus === "dirty" || autosaveStatus === "saving") {
        // fire-and-forget; not awaited, but Supabase will keep the fetch alive
        save({ silent: true });
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [autosaveStatus, save]);

  // keyboard shortcuts
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const oids = Array.from(selectedIds).filter(
          (oid) => !isObjectLocked(scene.objects.find((o) => o.id === oid)),
        );
        const lids = Array.from(selectedLightIds);
        if (oids.length) {
          removeObjects(oids);
          setSelectedIds(new Set());
          setSelectedId(null);
          if (editingPolygonId && oids.includes(editingPolygonId)) setEditingPolygonId(null);
        }
        if (lids.length) {
          removeLights(lids);
          setSelectedLightIds(new Set());
          setSelectedLightId(null);
        }
      }
      // gizmo mode shortcuts — only when no input is focused
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as any)?.isContentEditable) return;
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key.toLowerCase() === "g") setTransformMode("translate");
        else if (e.key.toLowerCase() === "r") setTransformMode("rotate");
        else if (e.key.toLowerCase() === "t") setTransformMode("scale");
        else if (e.key === "Escape") setTransformMode(null);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [save, undo, redo, selectedIds, selectedLightIds, editingPolygonId]);

  /* ---------- scene mutators ---------- */

  const updateScene = (mut: (s: LevelScene) => LevelScene) =>
    setScene((prev) => {
      pushHistory(prev);
      return mut(structuredClone(prev));
    });

  const addObject = (o: SceneObject) =>
    updateScene((s) => {
      if (!s.layers || s.layers.length === 0) s.layers = defaultLayers();
      const targetLayer = s.layers.find((l) => l.id === currentLayerId)
        ? currentLayerId
        : s.layers[0].id;
      s.objects.push({ ...o, layerId: o.layerId ?? targetLayer } as SceneObject);
      return s;
    });

  const removeObject = (oid: string) =>
    updateScene((s) => {
      s.objects = s.objects.filter((o) => o.id !== oid);
      s.animations = s.animations.filter((a) => a.targetId !== oid);
      return s;
    });

  const removeObjects = (oids: string[]) =>
    updateScene((s) => {
      s.objects = s.objects.filter((o) => !oids.includes(o.id));
      s.animations = s.animations.filter((a) => !oids.includes(a.targetId));
      return s;
    });

  const patchObject = (oid: string, patch: Partial<SceneObject>) =>
    updateScene((s) => {
      const idx = s.objects.findIndex((o) => o.id === oid);
      if (idx >= 0) s.objects[idx] = { ...s.objects[idx], ...patch } as SceneObject;
      return s;
    });

  const addLight = (l: SceneLight) =>
    updateScene((s) => {
      s.lights.push(l);
      return s;
    });
  const removeLight = (lid: string) =>
    updateScene((s) => {
      s.lights = s.lights.filter((l) => l.id !== lid);
      return s;
    });
  const removeLights = (lids: string[]) =>
    updateScene((s) => {
      s.lights = s.lights.filter((l) => !lids.includes(l.id));
      return s;
    });
  const patchLight = (lid: string, patch: Partial<SceneLight>) =>
    updateScene((s) => {
      const idx = s.lights.findIndex((l) => l.id === lid);
      if (idx >= 0) s.lights[idx] = { ...s.lights[idx], ...patch };
      return s;
    });

  const addTrack = (t: AnimationTrack) =>
    updateScene((s) => {
      s.animations.push(t);
      return s;
    });
  const removeTrack = (tid: string) =>
    updateScene((s) => {
      s.animations = s.animations.filter((a) => a.id !== tid);
      return s;
    });
  const patchTrack = (tid: string, patch: Partial<AnimationTrack>) =>
    updateScene((s) => {
      const idx = s.animations.findIndex((a) => a.id === tid);
      if (idx >= 0) s.animations[idx] = { ...s.animations[idx], ...patch };
      return s;
    });

  /* ---------- layers ---------- */

  const ensureLayers = (s: LevelScene) => {
    if (!s.layers || s.layers.length === 0) s.layers = defaultLayers();
    return s;
  };
  const addLayer = () =>
    updateScene((s) => {
      ensureLayers(s);
      const n = (s.layers!.length) + 1;
      const layer: SceneLayer = {
        id: newId("lay"),
        name: `Layer ${n}`,
        color: ["#3b82f6", "#22c55e", "#f59e0b", "#ec4899", "#a855f7", "#14b8a6"][n % 6],
        visible: true,
      };
      s.layers!.push(layer);
      setCurrentLayerId(layer.id);
      return s;
    });
  const removeLayer = (lid: string) =>
    updateScene((s) => {
      ensureLayers(s);
      if (lid === DEFAULT_LAYER_ID) return s; // protect default
      s.layers = s.layers!.filter((l) => l.id !== lid);
      // reassign orphaned objects to the default layer
      s.objects = s.objects.map((o) =>
        o.layerId === lid ? ({ ...o, layerId: DEFAULT_LAYER_ID } as SceneObject) : o,
      );
      if (currentLayerId === lid) setCurrentLayerId(DEFAULT_LAYER_ID);
      return s;
    });
  const patchLayer = (lid: string, patch: Partial<SceneLayer>) =>
    updateScene((s) => {
      ensureLayers(s);
      const idx = s.layers!.findIndex((l) => l.id === lid);
      if (idx >= 0) s.layers![idx] = { ...s.layers![idx], ...patch };
      return s;
    });
  const assignObjectsToLayer = (oids: string[], lid: string) =>
    updateScene((s) => {
      ensureLayers(s);
      const set = new Set(oids);
      s.objects = s.objects.map((o) =>
        set.has(o.id) ? ({ ...o, layerId: lid } as SceneObject) : o,
      );
      return s;
    });

  /* ---------- glTF upload ---------- */

  const fileRef = useRef<HTMLInputElement>(null);
  const onUploadModel = async (file: File) => {
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      toast.error("Upload a .glb or .gltf file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const obj: ModelObject = {
        id: newId("obj"),
        kind: "model",
        name: file.name.replace(/\.(glb|gltf)$/i, ""),
        url,
        fileName: file.name,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      };
      addObject(obj);
    };
    reader.readAsDataURL(file);
  };

  /* ---------- place on atlas ---------- */

  const placeOnAtlas = async () => {
    if (!id || !userId) return;
    const lat = parseFloat(placeLat);
    const lng = parseFloat(placeLng);
    const sc = parseFloat(placeScale) || 1;
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Invalid coordinates");
      return;
    }
    const { error } = await supabase.from("atlas_level_placements").insert({
      owner_id: userId,
      level_id: id,
      lat,
      lng,
      scale: sc,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Placed on Atlas");
      setPlaceDialogOpen(false);
    }
  };

  const selectedObj = scene.objects.find((o) => o.id === selectedId);
  const selectedLight = scene.lights.find((l) => l.id === selectedLightId);

  // Apply layer visibility to the rendered scene (objects in hidden layers
  // become invisible). Memoised to avoid re-renders.
  const renderedScene = useMemo(() => {
    const layers = scene.layers && scene.layers.length ? scene.layers : defaultLayers();
    const hidden = new Set(layers.filter((l) => !l.visible).map((l) => l.id));
    if (hidden.size === 0) return scene;
    return {
      ...scene,
      objects: scene.objects.map((o) =>
        hidden.has(o.layerId ?? DEFAULT_LAYER_ID) ? { ...o, visible: false } : o,
      ),
    };
  }, [scene]);

  // Lock helpers — an object is locked if it or its layer is locked.
  const layerLockMap = useMemo(() => {
    const m = new Map<string, boolean>();
    (scene.layers ?? defaultLayers()).forEach((l) => m.set(l.id, !!l.locked));
    return m;
  }, [scene.layers]);
  const isObjectLocked = useCallback(
    (o: SceneObject | undefined | null) =>
      !!o && (!!o.locked || !!layerLockMap.get(o.layerId ?? DEFAULT_LAYER_ID)),
    [layerLockMap],
  );
  const selectedObjectLocked = isObjectLocked(scene.objects.find((o) => o.id === selectedId));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border/40 backdrop-blur-xl bg-background/60 px-4 py-2 flex items-center gap-3 z-10">
        <Link to="/levels" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Layers className="w-4 h-4 text-primary" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isOwner}
          className="h-8 w-64 bg-transparent border-transparent hover:border-border focus:border-border text-sm font-semibold"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={undo}
            disabled={historyRef.current.past.length === 0}
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={redo}
            disabled={historyRef.current.future.length === 0}
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>
          <div className="flex items-center gap-0.5 px-1 h-8 rounded-md border border-border/40 bg-card/40">
            <Button
              size="sm"
              variant={transformMode === "translate" ? "secondary" : "ghost"}
              className="h-6 px-1.5"
              onClick={() => setTransformMode((m) => (m === "translate" ? null : "translate"))}
              title="Move (G)"
            >
              <Move3d className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant={transformMode === "rotate" ? "secondary" : "ghost"}
              className="h-6 px-1.5"
              onClick={() => setTransformMode((m) => (m === "rotate" ? null : "rotate"))}
              title="Rotate (R)"
            >
              <Rotate3d className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant={transformMode === "scale" ? "secondary" : "ghost"}
              className="h-6 px-1.5"
              onClick={() => setTransformMode((m) => (m === "scale" ? null : "scale"))}
              title="Scale (T)"
            >
              <Scaling className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1 px-2 h-8 rounded-md border border-border/40 bg-card/40">
            <button
              onClick={() => setSnapEnabled((v) => !v)}
              className={`flex items-center gap-1 text-[11px] ${snapEnabled ? "text-primary" : "text-muted-foreground"}`}
              title="Toggle snap to grid"
            >
              <Magnet className="w-3.5 h-3.5" /> Snap
            </button>
            {snapEnabled && (
              <Select value={String(snapSize)} onValueChange={(v) => setSnapSize(parseFloat(v))}>
                <SelectTrigger className="h-6 w-16 text-[11px] px-1 border-transparent bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0.1, 0.25, 0.5, 1, 2, 5].map((v) => (
                    <SelectItem key={v} value={String(v)} className="text-xs">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowGrid((v) => !v)} title="Toggle grid">
            {showGrid ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPlaying((p) => !p)} title="Play / Pause">
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPlaceDialogOpen(true)}
            disabled={!isOwner}
            title="Place on Atlas"
          >
            <MapPin className="w-3.5 h-3.5 mr-1" /> Place on Atlas
          </Button>
          <span
            className={`text-[11px] ${
              autosaveStatus === "saving" || autosaveStatus === "dirty"
                ? "text-amber-400"
                : autosaveStatus === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
            title="All changes are saved automatically"
          >
            {autosaveStatus === "saving" ? "Saving…" :
             autosaveStatus === "dirty" ? "Unsaved" :
             autosaveStatus === "error" ? "Save failed" :
             autosaveStatus === "saved" ? "Saved" : ""}
          </span>
          <Button size="sm" onClick={() => save()} disabled={!isOwner || saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[260px_1fr_320px] min-h-0">
        {/* Left: outline */}
        <aside className="border-r border-border/40 bg-card/40 overflow-y-auto">
          <div className="p-3 border-b border-border/40 sticky top-0 bg-card/80 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Add</p>
            <div className="grid grid-cols-3 gap-1">
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => addObject(makePrimitive("box"))}>
                <Box className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => addObject(makePrimitive("sphere"))}>
                <Circle className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => addObject(makePrimitive("plane"))}>
                <Square className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => addObject(makePrimitive("cylinder"))}>
                <Cylinder className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => addObject(makePrimitive("cone"))}>
                <Cone className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => addObject(makePolygon())} title="Polygon (spline)">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1" /> glTF
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadModel(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3 mb-1">Lights</p>
            <div className="grid grid-cols-4 gap-1">
              <Button size="sm" variant="ghost" className="h-8 px-1" title="Directional"
                onClick={() => { const l = makeLight("directional"); addLight(l); selectLight(l.id); }}>
                <SunMedium className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-1" title="Point"
                onClick={() => { const l = makeLight("point"); addLight(l); selectLight(l.id); }}>
                <Lightbulb className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-1" title="Spot"
                onClick={() => { const l = makeLight("spot"); addLight(l); selectLight(l.id); }}>
                <Spotlight className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-1" title="Ambient"
                onClick={() => { const l = makeLight("ambient"); addLight(l); selectLight(l.id); }}>
                <Sun className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Layers</p>
              <button
                onClick={addLayer}
                title="Add layer"
                className="text-muted-foreground hover:text-foreground"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>
            {(() => {
              const layers = scene.layers && scene.layers.length ? scene.layers : defaultLayers();
              return layers.map((layer) => {
                const items = scene.objects.filter(
                  (o) => (o.layerId ?? DEFAULT_LAYER_ID) === layer.id,
                );
                const isActive = currentLayerId === layer.id;
                return (
                  <div key={layer.id} className="mb-2">
                    <div
                      className={`group flex items-center gap-1 px-1.5 py-1 rounded text-[11px] ${
                        isActive ? "bg-muted/60" : "hover:bg-muted/30"
                      }`}
                    >
                      <button
                        onClick={() => patchLayer(layer.id, { collapsed: !layer.collapsed })}
                        className="text-muted-foreground"
                      >
                        {layer.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ background: layer.color ?? "#64748b" }}
                      />
                      <input
                        value={layer.name}
                        onChange={(e) => patchLayer(layer.id, { name: e.target.value })}
                        onClick={() => setCurrentLayerId(layer.id)}
                        className="flex-1 bg-transparent text-foreground outline-none border-0 px-1 py-0 h-5 text-[11px] focus:bg-background/60 rounded"
                      />
                      <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
                      <button
                        onClick={() => patchLayer(layer.id, { visible: !layer.visible })}
                        title={layer.visible ? "Hide layer" : "Show layer"}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => patchLayer(layer.id, { locked: !layer.locked })}
                        title={layer.locked ? "Unlock layer" : "Lock layer"}
                        className={layer.locked ? "text-amber-400" : "text-muted-foreground hover:text-foreground"}
                      >
                        {layer.locked ? <Unlock className="w-3 h-3" /> : <LockIcon className="w-3 h-3" />}
                      </button>
                      {layer.id !== DEFAULT_LAYER_ID && (
                        <button
                          onClick={() => removeLayer(layer.id)}
                          title="Delete layer (objects move to Default)"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground"
                          disabled={!!layer.locked}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {!layer.collapsed && (
                      <div className="ml-3 mt-0.5 border-l border-border/30 pl-2">
                        {items.length === 0 && (
                          <p className="text-[10px] text-muted-foreground/70 italic py-1">empty</p>
                        )}
                        {items.map((o) => {
                          const objLocked = isObjectLocked(o);
                          return (
                          <div
                            key={o.id}
                            className={`group w-full px-1.5 py-1 rounded text-xs flex items-center gap-1.5 ${
                              selectedIds.has(o.id) ? "bg-primary/20 text-primary" : "hover:bg-muted/40"
                            } ${objLocked ? "opacity-80" : ""}`}
                          >
                            <button
                              onClick={(e) => selectObject(o.id, e.ctrlKey || e.metaKey)}
                              className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                            >
                              {o.kind === "primitive" ? <Box className="w-3 h-3" /> :
                               o.kind === "polygon" ? <Pencil className="w-3 h-3" /> :
                               <LayersIcon className="w-3 h-3" />}
                              <span className="flex-1 truncate">{o.name}</span>
                            </button>
                            <select
                              value={o.layerId ?? DEFAULT_LAYER_ID}
                              onChange={(e) => assignObjectsToLayer([o.id], e.target.value)}
                              title="Move to layer"
                              className="opacity-0 group-hover:opacity-100 bg-background/60 border border-border/40 rounded text-[10px] px-1 py-0.5"
                            >
                              {layers.map((l) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={(e) => { e.stopPropagation(); patchObject(o.id, { locked: !o.locked } as any); }}
                              title={o.locked ? "Unlock object" : "Lock object"}
                              className={o.locked ? "text-amber-400" : "text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100"}
                            >
                              {o.locked ? <Unlock className="w-3 h-3" /> : <LockIcon className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (objLocked) return;
                                removeObject(o.id);
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(o.id);
                                  return next;
                                });
                                if (selectedId === o.id) setSelectedId(null);
                                if (editingPolygonId === o.id) setEditingPolygonId(null);
                              }}
                              disabled={objLocked}
                              title={objLocked ? "Object is locked" : "Delete"}
                              className="opacity-60 hover:opacity-100 hover:text-destructive disabled:opacity-20 disabled:hover:text-muted-foreground"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()}

            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-4 mb-2">Lights</p>
            {scene.lights.map((l) => (
              <button
                key={l.id}
                onClick={(e) => { selectLight(l.id, e.ctrlKey || e.metaKey); }}
                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${
                  selectedLightIds.has(l.id) ? "bg-primary/20 text-primary" : "hover:bg-muted/40"
                }`}
              >
                {l.kind === "directional" ? <SunMedium className="w-3 h-3" /> :
                 l.kind === "spot" ? <Spotlight className="w-3 h-3" /> :
                 l.kind === "ambient" ? <Sun className="w-3 h-3" /> :
                 <Lightbulb className="w-3 h-3" />}
                <span className="flex-1 truncate">{l.name}</span>
                <Trash2
                  className="w-3 h-3 opacity-60 hover:opacity-100 hover:text-destructive cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLight(l.id);
                    setSelectedLightIds((prev) => {
                      const next = new Set(prev);
                      next.delete(l.id);
                      return next;
                    });
                    if (selectedLightId === l.id) setSelectedLightId(null);
                  }}
                />
              </button>
            ))}
          </div>
        </aside>

        {/* Center: viewport */}
        <main className="relative bg-slate-950">
          <LevelScene3D
            scene={renderedScene}
            selectedId={selectedId}
            onSelect={(oid) => {
              if (oid) selectObject(oid);
              else {
                setSelectedIds(new Set());
                setSelectedId(null);
                setSelectedLightIds(new Set());
                setSelectedLightId(null);
              }
            }}
            showGrid={showGrid}
            playing={playing}
            snap={snap}
            selectedLightId={selectedLightId}
            onSelectLight={(lid) => selectLight(lid)}
            editingPolygonId={selectedObjectLocked ? null : editingPolygonId}
            onPolygonPointsChange={(oid, points) => patchObject(oid, { points } as any)}
            transformMode={selectedObjectLocked ? null : transformMode}
            onObjectTransform={(oid, t) => {
              const o = scene.objects.find((x) => x.id === oid);
              if (isObjectLocked(o)) return;
              patchObject(oid, t as any);
            }}
            className="w-full h-full"
          />
        </main>

        {/* Right: inspector */}
        <aside className="border-l border-border/40 bg-card/40 overflow-y-auto">
          <Tabs defaultValue="object" className="w-full">
            <TabsList className="w-full rounded-none grid grid-cols-3">
              <TabsTrigger value="object" className="text-[11px]">Object</TabsTrigger>
              <TabsTrigger value="anim" className="text-[11px]">Animate</TabsTrigger>
              <TabsTrigger value="level" className="text-[11px]">Level</TabsTrigger>
            </TabsList>

            <TabsContent value="object" className="p-3 space-y-3 m-0">
              {selectedLightIds.size > 1 ? (
                <MultiLightInspector
                  count={selectedLightIds.size}
                  onDelete={() => {
                    removeLights(Array.from(selectedLightIds));
                    setSelectedLightIds(new Set());
                    setSelectedLightId(null);
                  }}
                  disabled={!isOwner}
                />
              ) : selectedLight ? (
                <LightInspector
                  light={selectedLight}
                  onPatch={(p) => patchLight(selectedLight.id, p)}
                  disabled={!isOwner}
                  snap={snap}
                  onDelete={() => {
                    removeLight(selectedLight.id);
                    setSelectedLightIds((prev) => {
                      const next = new Set(prev);
                      next.delete(selectedLight.id);
                      return next;
                    });
                    setSelectedLightId(null);
                  }}
                />
              ) : selectedIds.size > 1 ? (
                <MultiObjectInspector
                  count={selectedIds.size}
                  onDelete={() => {
                    removeObjects(Array.from(selectedIds));
                    setSelectedIds(new Set());
                    setSelectedId(null);
                    setEditingPolygonId(null);
                  }}
                  disabled={!isOwner}
                />
              ) : selectedObj ? (
                <ObjectInspector
                  obj={selectedObj}
                  onPatch={(p) => patchObject(selectedObj.id, p)}
                  disabled={!isOwner}
                  snap={snap}
                  editing={editingPolygonId === selectedObj.id}
                  onToggleEdit={() =>
                    setEditingPolygonId((cur) => (cur === selectedObj.id ? null : selectedObj.id))
                  }
                  onDelete={() => {
                    removeObject(selectedObj.id);
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(selectedObj.id);
                      return next;
                    });
                    if (selectedId === selectedObj.id) setSelectedId(null);
                    if (editingPolygonId === selectedObj.id) setEditingPolygonId(null);
                  }}
                />
              ) : (
                <p className="text-xs text-muted-foreground italic">Select an object or light to edit</p>
              )}
            </TabsContent>

            <TabsContent value="anim" className="p-3 space-y-3 m-0">
              <AnimationPanel
                scene={scene}
                onAdd={(t) => addTrack(t)}
                onRemove={removeTrack}
                onPatch={patchTrack}
                disabled={!isOwner}
              />
            </TabsContent>

            <TabsContent value="level" className="p-3 space-y-3 m-0">
              <div className="space-y-2">
                <Label className="text-xs">Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isOwner}
                  placeholder="Short description…"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Background</Label>
                <Input
                  type="color"
                  value={scene.environment.background}
                  onChange={(e) =>
                    updateScene((s) => {
                      s.environment.background = e.target.value;
                      return s;
                    })
                  }
                  disabled={!isOwner}
                  className="h-8 w-full p-1"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Ambient {scene.environment.ambient.toFixed(2)}</Label>
                <Slider
                  value={[scene.environment.ambient]}
                  min={0}
                  max={2}
                  step={0.05}
                  onValueChange={([v]) =>
                    updateScene((s) => {
                      s.environment.ambient = v;
                      return s;
                    })
                  }
                  disabled={!isOwner}
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    {isPublic ? <Globe2 className="w-3 h-3" /> : <LockIcon className="w-3 h-3" />} Public
                  </Label>
                  <p className="text-[10px] text-muted-foreground">Anyone can view this Level</p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={!isOwner} />
              </div>

              <TerrainPanel
                terrain={scene.terrain}
                disabled={!isOwner}
                onPatch={(p) =>
                  updateScene((s) => {
                    const base = s.terrain ?? defaultTerrain();
                    s.terrain = { ...base, ...p } as SceneTerrain;
                    return s;
                  })
                }
                onEnable={(enabled) =>
                  updateScene((s) => {
                    s.terrain = { ...(s.terrain ?? defaultTerrain()), enabled };
                    return s;
                  })
                }
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* Place on atlas dialog */}
      <Dialog open={placeDialogOpen} onOpenChange={setPlaceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place Level on Atlas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Latitude</Label>
                <Input value={placeLat} onChange={(e) => setPlaceLat(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Longitude</Label>
                <Input value={placeLng} onChange={(e) => setPlaceLng(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Scale</Label>
              <Input value={placeScale} onChange={(e) => setPlaceScale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlaceDialogOpen(false)}>Cancel</Button>
            <Button onClick={placeOnAtlas}>
              <MapPin className="w-3.5 h-3.5 mr-1" /> Place
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- inspector ---------- */

function Vec3Field({
  label, value, onChange, step = 0.1, disabled, snap = 0,
}: { label: string; value: Vec3; onChange: (v: Vec3) => void; step?: number; disabled?: boolean; snap?: number }) {
  const snapVal = (n: number) => (snap > 0 ? Math.round(n / snap) * snap : n);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-3 gap-1 mt-1">
        {(["X", "Y", "Z"] as const).map((axis, i) => (
          <Input
            key={axis}
            type="number"
            step={snap > 0 ? snap : step}
            value={value[i]}
            disabled={disabled}
            onChange={(e) => {
              const v = [...value] as Vec3;
              v[i] = snapVal(parseFloat(e.target.value) || 0);
              onChange(v);
            }}
            className="h-7 text-[11px]"
          />
        ))}
      </div>
    </div>
  );
}

function ObjectInspector({
  obj, onPatch, disabled, snap = 0, editing, onToggleEdit, onDelete,
}: {
  obj: SceneObject;
  onPatch: (p: Partial<SceneObject>) => void;
  disabled?: boolean;
  snap?: number;
  editing?: boolean;
  onToggleEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Name</Label>
        <Input value={obj.name} disabled={disabled} onChange={(e) => onPatch({ name: e.target.value } as any)} className="h-7 text-xs" />
      </div>
      <Vec3Field label="Position" value={obj.position} onChange={(position) => onPatch({ position } as any)} disabled={disabled} snap={snap} />
      <Vec3Field label="Rotation (rad)" value={obj.rotation} onChange={(rotation) => onPatch({ rotation } as any)} step={0.05} disabled={disabled} />
      <Vec3Field label="Scale" value={obj.scale} onChange={(scale) => onPatch({ scale } as any)} disabled={disabled} />

      {obj.kind === "primitive" && (
        <>
          <div>
            <Label className="text-xs">Color</Label>
            <Input
              type="color"
              value={rgbaToHex(obj.color)}
              disabled={disabled}
              onChange={(e) => onPatch({ color: hexToRgba(e.target.value, obj.color[3]) } as any)}
              className="h-8 w-full p-1"
            />
          </div>
          <div>
            <Label className="text-xs">Metalness {obj.metalness.toFixed(2)}</Label>
            <Slider value={[obj.metalness]} min={0} max={1} step={0.05} disabled={disabled}
              onValueChange={([v]) => onPatch({ metalness: v } as any)} />
          </div>
          <div>
            <Label className="text-xs">Roughness {obj.roughness.toFixed(2)}</Label>
            <Slider value={[obj.roughness]} min={0} max={1} step={0.05} disabled={disabled}
              onValueChange={([v]) => onPatch({ roughness: v } as any)} />
          </div>
        </>
      )}

      {obj.kind === "polygon" && (
        <>
          <Button
            size="sm"
            variant={editing ? "default" : "outline"}
            className="w-full h-8 text-[11px]"
            disabled={disabled}
            onClick={onToggleEdit}
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            {editing ? "Editing geometry — click to finish" : "Edit geometry (spline points)"}
          </Button>
          <div>
            <Label className="text-xs">Extrude {obj.extrude.toFixed(2)}</Label>
            <Slider value={[obj.extrude]} min={0} max={20} step={0.1} disabled={disabled}
              onValueChange={([v]) => onPatch({ extrude: v } as any)} />
          </div>
          <div>
            <Label className="text-xs">Bevel {obj.bevel.toFixed(2)}</Label>
            <Slider value={[obj.bevel]} min={0} max={0.5} step={0.01} disabled={disabled}
              onValueChange={([v]) => onPatch({ bevel: v } as any)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">Fill</Label>
              <Input type="color" value={rgbaToHex(obj.fillColor)} disabled={disabled}
                onChange={(e) => onPatch({ fillColor: hexToRgba(e.target.value) } as any)} className="h-8 w-full p-1" />
            </div>
            <div>
              <Label className="text-[10px]">Sides</Label>
              <Input type="color" value={rgbaToHex(obj.sideColor)} disabled={disabled}
                onChange={(e) => onPatch({ sideColor: hexToRgba(e.target.value) } as any)} className="h-8 w-full p-1" />
            </div>
            <div>
              <Label className="text-[10px]">Top</Label>
              <Input type="color" value={rgbaToHex(obj.topColor)} disabled={disabled}
                onChange={(e) => onPatch({ topColor: hexToRgba(e.target.value) } as any)} className="h-8 w-full p-1" />
            </div>
          </div>
          <PolygonPointsEditor obj={obj} onChange={(points) => onPatch({ points } as any)} disabled={disabled} />
        </>
      )}
      {onDelete && (
        <Button
          size="sm"
          variant="destructive"
          className="w-full h-8 text-[11px] mt-2"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminate object
        </Button>
      )}
    </div>
  );
}

function PolygonPointsEditor({
  obj, onChange, disabled,
}: { obj: PolygonObject; onChange: (pts: Array<[number, number]>) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">Spline points</Label>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          disabled={disabled}
          onClick={() => onChange([...obj.points, [0, 0]])}
        >
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {obj.points.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
            <Input
              type="number"
              step={0.1}
              value={p[0]}
              disabled={disabled}
              onChange={(e) => {
                const next = obj.points.map((x, j) => (j === i ? [parseFloat(e.target.value) || 0, x[1]] : x)) as Array<[number, number]>;
                onChange(next);
              }}
              className="h-6 text-[10px]"
            />
            <Input
              type="number"
              step={0.1}
              value={p[1]}
              disabled={disabled}
              onChange={(e) => {
                const next = obj.points.map((x, j) => (j === i ? [x[0], parseFloat(e.target.value) || 0] : x)) as Array<[number, number]>;
                onChange(next);
              }}
              className="h-6 text-[10px]"
            />
            <button
              disabled={disabled}
              onClick={() => onChange(obj.points.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MultiObjectInspector({
  count, onDelete, disabled,
}: { count: number; onDelete?: () => void; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{count} objects selected</p>
      <p className="text-xs text-muted-foreground">Ctrl/Cmd-click objects in the outline to multi-select. Press Delete or Backspace to remove all selected.</p>
      {onDelete && (
        <Button
          size="sm"
          variant="destructive"
          className="w-full h-8 text-[11px] mt-2"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminate {count} objects
        </Button>
      )}
    </div>
  );
}

/* ---------- animation panel ---------- */

function LightInspector({
  light, onPatch, disabled, snap = 0, onDelete,
}: { light: SceneLight; onPatch: (p: Partial<SceneLight>) => void; disabled?: boolean; snap?: number; onDelete?: () => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Name</Label>
        <Input value={light.name} disabled={disabled} onChange={(e) => onPatch({ name: e.target.value })} className="h-7 text-xs" />
      </div>
      <div>
        <Label className="text-xs">Type</Label>
        <Select value={light.kind} onValueChange={(v) => onPatch({ kind: v as SceneLight["kind"] })} disabled={disabled}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="directional" className="text-xs">Directional</SelectItem>
            <SelectItem value="point" className="text-xs">Point</SelectItem>
            <SelectItem value="spot" className="text-xs">Spot</SelectItem>
            <SelectItem value="ambient" className="text-xs">Ambient</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {light.kind !== "ambient" && (
        <Vec3Field label="Position" value={light.position} onChange={(position) => onPatch({ position })} disabled={disabled} snap={snap} />
      )}
      <div>
        <Label className="text-xs">Color</Label>
        <Input
          type="color"
          value={rgbaToHex(light.color)}
          disabled={disabled}
          onChange={(e) => onPatch({ color: hexToRgba(e.target.value, light.color[3]) })}
          className="h-8 w-full p-1"
        />
      </div>
      <div>
        <Label className="text-xs">Intensity {light.intensity.toFixed(2)}</Label>
        <Slider value={[light.intensity]} min={0} max={10} step={0.05} disabled={disabled}
          onValueChange={([v]) => onPatch({ intensity: v })} />
      </div>
      {light.kind !== "ambient" && (
        <div className="flex items-center justify-between">
          <Label className="text-xs">Cast shadow</Label>
          <Switch checked={!!light.castShadow} onCheckedChange={(v) => onPatch({ castShadow: v })} disabled={disabled} />
        </div>
      )}
      {onDelete && (
        <Button
          size="sm"
          variant="destructive"
          className="w-full h-8 text-[11px] mt-2"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminate light
        </Button>
      )}
    </div>
  );
}

function MultiLightInspector({
  count, onDelete, disabled,
}: { count: number; onDelete?: () => void; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{count} lights selected</p>
      <p className="text-xs text-muted-foreground">Ctrl/Cmd-click lights in the outline to multi-select. Press Delete or Backspace to remove all selected.</p>
      {onDelete && (
        <Button
          size="sm"
          variant="destructive"
          className="w-full h-8 text-[11px] mt-2"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminate {count} lights
        </Button>
      )}
    </div>
  );
}

function AnimationPanel({
  scene, onAdd, onRemove, onPatch, disabled,
}: {
  scene: LevelScene;
  onAdd: (t: AnimationTrack) => void;
  onRemove: (id: string) => void;
  onPatch: (id: string, patch: Partial<AnimationTrack>) => void;
  disabled?: boolean;
}) {
  const [target, setTarget] = useState<string>("");

  const addTrack = () => {
    if (!target) {
      toast.error("Pick a target object first");
      return;
    }
    const obj = scene.objects.find((o) => o.id === target);
    if (!obj) return;
    onAdd({
      id: newId("anim"),
      name: `Animate ${obj.name}`,
      targetId: target,
      duration: 2,
      loop: true,
      keyframes: [
        { t: 0, position: obj.position, rotation: obj.rotation, scale: obj.scale },
        { t: 2, position: [obj.position[0], obj.position[1] + 1, obj.position[2]], rotation: obj.rotation, scale: obj.scale },
      ],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Target object" />
          </SelectTrigger>
          <SelectContent>
            {scene.objects.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={addTrack} disabled={disabled}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {scene.animations.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No tracks. Press Play (top-right) to preview.</p>
      )}

      {scene.animations.map((t) => (
        <div key={t.id} className="border border-border/40 rounded p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Film className="w-3 h-3 text-primary" />
            <Input value={t.name} disabled={disabled} onChange={(e) => onPatch(t.id, { name: e.target.value })} className="h-6 text-[11px] flex-1" />
            <Trash2 className="w-3 h-3 cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => onRemove(t.id)} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[10px]">Duration</Label>
            <Input type="number" step={0.1} value={t.duration} disabled={disabled} onChange={(e) => onPatch(t.id, { duration: parseFloat(e.target.value) || 1 })} className="h-6 text-[11px] w-16" />
            <Label className="text-[10px] ml-auto">Loop</Label>
            <Switch checked={t.loop} onCheckedChange={(v) => onPatch(t.id, { loop: v })} disabled={disabled} />
          </div>
          <p className="text-[10px] text-muted-foreground">{t.keyframes.length} keyframes</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- terrain panel ---------- */

function TerrainPanel({
  terrain,
  disabled,
  onPatch,
  onEnable,
}: {
  terrain?: SceneTerrain;
  disabled?: boolean;
  onPatch: (p: Partial<SceneTerrain>) => void;
  onEnable: (enabled: boolean) => void;
}) {
  const t = terrain ?? { ...defaultTerrain(), enabled: false };
  const fileRef = useRef<HTMLInputElement>(null);

  const onUpload = (file: File) => {
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      toast.error("Upload a .glb or .gltf file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onPatch({
        source: "model",
        modelUrl: reader.result as string,
        modelFileName: file.name,
        enabled: true,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2 pt-3 border-t border-border/40">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1">
          <Layers className="w-3 h-3" /> Terrain
        </Label>
        <Switch checked={t.enabled} onCheckedChange={onEnable} disabled={disabled} />
      </div>
      {t.enabled && (
        <>
          <div className="grid grid-cols-2 gap-1">
            <Button
              size="sm"
              variant={t.source === "primitive" ? "secondary" : "ghost"}
              className="h-7 text-[11px]"
              onClick={() => onPatch({ source: "primitive" })}
              disabled={disabled}
            >
              Geometry
            </Button>
            <Button
              size="sm"
              variant={t.source === "model" ? "secondary" : "ghost"}
              className="h-7 text-[11px]"
              onClick={() => onPatch({ source: "model" })}
              disabled={disabled}
            >
              Model
            </Button>
          </div>

          {t.source === "primitive" ? (
            <>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Shape</Label>
                <Select
                  value={t.shape}
                  onValueChange={(v) => onPatch({ shape: v as SceneTerrain["shape"] })}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plane" className="text-xs">Plane</SelectItem>
                    <SelectItem value="box" className="text-xs">Box</SelectItem>
                    <SelectItem value="sphere" className="text-xs">Sphere</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Size (W / H / D)</Label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {([0, 1, 2] as const).map((i) => (
                    <Input
                      key={i}
                      type="number"
                      step={0.5}
                      value={t.size[i]}
                      onChange={(e) => {
                        const v = [...t.size] as Vec3;
                        v[i] = parseFloat(e.target.value) || 0;
                        onPatch({ size: v });
                      }}
                      disabled={disabled}
                      className="h-7 text-[11px]"
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs flex-1">Color</Label>
                <Input
                  type="color"
                  value={rgbaToHex(t.color)}
                  onChange={(e) => onPatch({ color: hexToRgba(e.target.value, t.color[3]) })}
                  disabled={disabled}
                  className="h-7 w-12 p-0.5"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Wireframe</Label>
                <Switch
                  checked={t.wireframe}
                  onCheckedChange={(v) => onPatch({ wireframe: v })}
                  disabled={disabled}
                />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] w-full"
                onClick={() => fileRef.current?.click()}
                disabled={disabled}
              >
                <Upload className="w-3 h-3 mr-1" />
                {t.modelFileName ? `Replace (${t.modelFileName})` : "Upload glTF terrain"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
              {!t.modelUrl && (
                <p className="text-[10px] text-muted-foreground italic">No model loaded.</p>
              )}
            </div>
          )}

          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Position</Label>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {([0, 1, 2] as const).map((i) => (
                <Input
                  key={i}
                  type="number"
                  step={0.1}
                  value={t.position[i]}
                  onChange={(e) => {
                    const v = [...t.position] as Vec3;
                    v[i] = parseFloat(e.target.value) || 0;
                    onPatch({ position: v });
                  }}
                  disabled={disabled}
                  className="h-7 text-[11px]"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Magnet className="w-3 h-3" /> Snap objects to surface
              </Label>
              <p className="text-[10px] text-muted-foreground">Dragged objects stick to terrain</p>
            </div>
            <Switch
              checked={t.snapToSurface}
              onCheckedChange={(v) => onPatch({ snapToSurface: v })}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              {t.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Visible
            </Label>
            <Switch
              checked={t.visible}
              onCheckedChange={(v) => onPatch({ visible: v })}
              disabled={disabled}
            />
          </div>
        </>
      )}
    </div>
  );
}
