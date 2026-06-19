import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft, Save, Plus, Trash2, Box, Circle, Square, Cylinder, Cone,
  Upload, Sun, Lightbulb, Film, Play, Pause, MapPin, Layers, Eye, EyeOff,
  Loader2, Globe2, Lock as LockIcon, ChevronDown, ChevronRight, Pencil, Magnet,
  SunMedium, FlashlightIcon as Spotlight, Undo2, Redo2,
  Move3d, Rotate3d, Scaling,
  Layers as LayersIcon, FolderPlus,
  Unlock, Mountain, Brush, ArrowUp, ArrowDown, Waves, Minus,
  X, ArrowUpRight, User, Camera,
} from "lucide-react";
import { Spline as SplineIcon, Paintbrush } from "lucide-react";
import { Sparkles, Library, ChevronLeft, Search, PanelLeft, PanelRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import CharacterAnimationGallery from "@/components/level/animations/CharacterAnimationGallery";
import ObjectAnimationGallery from "@/components/level/animations/ObjectAnimationGallery";
import InlineAnimationPicker from "@/components/level/animations/InlineAnimationPicker";
import type { CharacterClipEntry } from "@/lib/characterAnimationLibrary";
import { supabase } from "@/integrations/supabase/client";
import { ensureLevelSession, withTimeout } from "@/lib/levelSession";
import { stripHdriBlobs, rehydrateHdriBlobs } from "@/lib/hdriBlobStore";
import { getLocalLevel, getLocalLevelOwnerId, isLocalLevelId, listLocalLevels, updateLocalLevel } from "@/lib/localLevels";
import {
  writeSnapshot as writeLevelSnapshot,
  markCommitted as markLevelSnapshotCommitted,
  latestSnapshot as latestLevelSnapshot,
} from "@/lib/levelBackup";
import {
  EMPTY_SCENE, LevelScene, SceneObject, SceneLight, AnimationTrack,
  PrimitiveObject, PolygonObject, ModelObject, newId, Vec3, RGBA,
  SceneLayer, DEFAULT_LAYER_ID, defaultLayers,
  SceneTerrain, defaultTerrain,
  ModelMaterialOverride,
  HDRIMap, HDRIEnvironment as HDRIEnvironmentCfg,
  CharacterObject, DEFAULT_CHARACTER_URL,
} from "@/lib/levelTypes";
import type { TrajectoryObject, TrajectorySection } from "@/lib/levelTypes";
import LevelScene3D from "@/components/level/LevelScene3D";
import KeyCaptureInput from "@/components/level/KeyCaptureInput";
import PlayBehaviorRuntime from "@/components/level/play/PlayBehaviorRuntime";
import PlayInputManager from "@/components/level/play/PlayInputManager";
import PlayHUD from "@/components/level/play/PlayHUD";
import RigControllerRoom from "@/components/level/locomotion/RigControllerRoom";
import BoneHierarchyPanel from "@/components/level/BoneHierarchyPanel";
import { useCharacterAnimationNames } from "@/components/level/LevelCharacter";
import AtlasMiniMap from "@/components/level/AtlasMiniMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  importModelFile,
  convertCadViaAps,
  extOf,
  isCadFormat,
  isNativeFormat,
  NATIVE_FORMATS,
  CAD_FORMATS,
} from "@/lib/model-import";
import { GLTFLoader } from "three-stdlib";
import { FacePaintPanel } from "@/components/level/FacePaintPanel";
import TerrainGallery from "@/components/level/terrain/TerrainGallery";
import { GeometryPanel } from "@/components/level/geometry/GeometryPanel";
import { InteractionsPanel } from "@/components/level/geometry/InteractionsPanel";
import {
  listRigSaves,
  getCachedRigSaves,
  onRigSavesChanged,
  type RigSave,
} from "@/lib/rigSaves";

type ActiveTool = { key: string; label: string; icon: React.ReactNode; active: boolean };

function ActiveToolBadges({ tools }: { tools: ActiveTool[] }) {
  const [hiddenAt, setHiddenAt] = useState<Record<string, number>>({});
  const prevActive = useRef<Record<string, boolean>>({});
  const [, force] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const updates: Record<string, number> = {};
    let changed = false;
    for (const t of tools) {
      const was = prevActive.current[t.key] ?? false;
      if (was && !t.active) {
        updates[t.key] = now;
        changed = true;
      }
      prevActive.current[t.key] = t.active;
    }
    if (changed) setHiddenAt((p) => ({ ...p, ...updates }));
  }, [tools.map((t) => `${t.key}:${t.active ? 1 : 0}`).join("|")]);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const visible = tools.filter((t) => {
    if (t.active) return true;
    const off = hiddenAt[t.key];
    return !!off && now - off < 10000;
  });

  if (visible.length === 0) return null;

  return (
    <div className="flex items-center gap-1 mr-1">
      {visible.map((t) => {
        const off = hiddenAt[t.key];
        const fading = !t.active && !!off;
        return (
          <div
            key={t.key}
            title={t.label}
            className={`h-7 w-7 flex items-center justify-center rounded-md border transition-all duration-700 ease-out ${
              t.active
                ? "border-primary/70 bg-primary/15 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.4)] opacity-100"
                : "border-border/40 text-muted-foreground bg-transparent"
            }`}
            style={fading ? { opacity: Math.max(0, 1 - (now - off) / 10000) } : undefined}
          >
            {t.icon}
          </div>
        );
      })}
    </div>
  );
}

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

function makeCharacter(): CharacterObject {
  return {
    id: newId("obj"),
    kind: "character",
    name: "Character",
    url: DEFAULT_CHARACTER_URL,
    source: "Xbot · Mixamo (MIT)",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    animationSpeed: 1,
    paused: false,
    crossfade: 0.25,
  };
}

