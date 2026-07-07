/**
 * AtlasBuildingsOverlay
 * ---------------------
 * Adds interactive OSM Building support on top of Cesium OSM Buildings tileset:
 *   - LEFT click on a building → pick it, open BuildingCard, enrich via Overpass + Nominatim
 *   - LEFT press-and-hold (≥ 450 ms) on a building → enter multi-select mode
 *     Subsequent clicks toggle buildings in/out of the selection.
 *     Escape or clicking empty sky exits multi-select.
 *   - Applies user color to Cesium3DTileFeature via `feature.color`
 *     (both live picks and previously-saved records on tileset re-load).
 *   - When a record has a replacement GLB, hides the OSM feature and adds
 *     a Cesium Entity model at the building's coordinates.
 *
 * Only mounts when viewMode === "osm" (the only mode where the OSM Buildings
 * tileset is streamed and features are addressable).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cartesian3,
  Cartographic,
  Color as CesiumColor,
  Cesium3DTileFeature,
  Cesium3DTileset,
  HeightReference,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer,
} from "cesium";
import BuildingCard from "./BuildingCard";
import { useBuildingRecords } from "@/hooks/useBuildingRecords";
import { estimatePopulation, type PickedBuilding } from "@/types/BuildingCardRecord";
import { toast } from "sonner";
import { MousePointerSquareDashed } from "lucide-react";

const LONG_PRESS_MS = 450;
const PRESS_MOVE_TOL_PX = 6;

interface Props {
  viewerRef: React.RefObject<Viewer | null>;
  active: boolean;
}

export default function AtlasBuildingsOverlay({ viewerRef, active }: Props) {
  const records = useBuildingRecords();
  const [picked, setPicked] = useState<PickedBuilding | null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const selectionRef = useRef(selection);
  const multiRef = useRef(multiSelect);
  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => { multiRef.current = multiSelect; }, [multiSelect]);

  // Map: osm_id → applied CesiumColor (so we can restore or reapply on tile reload)
  const appliedColors = useRef<Map<string, string | null>>(new Map());
  // Map: osm_id → Cesium.Entity id for a replacement GLB model
  const replacementEntities = useRef<Map<string, string>>(new Map());

  const currentRecord = picked ? records.records[picked.osm_id] ?? null : null;

  const getOsmTileset = useCallback((): Cesium3DTileset | null => {
    const viewer = viewerRef.current;
    if (!viewer) return null;
    return ((viewer as any)._osmTileset as Cesium3DTileset | undefined) ?? null;
  }, [viewerRef]);

  const featureOsmId = (feature: Cesium3DTileFeature): string | null => {
    try {
      const id =
        feature.getProperty("elementId") ??
        feature.getProperty("id") ??
        feature.getProperty("osm_id");
      if (id == null) return null;
      return `way/${id}`;
    } catch {
      return null;
    }
  };

  const featureCoords = useCallback(
    (feature: Cesium3DTileFeature, viewer: Viewer, screen?: { x: number; y: number }) => {
      // Prefer the ray-hit position (matches the click location on the mesh).
      if (screen) {
        const world = viewer.scene.pickPosition(screen as any);
        if (world) {
          const c = Cartographic.fromCartesian(world);
          return {
            lat: CesiumMath.toDegrees(c.latitude),
            lng: CesiumMath.toDegrees(c.longitude),
          };
        }
      }
      // Fall back to feature centroid via bounding sphere
      try {
        const sphere = (feature as any).content?._boundingVolume?.boundingSphere;
        if (sphere) {
          const c = Cartographic.fromCartesian(sphere.center);
          return {
            lat: CesiumMath.toDegrees(c.latitude),
            lng: CesiumMath.toDegrees(c.longitude),
          };
        }
      } catch {}
      return { lat: 0, lng: 0 };
    },
    [],
  );

  /** Re-apply persisted colors + replacement models whenever OSM tileset finishes streaming a batch. */
  useEffect(() => {
    if (!active) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    const tileset = getOsmTileset();
    if (!tileset) return;
    const applyToTile = () => {
      // Walk all currently-visible content to re-apply colors + hide replaced buildings.
      try {
        (tileset as any)._selectedTiles?.forEach((tile: any) => {
          const content = tile.content;
          const count = content?.featuresLength ?? 0;
          for (let i = 0; i < count; i++) {
            const feature: Cesium3DTileFeature = content.getFeature(i);
            const osmId = featureOsmId(feature);
            if (!osmId) continue;
            const hex = appliedColors.current.get(osmId);
            if (hex) feature.color = CesiumColor.fromCssColorString(hex);
            if (replacementEntities.current.has(osmId)) feature.show = false;
          }
        });
      } catch (e) {
        // ignore
      }
    };
    const remove = tileset.tileLoad.addEventListener(applyToTile);
    return () => {
      try { remove?.(); } catch {}
    };
  }, [active, viewerRef, getOsmTileset]);

  /** On records load, reconcile: apply colors + spawn replacement entities. */
  useEffect(() => {
    if (!active) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    for (const rec of Object.values(records.records)) {
      if (rec.color) appliedColors.current.set(rec.osm_id, rec.color);
      if (rec.replacement_glb_url && !replacementEntities.current.has(rec.osm_id)) {
        spawnReplacementEntity(viewer, rec.osm_id, rec.lat ?? 0, rec.lng ?? 0, rec.replacement_glb_url);
      }
    }
    // Force a repaint over the current tiles so colors take effect immediately
    try {
      const tileset = getOsmTileset();
      (tileset as any)?._selectedTiles?.forEach((tile: any) => {
        const count = tile.content?.featuresLength ?? 0;
        for (let i = 0; i < count; i++) {
          const feature: Cesium3DTileFeature = tile.content.getFeature(i);
          const osmId = featureOsmId(feature);
          if (!osmId) continue;
          const hex = appliedColors.current.get(osmId);
          if (hex) feature.color = CesiumColor.fromCssColorString(hex);
          if (replacementEntities.current.has(osmId)) feature.show = false;
        }
      });
      viewer.scene.requestRender();
    } catch {}
  }, [active, records.records, viewerRef, getOsmTileset]);

  const spawnReplacementEntity = useCallback(
    (viewer: Viewer, osmId: string, lat: number, lng: number, url: string) => {
      if (replacementEntities.current.has(osmId)) return;
      const entityId = `building-replacement:${osmId}`;
      viewer.entities.add({
        id: entityId,
        position: Cartesian3.fromDegrees(lng, lat, 0),
        model: {
          uri: url,
          minimumPixelSize: 32,
          maximumScale: 400,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        } as any,
      });
      replacementEntities.current.set(osmId, entityId);
      viewer.scene.requestRender();
    },
    [],
  );

  const removeReplacementEntity = useCallback((viewer: Viewer, osmId: string) => {
    const entityId = replacementEntities.current.get(osmId);
    if (!entityId) return;
    try {
      const entity = viewer.entities.getById(entityId);
      if (entity) viewer.entities.remove(entity);
    } catch {}
    replacementEntities.current.delete(osmId);
    viewer.scene.requestRender();
  }, []);

  /** Enrich a picked building with Overpass + Nominatim in the background. */
  const enrichPicked = useCallback(async (base: PickedBuilding) => {
    // Nominatim reverse geocode for address
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${base.lat}&lon=${base.lng}&zoom=18&addressdetails=1`,
        { headers: { "Accept-Language": "en" } },
      );
      if (r.ok) {
        const j = await r.json();
        base.address = j.display_name ?? base.address ?? null;
        base.name = base.name ?? j.name ?? null;
      }
    } catch {}
    // Overpass for footprint + levels + name
    const wayId = base.osm_id.replace(/^way\//, "");
    try {
      const q = `[out:json][timeout:15];way(${wayId});out tags geom;`;
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: q,
      });
      if (r.ok) {
        const j = await r.json();
        const el = j.elements?.[0];
        if (el) {
          const t = el.tags ?? {};
          base.name = base.name ?? t.name ?? null;
          base.building_kind = base.building_kind ?? t.building ?? null;
          const lvl = parseInt(t["building:levels"] ?? "", 10);
          if (!Number.isNaN(lvl)) base.levels = lvl;
          // Compute polygon area via geodesic approximation (shoelace on equirectangular)
          if (Array.isArray(el.geometry) && el.geometry.length >= 3) {
            base.footprint_m2 = polygonAreaM2(el.geometry);
          }
          base.est_population = estimatePopulation({
            levels: base.levels,
            footprint_m2: base.footprint_m2,
            building_kind: base.building_kind,
          });
          base.raw = { ...(base.raw ?? {}), tags: t };
        }
      }
    } catch {}
    return base;
  }, []);

  /** Handle a raw building pick from Cesium. */
  const handlePick = useCallback(
    async (feature: Cesium3DTileFeature, screen: { x: number; y: number }) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const osmId = featureOsmId(feature);
      if (!osmId) {
        toast.error("This OSM feature has no id");
        return;
      }
      const { lat, lng } = featureCoords(feature, viewer, screen);
      const base: PickedBuilding = {
        osm_id: osmId,
        lat,
        lng,
        name: safeProp(feature, "name") ?? null,
        building_kind: safeProp(feature, "building") ?? null,
        levels: numProp(feature, "building:levels"),
        raw: {},
      };

      if (multiRef.current) {
        // toggle in/out of the selection
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(osmId)) {
            next.delete(osmId);
          } else {
            next.add(osmId);
          }
          return next;
        });
      }
      // Always open/refresh the card on the just-picked building
      setPicked(base);
      // Ensure record exists so subsequent edits are persisted immediately
      await records.ensureRecord(base);
      const enriched = await enrichPicked({ ...base });
      setPicked((cur) => (cur?.osm_id === osmId ? enriched : cur));
      await records.ensureRecord(enriched);
    },
    [viewerRef, featureCoords, records, enrichPicked],
  );

  /** LEFT_DOWN → start long-press timer; LEFT_CLICK → normal pick. */
  useEffect(() => {
    if (!active) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    let downAt = 0;
    let downPos: { x: number; y: number } | null = null;
    let longTimer: number | null = null;

    const clearTimer = () => {
      if (longTimer != null) { window.clearTimeout(longTimer); longTimer = null; }
    };

    handler.setInputAction((e: any) => {
      downAt = performance.now();
      downPos = { x: e.position.x, y: e.position.y };
      clearTimer();
      longTimer = window.setTimeout(() => {
        // Only enter multi-select if the finger/mouse hasn't moved much
        if (!downPos) return;
        setMultiSelect(true);
        toast("Multi-select ON — click buildings to add. Escape to exit.", { duration: 2500 });
      }, LONG_PRESS_MS);
    }, ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction(() => {
      clearTimer();
    }, ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction((e: any) => {
      if (!downPos) return;
      const dx = e.endPosition.x - downPos.x;
      const dy = e.endPosition.y - downPos.y;
      if (Math.hypot(dx, dy) > PRESS_MOVE_TOL_PX) clearTimer();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (picked instanceof Cesium3DTileFeature) {
        const ts = getOsmTileset();
        if (ts && (picked as any).tileset === ts) {
          handlePick(picked, { x: click.position.x, y: click.position.y });
          return;
        }
      }
      // Clicking empty sky exits multi-select
      if (!picked && multiRef.current) {
        setMultiSelect(false);
        toast("Multi-select OFF");
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (multiRef.current) { setMultiSelect(false); setSelection(new Set()); }
        setPicked(null);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      clearTimer();
      handler.destroy();
      window.removeEventListener("keydown", onKey);
    };
  }, [active, viewerRef, getOsmTileset, handlePick]);

  // ── Callbacks passed to BuildingCard ────────────────────────────────
  const applyColorImmediate = (osmId: string, hex: string | null) => {
    const viewer = viewerRef.current;
    const ts = getOsmTileset();
    if (!viewer || !ts) return;
    appliedColors.current.set(osmId, hex);
    // Walk currently-selected tiles and repaint the matching feature
    try {
      (ts as any)._selectedTiles?.forEach((tile: any) => {
        const count = tile.content?.featuresLength ?? 0;
        for (let i = 0; i < count; i++) {
          const feature: Cesium3DTileFeature = tile.content.getFeature(i);
          if (featureOsmId(feature) === osmId) {
            feature.color = hex ? CesiumColor.fromCssColorString(hex) : CesiumColor.WHITE;
          }
        }
      });
    } catch {}
    viewer.scene.requestRender();
  };

  const onColor = async (osmId: string, hex: string | null) => {
    applyColorImmediate(osmId, hex);
    await records.patchRecord(
      osmId,
      { color: hex },
      { kind: "color", message: hex ? `Color set to ${hex}` : "Color cleared", payload: { color: hex } },
    );
  };

  const onApplyColorToSelection = async (hex: string | null) => {
    for (const osmId of selectionRef.current) {
      applyColorImmediate(osmId, hex);
      // Ensure a record exists per selected building before patching
      if (!records.records[osmId]) {
        await records.ensureRecord({ osm_id: osmId, lat: 0, lng: 0 });
      }
      await records.patchRecord(
        osmId,
        { color: hex },
        { kind: "color", message: hex ? `Bulk color ${hex}` : "Bulk color cleared" },
      );
    }
  };

  const onTag = async (osmId: string, tag: string) => {
    await records.patchRecord(osmId, { tag }, { kind: "tag", message: `Tag set to “${tag}”` });
  };
  const onNotes = async (osmId: string, notes: string) => {
    await records.patchRecord(osmId, { notes }, { kind: "note", message: notes.slice(0, 140) });
  };
  const onTogglePublish = async (osmId: string, isPublic: boolean) => {
    await records.patchRecord(
      osmId,
      { is_public: isPublic },
      { kind: "publish", message: isPublic ? "Published" : "Made private" },
    );
  };
  const onUploadModel = async (osmId: string, file: File) => {
    const row = await records.uploadReplacementModel(osmId, file);
    if (!row || !row.replacement_glb_url) return;
    const viewer = viewerRef.current;
    if (viewer) {
      spawnReplacementEntity(viewer, osmId, row.lat ?? 0, row.lng ?? 0, row.replacement_glb_url);
      // hide underlying OSM feature
      const ts = getOsmTileset();
      (ts as any)?._selectedTiles?.forEach((tile: any) => {
        const count = tile.content?.featuresLength ?? 0;
        for (let i = 0; i < count; i++) {
          const feature: Cesium3DTileFeature = tile.content.getFeature(i);
          if (featureOsmId(feature) === osmId) feature.show = false;
        }
      });
      viewer.scene.requestRender();
    }
  };
  const onClearModel = async (osmId: string) => {
    await records.clearReplacementModel(osmId);
    const viewer = viewerRef.current;
    if (viewer) {
      removeReplacementEntity(viewer, osmId);
      // Un-hide the OSM feature on next tile pass
      const ts = getOsmTileset();
      (ts as any)?._selectedTiles?.forEach((tile: any) => {
        const count = tile.content?.featuresLength ?? 0;
        for (let i = 0; i < count; i++) {
          const feature: Cesium3DTileFeature = tile.content.getFeature(i);
          if (featureOsmId(feature) === osmId) feature.show = true;
        }
      });
      viewer.scene.requestRender();
    }
  };

  // Small multi-select status pill
  const statusPill = useMemo(() => {
    if (!active || !multiSelect) return null;
    return (
      <div className="pointer-events-auto fixed left-1/2 top-4 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full bg-cyan-500/20 backdrop-blur-xl border border-cyan-400/40 px-3 py-1.5 text-xs text-cyan-100">
        <MousePointerSquareDashed className="w-3.5 h-3.5" />
        Multi-select · {selection.size} building{selection.size === 1 ? "" : "s"} · Esc to exit
      </div>
    );
  }, [active, multiSelect, selection.size]);

  if (!active) return null;
  return (
    <>
      {statusPill}
      {picked && (
        <BuildingCard
          picked={picked}
          record={currentRecord}
          multiSelectCount={multiSelect ? selection.size : 1}
          onClose={() => setPicked(null)}
          onColor={onColor}
          onTag={onTag}
          onNotes={onNotes}
          onTogglePublish={onTogglePublish}
          onUploadModel={onUploadModel}
          onClearModel={onClearModel}
          onApplyColorToSelection={onApplyColorToSelection}
          loadLedger={records.listLedger}
        />
      )}
    </>
  );
}

function safeProp(f: Cesium3DTileFeature, key: string): string | null {
  try {
    const v = f.getProperty(key);
    return v == null ? null : String(v);
  } catch {
    return null;
  }
}
function numProp(f: Cesium3DTileFeature, key: string): number | null {
  const s = safeProp(f, key);
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** Approx geodesic polygon area (m²) from Overpass geometry using equirectangular projection. */
function polygonAreaM2(geom: Array<{ lat: number; lon: number }>): number {
  if (geom.length < 3) return 0;
  const R = 6378137;
  const rad = (d: number) => (d * Math.PI) / 180;
  const lat0 = rad(geom[0].lat);
  const cosLat0 = Math.cos(lat0);
  const pts = geom.map((g) => ({
    x: R * rad(g.lon) * cosLat0,
    y: R * rad(g.lat),
  }));
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(area / 2);
}