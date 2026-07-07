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
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color as CesiumColor,
  Cesium3DTileFeature,
  Cesium3DTileset,
  HeightReference,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SceneTransforms,
  BoundingSphere,
  HeadingPitchRange,
  HeadingPitchRoll,
  Transforms,
  ConstantProperty,
  ConstantPositionProperty,
  type Viewer,
} from "cesium";
import BuildingCard from "./BuildingCard";
import ModelTransformWidget, { type TransformData } from "@/components/ModelTransformWidget";
import { useBuildingRecords } from "@/hooks/useBuildingRecords";
import { useSelectionGroups } from "@/hooks/useSelectionGroups";
import { estimatePopulation, type PickedBuilding } from "@/types/BuildingCardRecord";
import { estimateBuildingResidents } from "@/lib/census";
import { toast } from "sonner";
import { MousePointerSquareDashed, LassoSelect, Check, Plus, X as XIcon } from "lucide-react";
import MarqueeSelectionLayer, { type MarqueeRect } from "./MarqueeSelectionLayer";
import SelectionGroupsPanel from "./SelectionGroupsPanel";

const LONG_PRESS_MS = 450;
const PRESS_MOVE_TOL_PX = 6;

const PENDING_HEX = "#22c55e"; // Tailwind green-500 — pending selection preview

interface Props {
  viewerRef: React.RefObject<Viewer | null>;
  active: boolean;
}