function makeTrajectory(): TrajectoryObject {
  return {
    id: newId("obj"),
    kind: "trajectory",
    name: "Trajectory",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    points: [
      [-3, 0.5, -3],
      [-1, 0.5, 0],
      [1, 0.5, 0],
      [3, 0.5, 3],
    ],
    closed: false,
    tension: 0.5,
    speed: 2,
    sections: [],
    followers: [],
    orientToPath: true,
    loop: true,
    color: "#3b82f6",
    smartPath: false,
    maxStepHeight: 0.4,
    slopeSpeedFactor: 0.6,
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

/**
 * Components/ — searchable section in the left sidebar that groups every
 * scene component (characters, objects, trajectories) and live-filters as the
 * user types. Sits above the Lights section.
 */
function ComponentsPanel({
  objects,
  selectedIds,
  onSelect,
  rigState,
  selectedBoneName,
  onSelectBone,
  hideBoneHierarchy,
}: {
  objects: SceneObject[];
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  rigState?: {
    name: string;
    url: string;
    bones: { name: string; parentName: string | null }[];
    selectedBoneName: string | null;
  } | null;
  selectedBoneName?: string | null;
  onSelectBone?: (name: string) => void;
  hideBoneHierarchy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  type GroupKey = "characters" | "objects" | "trajectories";
  const groups: { key: GroupKey; label: string; items: SceneObject[] }[] = useMemo(() => {
    const all = objects.filter((o) => !q || o.name.toLowerCase().includes(q) || o.kind.toLowerCase().includes(q));
    return [
      { key: "characters",   label: "Characters",   items: all.filter((o) => o.kind === "character") },
      { key: "objects",      label: "Objects",      items: all.filter((o) => o.kind === "primitive" || o.kind === "polygon" || o.kind === "model") },
      { key: "trajectories", label: "Trees / Splines", items: all.filter((o) => o.kind === "trajectory") },
    ];
  }, [objects, q]);

  // Bone hierarchy tree (parent/child) for the live rig, when present.
  const total = groups.reduce((n, g) => n + g.items.length, 0) + (rigState ? 1 : 0);

  return (
    <div className="mt-4 mb-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Components / <span className="tabular-nums opacity-70">{total}</span>
        </p>
        {query && (
          <button onClick={() => setQuery("")} className="text-[10px] text-muted-foreground hover:text-foreground">clear</button>
        )}
      </div>
      <div className="relative mb-1.5">
        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search components…"
          className="h-7 pl-7 text-[11px]"
        />
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 px-1">
              {g.label} · {g.items.length + (g.key === "characters" && rigState ? 1 : 0)}
            </p>
            {g.key === "characters" && rigState && (
              <div className="mb-1">
                <div
                  className={`w-full px-2 py-1 rounded text-[11px] flex items-center gap-1.5 ${
                    selectedBoneName ? "bg-muted/20" : "bg-[rgba(34,255,136,0.10)]"
                  }`}
                  title={`Live rig — ${rigState.bones.length} bones`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: "#22ff88" }}
                  />
                  <span className="flex-1 truncate text-[#bbffd5]">{rigState.name}</span>
                  <span className="text-[9px] uppercase tracking-wider opacity-50 tabular-nums">
                    {rigState.bones.length} bones
                  </span>
                </div>
                {!hideBoneHierarchy && (
                  <div className="mt-1">
                    <BoneHierarchyPanel
                      bones={rigState.bones}
                      selectedBoneName={selectedBoneName ?? null}
                      onSelect={(name) => onSelectBone?.(name)}
                    />
                  </div>
                )}
              </div>
            )}
            {g.items.length === 0 && !(g.key === "characters" && rigState) ? (
              <p className="text-[10px] text-muted-foreground/50 italic px-2 py-0.5">—</p>
            ) : (
              g.items.map((o) => (
                <button
                  key={o.id}
                  onClick={(e) => onSelect(o.id, e.ctrlKey || e.metaKey)}
                  className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-1.5 ${
                    selectedIds.has(o.id) ? "bg-primary/20 text-primary" : "hover:bg-muted/30 text-muted-foreground"
                  }`}
                  title={`${o.name} (${o.kind})`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        o.kind === "character" ? "#22ff88" :
                        o.kind === "trajectory" ? "#7be7ff" :
                        "#fbbf24",
                    }}
                  />
                  <span className="flex-1 truncate">{o.name}</span>
                  <span className="text-[9px] uppercase tracking-wider opacity-50">{o.kind}</span>
                </button>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LevelEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  /**
   * When mounted at /locomotion, the editor swaps its central viewport for
   * the Rig Controller Room while keeping every sidebar (objects, layers,
   * terrain, inspector, animations) so users can sculpt rigs surrounded by
   * the full scene-creation toolset.
   */
  const rigRoomMode = location.pathname === "/locomotion";

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
  // Live rig state surfaced from <RigControllerRoom/> so the left Components
  // panel can mirror the rig's character + bone hierarchy.
  const [rigState, setRigState] = useState<{
    name: string;
    url: string;
    bones: { name: string; parentName: string | null }[];
    selectedBoneName: string | null;
  } | null>(null);
  const [rigBoneRequest, setRigBoneRequest] = useState<string | null>(null);
  // Local copy/paste buffer for scene objects (Ctrl/Cmd+C / V / D).
  const clipboardRef = useRef<SceneObject[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [placeLat, setPlaceLat] = useState("40.7580");
  const [placeLng, setPlaceLng] = useState("-73.9855");
  const [placeScale, setPlaceScale] = useState("1");
  const [currentPlacement, setCurrentPlacement] = useState<{ lat: number; lng: number; scale: number } | null>(null);
  const [showLocationViewport, setShowLocationViewport] = useState(true);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [selectedLightIds, setSelectedLightIds] = useState<Set<string>>(new Set());
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapSize, setSnapSize] = useState(0.5);
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [addingPointMode, setAddingPointMode] = useState<boolean>(false);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale" | null>("translate");
  const [currentLayerId, setCurrentLayerId] = useState<string>(DEFAULT_LAYER_ID);
  const [terrainOpen, setTerrainOpen] = useState(false);
  const [terrainGalleryOpen, setTerrainGalleryOpen] = useState(false);

  // Animation gallery modals — opened from inspectors.
  const [characterGalleryOpen, setCharacterGalleryOpen] = useState(false);
  const [objectGalleryOpen, setObjectGalleryOpen] = useState(false);
  const [objectGalleryTarget, setObjectGalleryTarget] = useState<SceneObject | null>(null);

  /** User-uploaded character clips persisted on the scene. */
  const userClipEntries = useMemo<CharacterClipEntry[]>(() => {
    const lib = scene.userClipLibrary ?? [];
    return lib.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category as any,
      tags: e.tags,
      source: "user" as const,
      url: e.url,
      clipName: e.clipName,
      loop: e.loop,
    }));
  }, [scene.userClipLibrary]);

  // Terrain sculpting tool state
  const [sculptActive, setSculptActive] = useState(false);
  const [sculptTool, setSculptTool] = useState<"lift" | "dig" | "smooth" | "flatten">("lift");
  const [sculptRadius, setSculptRadius] = useState(2);
  const [sculptStrength, setSculptStrength] = useState(0.3);

  // Face-paint mode: when active, clicks on the selected object's faces add
  // to `paintedFaces` (Shift = additive). The inspector panel writes the
  // chosen color/texture into the object's `faceOverrides`.
  const [facePaintActive, setFacePaintActive] = useState(false);
  const [paintedFaces, setPaintedFaces] = useState<Set<string>>(new Set());
  const facePaintState = useMemo(
    () => ({
      active: facePaintActive,
      objectId: facePaintActive ? selectedId : null,
      selected: paintedFaces,
      toggle: (key: string, add: boolean) =>
        setPaintedFaces((prev) => {
          const next = add ? new Set(prev) : new Set<string>();
          if (prev.has(key) && add) next.delete(key);
          else next.add(key);
          return next;
        }),
      clear: () => setPaintedFaces(new Set()),
    }),
    [facePaintActive, selectedId, paintedFaces],
  );
  // Exiting paint mode (or switching object) clears the selection.
  useEffect(() => {
    if (!facePaintActive) setPaintedFaces(new Set());
  }, [facePaintActive, selectedId]);

  // Atlas placement is loaded on-demand (when the user opens "Place on Atlas"),
  // not on every level load — see openPlaceDialog below.
  const placementLoadedRef = useRef(false);
  const openPlaceDialog = useCallback(async () => {
    setPlaceDialogOpen(true);
    if (placementLoadedRef.current) return;
    if (!id || !userId || isLocalLevelId(id)) {
      placementLoadedRef.current = true;
      return;
    }
    placementLoadedRef.current = true;
    const { data } = await supabase
      .from("atlas_level_placements")
      .select("lat,lng,scale")
      .eq("level_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;
    setCurrentPlacement({ lat: Number(data.lat), lng: Number(data.lng), scale: Number(data.scale ?? 1) });
    setPlaceLat(String(data.lat));
    setPlaceLng(String(data.lng));
    setPlaceScale(String(data.scale ?? 1));
  }, [id, userId]);

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
    if (rigRoomMode) {
      // Bootstrap an in-memory "Rig Room" workspace — no DB, no autosave.
      const me = "rig-room";
      setUserId(me);
      setOwnerId(me);
      setName("Rig Room");
      setDescription("Standalone rig & scene workspace");
      setIsPublic(false);
      setScene(EMPTY_SCENE);
      setLoading(false);
      return;
    }
    if (!id) return;
    (async () => {
      if (isLocalLevelId(id)) {
        const local = getLocalLevel(id);
        if (!local) {
          toast.error("Level not found");
          navigate("/levels");
          return;
        }
        const owner = getLocalLevelOwnerId();
        setUserId(owner);
        setName(local.name);
        setDescription(local.description ?? "");
        setIsPublic(local.is_public);
        setOwnerId(local.owner_id);
        setScene(await rehydrateHdriBlobs(id, { ...EMPTY_SCENE, ...(local.scene as any) }));
        setLoading(false);
        return;
      }
      // Read the cached/current user only; creating or refreshing auth here can
      // steal the browser auth lock and keep the editor stuck on Loading….
      const uid = await ensureLevelSession({ allowAnonymous: false });
      setUserId(uid);
      const { data, error } = await withTimeout(
        supabase
          .from("levels")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
        5000,
        { data: null, error: { message: "Level request timed out", details: "", hint: "", code: "TIMEOUT" } } as any,
      );
      if (error || !data) {
        toast.error(error?.message ?? "Level not found");
        navigate("/levels");
        return;
      }
      setName(data.name);
      setDescription(data.description ?? "");
      setIsPublic(data.is_public);
      setOwnerId(data.owner_id);
      setScene(await rehydrateHdriBlobs(id, { ...EMPTY_SCENE, ...(data.scene as any) }));
      setLoading(false);
    })();
  }, [id, navigate]);

  // ---- Recovery: if a newer, uncommitted backup snapshot exists for this
  // level (e.g. the last save failed, the tab crashed, or quota errored),
  // offer to restore it instead of silently losing the user's work.
  useEffect(() => {
    if (!id || loading) return;
    let cancelled = false;
    (async () => {
      const snap = await latestLevelSnapshot(id);
      if (cancelled || !snap || snap.committed) return;
      // Only prompt if the snapshot is meaningfully newer than what we loaded.
      if (snap.savedAt <= (lastSavedAtRef.current || 0)) return;
      const when = new Date(snap.savedAt).toLocaleString();
      const restore = window.confirm(
        `An unsaved backup of this level from ${when} was found.\n\nRestore it? (Cancel keeps the currently loaded version.)`,
      );
      if (!restore || cancelled) return;
      setName(snap.name);
      setDescription(snap.description ?? "");
      setIsPublic(snap.isPublic);
      setScene(await rehydrateHdriBlobs(id, { ...EMPTY_SCENE, ...(snap.scene as any) }));
      toast.success("Restored unsaved backup");
    })();
    return () => { cancelled = true; };
  }, [id, loading]);

  const lastSavedAtRef = useRef<number>(0);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");

  const save = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!id || !isOwner) return;
      setSaving(true);
      setAutosaveStatus("saving");
      const persistable = stripHdriBlobs(id, scene);
      const snapshotAt = Date.now();
      // Ultra-light thumbnail (~5 KB JPEG) captured from the live canvas.
      // Best-effort: any failure (no canvas yet, lost context) just skips it.
      const thumb: string | null =
        typeof window !== "undefined" && typeof (window as any).__levelThumbnail === "function"
          ? (window as any).__levelThumbnail()
          : null;
      // ALWAYS write a backup snapshot to IndexedDB before attempting the
      // primary save. If anything below fails (quota, network, crash) the
      // user's work is recoverable on next load.
      const snapshotOk = await writeLevelSnapshot({
        levelId: id,
        savedAt: snapshotAt,
        committed: false,
        name,
        description,
        isPublic,
        scene: persistable,
      });
      if (isLocalLevelId(id)) {
        let ok = false;
        try {
          ok = updateLocalLevel(id, {
            name,
            description,
            is_public: isPublic,
            scene: persistable,
            ...(thumb ? { thumbnail_url: thumb } : {}),
          });
        } catch (err) {
          console.warn("[level] local save failed", err);
        }
        setSaving(false);
        if (ok) {
          lastSavedAtRef.current = Date.now();
          setAutosaveStatus("saved");
          markLevelSnapshotCommitted(id, snapshotAt).catch(() => {});
          if (!opts.silent) toast.success("Saved");
        } else {
          // Primary local save failed but the IDB snapshot is our safety net.
          if (snapshotOk) {
            lastSavedAtRef.current = Date.now();
            setAutosaveStatus("saved");
            if (!opts.silent) {
              toast.warning(
                "Saved to local backup (browser storage is full). Your work is safe and will be restored on reload.",
              );
            }
          } else {
            setAutosaveStatus("error");
            toast.error("Could not save — both local storage and backup failed. Please export or copy your work.");
          }
        }
        return;
      }
      // Cloud save with retry — never lose data to a transient network blip.
      let error: { message?: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await supabase
          .from("levels")
          .update({
            name,
            description,
            is_public: isPublic,
            scene: persistable as any,
            ...(thumb ? { thumbnail_url: thumb } : {}),
          })
          .eq("id", id);
        error = (res as any).error ?? null;
        if (!error) break;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      setSaving(false);
      if (error) {
        setAutosaveStatus("error");
        // The IDB snapshot persists — the user can reload and recover.
        toast.error(
          snapshotOk
            ? `Cloud save failed (${error.message ?? "unknown error"}). A local backup was kept — we'll restore it next time.`
            : (error.message ?? "Save failed"),
        );
      } else {
        lastSavedAtRef.current = Date.now();
        setAutosaveStatus("saved");
        markLevelSnapshotCommitted(id, snapshotAt).catch(() => {});
        // Append-only version history: every successful cloud save also writes
        // an immutable snapshot row so older versions can never be erased.
        if (userId) {
          supabase
            .from("level_snapshots")
            .insert({
              level_id: id,
              owner_id: userId,
              name,
              description: description || null,
              is_public: isPublic,
              scene: persistable as any,
              client_saved_at: new Date(snapshotAt).toISOString(),
            })
            .then(({ error: snapErr }) => {
              if (snapErr) console.warn("[level] snapshot insert failed", snapErr.message);
            });
        }
        if (!opts.silent) toast.success("Saved");
      }
    },
    [id, name, description, isPublic, scene, isOwner, userId],
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
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || (e.target as any)?.isContentEditable;

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

      // ---- Copy / Paste / Duplicate (selected scene objects) ----
      if (!inField && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        const ids = Array.from(selectedIds);
        if (ids.length) {
          const objs = scene.objects.filter((o) => ids.includes(o.id));
          if (objs.length) {
            clipboardRef.current = structuredClone(objs);
            e.preventDefault();
            toast.success(`Copied ${objs.length} object${objs.length > 1 ? "s" : ""}`);
          }
        }
      }
      if (!inField && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        const buf = clipboardRef.current;
        if (buf && buf.length) {
          e.preventDefault();
          const newIds: string[] = [];
          updateScene((s) => {
            for (const src of buf) {
              const clone = structuredClone(src) as SceneObject;
              clone.id = newId(clone.kind);
              clone.name = `${src.name} copy`;
              clone.position = [
                src.position[0] + 1,
                src.position[1],
                src.position[2] + 1,
              ];
              s.objects.push(clone);
              newIds.push(clone.id);
            }
            return s;
          });
          setSelectedIds(new Set(newIds));
          setSelectedId(newIds[newIds.length - 1] ?? null);
          toast.success(`Pasted ${buf.length} object${buf.length > 1 ? "s" : ""}`);
        }
      }
      if (!inField && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        const ids = Array.from(selectedIds);
        if (ids.length) {
          e.preventDefault();
          const sources = scene.objects.filter((o) => ids.includes(o.id));
          const newIds: string[] = [];
          updateScene((s) => {
            for (const src of sources) {
              const clone = structuredClone(src) as SceneObject;
              clone.id = newId(clone.kind);
              clone.name = `${src.name} copy`;
              clone.position = [
                src.position[0] + 1,
                src.position[1],
                src.position[2] + 1,
              ];
              s.objects.push(clone);
              newIds.push(clone.id);
            }
            return s;
          });
          setSelectedIds(new Set(newIds));
          setSelectedId(newIds[newIds.length - 1] ?? null);
        }
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
      if (inField) return;
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key.toLowerCase() === "g") setTransformMode("translate");
        else if (e.key.toLowerCase() === "r") setTransformMode("rotate");
        else if (e.key.toLowerCase() === "t") setTransformMode("scale");
        else if (e.key.toLowerCase() === "f") {
          // Frame selected object in the viewport.
          if (selectedId && (window as any).__levelFocusObject) {
            (window as any).__levelFocusObject(selectedId);
          }
        } else if (e.key === "Escape") {
          // Priority: exit Play mode → clear gizmo → clear selection.
          if (playing) setPlaying(false);
          else if (transformMode) setTransformMode(null);
          else {
            setSelectedIds(new Set());
            setSelectedId(null);
          }
        }
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [save, undo, redo, selectedIds, selectedLightIds, editingPolygonId, scene.objects, playing, transformMode, selectedId]);

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

  const addObjects = (objs: SceneObject[]) =>
    updateScene((s) => {
      if (!s.layers || s.layers.length === 0) s.layers = defaultLayers();
      const targetLayer = s.layers.find((l) => l.id === currentLayerId)
        ? currentLayerId
        : s.layers[0].id;
      for (const o of objs) {
        s.objects.push({ ...o, layerId: o.layerId ?? targetLayer } as SceneObject);
      }
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
  const cadFileRef = useRef<HTMLInputElement>(null);
  const [cadConverting, setCadConverting] = useState(false);

  const addImportedAsObject = (
    imported: { url: string; sourceFormat: string; fileName: string },
  ) => {
    const obj: ModelObject = {
      id: newId("obj"),
      kind: "model",
      name: imported.fileName.replace(/\.[^.]+$/, ""),
      url: imported.url,
      fileName: imported.fileName,
      sourceFormat: imported.sourceFormat,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
    };
    addObject(obj);
  };

  const onUploadModel = async (file: File) => {
    const ext = extOf(file.name);
    if (!isNativeFormat(ext)) {
      toast.error(
        `Use the CAD button for .${ext}. Native formats: ${NATIVE_FORMATS.map((e) => "." + e).join(", ")}`,
      );
      return;
    }
    try {
      const imported = await importModelFile(file);
      addImportedAsObject(imported);
      toast.success(`Imported ${file.name}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to import model");
    }
  };

  const onUploadCad = async (file: File) => {
    const ext = extOf(file.name);
    if (!isCadFormat(ext)) {
      toast.error(
        `Use the model button for .${ext}. CAD formats handled here: ${CAD_FORMATS.map((e) => "." + e).join(", ")}`,
      );
      return;
    }
    setCadConverting(true);
    const tid = toast.loading(`Converting ${file.name} via Autodesk Platform Services…`);
    try {
      const imported = await convertCadViaAps(file, (fn, opts) =>
        supabase.functions.invoke(fn, opts) as any,
      );
      addImportedAsObject(imported);
      toast.success(`Imported ${file.name}`, { id: tid });
    } catch (e: any) {
      toast.error(e?.message || "Conversion failed", { id: tid });
    } finally {
      setCadConverting(false);
    }
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
      setCurrentPlacement({ lat, lng, scale: sc });
      setShowLocationViewport(true);
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

  // Mobile-only adaptations: compact top bar, full-bleed canvas, and the
  // left/right inspector panels become slide-up bottom sheets triggered by a
  // fixed tab bar. Desktop layout is untouched.
  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState<"left" | "right" | null>(null);
  useEffect(() => {
    if (!isMobile) setMobilePanel(null);
  }, [isMobile]);

  // Desktop-only sidebar visibility. Right inspector is hidden by default and
  // revealed by the toolbar toggle next to Undo; left outline can be collapsed
  // by the chevron arrow on its inner edge.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  // Right inspector hosts Object / Terrain / Animate / Level tabs. Default to
  // open on desktop so users always see the controllers (they can still hide
  // via the toolbar toggle). Mobile uses the slide-up sheet instead.
  const [rightOpen, setRightOpen] = useState(true);

  // Auto-open the right inspector when any object, character, or light gets
  // selected so the contextual bar (Object/Terrain/Animate/Level) pops into
  // view. Users can still hide it via the "Show inspector" toggle.
  useEffect(() => {
    if (isMobile) return;
    const hasSelection =
      !!selectedId ||
      selectedIds.size > 0 ||
      !!selectedLightId ||
      selectedLightIds.size > 0;
    if (hasSelection) setRightOpen(true);
  }, [selectedId, selectedIds, selectedLightId, selectedLightIds, isMobile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const editorSidebarPanels = (
          <div className="p-3">
            {rigRoomMode && (
              <div className="mb-3 pb-3 border-b border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Tools</p>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Directional light"
                    onClick={() => { const l = makeLight("directional"); addLight(l); selectLight(l.id); }}
                  >
                    <SunMedium className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Point light"
                    onClick={() => { const l = makeLight("point"); addLight(l); selectLight(l.id); }}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Spot light"
                    onClick={() => { const l = makeLight("spot"); addLight(l); selectLight(l.id); }}
                  >
                    <Spotlight className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Ambient light"
                    onClick={() => { const l = makeLight("ambient"); addLight(l); selectLight(l.id); }}
                  >
                    <Sun className="w-3.5 h-3.5" />
                  </Button>
                  <div className="w-px h-5 bg-border/50 mx-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Geometry primitive (box)"
                    onClick={() => addObject(makePrimitive("box"))}
                  >
                    <Box className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Load 3D file (.glb, .gltf, .fbx, .obj…)"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Polygon (spline)"
                    onClick={() => addObject(makePolygon())}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <ComponentsPanel
              objects={scene.objects}
              selectedIds={selectedIds}
              onSelect={(id, multi) => selectObject(id, multi)}
              rigState={rigRoomMode ? rigState : null}
              selectedBoneName={rigState?.selectedBoneName ?? null}
              onSelectBone={(name) => setRigBoneRequest(name)}
              hideBoneHierarchy={rigRoomMode}
            />

            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-4">Layers</p>
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
                               o.kind === "character" ? <User className="w-3 h-3" /> :
                               o.kind === "trajectory" ? <SplineIcon className="w-3 h-3" /> :
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
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header
        className={`shrink-0 border-b border-border/40 backdrop-blur-xl bg-background/60 z-20 flex items-center gap-3 ${
          isMobile
            ? "px-2 py-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "px-4 py-2"
        }`}
      >
        <Link to="/levels" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {!isMobile && (
          <>
            <Layers className="w-4 h-4 text-primary" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner}
              className="h-8 bg-transparent border-transparent hover:border-border focus:border-border text-sm font-semibold w-64"
            />
          </>
        )}
        <div className={`flex items-center gap-2 ${isMobile ? "ml-0" : "ml-auto"}`}>
          <ActiveToolBadges
            tools={[
              {
                key: "sculpt",
                label: "Sculpt brush",
                icon: <Brush className="w-3.5 h-3.5" />,
                active: sculptActive,
              },
              {
                key: "spline",
                label: "Spline editor",
                icon: <SplineIcon className="w-3.5 h-3.5" />,
                active: editingPolygonId !== null,
              },
              {
                key: "texture",
                label: "Texture painting",
                icon: <Paintbrush className="w-3.5 h-3.5" />,
                active: facePaintActive,
              },
            ]}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={undo}
            disabled={historyRef.current.past.length === 0}
            title="Undo (Ctrl/Cmd+Z)"
            className={isMobile ? "h-7 w-7 px-0" : ""}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (window as any).__levelResetCamera?.()}
            title="Reset camera to scene center"
            className={isMobile ? "h-7 w-7 px-0" : "h-8 w-8 px-0"}
          >
            <Camera className="w-3.5 h-3.5" />
          </Button>
          {!isMobile && (
            <>
              <Button
                size="sm"
                variant={leftCollapsed ? "ghost" : "secondary"}
                onClick={() => setLeftCollapsed((v) => !v)}
                title={leftCollapsed ? "Show left panel" : "Hide left panel"}
                className="h-8 w-8 px-0"
              >
                <PanelLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant={rightOpen ? "secondary" : "ghost"}
                onClick={() => setRightOpen((v) => !v)}
                title={rightOpen ? "Hide inspector" : "Show inspector"}
                className="h-8 w-8 px-0"
              >
                <PanelRight className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={redo}
            disabled={historyRef.current.future.length === 0}
            title="Redo (Ctrl/Cmd+Shift+Z)"
            className={isMobile ? "h-7 w-7 px-0" : ""}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>
          {!isMobile && (
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
          )}
          {isMobile && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSnapEnabled((v) => !v)}
              title="Toggle snap to grid"
              className="h-7 w-7 px-0"
            >
              <Magnet className={`w-3.5 h-3.5 ${snapEnabled ? "text-primary" : ""}`} />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowGrid((v) => !v)} title="Toggle grid" className={isMobile ? "h-7 w-7 px-0" : ""}>
            {showGrid ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>
          {!isMobile && (
            <Button size="sm" variant="ghost" onClick={() => setPlaying((p) => !p)} title="Play / Pause">
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </Button>
          )}
          {!isMobile && (
            <Button
              size="sm"
              variant="outline"
              onClick={openPlaceDialog}
              disabled={!isOwner}
              title="Place on Atlas"
            >
              <MapPin className="w-3.5 h-3.5 mr-1" /> Place on Atlas
            </Button>
          )}
          {!isMobile && (
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
          )}
          {!isMobile && (
            <Button
              size="sm"
              onClick={() => save()}
              disabled={!isOwner || saving}
              className="h-8 w-8 p-0"
              title="Save"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </header>

      <div
        className={
          isMobile
            ? "flex-1 relative min-h-0"
            : "flex-1 grid grid-rows-[minmax(0,1fr)] min-h-0 min-w-0"
        }
        style={
          isMobile
            ? undefined
            : {
                gridTemplateColumns: playing
                  ? `1fr`
                  : rigRoomMode
                  ? `1fr ${rightOpen ? "320px" : "0px"}`
                  : `${leftCollapsed ? "28px" : "260px"} 1fr ${rightOpen ? "320px" : "0px"}`,
              }
        }
      >
        {/* Left: outline — scene components, lights, layers (hidden in rig-room mode). */}
        {!rigRoomMode && !playing && (
        <aside
          className={
            isMobile
              ? `fixed inset-x-0 bottom-14 top-12 z-40 overflow-y-auto overflow-x-hidden bg-background/95 backdrop-blur-xl border-t border-border/60 rounded-t-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out scrollbar-dark ${
                  mobilePanel === "left"
                    ? "translate-y-0"
                    : "translate-y-full pointer-events-none"
                }`
              : `border-r border-border/40 bg-card/40 overflow-y-auto overflow-x-hidden relative transition-all duration-300 scrollbar-dark ${
                  leftCollapsed ? "overflow-hidden" : ""
                }`
          }
        >
          {!isMobile && (
            <button
              onClick={() => setLeftCollapsed((v) => !v)}
              title={leftCollapsed ? "Expand panel" : "Collapse panel"}
              aria-label={leftCollapsed ? "Expand left panel" : "Collapse left panel"}
              className="absolute top-2 right-0 z-30 w-5 h-8 flex items-center justify-center rounded-l-md bg-background/80 border border-r-0 border-border/60 text-muted-foreground hover:text-foreground hover:bg-background"
            >
              {leftCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>
          )}
          {!isMobile && leftCollapsed ? null : (
            <>
          {isMobile && (
            <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-border/40 bg-background/95 backdrop-blur-xl">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Scene</span>
              <button
                onClick={() => setMobilePanel(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="p-3 border-b border-border/40 sticky top-0 z-10 shrink-0 bg-card/80 backdrop-blur-xl">
            {!rigRoomMode && (
              <>
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
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => addObject(makeTrajectory())} title="Trajectory spline">
                <SplineIcon className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => addObject(makeCharacter())}
                title="Character (rigged Xbot — body, fingers, toes + Mixamo animations)"
              >
                <User className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px]"
                onClick={() => fileRef.current?.click()}
                title={`Native: ${NATIVE_FORMATS.map((e) => "." + e).join(", ")}`}
              >
                <Upload className="w-3.5 h-3.5 mr-1" /> Model
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px]"
                onClick={() => cadFileRef.current?.click()}
                disabled={cadConverting}
                title={`CAD via Autodesk APS: ${CAD_FORMATS.map((e) => "." + e).join(", ")}`}
              >
                {cadConverting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 mr-1" />
                )}
                CAD
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={NATIVE_FORMATS.map((e) => "." + e).join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadModel(f);
                  e.target.value = "";
                }}
              />
              <input
                ref={cadFileRef}
                type="file"
                accept={CAD_FORMATS.map((e) => "." + e).join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadCad(f);
                  e.target.value = "";
                }}
              />
            </div>
              </>
            )}
          </div>

          {!rigRoomMode && editorSidebarPanels}
            </>
          )}
        </aside>
        )}

        {/* Center: viewport */}
        <main
          className={
            isMobile
              ? "absolute inset-0 bottom-14 bg-slate-950"
              : "relative bg-slate-950"
          }
        >
          {rigRoomMode ? (
            <RigControllerRoom
              sidebarOpen={!leftCollapsed}
              onRigStateChange={setRigState}
              externalSelectedBoneName={rigBoneRequest}
              sidebarExtras={editorSidebarPanels}
              sceneCharacters={(() => {
                // Rig room has no scene of its own, so surface every
                // character authored across the user's local levels. The id
                // is namespaced "<levelId>:<charId>" so apply-back can find
                // the right level + object later.
                const seen = new Set<string>();
                const out: { id: string; name: string; url: string; currentAnimation?: string }[] = [];
                for (const lvl of listLocalLevels()) {
                  const chars = (lvl.scene?.objects ?? []).filter(
                    (o): o is CharacterObject => o.kind === "character",
                  );
                  for (const c of chars) {
                    const key = `${lvl.id}:${c.id}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push({
                      id: key,
                      name: `${c.name} · ${lvl.name}`,
                      url: c.url,
                      currentAnimation: c.currentAnimation,
                    });
                  }
                }
                return out;
              })()}
              onApplyToCharacter={(cid, patch) => {
                // Rig-room ids are namespaced "<levelId>:<charId>"; write the
                // patch back to that level on disk so it persists.
                const [levelId, charId] = cid.split(":");
                if (!levelId || !charId) {
                  patchObject(cid, {
                    url: patch.url,
                    ...(patch.currentAnimation ? { currentAnimation: patch.currentAnimation } : {}),
                    ...(patch.pose ? { pose: patch.pose } : {}),
                    ...(patch.rigSaveId ? { rigSaveId: patch.rigSaveId } : {}),
                    ...(patch.source ? { source: patch.source } : {}),
                  } as any);
                  return;
                }
                const lvl = getLocalLevel(levelId);
                if (!lvl) return;
                const nextObjects = (lvl.scene.objects ?? []).map((o) =>
                  o.id === charId
                    ? ({
                        ...o,
                        url: patch.url,
                        ...(patch.currentAnimation ? { currentAnimation: patch.currentAnimation } : {}),
                        ...(patch.pose ? { pose: patch.pose } : {}),
                        ...(patch.rigSaveId ? { rigSaveId: patch.rigSaveId } : {}),
                        ...(patch.source ? { source: patch.source } : {}),
                      } as any)
                    : o,
                );
                updateLocalLevel(levelId, {
                  scene: { ...lvl.scene, objects: nextObjects },
                });
              }}
            />
          ) : (
          <LevelScene3D
            scene={renderedScene}
            selectedId={selectedId}
            facePaint={facePaintState}
            onSelect={(oid) => {
              if (editingPolygonId) {
                // While spline editing is active, keep the editing polygon
                // selected and ignore clicks on other objects / empty space.
                if (oid === editingPolygonId) return;
                return;
              }
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
            onSelectLight={(lid) => {
              if (editingPolygonId) return;
              selectLight(lid);
            }}
            editingPolygonId={selectedObjectLocked ? null : editingPolygonId}
            onPolygonPointsChange={(oid, points) => patchObject(oid, { points } as any)}
            onPolygonOffsetsChange={(oid, bottomOffsets) =>
              patchObject(oid, { bottomOffsets } as any)
            }
            onPolygonHeightsChange={(oid, h) => {
              const patch: any = {};
              if (h.top) patch.pointHeights = h.top;
              if (h.bottom) patch.bottomHeights = h.bottom;
              patchObject(oid, patch);
            }}
            onPolygonPatch={(oid, p) => patchObject(oid, p as any)}
            onTrajectoryPointsChange={(oid, points) =>
              patchObject(oid, { points } as any)
            }
            addingPolygonPoint={addingPointMode && !!editingPolygonId}
            onAddingPointHandled={() => setAddingPointMode(false)}
            transformMode={selectedObjectLocked ? null : transformMode}
            onObjectTransform={(oid, t) => {
              const o = scene.objects.find((x) => x.id === oid);
              if (isObjectLocked(o)) return;
              patchObject(oid, t as any);
            }}
            sculpt={{
              active: sculptActive && !!scene.terrain?.enabled &&
                scene.terrain.source === "primitive" && scene.terrain.shape === "plane",
              tool: sculptTool,
              radius: sculptRadius,
              strength: sculptStrength,
              commit: (heights) =>
                updateScene((s) => {
                  const base = s.terrain ?? defaultTerrain();
                  const N = base.heightmap?.resolution ?? 64;
                  s.terrain = {
                    ...base,
                    heightmap: { resolution: N, data: heights },
                  };
                  return s;
                }),
            }}
            className="w-full h-full"
          />
          )}
        </main>

        {/* Right: inspector */}
        <aside
          className={
            playing
              ? "hidden"
              : isMobile
              ? `fixed inset-x-0 bottom-14 top-12 z-40 overflow-y-auto overflow-x-hidden bg-background/95 backdrop-blur-xl border-t border-border/60 rounded-t-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out scrollbar-dark ${
                  mobilePanel === "right"
                    ? "translate-y-0"
                    : "translate-y-full pointer-events-none"
                }`
              : rightOpen
              ? "border-l border-border/40 bg-card/40 overflow-y-auto overflow-x-hidden scrollbar-dark"
              : "hidden"
          }
        >
          {isMobile && (
            <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-border/40 bg-background/95 backdrop-blur-xl">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Inspector</span>
              <button
                onClick={() => setMobilePanel(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <Tabs defaultValue="object" className="w-full">
            <TabsList className="w-full rounded-none grid grid-cols-4">
              <TabsTrigger value="object" className="text-[11px]">Object</TabsTrigger>
              <TabsTrigger value="terrain" className="text-[11px]">Terrain</TabsTrigger>
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
                  allObjects={scene.objects}
                  editing={editingPolygonId === selectedObj.id}
                  onToggleEdit={() =>
                    setEditingPolygonId((cur) => (cur === selectedObj.id ? null : selectedObj.id))
                  }
                  addingPoint={addingPointMode}
                  onToggleAddPoint={() => setAddingPointMode((v) => !v)}
                  projectId={id || "unsaved"}
                  facePaintActive={facePaintActive}
                  paintedFaces={paintedFaces}
                  onToggleFacePaint={() => setFacePaintActive((v) => !v)}
                  onClearFacePaint={() => setPaintedFaces(new Set())}
                  userClips={userClipEntries}
                  onOpenCharacterGallery={() => setCharacterGalleryOpen(true)}
                  onSpawnObjects={(objs) => addObjects(objs)}
                  scenePaths={scene.scenePaths ?? []}
                  onPatchScenePaths={(next) => updateScene((s) => { s.scenePaths = next; return s; })}
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
                onOpenGallery={(targetId) => {
                  const obj = scene.objects.find((o) => o.id === targetId) ?? null;
                  setObjectGalleryTarget(obj);
                  setObjectGalleryOpen(true);
                }}
              />
            </TabsContent>

            <TabsContent value="terrain" className="p-3 space-y-3 m-0">
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
                sculpt={{
                  active: sculptActive,
                  tool: sculptTool,
                  radius: sculptRadius,
                  strength: sculptStrength,
                  setActive: setSculptActive,
                  setTool: setSculptTool,
                  setRadius: setSculptRadius,
                  setStrength: setSculptStrength,
                }}
                onClear={() =>
                  updateScene((s) => {
                    s.terrain = { ...(s.terrain ?? defaultTerrain()), enabled: false };
                    return s;
                  })
                }
                onOpenGallery={() => setTerrainGalleryOpen(true)}
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
              <HDRIPanel
                hdri={scene.environment.hdri}
                disabled={!isOwner}
                onChange={(updater) =>
                  updateScene((s) => {
                    const current: HDRIEnvironmentCfg = s.environment.hdri ?? {
                      maps: [],
                      intensity: 1,
                      rotation: 0,
                      asBackground: true,
                    };
                    const next = updater(current);
                    if (!next || next.maps.length === 0) {
                      delete s.environment.hdri;
                    } else {
                      s.environment.hdri = next;
                    }
                    return s;
                  })
                }
              />
              <GlobalIlluminationPanel
                gi={scene.environment.gi}
                disabled={!isOwner}
                onChange={(updater) =>
                  updateScene((s) => {
                    const current = s.environment.gi ?? {
                      enabled: true,
                      skyColor: "#87ceeb",
                      groundColor: "#3d5c3d",
                      hemisphereIntensity: 0.6,
                      contactShadows: true,
                      contactOpacity: 0.4,
                      contactBlur: 2.5,
                    };
                    s.environment.gi = updater(current);
                    return s;
                  })
                }
              />
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    {isPublic ? <Globe2 className="w-3 h-3" /> : <LockIcon className="w-3 h-3" />} Public
                  </Label>
                  <p className="text-[10px] text-muted-foreground">Anyone can view this Level</p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={!isOwner} />
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* Mobile bottom tab bar — toggles slide-up panels and quick play/save */}
      {isMobile && (
        <nav className="fixed inset-x-0 bottom-0 h-14 z-50 border-t border-border/60 bg-background/95 backdrop-blur-xl grid grid-cols-5 [padding-bottom:env(safe-area-inset-bottom)]">
          <button
            onClick={() => setMobilePanel((p) => (p === "left" ? null : "left"))}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-wider transition-colors ${
              mobilePanel === "left" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <LayersIcon className="w-5 h-5" />
            Scene
          </button>
          <button
            onClick={() => setMobilePanel((p) => (p === "right" ? null : "right"))}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-wider transition-colors ${
              mobilePanel === "right" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Sparkles className="w-5 h-5" />
            Inspect
          </button>
          <button
            onClick={() => {
              setMobilePanel(null);
              setPlaying((p) => !p);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-wider transition-colors ${
              playing ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              setMobilePanel(null);
              openPlaceDialog();
            }}
            disabled={!isOwner}
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-wider text-muted-foreground disabled:opacity-50"
          >
            <MapPin className="w-5 h-5" />
            Map
          </button>
          <button
            onClick={() => {
              setMobilePanel(null);
              save();
            }}
            disabled={!isOwner || saving}
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-wider text-muted-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          </button>
        </nav>
      )}

      {/* Play-mode runtime + HUD (mounted only while playing) */}
      <PlayBehaviorRuntime objects={scene.objects} playing={playing} />
      <PlayInputManager playing={playing} />
      <PlayHUD visible={playing} onExit={() => setPlaying(false)} />

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
            <AtlasMiniMap
              lat={parseFloat(placeLat)}
              lng={parseFloat(placeLng)}
              onChange={(la, ln) => { setPlaceLat(la.toFixed(6)); setPlaceLng(ln.toFixed(6)); }}
              className="h-56 w-full rounded-lg overflow-hidden border border-white/10"
            />
            <p className="text-[10px] text-muted-foreground">
              Drag the pin (or click the map) to move the placement.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlaceDialogOpen(false)}>Cancel</Button>
            <Button onClick={placeOnAtlas}>
              <MapPin className="w-3.5 h-3.5 mr-1" /> Place
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Atlas location viewport */}
      {currentPlacement && showLocationViewport && (
        <LocationViewport
          lat={currentPlacement.lat}
          lng={currentPlacement.lng}
          onClose={() => setShowLocationViewport(false)}
          onOpenAtlas={() => navigate(`/atlas?lat=${currentPlacement.lat}&lng=${currentPlacement.lng}`)}
          onPickManually={() => setPlaceDialogOpen(true)}
          onMove={async (la, ln) => {
            setCurrentPlacement({ lat: la, lng: ln, scale: currentPlacement.scale });
            setPlaceLat(la.toFixed(6));
            setPlaceLng(ln.toFixed(6));
            if (!id || !userId || isLocalLevelId(id)) return;
            // Persist the new coordinates on the most recent placement row.
            const { data } = await supabase
              .from("atlas_level_placements")
              .select("id")
              .eq("level_id", id)
              .eq("owner_id", userId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.id) {
              await supabase
                .from("atlas_level_placements")
                .update({ lat: la, lng: ln })
                .eq("id", data.id);
            } else {
              await supabase.from("atlas_level_placements").insert({
                owner_id: userId, level_id: id, lat: la, lng: ln, scale: currentPlacement.scale,
              });
            }
          }}
        />
      )}

      <CharacterAnimationGallery
        open={characterGalleryOpen}
        onOpenChange={setCharacterGalleryOpen}
        currentClip={
          scene.objects.find((o) => o.id === selectedId && o.kind === "character") &&
          (scene.objects.find((o) => o.id === selectedId) as CharacterObject | undefined)?.currentAnimation
        }
        extraEntries={userClipEntries}
        onApply={(entry) => {
          const obj = scene.objects.find((o) => o.id === selectedId);
          if (!obj || obj.kind !== "character") return;
          const patch: Partial<CharacterObject> = { currentAnimation: entry.clipName };
          if (entry.source !== "builtin" && entry.url) patch.url = entry.url;
          patchObject(obj.id, patch as any);
        }}
        onUserClipsParsed={async (entries) => {
          const persisted = await Promise.all(
            entries.map(async (e) => {
              let url = e.url ?? "";
              if (url.startsWith("blob:")) {
                try {
                  const blob = await fetch(url).then((r) => r.blob());
                  url = await new Promise<string>((res, rej) => {
                    const r = new FileReader();
                    r.onload = () => res(r.result as string);
                    r.onerror = () => rej(r.error);
                    r.readAsDataURL(blob);
                  });
                } catch (err) {
                  console.warn("[clip-persist] keeping blob url", err);
                }
              }
              return {
                id: e.id, name: e.name, category: String(e.category),
                tags: e.tags, url, clipName: e.clipName, loop: e.loop,
              };
            }),
          );
          updateScene((s) => {
            s.userClipLibrary = [...(s.userClipLibrary ?? []), ...persisted];
            return s;
          });
        }}
      />

      <ObjectAnimationGallery
        open={objectGalleryOpen}
        onOpenChange={setObjectGalleryOpen}
        target={objectGalleryTarget}
        onApply={(track) => addTrack(track)}
      />

      <TerrainGallery
        open={terrainGalleryOpen}
        onOpenChange={setTerrainGalleryOpen}
        currentTerrain={scene.terrain}
        onLoad={(terrain) =>
          updateScene((s) => {
            s.terrain = { ...terrain, enabled: true };
            return s;
          })
        }
      />
    </div>
  );
}

/* ---------- inspector ---------- */

function Vec3Field({
  label, value, onChange, step = 0.1, disabled, snap = 0,
}: { label: string; value: Vec3; onChange: (v: Vec3) => void; step?: number; disabled?: boolean; snap?: number }) {
  const snapVal = (n: number) => (snap > 0 ? Math.round(n / snap) * snap : n);
  const abbr = label === "Position" ? "P" : label === "Rotation (rad)" ? "R" : label === "Scale" ? "S" : label.charAt(0);
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 text-right leading-none" title={label}>
        {abbr}
      </span>
      <div className="grid grid-cols-3 gap-1 flex-1 min-w-0">
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
            className="h-6 text-[10px] px-1.5"
            placeholder={axis}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- play behavior section (per-object) ---------- */

function PlayBehaviorSection({
  obj,
  onPatch,
  disabled,
}: {
  obj: SceneObject;
  onPatch: (p: Partial<SceneObject>) => void;
  disabled?: boolean;
}) {
  const beh = (obj as any).playBehavior as
    | import("@/lib/levelTypes").PlayBehavior
    | undefined;
  const current: import("@/lib/levelTypes").PlayBehavior = beh ?? {
    collision: "walkable",
  };
  const patchBeh = (p: Partial<import("@/lib/levelTypes").PlayBehavior>) =>
    onPatch({ playBehavior: { ...current, ...p } } as any);
  const toggleGroup = (
    key: "grabbable" | "pushable" | "event" | "sittable" | "usable",
    enabled: boolean,
  ) => {
    if (!enabled) {
      const next = { ...current };
      delete (next as any)[key];
      onPatch({ playBehavior: next } as any);
      return;
    }
    const defaults: Record<typeof key, any> = {
      grabbable: { key: "E" },
      pushable: { mass: 1, friction: 0.92 },
      event: { key: "F", eventId: "event_1" },
      sittable: { key: "E" },
      usable: { key: "E" },
    };
    patchBeh({ [key]: defaults[key] } as any);
  };

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Play behavior
        </Label>
        <span className="text-[9px] font-mono text-muted-foreground/60">
          {[
            current.grabbable && "GRAB",
            current.pushable && "PUSH",
            current.event && "EVT",
            current.sittable && "SIT",
            current.usable && "USE",
            current.invisibleInPlay && "HIDDEN",
            current.collision === "none" && "GHOST",
            current.collision === "blocking" && "BLOCK",
          ]
            .filter(Boolean)
            .join(" · ") || "static"}
        </span>
      </div>

      {/* Collision */}
      <div>
        <Label className="text-[10px] text-muted-foreground">Collision</Label>
        <Select
          value={current.collision}
          onValueChange={(v) => patchBeh({ collision: v as any })}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-[11px] mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="walkable" className="text-xs">
              Walkable — player stands on / collides
            </SelectItem>
            <SelectItem value="blocking" className="text-xs">
              Blocking volume — solid wall
            </SelectItem>
            <SelectItem value="none" className="text-xs">
              None — player passes through
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invisible in play */}
      <div className="flex items-center justify-between rounded border border-border/30 px-2 py-1">
        <Label className="text-[11px]">Invisible in play</Label>
        <Switch
          checked={!!current.invisibleInPlay}
          disabled={disabled}
          onCheckedChange={(v) => patchBeh({ invisibleInPlay: v })}
        />
      </div>

      {/* Grabbable */}
      <BehaviorRow
        label="Grabbable"
        on={!!current.grabbable}
        onToggle={(v) => toggleGroup("grabbable", v)}
        disabled={disabled}
      >
        {current.grabbable && (
          <KeyCaptureInput
            value={current.grabbable.key}
            onChange={(k) => patchBeh({ grabbable: { ...current.grabbable!, key: k } })}
            disabled={disabled}
          />
        )}
      </BehaviorRow>

      {/* Pushable */}
      <BehaviorRow
        label="Pushable"
        on={!!current.pushable}
        onToggle={(v) => toggleGroup("pushable", v)}
        disabled={disabled}
      >
        {current.pushable && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">m</span>
            <Input
              type="number"
              value={current.pushable.mass ?? 1}
              step={0.1}
              disabled={disabled}
              onChange={(e) =>
                patchBeh({
                  pushable: {
                    ...current.pushable!,
                    mass: parseFloat(e.target.value) || 1,
                  },
                })
              }
              className="h-6 w-14 text-[10px] px-1"
            />
          </div>
        )}
      </BehaviorRow>

      {/* Event */}
      <BehaviorRow
        label="Trigger event"
        on={!!current.event}
        onToggle={(v) => toggleGroup("event", v)}
        disabled={disabled}
      >
        {current.event && (
          <div className="flex items-center gap-1.5">
            <KeyCaptureInput
              value={current.event.key}
              onChange={(k) => patchBeh({ event: { ...current.event!, key: k } })}
              disabled={disabled}
            />
            <Input
              value={current.event.eventId}
              placeholder="event_id"
              disabled={disabled}
              onChange={(e) =>
                patchBeh({ event: { ...current.event!, eventId: e.target.value } })
              }
              className="h-6 w-24 text-[10px] px-1.5"
            />
          </div>
        )}
      </BehaviorRow>

      {/* Sittable */}
      <BehaviorRow
        label="Sittable"
        on={!!current.sittable}
        onToggle={(v) => toggleGroup("sittable", v)}
        disabled={disabled}
      >
        {current.sittable && (
          <KeyCaptureInput
            value={current.sittable.key}
            onChange={(k) => patchBeh({ sittable: { ...current.sittable!, key: k } })}
            disabled={disabled}
          />
        )}
      </BehaviorRow>

      {/* Usable */}
      <BehaviorRow
        label="Usable"
        on={!!current.usable}
        onToggle={(v) => toggleGroup("usable", v)}
        disabled={disabled}
      >
        {current.usable && (
          <KeyCaptureInput
            value={current.usable.key}
            onChange={(k) => patchBeh({ usable: { ...current.usable!, key: k } })}
            disabled={disabled}
          />
        )}
      </BehaviorRow>

      {/* Interact radius (only meaningful when any action is bound) */}
      {(current.grabbable || current.event || current.sittable || current.usable) && (
        <div>
          <Label className="text-[10px] text-muted-foreground">
            Interact radius {(current.interactRadius ?? 2.5).toFixed(1)} m
          </Label>
          <Slider
            value={[current.interactRadius ?? 2.5]}
            min={0.5}
            max={10}
            step={0.1}
            disabled={disabled}
            onValueChange={([v]) => patchBeh({ interactRadius: v })}
          />
        </div>
      )}
    </div>
  );
}

function BehaviorRow({
  label,
  on,
  onToggle,
  disabled,
  children,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-border/30 px-2 py-1 min-h-[2rem]">
      <div className="flex items-center gap-2 min-w-0">
        <Switch checked={on} onCheckedChange={onToggle} disabled={disabled} />
        <Label className="text-[11px] truncate">{label}</Label>
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function ObjectInspector({
  obj, onPatch, disabled, snap = 0, editing, onToggleEdit, addingPoint, onToggleAddPoint, onDelete,
  projectId, facePaintActive, paintedFaces, onToggleFacePaint, onClearFacePaint,
  userClips, onOpenCharacterGallery, onSpawnObjects, allObjects = [],
  scenePaths = [], onPatchScenePaths,
}: {
  obj: SceneObject;
  onPatch: (p: Partial<SceneObject>) => void;
  disabled?: boolean;
  snap?: number;
  editing?: boolean;
  onToggleEdit?: () => void;
  addingPoint?: boolean;
  onToggleAddPoint?: () => void;
  onDelete?: () => void;
  projectId: string;
  facePaintActive: boolean;
  paintedFaces: Set<string>;
  onToggleFacePaint: () => void;
  onClearFacePaint: () => void;
  userClips: CharacterClipEntry[];
  onOpenCharacterGallery: () => void;
  onSpawnObjects?: (objs: SceneObject[]) => void;
  allObjects?: SceneObject[];
  scenePaths?: import("@/lib/levelTypes").ScenePath[];
  onPatchScenePaths?: (next: import("@/lib/levelTypes").ScenePath[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Name</Label>
        <Input value={obj.name} disabled={disabled} onChange={(e) => onPatch({ name: e.target.value } as any)} className="h-7 text-xs" />
      </div>
      <div className="space-y-1">
        <Vec3Field label="Position" value={obj.position} onChange={(position) => onPatch({ position } as any)} disabled={disabled} snap={snap} />
        <Vec3Field label="Rotation (rad)" value={obj.rotation} onChange={(rotation) => onPatch({ rotation } as any)} step={0.05} disabled={disabled} />
        <Vec3Field label="Scale" value={obj.scale} onChange={(scale) => onPatch({ scale } as any)} disabled={disabled} />
      </div>

      {obj.kind !== "character" && (
        <PlayBehaviorSection obj={obj} onPatch={onPatch} disabled={disabled} />
      )}

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
          <PolygonPointsEditor
            obj={obj}
            onChange={(points) => onPatch({ points } as any)}
            disabled={disabled}
            addingPoint={addingPoint}
            onToggleAddPoint={onToggleAddPoint}
          />
        </>
      )}
      {obj.kind === "model" && (
        <ModelMaterialEditor
          obj={obj}
          disabled={disabled}
          onPatch={(materialOverrides) =>
            onPatch({ materialOverrides } as any)
          }
        />
      )}
      {obj.kind === "character" && (
        <Suspense fallback={
          <p className="text-[10px] text-muted-foreground py-3 border-t border-border/40">
            Loading rig & animation clips…
          </p>
        }>
          <CharacterInspector
            obj={obj as CharacterObject}
            disabled={disabled}
            onPatch={(patch) => onPatch(patch as any)}
            userClips={userClips}
            onOpenGallery={onOpenCharacterGallery}
          />
        </Suspense>
      )}
      {obj.kind === "trajectory" && (
        <TrajectoryInspector
          obj={obj as TrajectoryObject}
          disabled={disabled}
          onPatch={(patch) => onPatch(patch as any)}
          allObjects={allObjects}
        />
      )}
      {(obj.kind === "polygon" || obj.kind === "primitive" || obj.kind === "model") && (
        <FacePaintPanel
          obj={obj}
          projectId={projectId}
          active={facePaintActive}
          selectedFaces={paintedFaces}
          onToggleActive={onToggleFacePaint}
          onClearSelection={onClearFacePaint}
          onPatchFaceOverrides={(faceOverrides) => onPatch({ faceOverrides } as any)}
          onPatchModelOverrides={(materialOverrides) => onPatch({ materialOverrides } as any)}
          disabled={disabled}
        />
      )}
      {onSpawnObjects && obj.kind !== "character" && obj.kind !== "trajectory" && (
        <GeometryPanel
          anchor={obj.position}
          selectedObject={obj}
          onSpawn={onSpawnObjects}
          onAddPaths={onPatchScenePaths ? (paths) => onPatchScenePaths([...(scenePaths ?? []), ...paths]) : undefined}
          disabled={disabled}
        />
      )}
      {onPatchScenePaths && obj.kind !== "trajectory" && (
        <InteractionsPanel
          obj={obj}
          paths={scenePaths}
          onPatch={onPatch}
          onPatchPaths={onPatchScenePaths}
          disabled={disabled}
        />
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
  obj, onChange, disabled, addingPoint, onToggleAddPoint,
}: {
  obj: PolygonObject;
  onChange: (pts: Array<[number, number]>) => void;
  disabled?: boolean;
  addingPoint?: boolean;
  onToggleAddPoint?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">Spline points</Label>
        <Button
          size="sm"
          variant={addingPoint ? "default" : "ghost"}
          className="h-6 px-2 text-[10px]"
          disabled={disabled}
          onClick={onToggleAddPoint}
          title="Click an edge of the polygon to insert a new point"
        >
          <Plus className="w-3 h-3" /> {addingPoint ? "Click edge…" : "Add"}
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

/* ------------------ Model material / texture editor ------------------ */

function useModelMeshNames(url: string): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const out: string[] = [];
        let i = 0;
        gltf.scene.traverse((n: any) => {
          if (n.isMesh) out.push(n.name || `mesh_${i++}`);
        });
        // de-dup while preserving order
        const seen = new Set<string>();
        setNames(out.filter((n) => (seen.has(n) ? false : (seen.add(n), true))));
      },
      undefined,
      () => { if (!cancelled) setNames([]); },
    );
    return () => { cancelled = true; };
  }, [url]);
  return names;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
}

function TextureSlot({
  label, value, disabled, onChange,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-1">
      <Label className="text-[10px] w-16 shrink-0">{label}</Label>
      <div className="w-7 h-7 rounded border border-border bg-muted/30 overflow-hidden shrink-0">
        {value && <img src={value} alt={label} className="w-full h-full object-cover" />}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-[10px] px-2 flex-1"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {value ? "Replace" : "Upload"}
      </Button>
      {value && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          title="Remove"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            onChange(await readFileAsDataURL(f));
          } catch {
            toast.error("Failed to read image");
          }
        }}
      />
    </div>
  );
}

function CharacterInspector({
  obj, disabled, onPatch, userClips, onOpenGallery,
}: {
  obj: CharacterObject;
  disabled?: boolean;
  onPatch: (patch: Partial<CharacterObject>) => void;
  userClips?: CharacterClipEntry[];
  onOpenGallery?: () => void;
}) {
  const names = useCharacterAnimationNames(obj.url);
  const current = obj.currentAnimation || names[0] || "";
  const navigate = useNavigate();
  const { id: routeLevelId } = useParams<{ id: string }>();
  const openInRigRoom = () => {
    const params = new URLSearchParams();
    // Always carry the URL so the rig room can load *any* character, even
    // when it isn't part of a saved local level (uploaded ad-hoc, library
    // rig, etc.). When we also know the level id we pass an apply-target id
    // so "Apply to scene character" writes back to the right object.
    params.set("url", obj.url);
    params.set("name", obj.name || obj.source || "Character");
    if (routeLevelId) params.set("target", `${routeLevelId}:${obj.id}`);
    navigate(`/locomotion?${params.toString()}`);
  };
  return (
    <div className="space-y-3 pt-3 border-t border-border/40">
      <Button
        size="sm"
        variant="outline"
        className="w-full h-8 text-[11px] gap-1.5 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/10"
        disabled={disabled}
        onClick={openInRigRoom}
      >
        Open in Rig Room →
      </Button>
      {/* ------------ Rig & Body (saved from Rig Controller Room) ------------ */}
      <RigBodySection obj={obj} disabled={disabled} onPatch={onPatch} />

      {/* ------------ locomotion (playable character) ------------ */}
      <div className="rounded-md border border-blue-400/30 bg-blue-500/5 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-blue-200">Playable in Play mode</Label>
          <Switch
            checked={!!obj.playable}
            onCheckedChange={(v) => onPatch({ playable: v })}
            disabled={disabled}
          />
        </div>
        {obj.playable && (
          <>
            <p className="text-[10px] text-muted-foreground leading-snug">
              WASD / left stick to move · Space / A to jump · Shift / LT to run ·
              E / X to interact · Mouse / right stick to look.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Input</Label>
                <Select
                  value={obj.controlScheme ?? "both"}
                  onValueChange={(v) => onPatch({ controlScheme: v as any })}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-7 text-[11px] mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both" className="text-xs">Keyboard + Gamepad</SelectItem>
                    <SelectItem value="keyboard" className="text-xs">Keyboard only</SelectItem>
                    <SelectItem value="gamepad" className="text-xs">Gamepad only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Camera</Label>
                <Select
                  value={obj.cameraMode ?? "third"}
                  onValueChange={(v) => onPatch({ cameraMode: v as any })}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-7 text-[11px] mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="third" className="text-xs">Third person</SelectItem>
                    <SelectItem value="first" className="text-xs">First person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Walk</Label>
                <Input
                  type="number" step={0.1} min={0.1}
                  value={obj.locomotion?.walkSpeed ?? 2.2}
                  onChange={(e) => onPatch({ locomotion: { ...(obj.locomotion ?? {}), walkSpeed: +e.target.value } })}
                  disabled={disabled}
                  className="h-7 text-[11px] mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Run</Label>
                <Input
                  type="number" step={0.1} min={0.1}
                  value={obj.locomotion?.runSpeed ?? 5.0}
                  onChange={(e) => onPatch({ locomotion: { ...(obj.locomotion ?? {}), runSpeed: +e.target.value } })}
                  disabled={disabled}
                  className="h-7 text-[11px] mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Jump</Label>
                <Input
                  type="number" step={0.05} min={0.1}
                  value={obj.locomotion?.jumpHeight ?? 1.2}
                  onChange={(e) => onPatch({ locomotion: { ...(obj.locomotion ?? {}), jumpHeight: +e.target.value } })}
                  disabled={disabled}
                  className="h-7 text-[11px] mt-1"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-[11px]">Show navigation map</Label>
              <Switch
                checked={!!obj.showNavMap}
                onCheckedChange={(v) => onPatch({ showNavMap: v })}
                disabled={disabled}
              />
            </div>
            {obj.showNavMap && (
              <p className="text-[10px] text-muted-foreground leading-snug">
                <span className="inline-block w-2 h-2 mr-1 rounded-sm bg-emerald-500/70 align-middle" />
                walkable ·{" "}
                <span className="inline-block w-2 h-2 mx-1 rounded-sm bg-red-500/70 align-middle" />
                blocked (no ground, ceiling too low, or slope &gt; 45°).
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Character</p>
        <p className="text-[11px] text-foreground/80">{obj.source || "Custom rig"}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {names.length} animation clip{names.length === 1 ? "" : "s"} · full body, finger & toe rig
        </p>
      </div>

      {onOpenGallery && (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-[11px]"
          disabled={disabled}
          onClick={onOpenGallery}
        >
          <Library className="w-3.5 h-3.5 mr-1" /> Browse 100 animations
        </Button>
      )}

      <InlineAnimationPicker
        currentClipName={current}
        extraEntries={userClips}
        onPick={(entry) => {
          // If the entry is from a different rig URL, swap to its url so the
          // clip can play. Otherwise just update the clip name.
          const patch: Partial<CharacterObject> = { currentAnimation: entry.clipName };
          if (entry.source !== "builtin" && entry.url) patch.url = entry.url;
          onPatch(patch);
        }}
      />

      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Animation</Label>
        <Select
          value={current}
          onValueChange={(v) => onPatch({ currentAnimation: v })}
          disabled={disabled || names.length === 0}
        >
          <SelectTrigger className="h-8 text-xs mt-1">
            <SelectValue placeholder={names.length === 0 ? "No clips" : "Pick a clip"} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {names.map((n) => (
              <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Speed</Label>
          <span className="text-[10px] font-mono text-muted-foreground">{(obj.animationSpeed ?? 1).toFixed(2)}×</span>
        </div>
        <Slider
          min={0}
          max={3}
          step={0.05}
          value={[obj.animationSpeed ?? 1]}
          onValueChange={([v]) => onPatch({ animationSpeed: v })}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-[11px]">Paused</Label>
        <Switch
          checked={!!obj.paused}
          onCheckedChange={(v) => onPatch({ paused: v })}
          disabled={disabled}
        />
      </div>

      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Source URL</Label>
        <Input
          value={obj.url}
          onChange={(e) => onPatch({ url: e.target.value })}
          disabled={disabled}
          className="h-8 text-[11px] mt-1 font-mono"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Paste any rigged .glb/.gltf URL. Defaults to the Xbot example rig.
        </p>
      </div>
    </div>
  );
}

function RigBodySection({
  obj, disabled, onPatch,
}: {
  obj: CharacterObject;
  disabled?: boolean;
  onPatch: (patch: Partial<CharacterObject>) => void;
}) {
  const [saves, setSaves] = useState<RigSave[]>(() => getCachedRigSaves());
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    listRigSaves()
      .then((rows) => { if (!cancel) setSaves(rows); })
      .catch(() => { /* keep cache */ })
      .finally(() => { if (!cancel) setLoading(false); });
    const off = onRigSavesChanged(() => {
      setSaves(getCachedRigSaves());
    });
    return () => { cancel = true; off(); };
  }, []);

  const applySave = (s: RigSave) => {
    onPatch({
      url: s.model_url,
      source: s.name,
      pose: (s.pose ?? []) as any,
      rigSaveId: s.id,
      ...(s.active_clip ? { currentAnimation: s.active_clip } : {}),
    } as any);
    toast.success(`Rig "${s.name}" applied (pose + clip)`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return saves;
    return saves.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.source_label ?? "").toLowerCase().includes(q),
    );
  }, [saves, query]);

  // Keep the carousel index aligned with the current selection or in bounds
  // as the filter changes.
  useEffect(() => {
    if (filtered.length === 0) {
      setIndex(0);
      return;
    }
    const activeIdx = filtered.findIndex((s) => s.model_url === obj.url);
    if (activeIdx >= 0) {
      setIndex(activeIdx);
    } else if (index >= filtered.length) {
      setIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, obj.url]);

  const safeIndex = filtered.length ? Math.min(index, filtered.length - 1) : 0;
  const current = filtered[safeIndex];
  const step = (delta: number) => {
    if (filtered.length === 0) return;
    setIndex((i) => (i + delta + filtered.length) % filtered.length);
  };

  return (
    <div className="rounded-md border border-fuchsia-400/30 bg-fuchsia-500/5 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold text-fuchsia-200">Rig &amp; Body</Label>
        <span className="text-[10px] text-muted-foreground">
          {loading
            ? "…"
            : query
              ? `${filtered.length}/${saves.length}`
              : `${saves.length} saved`}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        Browse saved rigs from the Rig Controller Room. Tap the card to swap this character's body.
      </p>
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rigs…"
          disabled={disabled || saves.length === 0}
          className="w-full h-7 pl-7 pr-2 rounded-md bg-black/40 border border-border/40 text-[11px] placeholder:text-muted-foreground/60 focus:outline-none focus:border-fuchsia-400/60"
        />
      </div>
      {saves.length === 0 ? (
        <div className="text-[10px] text-muted-foreground/80 italic">
          No saved rigs yet — build & save one in the Rig Controller Room.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-[10px] text-muted-foreground/80 italic">
          No rigs match "{query}".
        </div>
      ) : current ? (
        <div className="space-y-1.5">
          <div className="relative">
            <button
              type="button"
              disabled={disabled || filtered.length < 2}
              onClick={() => step(-1)}
              aria-label="Previous rig"
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/60 border border-border/40 flex items-center justify-center hover:bg-black/80 disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled || filtered.length < 2}
              onClick={() => step(1)}
              aria-label="Next rig"
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/60 border border-border/40 flex items-center justify-center hover:bg-black/80 disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => applySave(current)}
              title={`${current.name}${current.source_label ? " · " + current.source_label : ""}`}
              className={
                "block w-full aspect-square rounded-md overflow-hidden border bg-black/40 " +
                (obj.url === current.model_url
                  ? "border-fuchsia-400/80 ring-1 ring-fuchsia-400/60"
                  : "border-border/40 hover:border-fuchsia-400/60")
              }
            >
              {current.thumbnail ? (
                <img
                  src={current.thumbnail}
                  alt={current.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/70 text-[10px] text-white truncate text-left">
                {current.name}
                {current.source_label ? (
                  <span className="text-muted-foreground"> · {current.source_label}</span>
                ) : null}
              </div>
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{obj.url === current.model_url ? "Active" : "Tap card to apply"}</span>
            <span>{safeIndex + 1} / {filtered.length}</span>
          </div>
          {filtered.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {filtered.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  title={s.name}
                  className={
                    "shrink-0 w-10 h-10 rounded overflow-hidden border bg-black/40 " +
                    (i === safeIndex
                      ? "border-fuchsia-400/80 ring-1 ring-fuchsia-400/60"
                      : "border-border/40 hover:border-fuchsia-400/60")
                  }
                >
                  {s.thumbnail ? (
                    <img src={s.thumbnail} alt={s.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ModelMaterialEditor({
  obj, disabled, onPatch,
}: {
  obj: ModelObject;
  disabled?: boolean;
  onPatch: (next: Record<string, ModelMaterialOverride>) => void;
}) {
  const meshNames = useModelMeshNames(obj.url);
  const overrides = obj.materialOverrides || {};
  const [openMesh, setOpenMesh] = useState<string | null>(null);

  const updateOverride = (
    meshName: string,
    patch: Partial<ModelMaterialOverride>,
  ) => {
    const next: Record<string, ModelMaterialOverride> = { ...overrides };
    const merged = { ...(next[meshName] || {}), ...patch };
    // Drop entry entirely if nothing meaningful is set.
    const empty =
      merged.color == null &&
      merged.metalness == null &&
      merged.roughness == null &&
      merged.opacity == null &&
      merged.map == null &&
      merged.normalMap == null &&
      merged.roughnessMap == null &&
      merged.repeat == null &&
      merged.offset == null &&
      merged.rotation == null;
    if (empty) delete next[meshName];
    else next[meshName] = merged;
    onPatch(next);
  };

  const resetMesh = (meshName: string) => {
    const next = { ...overrides };
    delete next[meshName];
    onPatch(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Materials</Label>
        <span className="text-[10px] text-muted-foreground">
          {obj.sourceFormat ? `.${obj.sourceFormat} · ` : ""}
          {meshNames.length} mesh{meshNames.length === 1 ? "" : "es"}
        </span>
      </div>
      {meshNames.length === 0 && (
        <p className="text-[10px] text-muted-foreground">Reading meshes…</p>
      )}
      <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
        {meshNames.map((name) => {
          const ov = overrides[name] || {};
          const isOpen = openMesh === name;
          const hasOverride = !!overrides[name];
          return (
            <div key={name} className="border border-border rounded">
              <button
                className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] hover:bg-accent/40"
                onClick={() => setOpenMesh(isOpen ? null : name)}
              >
                <span className="flex items-center gap-1 truncate">
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="truncate">{name}</span>
                </span>
                {hasOverride && (
                  <span className="text-[9px] uppercase tracking-wider text-primary">edited</span>
                )}
              </button>
              {isOpen && (
                <div className="p-2 space-y-2 border-t border-border">
                  <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                    <Label className="text-[10px]">Color</Label>
                    <Input
                      type="color"
                      value={ov.color ? rgbaToHex(ov.color) : "#cccccc"}
                      disabled={disabled}
                      onChange={(e) =>
                        updateOverride(name, { color: hexToRgba(e.target.value, ov.opacity ?? 1) })
                      }
                      className="h-7 w-full p-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">
                      Metalness {(ov.metalness ?? 0.1).toFixed(2)}
                    </Label>
                    <Slider
                      value={[ov.metalness ?? 0.1]}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={disabled}
                      onValueChange={([v]) => updateOverride(name, { metalness: v })}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">
                      Roughness {(ov.roughness ?? 0.8).toFixed(2)}
                    </Label>
                    <Slider
                      value={[ov.roughness ?? 0.8]}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={disabled}
                      onValueChange={([v]) => updateOverride(name, { roughness: v })}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">
                      Opacity {(ov.opacity ?? 1).toFixed(2)}
                    </Label>
                    <Slider
                      value={[ov.opacity ?? 1]}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={disabled}
                      onValueChange={([v]) => updateOverride(name, { opacity: v })}
                    />
                  </div>
                  <div className="space-y-1">
                    <TextureSlot
                      label="Albedo"
                      value={ov.map}
                      disabled={disabled}
                      onChange={(map) => updateOverride(name, { map })}
                    />
                    <TextureSlot
                      label="Normal"
                      value={ov.normalMap}
                      disabled={disabled}
                      onChange={(normalMap) => updateOverride(name, { normalMap })}
                    />
                    <TextureSlot
                      label="Roughness"
                      value={ov.roughnessMap}
                      disabled={disabled}
                      onChange={(roughnessMap) => updateOverride(name, { roughnessMap })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Tile U {(ov.repeat?.[0] ?? 1).toFixed(2)}</Label>
                      <Slider
                        value={[ov.repeat?.[0] ?? 1]}
                        min={0.1}
                        max={16}
                        step={0.1}
                        disabled={disabled}
                        onValueChange={([v]) =>
                          updateOverride(name, { repeat: [v, ov.repeat?.[1] ?? 1] })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Tile V {(ov.repeat?.[1] ?? 1).toFixed(2)}</Label>
                      <Slider
                        value={[ov.repeat?.[1] ?? 1]}
                        min={0.1}
                        max={16}
                        step={0.1}
                        disabled={disabled}
                        onValueChange={([v]) =>
                          updateOverride(name, { repeat: [ov.repeat?.[0] ?? 1, v] })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Offset U {(ov.offset?.[0] ?? 0).toFixed(2)}</Label>
                      <Slider
                        value={[ov.offset?.[0] ?? 0]}
                        min={-1}
                        max={1}
                        step={0.01}
                        disabled={disabled}
                        onValueChange={([v]) =>
                          updateOverride(name, { offset: [v, ov.offset?.[1] ?? 0] })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Offset V {(ov.offset?.[1] ?? 0).toFixed(2)}</Label>
                      <Slider
                        value={[ov.offset?.[1] ?? 0]}
                        min={-1}
                        max={1}
                        step={0.01}
                        disabled={disabled}
                        onValueChange={([v]) =>
                          updateOverride(name, { offset: [ov.offset?.[0] ?? 0, v] })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px]">
                      Rotation {(((ov.rotation ?? 0) * 180) / Math.PI).toFixed(0)}°
                    </Label>
                    <Slider
                      value={[ov.rotation ?? 0]}
                      min={-Math.PI}
                      max={Math.PI}
                      step={0.05}
                      disabled={disabled}
                      onValueChange={([v]) => updateOverride(name, { rotation: v })}
                    />
                  </div>
                  {hasOverride && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full h-7 text-[10px]"
                      disabled={disabled}
                      onClick={() => resetMesh(name)}
                    >
                      <Undo2 className="w-3 h-3 mr-1" /> Reset to original
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
  scene, onAdd, onRemove, onPatch, disabled, onOpenGallery,
}: {
  scene: LevelScene;
  onAdd: (t: AnimationTrack) => void;
  onRemove: (id: string) => void;
  onPatch: (id: string, patch: Partial<AnimationTrack>) => void;
  disabled?: boolean;
  onOpenGallery?: (targetId: string) => void;
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
        {onOpenGallery && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !target}
            onClick={() => target && onOpenGallery(target)}
            title="Browse animation presets"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </Button>
        )}
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
  sculpt,
  onClear,
  onOpenGallery,
}: {
  terrain?: SceneTerrain;
  disabled?: boolean;
  onPatch: (p: Partial<SceneTerrain>) => void;
  onEnable: (enabled: boolean) => void;
  onClear: () => void;
  onOpenGallery: () => void;
  sculpt?: {
    active: boolean;
    tool: "lift" | "dig" | "smooth" | "flatten";
    radius: number;
    strength: number;
    setActive: (v: boolean) => void;
    setTool: (v: "lift" | "dig" | "smooth" | "flatten") => void;
    setRadius: (v: number) => void;
    setStrength: (v: number) => void;
  };
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
    <div className="space-y-2 p-3 rounded-lg border border-border/40 bg-card/80 backdrop-blur-xl shadow-lg max-w-sm">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1">
          <Layers className="w-3 h-3" /> Terrain
        </Label>
        <Switch checked={t.enabled} onCheckedChange={onEnable} disabled={disabled} />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={onOpenGallery}
          disabled={disabled}
          title="Browse terrain gallery & save current"
        >
          <Mountain className="w-3 h-3 mr-1" /> Gallery / Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] text-destructive hover:text-destructive"
          onClick={onClear}
          disabled={disabled || !t.enabled}
          title="Remove terrain from scene"
        >
          <Trash2 className="w-3 h-3 mr-1" /> Eliminate
        </Button>
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
              <TerrainAppearanceTabs
                terrain={t}
                disabled={disabled}
                onPatch={onPatch}
              />
              <TerrainMaterialPanel
                terrain={t}
                disabled={disabled}
                onPatch={onPatch}
              />
              <div className="flex items-center justify-between">
                <Label className="text-xs">Wireframe</Label>
                <Switch
                  checked={t.wireframe}
                  onCheckedChange={(v) => onPatch({ wireframe: v })}
                  disabled={disabled}
                />
              </div>
              {t.shape === "plane" && sculpt && (
                <div className="mt-2 space-y-2 rounded-md border border-border/40 bg-background/40 p-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1">
                      <Brush className="w-3 h-3" /> Sculpt brush
                    </Label>
                    <Switch
                      checked={sculpt.active}
                      onCheckedChange={(v) => {
                        // Initialize heightmap on first activation so the
                        // plane has a subdivided grid to sculpt into.
                        if (v && !t.heightmap) {
                          const N = 64;
                          const data = new Array((N + 1) * (N + 1)).fill(0);
                          onPatch({ heightmap: { resolution: N, data } });
                        }
                        sculpt.setActive(v);
                      }}
                      disabled={disabled}
                    />
                  </div>
                  {sculpt.active && (
                    <>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Tool
                        </Label>
                        <div className="grid grid-cols-4 gap-1 mt-1">
                          {([
                            { id: "lift", icon: ArrowUp, label: "Lift" },
                            { id: "dig", icon: ArrowDown, label: "Dig" },
                            { id: "smooth", icon: Waves, label: "Smooth" },
                            { id: "flatten", icon: Minus, label: "Flat" },
                          ] as const).map((b) => {
                            const Icon = b.icon;
                            return (
                              <Button
                                key={b.id}
                                size="sm"
                                variant={sculpt.tool === b.id ? "secondary" : "ghost"}
                                className="h-8 flex flex-col gap-0.5 px-1 text-[9px]"
                                onClick={() => sculpt.setTool(b.id)}
                                disabled={disabled}
                                title={b.label}
                              >
                                <Icon className="w-3 h-3" />
                                {b.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Radius
                          </Label>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {sculpt.radius.toFixed(2)}
                          </span>
                        </div>
                        <Slider
                          value={[sculpt.radius]}
                          min={0.1}
                          max={Math.max(2, Math.max(t.size[0], t.size[2]) / 2)}
                          step={0.05}
                          onValueChange={(v) => sculpt.setRadius(v[0])}
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Strength
                          </Label>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {sculpt.strength.toFixed(2)}
                          </span>
                        </div>
                        <Slider
                          value={[sculpt.strength]}
                          min={0.01}
                          max={2}
                          step={0.01}
                          onValueChange={(v) => sculpt.setStrength(v[0])}
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Resolution
                        </Label>
                        <Select
                          value={String(t.heightmap?.resolution ?? 64)}
                          onValueChange={(v) => {
                            const N = parseInt(v, 10);
                            const data = new Array((N + 1) * (N + 1)).fill(0);
                            onPatch({ heightmap: { resolution: N, data } });
                          }}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-7 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="32" className="text-xs">32 × 32 (coarse)</SelectItem>
                            <SelectItem value="64" className="text-xs">64 × 64 (default)</SelectItem>
                            <SelectItem value="128" className="text-xs">128 × 128 (fine)</SelectItem>
                            <SelectItem value="192" className="text-xs">192 × 192 (hi-res)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground mt-1 italic">
                          Changing resolution resets the heightmap.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] w-full"
                        disabled={disabled || !t.heightmap}
                        onClick={() => {
                          const N = t.heightmap?.resolution ?? 64;
                          const data = new Array((N + 1) * (N + 1)).fill(0);
                          onPatch({ heightmap: { resolution: N, data } });
                        }}
                      >
                        Reset terrain (flat)
                      </Button>
                      <p className="text-[10px] text-muted-foreground italic">
                        Click &amp; drag on the terrain to sculpt. Orbit controls pause while you paint.
                      </p>
                    </>
                  )}
                </div>
              )}
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

/* ---------- trajectory inspector ---------- */

function TrajectoryInspector({
  obj,
  onPatch,
  disabled,
  allObjects,
}: {
  obj: TrajectoryObject;
  onPatch: (patch: Partial<TrajectoryObject>) => void;
  disabled?: boolean;
  allObjects: SceneObject[];
}) {
  const candidates = allObjects.filter(
    (o) => o.id !== obj.id && (o.kind === "character" || o.kind === "primitive" || o.kind === "model" || o.kind === "polygon"),
  );
  const setPoint = (i: number, v: Vec3) => {
    const next = obj.points.map((p, j) => (j === i ? v : p));
    onPatch({ points: next });
  };
  const addPoint = () => {
    const last = obj.points[obj.points.length - 1] ?? [0, 0.5, 0];
    const prev = obj.points[obj.points.length - 2] ?? [last[0] - 1, last[1], last[2] - 1];
    const ext: Vec3 = [last[0] + (last[0] - prev[0]), last[1], last[2] + (last[2] - prev[2])];
    onPatch({ points: [...obj.points, ext] });
  };
  const removePoint = (i: number) => {
    if (obj.points.length <= 2) return;
    onPatch({ points: obj.points.filter((_, j) => j !== i) });
  };

  // Template shape generators (centered at origin in object-local space).
  const applyTemplate = (name: string) => {
    const TAU = Math.PI * 2;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const mk = (xs: number[], ys: number[], zs: number[]): Vec3[] =>
      xs.map((x, i) => [round(x), round(ys[i]), round(zs[i])] as Vec3);
    let pts: Vec3[] = [];
    let closed = obj.closed;
    switch (name) {
      case "line": {
        pts = [[-3, 0, 0], [3, 0, 0]]; closed = false; break;
      }
      case "circle": {
        const N = 12, R = 3;
        pts = Array.from({ length: N }, (_, i) => {
          const a = (i / N) * TAU;
          return [Math.cos(a) * R, 0, Math.sin(a) * R] as Vec3;
        });
        closed = true; break;
      }
      case "square": {
        pts = [[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]]; closed = true; break;
      }
      case "triangle": {
        const R = 3;
        pts = Array.from({ length: 3 }, (_, i) => {
          const a = (i / 3) * TAU - Math.PI / 2;
          return [Math.cos(a) * R, 0, Math.sin(a) * R] as Vec3;
        });
        closed = true; break;
      }
      case "figure8": {
        const N = 16, R = 2.5;
        pts = Array.from({ length: N }, (_, i) => {
          const a = (i / N) * TAU;
          // Lemniscate of Gerono
          return [Math.sin(a) * R * 1.4, 0, Math.sin(a) * Math.cos(a) * R * 1.4] as Vec3;
        });
        closed = true; break;
      }
      case "zigzag": {
        const N = 8, dx = 1.2;
        pts = Array.from({ length: N }, (_, i) => [
          (i - (N - 1) / 2) * dx, 0, i % 2 === 0 ? -1 : 1,
        ] as Vec3);
        closed = false; break;
      }
      case "stairs": {
        const N = 8, step = 0.6;
        pts = Array.from({ length: N }, (_, i) => [i * 0.8, i * step, 0] as Vec3);
        closed = false; break;
      }
      case "spiral": {
        const N = 24, turns = 2;
        pts = Array.from({ length: N }, (_, i) => {
          const a = (i / (N - 1)) * TAU * turns;
          const r = 0.4 + (i / (N - 1)) * 3;
          return [Math.cos(a) * r, (i / (N - 1)) * 3, Math.sin(a) * r] as Vec3;
        });
        closed = false; break;
      }
      case "wave": {
        const N = 16;
        pts = Array.from({ length: N }, (_, i) => {
          const t = (i / (N - 1)) * Math.PI * 2;
          return [(i - (N - 1) / 2) * 0.6, Math.sin(t) * 1.2, 0] as Vec3;
        });
        closed = false; break;
      }
      default: return;
    }
    onPatch({ points: pts, closed, sections: [] });
  };

  const addSection = () => {
    const palette = ["#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#ec4899"];
    const sec: TrajectorySection = {
      id: newId("sec"),
      tStart: 0,
      tEnd: 0.25,
      speedMul: 2,
      altitude: 0,
      color: palette[obj.sections.length % palette.length],
    };
    onPatch({ sections: [...obj.sections, sec] });
  };
  const patchSection = (sid: string, p: Partial<TrajectorySection>) => {
    onPatch({
      sections: obj.sections.map((s) => (s.id === sid ? { ...s, ...p } : s)),
    });
  };
  const removeSection = (sid: string) =>
    onPatch({ sections: obj.sections.filter((s) => s.id !== sid) });
  const toggleFollower = (oid: string) => {
    const has = obj.followers.includes(oid);
    onPatch({
      followers: has ? obj.followers.filter((f) => f !== oid) : [...obj.followers, oid],
    });
  };
  return (
    <div className="space-y-3 border-t border-border/40 pt-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Trajectory</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Base speed (u/s)</Label>
          <Input
            type="number" step={0.1} value={obj.speed} disabled={disabled}
            onChange={(e) => onPatch({ speed: parseFloat(e.target.value) || 0 })}
            className="h-7 text-[11px]"
          />
        </div>
        <div>
          <Label className="text-[10px]">Tension {obj.tension.toFixed(2)}</Label>
          <Slider value={[obj.tension]} min={0} max={1} step={0.05} disabled={disabled}
            onValueChange={([v]) => onPatch({ tension: v })} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex items-center gap-1 text-[11px]">
          <Switch checked={obj.closed} onCheckedChange={(v) => onPatch({ closed: v })} disabled={disabled} />
          Closed
        </label>
        <label className="flex items-center gap-1 text-[11px]">
          <Switch checked={obj.loop} onCheckedChange={(v) => onPatch({ loop: v })} disabled={disabled} />
          Loop
        </label>
        <label className="flex items-center gap-1 text-[11px]">
          <Switch checked={obj.orientToPath} onCheckedChange={(v) => onPatch({ orientToPath: v })} disabled={disabled} />
          Orient
        </label>
      </div>

      <div className="rounded border border-border/40 p-2 space-y-2 bg-muted/10">
        <label className="flex items-center gap-2 text-[11px] font-medium">
          <Switch
            checked={!!obj.smartPath}
            onCheckedChange={(v) => onPatch({ smartPath: v })}
            disabled={disabled}
          />
          Smart path (terrain-aware)
        </label>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Follower collides with terrain & objects, snaps to surface,
          climbs steps and tilts with the slope. Speed adjusts uphill/downhill.
        </p>
        {obj.smartPath && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <Label className="text-[9px]">Max step (m) {(obj.maxStepHeight ?? 0.4).toFixed(2)}</Label>
              <Slider
                value={[obj.maxStepHeight ?? 0.4]} min={0.05} max={1.2} step={0.05}
                disabled={disabled}
                onValueChange={([v]) => onPatch({ maxStepHeight: v })}
              />
            </div>
            <div>
              <Label className="text-[9px]">Slope speed × {(obj.slopeSpeedFactor ?? 0.6).toFixed(2)}</Label>
              <Slider
                value={[obj.slopeSpeedFactor ?? 0.6]} min={0} max={2} step={0.05}
                disabled={disabled}
                onValueChange={([v]) => onPatch({ slopeSpeedFactor: v })}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <Label className="text-[10px]">Curve color</Label>
        <Input type="color" value={obj.color} disabled={disabled}
          onChange={(e) => onPatch({ color: e.target.value })}
          className="h-7 w-full p-1" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Points ({obj.points.length})</Label>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={disabled} onClick={addPoint}>
            <Plus className="w-3 h-3" /> Extend
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-1">
          Drag yellow handles to move (hold <kbd>Shift</kbd> for vertical). Click a green <span className="text-green-500">+</span> midpoint to insert. Double-click a handle to delete.
        </p>
        <div className="mb-2">
          <Label className="text-[10px]">Template shape</Label>
          <Select disabled={disabled} value="" onValueChange={(v) => v && applyTemplate(v)}>
            <SelectTrigger className="h-7 text-[11px] mt-1"><SelectValue placeholder="Apply a template…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="line" className="text-xs">Straight line</SelectItem>
              <SelectItem value="circle" className="text-xs">Circle (closed)</SelectItem>
              <SelectItem value="square" className="text-xs">Square (closed)</SelectItem>
              <SelectItem value="triangle" className="text-xs">Triangle (closed)</SelectItem>
              <SelectItem value="figure8" className="text-xs">Figure-8</SelectItem>
              <SelectItem value="zigzag" className="text-xs">Zigzag</SelectItem>
              <SelectItem value="stairs" className="text-xs">Stairs (rising)</SelectItem>
              <SelectItem value="spiral" className="text-xs">Spiral (rising)</SelectItem>
              <SelectItem value="wave" className="text-xs">Sine wave</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 max-h-44 overflow-y-auto">
          {obj.points.map((p, i) => (
            <div key={i} className="grid grid-cols-[14px_1fr_1fr_1fr_auto] gap-1 items-center">
              <span className="text-[9px] text-muted-foreground text-right">{i}</span>
              {[0, 1, 2].map((axis) => (
                <Input
                  key={axis}
                  type="number" step={0.1} value={p[axis]} disabled={disabled}
                  onChange={(e) => {
                    const v = [...p] as Vec3;
                    v[axis] = parseFloat(e.target.value) || 0;
                    setPoint(i, v);
                  }}
                  className="h-6 text-[10px]"
                />
              ))}
              <button
                onClick={() => removePoint(i)} disabled={disabled || obj.points.length <= 2}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                title="Remove point"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Speed / altitude sections</Label>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={disabled} onClick={addSection}>
            <Plus className="w-3 h-3" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {obj.sections.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">
              No sections — entire curve runs at base speed. Add one to accelerate or change altitude on a segment.
            </p>
          )}
          {obj.sections.map((s) => (
            <div key={s.id} className="rounded border border-border/40 p-2 space-y-1.5 bg-muted/20">
              <div className="flex items-center gap-1">
                <Input type="color" value={s.color} disabled={disabled}
                  onChange={(e) => patchSection(s.id, { color: e.target.value })}
                  className="h-6 w-8 p-0.5" />
                <span className="text-[10px] text-muted-foreground">t [{s.tStart.toFixed(2)} → {s.tEnd.toFixed(2)}]</span>
                <button onClick={() => removeSection(s.id)} disabled={disabled}
                  className="ml-auto text-muted-foreground hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <Label className="text-[9px]">Start</Label>
                  <Slider value={[s.tStart]} min={0} max={1} step={0.01} disabled={disabled}
                    onValueChange={([v]) => patchSection(s.id, { tStart: Math.min(v, s.tEnd) })} />
                </div>
                <div>
                  <Label className="text-[9px]">End</Label>
                  <Slider value={[s.tEnd]} min={0} max={1} step={0.01} disabled={disabled}
                    onValueChange={([v]) => patchSection(s.id, { tEnd: Math.max(v, s.tStart) })} />
                </div>
                <div>
                  <Label className="text-[9px]">Speed ×{s.speedMul.toFixed(2)}</Label>
                  <Slider value={[s.speedMul]} min={0} max={5} step={0.05} disabled={disabled}
                    onValueChange={([v]) => patchSection(s.id, { speedMul: v })} />
                </div>
                <div>
                  <Label className="text-[9px]">Altitude {s.altitude.toFixed(2)}</Label>
                  <Slider value={[s.altitude]} min={-5} max={20} step={0.1} disabled={disabled}
                    onValueChange={([v]) => patchSection(s.id, { altitude: v })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs">Followers ({obj.followers.length})</Label>
        <p className="text-[10px] text-muted-foreground mb-1">
          Select objects/characters that travel along this spline during Play.
        </p>
        <div className="space-y-0.5 max-h-32 overflow-y-auto border border-border/40 rounded p-1">
          {candidates.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic px-1">No eligible objects in scene.</p>
          )}
          {candidates.map((o) => {
            const checked = obj.followers.includes(o.id);
            return (
              <label key={o.id} className={`flex items-center gap-1.5 text-[11px] px-1 py-0.5 rounded cursor-pointer ${checked ? "bg-primary/15 text-primary" : "hover:bg-muted/30"}`}>
                <input type="checkbox" checked={checked} disabled={disabled}
                  onChange={() => toggleFollower(o.id)} />
                <span className="truncate">{o.name}</span>
                <span className="ml-auto text-[9px] text-muted-foreground">{o.kind}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Atlas location preview ---------- */

function osmEmbedUrl(lat: number, lng: number, span = 0.01) {
  const left = lng - span;
  const right = lng + span;
  const top = lat + span;
  const bottom = lat - span;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function LocationMapPreview({ lat, lng, className }: { lat: number; lng: number; className?: string }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className={`${className ?? ""} grid place-items-center bg-white/5 text-[11px] text-muted-foreground`}>
        Enter valid coordinates
      </div>
    );
  }
  return (
    <iframe
      key={`${lat.toFixed(4)},${lng.toFixed(4)}`}
      title="Atlas location preview"
      src={osmEmbedUrl(lat, lng)}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function LocationViewport({
  lat, lng, onClose, onOpenAtlas, onPickManually, onMove,
}: {
  lat: number;
  lng: number;
  onClose: () => void;
  onOpenAtlas: () => void;
  onPickManually: () => void;
  onMove?: (lat: number, lng: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-white/10 bg-background/85 backdrop-blur-md shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[11px] font-medium truncate">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onOpenAtlas}
            title="Open in Atlas"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onClose}
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <AtlasMiniMap lat={lat} lng={lng} onChange={onMove} className="h-52 w-full" />
      <button
        onClick={onPickManually}
        className="w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/5 border-t border-white/10 text-left transition-colors"
      >
        Re-pick coordinates…
      </button>
    </div>
  );
}

/* ---------- terrain appearance (color / texture) ---------- */

const MATERIAL_PRESETS: Record<
  NonNullable<SceneTerrain["material"]>["preset"] & string,
  { metalness: number; roughness: number; reflectivity: number; label: string }
> = {
  plastic: { metalness: 0.0, roughness: 0.45, reflectivity: 1.0, label: "Plastic" },
  metal:   { metalness: 1.0, roughness: 0.25, reflectivity: 1.6, label: "Metal" },
  wood:    { metalness: 0.0, roughness: 0.85, reflectivity: 0.6, label: "Wood" },
  stone:   { metalness: 0.05, roughness: 0.95, reflectivity: 0.5, label: "Stone" },
  glass:   { metalness: 0.0, roughness: 0.05, reflectivity: 2.5, label: "Glass" },
  rubber:  { metalness: 0.0, roughness: 1.0, reflectivity: 0.2, label: "Rubber" },
  custom:  { metalness: 0.05, roughness: 0.95, reflectivity: 1.0, label: "Custom" },
};

function TerrainAppearanceTabs({
  terrain,
  disabled,
  onPatch,
}: {
  terrain: SceneTerrain;
  disabled?: boolean;
  onPatch: (p: Partial<SceneTerrain>) => void;
}) {
  const [tab, setTab] = useState<"color" | "texture">(
    terrain.texture?.url ? "texture" : "color",
  );
  const imgRef = useRef<HTMLInputElement>(null);
  const depthRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const onUpload = async (
    file: File | undefined,
    kind: "texture" | "depthMap",
  ) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Upload an image file (PNG, JPG, WebP, EXR…)");
      return;
    }
    try {
      const url = await readFile(file);
      if (kind === "texture") {
        onPatch({
          texture: {
            url,
            name: file.name,
            repeat: terrain.texture?.repeat ?? 1,
          },
        });
      } else {
        onPatch({
          depthMap: {
            url,
            name: file.name,
            scale: terrain.depthMap?.scale ?? 0.5,
          },
        });
      }
    } catch (e) {
      toast.error(`Failed to read ${file.name}`);
    }
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "color" | "texture")}>
      <TabsList className="grid grid-cols-2 h-7 w-full">
        <TabsTrigger value="color" className="text-[11px]">Color</TabsTrigger>
        <TabsTrigger value="texture" className="text-[11px]">Texture</TabsTrigger>
      </TabsList>
      <TabsContent value="color" className="mt-2 m-0">
        <div className="flex items-center gap-2">
          <Label className="text-xs flex-1">Base color</Label>
          <Input
            type="color"
            value={rgbaToHex(terrain.color)}
            onChange={(e) =>
              onPatch({ color: hexToRgba(e.target.value, terrain.color[3]) })
            }
            disabled={disabled}
            className="h-7 w-12 p-0.5"
          />
        </div>
      </TabsContent>
      <TabsContent value="texture" className="mt-2 m-0 space-y-2">
        {/* ---- Color / albedo image ---- */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Surface image
          </Label>
          <div className="flex items-center gap-2 mt-1">
            {terrain.texture?.url ? (
              <img
                src={terrain.texture.url}
                alt={terrain.texture.name}
                className="w-10 h-10 rounded object-cover border border-border/40"
              />
            ) : (
              <div className="w-10 h-10 rounded border border-dashed border-border/40 bg-background/40" />
            )}
            <div className="flex-1 min-w-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] w-full"
                onClick={() => imgRef.current?.click()}
                disabled={disabled}
              >
                <Upload className="w-3 h-3 mr-1" />
                <span className="truncate">
                  {terrain.texture?.name ?? "Upload texture"}
                </span>
              </Button>
              {terrain.texture && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] w-full text-muted-foreground"
                  onClick={() => onPatch({ texture: undefined })}
                  disabled={disabled}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onUpload(e.target.files?.[0], "texture");
              e.target.value = "";
            }}
          />
        </div>

        {/* ---- Depth / displacement map ---- */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Depth map (optional)
          </Label>
          <div className="flex items-center gap-2 mt-1">
            {terrain.depthMap?.url ? (
              <img
                src={terrain.depthMap.url}
                alt={terrain.depthMap.name}
                className="w-10 h-10 rounded object-cover border border-border/40 grayscale"
              />
            ) : (
              <div className="w-10 h-10 rounded border border-dashed border-border/40 bg-background/40" />
            )}
            <div className="flex-1 min-w-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] w-full"
                onClick={() => depthRef.current?.click()}
                disabled={disabled}
              >
                <Upload className="w-3 h-3 mr-1" />
                <span className="truncate">
                  {terrain.depthMap?.name ?? "Upload depth / height map"}
                </span>
              </Button>
              {terrain.depthMap && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] w-full text-muted-foreground"
                  onClick={() => onPatch({ depthMap: undefined })}
                  disabled={disabled}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          <input
            ref={depthRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onUpload(e.target.files?.[0], "depthMap");
              e.target.value = "";
            }}
          />
          {terrain.shape !== "plane" && terrain.depthMap && (
            <p className="text-[10px] text-amber-400/80 italic mt-1">
              Depth only displaces the Plane shape (needs subdivisions).
            </p>
          )}
        </div>

        {/* ---- Tiling ---- */}
        {terrain.texture && (
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tile repeat
              </Label>
              <span className="text-[10px] font-mono text-muted-foreground">
                {(terrain.texture.repeat ?? 1).toFixed(1)}×
              </span>
            </div>
            <Slider
              value={[terrain.texture.repeat ?? 1]}
              min={1}
              max={32}
              step={0.5}
              onValueChange={(v) =>
                onPatch({
                  texture: { ...terrain.texture!, repeat: v[0] },
                })
              }
              disabled={disabled}
            />
          </div>
        )}

        {/* ---- Displacement strength ---- */}
        {terrain.depthMap && terrain.shape === "plane" && (
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Depth strength
              </Label>
              <span className="text-[10px] font-mono text-muted-foreground">
                {(terrain.depthMap.scale ?? 0.5).toFixed(2)}
              </span>
            </div>
            <Slider
              value={[terrain.depthMap.scale ?? 0.5]}
              min={0}
              max={5}
              step={0.05}
              onValueChange={(v) =>
                onPatch({
                  depthMap: { ...terrain.depthMap!, scale: v[0] },
                })
              }
              disabled={disabled}
            />
            <p className="text-[10px] text-muted-foreground italic mt-1">
              Pick a high heightmap resolution in the sculpt panel for smoother results.
            </p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

/* ---------- terrain PBR material panel ---------- */

function TerrainMaterialPanel({
  terrain,
  disabled,
  onPatch,
}: {
  terrain: SceneTerrain;
  disabled?: boolean;
  onPatch: (p: Partial<SceneTerrain>) => void;
}) {
  const m = terrain.material ?? {
    metalness: 0.05,
    roughness: 0.95,
    reflectivity: 1,
    preset: "custom" as const,
  };
  const patchMat = (p: Partial<NonNullable<SceneTerrain["material"]>>) =>
    onPatch({ material: { ...m, ...p, preset: "custom" } });
  return (
    <div className="space-y-2 rounded-md border border-border/40 bg-background/40 p-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Material preset
      </Label>
      <Select
        value={m.preset ?? "custom"}
        onValueChange={(v) => {
          const key = v as keyof typeof MATERIAL_PRESETS;
          const p = MATERIAL_PRESETS[key];
          onPatch({
            material: {
              metalness: p.metalness,
              roughness: p.roughness,
              reflectivity: p.reflectivity,
              preset: key,
            },
          });
        }}
        disabled={disabled}
      >
        <SelectTrigger className="h-7 text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(MATERIAL_PRESETS) as Array<keyof typeof MATERIAL_PRESETS>).map((key) => (
            <SelectItem key={key} value={key} className="text-xs">
              {MATERIAL_PRESETS[key].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {([
        { key: "metalness", label: "Metalness", min: 0, max: 1, step: 0.01 },
        { key: "roughness", label: "Roughness", min: 0, max: 1, step: 0.01 },
        { key: "reflectivity", label: "Reflection", min: 0, max: 4, step: 0.05 },
      ] as const).map((row) => {
        const val = (m as any)[row.key] as number;
        return (
          <div key={row.key}>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {row.label}
              </Label>
              <span className="text-[10px] font-mono text-muted-foreground">
                {val.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[val]}
              min={row.min}
              max={row.max}
              step={row.step}
              onValueChange={(v) => patchMat({ [row.key]: v[0] } as any)}
              disabled={disabled}
            />
          </div>
        );
      })}

      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Shininess
        </Label>
        <Slider
          value={[1 - m.roughness]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) => patchMat({ roughness: 1 - v[0] })}
          disabled={disabled}
        />
        <p className="text-[10px] text-muted-foreground italic mt-1">
          Reflection picks up the scene's HDRI / environment lighting.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
 * HDRIPanel
 * Lets the user import .hdr/.exr files (HDRI packs) as image-based
 * lighting + background for the level. Multiple HDRIs can be uploaded
 * and switched between; intensity, Y-rotation and "use as background"
 * are tweakable per scene.
 * ========================================================== */
function HDRIPanel({
  hdri,
  disabled,
  onChange,
}: {
  hdri?: HDRIEnvironmentCfg;
  disabled?: boolean;
  onChange: (updater: (cur: HDRIEnvironmentCfg) => HDRIEnvironmentCfg | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cfg: HDRIEnvironmentCfg = hdri ?? {
    maps: [],
    intensity: 1,
    rotation: 0,
    asBackground: true,
  };

  const readAsDataURL = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: HDRIMap[] = [];
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      const ext: "hdr" | "exr" = lower.endsWith(".exr") ? "exr" : "hdr";
      if (!lower.endsWith(".hdr") && !lower.endsWith(".exr")) {
        toast.error(`${file.name}: only .hdr and .exr are supported`);
        continue;
      }
      try {
        const url = await readAsDataURL(file);
        added.push({
          id: newId("hdri"),
          name: file.name.replace(/\.(hdr|exr)$/i, ""),
          url,
          ext,
        });
      } catch (e) {
        toast.error(`Failed to read ${file.name}`);
      }
    }
    if (added.length === 0) return;
    onChange((cur) => ({
      ...cur,
      maps: [...cur.maps, ...added],
      activeId: cur.activeId ?? added[0].id,
    }));
    toast.success(`Imported ${added.length} HDRI${added.length > 1 ? "s" : ""}`);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeMap = (id: string) => {
    onChange((cur) => {
      const maps = cur.maps.filter((m) => m.id !== id);
      if (maps.length === 0) return null;
      return {
        ...cur,
        maps,
        activeId: cur.activeId === id ? maps[0].id : cur.activeId,
      };
    });
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1">
          <SunMedium className="w-3 h-3" /> HDRI environment
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-3 h-3 mr-1" /> Import .hdr / .exr
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".hdr,.exr,image/vnd.radiance,image/x-exr"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {cfg.maps.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          Drop a HDRI pack (.hdr / .exr) here to light the scene with image-based lighting.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Active HDRI</Label>
            <Select
              value={cfg.activeId ?? ""}
              onValueChange={(v) =>
                onChange((cur) => ({ ...cur, activeId: v || undefined }))
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select HDRI" />
              </SelectTrigger>
              <SelectContent>
                {cfg.maps.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.name} <span className="opacity-50">.{m.ext}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Intensity {cfg.intensity.toFixed(2)}</Label>
            <Slider
              value={[cfg.intensity]}
              min={0}
              max={4}
              step={0.05}
              onValueChange={([v]) => onChange((cur) => ({ ...cur, intensity: v }))}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">
              Rotation {((cfg.rotation * 180) / Math.PI).toFixed(0)}°
            </Label>
            <Slider
              value={[cfg.rotation]}
              min={-Math.PI}
              max={Math.PI}
              step={Math.PI / 180}
              onValueChange={([v]) => onChange((cur) => ({ ...cur, rotation: v }))}
              disabled={disabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-[10px]">Use as background</Label>
            <Switch
              checked={cfg.asBackground}
              onCheckedChange={(v) => onChange((cur) => ({ ...cur, asBackground: v }))}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1 pt-1">
            <Label className="text-[10px] text-muted-foreground">Pack ({cfg.maps.length})</Label>
            <div className="max-h-32 overflow-auto space-y-1 pr-1">
              {cfg.maps.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] ${
                    cfg.activeId === m.id ? "bg-primary/10" : "hover:bg-muted/40"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left truncate"
                    onClick={() => onChange((cur) => ({ ...cur, activeId: m.id }))}
                    disabled={disabled}
                    title={m.name}
                  >
                    {m.name}
                  </button>
                  <span className="opacity-50 text-[10px]">.{m.ext}</span>
                  <button
                    type="button"
                    className="opacity-60 hover:opacity-100"
                    onClick={() => removeMap(m.id)}
                    disabled={disabled}
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ==========================================================
 * GlobalIlluminationPanel
 * Toggles hemisphere light + contact shadows as a cheap real-time
 * global-illumination approximation for the level scene.
 * ========================================================== */
function GlobalIlluminationPanel({
  gi,
  disabled,
  onChange,
}: {
  gi?: LevelScene["environment"]["gi"];
  disabled?: boolean;
  onChange: (updater: (cur: NonNullable<LevelScene["environment"]["gi"]>) => NonNullable<LevelScene["environment"]["gi"]>) => void;
}) {
  const cfg = gi ?? {
    enabled: true,
    skyColor: "#87ceeb",
    groundColor: "#3d5c3d",
    hemisphereIntensity: 0.6,
    contactShadows: true,
    contactOpacity: 0.4,
    contactBlur: 2.5,
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1">
          <Sun className="w-3 h-3" /> Global illumination
        </Label>
        <Switch
          checked={cfg.enabled}
          onCheckedChange={(v) => onChange((cur) => ({ ...cur, enabled: v }))}
          disabled={disabled}
        />
      </div>

      {cfg.enabled && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-[10px] text-muted-foreground">Sky color</Label>
              <Input
                type="color"
                value={cfg.skyColor}
                onChange={(e) => onChange((cur) => ({ ...cur, skyColor: e.target.value }))}
                disabled={disabled}
                className="h-7 w-full p-1"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-[10px] text-muted-foreground">Ground color</Label>
              <Input
                type="color"
                value={cfg.groundColor}
                onChange={(e) => onChange((cur) => ({ ...cur, groundColor: e.target.value }))}
                disabled={disabled}
                className="h-7 w-full p-1"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Hemisphere intensity {cfg.hemisphereIntensity.toFixed(2)}</Label>
            <Slider
              value={[cfg.hemisphereIntensity]}
              min={0}
              max={2}
              step={0.05}
              onValueChange={([v]) => onChange((cur) => ({ ...cur, hemisphereIntensity: v }))}
              disabled={disabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-[10px]">Contact shadows (AO)</Label>
            <Switch
              checked={cfg.contactShadows}
              onCheckedChange={(v) => onChange((cur) => ({ ...cur, contactShadows: v }))}
              disabled={disabled}
            />
          </div>

          {cfg.contactShadows && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px]">Shadow opacity {cfg.contactOpacity.toFixed(2)}</Label>
                <Slider
                  value={[cfg.contactOpacity]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => onChange((cur) => ({ ...cur, contactOpacity: v }))}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Shadow blur {cfg.contactBlur.toFixed(1)}</Label>
                <Slider
                  value={[cfg.contactBlur]}
                  min={0}
                  max={10}
                  step={0.5}
                  onValueChange={([v]) => onChange((cur) => ({ ...cur, contactBlur: v }))}
                  disabled={disabled}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