export default function AtlasBuildingsOverlay({ viewerRef, active }: Props) {
  const records = useBuildingRecords();
  const groups = useSelectionGroups();
  const [picked, setPicked] = useState<PickedBuilding | null>(null);
  const [marqueeActive, setMarqueeActive] = useState(false);
  const [editingOsmId, setEditingOsmId] = useState<string | null>(null);
  const marqueeActiveRef = useRef(marqueeActive);
  useEffect(() => { marqueeActiveRef.current = marqueeActive; }, [marqueeActive]);
  // Panel visibility: shown by default so the user always sees the tool.
  const [panelOpen, setPanelOpen] = useState(true);

  // Pending (uncommitted) selection: buildings the user just lassoed but has
  // NOT yet saved into a group. These are painted green until the user hits
  // ✓ Save or ✕ Clear.
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  // Original color per osm_id, so we can restore on Clear or after save.
  const pendingSnapshot = useRef<Map<string, string | null>>(new Map());
  // Latest clearPending function (avoids use-before-decl in the ESC handler).
  const clearPendingRef = useRef<() => void>(() => {});

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

  /** Compute a feature's world centroid via its tile bounding sphere. */
  const featureCentroid = (feature: Cesium3DTileFeature): Cartesian3 | null => {
    try {
      const sphere = (feature as any)._content?.tile?.boundingSphere?.center
        ?? (feature as any).content?._boundingVolume?.boundingSphere?.center;
      return sphere ? Cartesian3.clone(sphere) : null;
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

  /** Fly the camera to a group by fitting its member centroids. */
  const flyToGroupIds = useCallback(
    (ids: string[]) => {
      const viewer = viewerRef.current;
      if (!viewer || ids.length === 0) return;
      const positions: Cartesian3[] = [];
      for (const osmId of ids) {
        const rec = records.records[osmId];
        if (rec?.lat != null && rec?.lng != null) {
          positions.push(Cartesian3.fromDegrees(rec.lng, rec.lat, 0));
        }
      }
      if (positions.length === 0) return;
      const sphere = BoundingSphere.fromPoints(positions);
      viewer.camera.flyToBoundingSphere(sphere, {
        duration: 1.2,
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), Math.max(sphere.radius * 3, 400)),
      });
    },
    [viewerRef, records.records],
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
      const entity = viewer.entities.add({
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
      // Apply saved transform (if any)
      const rec = records.records[osmId];
      const t = (rec?.raw as any)?.transform as TransformData | undefined;
      if (t) applyEntityTransform(viewer, entityId, t);
      viewer.scene.requestRender();
    },
    [records.records],
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
          base.raw = { ...(base.raw ?? {}), tags: t };
        }
      }
    } catch {}
    // Real population: US Census 2020 block data (falls back to heuristic).
    try {
      const est = await estimateBuildingResidents({
        lat: base.lat,
        lng: base.lng,
        levels: base.levels,
        footprint_m2: base.footprint_m2,
        building_kind: base.building_kind,
      });
      base.est_population = est.residents;
      base.population_source = est.source;
      base.population_note = est.note ?? null;
      base.raw = {
        ...(base.raw ?? {}),
        population: { residents: est.residents, units: est.units, source: est.source, note: est.note, block: est.block },
      };
    } catch {
      base.est_population = estimatePopulation({
        levels: base.levels,
        footprint_m2: base.footprint_m2,
        building_kind: base.building_kind,
      });
      base.population_source = "heuristic";
    }
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

  /** LEFT_CLICK → normal pick, unless the marquee tool owns the pointer. */
  useEffect(() => {
    if (!active) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click: any) => {
      if (marqueeActiveRef.current) return; // marquee owns the drag
      const picked = viewer.scene.pick(click.position);
      if (picked instanceof Cesium3DTileFeature) {
        const ts = getOsmTileset();
        if (ts && (picked as any).tileset === ts) {
          // Shift-click toggles membership in the ACTIVE group instead of
          // opening the card, so single-shot selection still works.
          const shift = (window.event as any)?.shiftKey;
          const osmId = featureOsmId(picked);
          if (shift && osmId) {
            groups.toggleInActiveGroup([osmId]);
            return;
          }
          handlePick(picked, { x: click.position.x, y: click.position.y });
          return;
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (marqueeActiveRef.current) setMarqueeActive(false);
        // Clear any pending green preview.
        clearPendingRef.current();
        setPicked(null);
      }
      // "m" toggles the marquee tool (Finder-style shortcut).
      if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey && !e.altKey &&
          !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setMarqueeActive((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      handler.destroy();
      window.removeEventListener("keydown", onKey);
    };
  }, [active, viewerRef, getOsmTileset, handlePick, groups]);

  /** Convert a screen-space rectangle into the OSM ids inside it and add
   *  them to the PENDING selection (green preview). User then hits ✓ Save
   *  in the confirm bar to commit them to a group. */
  const handleMarquee = useCallback(
    async (rect: MarqueeRect) => {
      const viewer = viewerRef.current;
      const tileset = getOsmTileset();
      if (!viewer || !tileset) return;
      const minX = Math.min(rect.x1, rect.x2);
      const maxX = Math.max(rect.x1, rect.x2);
      const minY = Math.min(rect.y1, rect.y2);
      const maxY = Math.max(rect.y1, rect.y2);
      // Convert page coords → canvas coords (Cesium wants canvas-local).
      const canvasRect = viewer.scene.canvas.getBoundingClientRect();
      const cMinX = minX - canvasRect.left;
      const cMaxX = maxX - canvasRect.left;
      const cMinY = minY - canvasRect.top;
      const cMaxY = maxY - canvasRect.top;

      const hits = new Set<string>();
      const scratch = new Cartesian2();
      const t0 = performance.now();
      // 1) Centroid pass — walks every currently loaded tile so buildings
      //    whose centroid falls in the rectangle are captured. Extremely
      //    fast: pure math, zero GPU picks.
      try {
        const walk = (tile: any) => {
          if (!tile) return;
          const content = tile.content;
          const count = content?.featuresLength ?? 0;
          for (let i = 0; i < count; i++) {
            const feature: Cesium3DTileFeature = content.getFeature(i);
            const osmId = featureOsmId(feature);
            if (!osmId) continue;
            const centroid = featureCentroid(feature);
            if (!centroid) continue;
            const screen = SceneTransforms.worldToWindowCoordinates(
              viewer.scene,
              centroid,
              scratch,
            ) as Cartesian2 | undefined;
            if (!screen) continue;
            if (
              screen.x >= cMinX && screen.x <= cMaxX &&
              screen.y >= cMinY && screen.y <= cMaxY
            ) {
              hits.add(osmId);
            }
          }
          const children = tile.children ?? [];
          for (const c of children) walk(c);
        };
        walk((tileset as any).root);
        (tileset as any)._selectedTiles?.forEach(walk);
      } catch (e) {
        console.warn("[AtlasBuildingsOverlay] marquee walk failed", e);
      }

      // 2) Light single-pick safety net — catches tall/off-center buildings
      //    whose centroid falls outside the rectangle but whose visible
      //    geometry crosses it. Coarse step keeps this cheap (< ~400 picks
      //    even for a fullscreen drag) so the UI never freezes.
      try {
        const w = cMaxX - cMinX, h = cMaxY - cMinY;
        if (w >= 8 && h >= 8) {
          const target = 24; // ~24×24 = 576 max picks
          const step = Math.max(18, Math.ceil(Math.max(w, h) / target));
          const pt = new Cartesian2();
          const isOsmFeature = (p: any) =>
            p instanceof Cesium3DTileFeature &&
            ((p as any).tileset === tileset || (p as any).primitive === tileset);
          for (let x = cMinX; x <= cMaxX; x += step) {
            for (let y = cMinY; y <= cMaxY; y += step) {
              pt.x = x; pt.y = y;
              const p = viewer.scene.pick(pt);
              if (isOsmFeature(p)) {
                const id = featureOsmId(p as Cesium3DTileFeature);
                if (id) hits.add(id);
              }
            }
          }
        }
      } catch {}
      const dt = Math.round(performance.now() - t0);
      console.log(`[marquee] ${hits.size} building(s) in ${dt}ms`);

      if (hits.size === 0) {
        toast("No buildings in that rectangle — zoom closer.", { duration: 2000 });
        return;
      }

      // Merge into pending selection based on drag mode.
      const hitIds = Array.from(hits);
      setPendingIds((prev) => {
        let next: string[];
        if (rect.mode === "replace") {
          // Restore any previously-pending that aren't in the new hit set.
          for (const oldId of prev) {
            if (!hits.has(oldId)) restorePendingColor(oldId);
          }
          next = hitIds;
        } else if (rect.mode === "add") {
          const s = new Set(prev);
          for (const id of hitIds) s.add(id);
          next = Array.from(s);
        } else {
          const drop = new Set(hitIds);
          const kept: string[] = [];
          for (const id of prev) {
            if (drop.has(id)) restorePendingColor(id);
            else kept.push(id);
          }
          next = kept;
        }
        // Paint all now-pending ids green (idempotent).
        for (const id of next) paintPendingColor(id);
        return next;
      });
    },
    [viewerRef, getOsmTileset],
  );

  /** Save the current pending color for `osmId` (if not already saved) then
   *  paint it green. */
  const paintPendingColor = useCallback((osmId: string) => {
    if (!pendingSnapshot.current.has(osmId)) {
      pendingSnapshot.current.set(osmId, appliedColors.current.get(osmId) ?? null);
    }
    // Repaint on the tileset without persisting to appliedColors — we still
    // want the snapshot value to survive if the user hits ✕ Clear.
    const viewer = viewerRef.current;
    const ts = getOsmTileset();
    if (!viewer || !ts) return;
    try {
      (ts as any)._selectedTiles?.forEach((tile: any) => {
        const count = tile.content?.featuresLength ?? 0;
        for (let i = 0; i < count; i++) {
          const f: Cesium3DTileFeature = tile.content.getFeature(i);
          if (featureOsmId(f) === osmId) {
            f.color = CesiumColor.fromCssColorString(PENDING_HEX);
          }
        }
      });
    } catch {}
    viewer.scene.requestRender();
  }, [viewerRef, getOsmTileset]);

  /** Restore the original tint of an osm_id from `pendingSnapshot`. */
  const restorePendingColor = useCallback((osmId: string) => {
    const original = pendingSnapshot.current.get(osmId) ?? null;
    pendingSnapshot.current.delete(osmId);
    const viewer = viewerRef.current;
    const ts = getOsmTileset();
    if (!viewer || !ts) return;
    try {
      (ts as any)._selectedTiles?.forEach((tile: any) => {
        const count = tile.content?.featuresLength ?? 0;
        for (let i = 0; i < count; i++) {
          const f: Cesium3DTileFeature = tile.content.getFeature(i);
          if (featureOsmId(f) === osmId) {
            f.color = original ? CesiumColor.fromCssColorString(original) : CesiumColor.WHITE;
          }
        }
      });
    } catch {}
    viewer.scene.requestRender();
  }, [viewerRef, getOsmTileset]);

  /** Wipe pending, restoring every affected building to its saved color. */
  const clearPending = useCallback(() => {
    for (const id of pendingIds) restorePendingColor(id);
    pendingSnapshot.current.clear();
    setPendingIds([]);
  }, [pendingIds, restorePendingColor]);

  /** Commit pending → brand-new group (color = green) then paint members. */
  const savePendingAsNewGroup = useCallback(async () => {
    if (pendingIds.length === 0) return;
    const ids = [...pendingIds];
    const g = await groups.createGroup(`Selection ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    if (!g) { toast.error("Could not create group"); return; }
    await groups.updateGroup(g.id, { osm_ids: ids, color: PENDING_HEX });
    groups.setActiveId(g.id);
    // Move buildings from "pending green" to a persisted green (saved on record).
    pendingSnapshot.current.clear();
    setPendingIds([]);
    for (const osmId of ids) {
      appliedColors.current.set(osmId, PENDING_HEX);
      if (!records.records[osmId]) {
        await records.ensureRecord({ osm_id: osmId, lat: 0, lng: 0 });
      }
      await records.patchRecord(
        osmId,
        { color: PENDING_HEX },
        { kind: "color", message: `Saved to group "${g.name}"` },
      );
    }
    toast.success(`Saved ${ids.length} building${ids.length === 1 ? "" : "s"} → "${g.name}"`);
  }, [pendingIds, groups, records]);

  /** Commit pending → existing active group, using that group's color. */
  const addPendingToActive = useCallback(async () => {
    if (pendingIds.length === 0 || !groups.activeGroup) return;
    const g = groups.activeGroup;
    const ids = [...pendingIds];
    await groups.addToGroup(g.id, ids);
    pendingSnapshot.current.clear();
    setPendingIds([]);
    for (const osmId of ids) {
      appliedColors.current.set(osmId, g.color);
      if (!records.records[osmId]) {
        await records.ensureRecord({ osm_id: osmId, lat: 0, lng: 0 });
      }
      await records.patchRecord(
        osmId,
        { color: g.color },
        { kind: "color", message: `Added to group "${g.name}"` },
      );
      // Repaint immediately with group color.
      applyColorImmediate(osmId, g.color);
    }
    toast.success(`+${ids.length} → "${g.name}"`);
  }, [pendingIds, groups, records]);

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

  /** Paint every building in a saved group using the group's own color. */
  const applyColorToGroup = useCallback(async (groupId: string) => {
    const g = groups.groups.find((x) => x.id === groupId);
    if (!g) return;
    const hex = g.color;
    for (const osmId of g.osm_ids) {
      applyColorImmediate(osmId, hex);
      if (!records.records[osmId]) {
        await records.ensureRecord({ osm_id: osmId, lat: 0, lng: 0 });
      }
      await records.patchRecord(
        osmId,
        { color: hex },
        { kind: "color", message: `Group "${g.name}" → ${hex}` },
      );
    }
    toast.success(`Painted ${g.osm_ids.length} building${g.osm_ids.length === 1 ? "" : "s"}`);
  }, [groups.groups, records]);

  /** For the BuildingCard's legacy "apply to selection" button — targets
   *  the currently active group. */
  const onApplyColorToSelection = async (hex: string | null) => {
    if (!groups.activeGroup) return;
    for (const osmId of groups.activeGroup.osm_ids) {
      applyColorImmediate(osmId, hex);
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
    if (!active) return null;
    const g = groups.activeGroup;
    if (!marqueeActive && !g) return null;
    return (
      <div className="pointer-events-auto fixed left-1/2 top-4 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 px-3 py-1.5 text-xs text-white">
        {marqueeActive ? (
          <>
            <LassoSelect className="w-3.5 h-3.5 text-sky-300" />
            <span>Marquee</span>
            <span className="opacity-60">·</span>
            <span className="opacity-80">Press &amp; drag · Shift = add · Alt = subtract · Esc = exit</span>
          </>
        ) : (
          <>
            <MousePointerSquareDashed className="w-3.5 h-3.5 opacity-70" />
            <span>Active group:</span>
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: g!.color }} />
            <span className="font-semibold">{g!.name}</span>
            <span className="opacity-60 tabular-nums">· {g!.osm_ids.length}</span>
          </>
        )}
      </div>
    );
  }, [active, marqueeActive, groups.activeGroup]);

  // Keep clearPending accessible from the ESC handler defined earlier.
  useEffect(() => { clearPendingRef.current = clearPending; }, [clearPending]);

  /**
   * Append a ledger row on every building that belongs to `groupId`.
   * Used so that group-level actions (rename / recolor / publish / delete /
   * paint) are traceable from every individual building's history.
   */
  const ledgerToGroup = useCallback(
    async (
      groupId: string,
      kind: "color" | "publish" | "tag" | "note" | "import",
      message: string,
      payload: Record<string, unknown> = {},
    ) => {
      const g = groups.groups.find((x) => x.id === groupId);
      if (!g) return;
      for (const osmId of g.osm_ids) {
        let rec = records.records[osmId];
        if (!rec) {
          rec = await records.ensureRecord({ osm_id: osmId, lat: 0, lng: 0 });
          if (!rec) continue;
        }
        await records.appendLedger(rec.id, kind, message, {
          group_id: groupId,
          group_name: g.name,
          ...payload,
        });
      }
    },
    [groups.groups, records],
  );

  if (!active) return null;
  return (
    <>
      {statusPill}

      {/* Save-Group confirm bar — appears whenever there is a pending
          (uncommitted) green selection. */}
      {pendingIds.length > 0 && (
        <div className="pointer-events-auto fixed left-1/2 bottom-40 z-40 -translate-x-1/2 flex items-center gap-2 rounded-2xl bg-black/70 backdrop-blur-xl border border-emerald-400/40 px-3 py-2 shadow-2xl shadow-emerald-500/20">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PENDING_HEX }} />
          <span className="text-xs text-white tabular-nums">
            {pendingIds.length} building{pendingIds.length === 1 ? "" : "s"} selected
          </span>
          <button
            onClick={savePendingAsNewGroup}
            className="ml-2 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-semibold"
            title="Save selection as a new group"
          >
            <Check className="w-3 h-3" /> Save as group
          </button>
          <button
            onClick={addPendingToActive}
            disabled={!groups.activeGroup}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-[11px]"
            title={groups.activeGroup ? `Add to "${groups.activeGroup.name}"` : "No active group"}
          >
            <Plus className="w-3 h-3" /> Add to active
          </button>
          <button
            onClick={clearPending}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 text-[11px]"
            title="Clear selection (Esc)"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Marquee tool toggle + saved groups panel. Docked bottom-left so it
          doesn't clash with the mode carousel or the level HUD. */}
      {panelOpen ? (
        <div className="pointer-events-auto fixed left-3 bottom-24 z-30 w-72 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMarqueeActive((v) => !v)}
              className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 ${
                marqueeActive
                  ? "bg-sky-500 border-sky-300 text-white shadow-lg shadow-sky-500/30"
                  : "bg-black/50 border-white/15 text-white/80 hover:bg-white/10"
              }`}
              title="Toggle marquee selection (M)"
            >
              <LassoSelect className="w-3.5 h-3.5" />
              {marqueeActive ? "Marquee ON" : "Marquee"}
            </button>
            <button
              onClick={() => setPanelOpen(false)}
              className="w-9 h-9 rounded-xl bg-black/50 border border-white/15 text-white/60 hover:text-white text-xs"
              title="Hide panel"
            >
              −
            </button>
          </div>
          <SelectionGroupsPanel
            groups={groups.groups}
            activeId={groups.activeId}
            records={records.records}
            onSetActive={groups.setActiveId}
            onCreate={groups.createGroup}
            onRename={(id, name) => { groups.updateGroup(id, { name }); }}
            onRecolor={(id, color) => { groups.updateGroup(id, { color }); }}
            onTogglePublic={(id, isPublic) => { groups.updateGroup(id, { is_public: isPublic }); }}
            onDelete={groups.deleteGroup}
            onApplyColorToGroup={applyColorToGroup}
            onFlyToGroup={(id) => {
              const g = groups.groups.find((x) => x.id === id);
              if (g) flyToGroupIds(g.osm_ids);
            }}
          />
        </div>
      ) : (
        <button
          onClick={() => setPanelOpen(true)}
          className="pointer-events-auto fixed left-3 bottom-24 z-30 px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs flex items-center gap-2"
        >
          <LassoSelect className="w-3.5 h-3.5" /> Selection groups
        </button>
      )}

      {/* macOS-style rubber-band. Only mounts while the marquee tool is on. */}
      <MarqueeSelectionLayer
        active={marqueeActive}
        onSelect={handleMarquee}
      />

      {picked && (
        <BuildingCard
          picked={picked}
          record={currentRecord}
          multiSelectCount={1}
          onClose={() => setPicked(null)}
          onColor={onColor}
          onTag={onTag}
          onNotes={onNotes}
          onTogglePublish={onTogglePublish}
          onUploadModel={onUploadModel}
          onClearModel={onClearModel}
          onApplyColorToSelection={undefined}
          onOpenModelControls={(osmId) => setEditingOsmId(osmId)}
          loadLedger={records.listLedger}
        />
      )}
      {editingOsmId && (() => {
        const rec = records.records[editingOsmId];
        if (!rec || !rec.replacement_glb_url) return null;
        const saved = ((rec.raw as any)?.transform as TransformData | undefined) ?? null;
        const initial: TransformData = saved ?? {
          lat: rec.lat ?? 0,
          lng: rec.lng ?? 0,
          alt: 0,
          heading: 0,
          pitch: 0,
          roll: 0,
          scale: 1,
        };
        const viewer = viewerRef.current;
        const entityId = replacementEntities.current.get(editingOsmId);
        return (
          <ModelTransformWidget
            modelName={rec.name ?? rec.tag ?? "Replacement Model"}
            initial={initial}
            onUpdate={(t) => {
              if (viewer && entityId) applyEntityTransform(viewer, entityId, t);
            }}
            onApply={async (t) => {
              if (viewer && entityId) applyEntityTransform(viewer, entityId, t);
              const nextRaw = { ...(rec.raw as any), transform: t };
              await records.patchRecord(
                editingOsmId!,
                { raw: nextRaw } as any,
                { kind: "model", message: "Saved 3D transform", payload: { transform: t } },
              );
              setEditingOsmId(null);
            }}
            onClose={() => setEditingOsmId(null)}
            onSnapToGround={(t, cb) => cb({ ...t, alt: 0 })}
          />
        );
      })()}
    </>
  );
}

/** Apply position/orientation/scale of a saved TransformData to a Cesium entity. */
function applyEntityTransform(viewer: Viewer, entityId: string, t: TransformData) {
  const entity = viewer.entities.getById(entityId);
  if (!entity) return;
  const pos = Cartesian3.fromDegrees(t.lng, t.lat, t.alt || 0);
  entity.position = new ConstantPositionProperty(pos);
  const hpr = new HeadingPitchRoll(
    CesiumMath.toRadians(t.heading || 0),
    CesiumMath.toRadians(t.pitch || 0),
    CesiumMath.toRadians(t.roll || 0),
  );
  entity.orientation = new ConstantProperty(Transforms.headingPitchRollQuaternion(pos, hpr));
  if (entity.model) {
    (entity.model as any).scale = new ConstantProperty(t.scale ?? 1);
    // Free height when the user sets a non-zero altitude
    (entity.model as any).heightReference = new ConstantProperty(
      (t.alt ?? 0) === 0 ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE,
    );
  }
  viewer.scene.requestRender();
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