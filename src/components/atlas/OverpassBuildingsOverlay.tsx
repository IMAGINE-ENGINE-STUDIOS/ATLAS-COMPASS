/**
 * OverpassBuildingsOverlay
 * ------------------------
 * Live OpenStreetMap buildings for the current viewport. Fills the gaps
 * where Cesium's OSM Buildings snapshot doesn't (remote villages in
 * Venezuela, brand-new OSM edits, small settlements across South America
 * and everywhere else).
 *
 * Flow:
 *   1. User hits "Load OSM ✚" — we compute the current camera bbox and
 *      POST an Overpass query for every `building=*` way inside it.
 *   2. Each returned way becomes a Cesium PolygonGraphics entity with
 *      extruded height = building:levels × 3 m (fallback 6 m).
 *   3. Left-click on any entity opens a BuildingCard — records + ledger
 *      + selection groups are the same hooks as the tileset overlay, so
 *      everything stays unified.
 *   4. Colors from `building_records.color` are applied to entities on
 *      load and refreshed whenever the record changes.
 *
 * Only mounts while viewMode === "osm".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cartesian3,
  Cartographic,
  Color as CesiumColor,
  Math as CesiumMath,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Entity,
  type Viewer,
} from "cesium";
import BuildingCard from "./BuildingCard";
import { useBuildingRecords } from "@/hooks/useBuildingRecords";
import { useSelectionGroups } from "@/hooks/useSelectionGroups";
import { estimateBuildingResidents } from "@/lib/census";
import type { PickedBuilding } from "@/types/BuildingCardRecord";
import { toast } from "sonner";
import { Download, Loader2, MapPinned } from "lucide-react";

interface Props {
  viewerRef: React.RefObject<Viewer | null>;
  active: boolean;
}

const ENTITY_PREFIX = "overpass-bldg:";
const DEFAULT_HEIGHT_PER_LEVEL_M = 3.2;

/** Geodesic polygon area via shoelace on equirectangular projection. */
function polygonAreaM2(coords: { lat: number; lon: number }[]): number {
  if (coords.length < 3) return 0;
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const lat0 = coords[0].lat;
  let area = 0;
  for (let i = 0, n = coords.length; i < n; i++) {
    const a = coords[i], b = coords[(i + 1) % n];
    const x1 = R * rad(a.lon) * Math.cos(rad(lat0));
    const y1 = R * rad(a.lat);
    const x2 = R * rad(b.lon) * Math.cos(rad(lat0));
    const y2 = R * rad(b.lat);
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

export default function OverpassBuildingsOverlay({ viewerRef, active }: Props) {
  const records = useBuildingRecords();
  const groups = useSelectionGroups();
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [picked, setPicked] = useState<PickedBuilding | null>(null);
  const entitiesRef = useRef<Map<string, string>>(new Map()); // osmId → entityId

  const currentRecord = picked ? records.records[picked.osm_id] ?? null : null;

  const cameraBbox = useCallback((): Rectangle | null => {
    const viewer = viewerRef.current;
    if (!viewer) return null;
    const r = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    return r ?? null;
  }, [viewerRef]);

  const applyRecordColor = useCallback((osmId: string) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const entityId = entitiesRef.current.get(osmId);
    if (!entityId) return;
    const e = viewer.entities.getById(entityId);
    if (!e?.polygon) return;
    const rec = records.records[osmId];
    const hex = rec?.color ?? "#7dd3fc"; // sky-300 default
    (e.polygon.material as any) = CesiumColor.fromCssColorString(hex).withAlpha(0.82);
    (e.polygon.outlineColor as any) = CesiumColor.fromCssColorString(hex).brighten(0.4, new CesiumColor());
  }, [viewerRef, records.records]);

  const loadBuildings = useCallback(async () => {
    const viewer = viewerRef.current;
    const bbox = cameraBbox();
    if (!viewer || !bbox) { toast.error("Move closer to Earth first"); return; }
    const s = CesiumMath.toDegrees(bbox.south);
    const n = CesiumMath.toDegrees(bbox.north);
    const w = CesiumMath.toDegrees(bbox.west);
    const e = CesiumMath.toDegrees(bbox.east);
    // Guard against huge viewports (Overpass will reject / take forever).
    if ((n - s) * (e - w) > 0.25) {
      toast.error("Zoom in more — viewport is too wide for a live OSM fetch");
      return;
    }
    setLoading(true);
    const q =
      `[out:json][timeout:25];` +
      `(way["building"](${s},${w},${n},${e}););` +
      `out tags geom;`;
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: q,
      });
      if (!r.ok) throw new Error(`Overpass ${r.status}`);
      const j = await r.json();
      const els: any[] = j.elements ?? [];
      let added = 0;
      for (const el of els) {
        if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 3) continue;
        const osmId = `way/${el.id}`;
        if (entitiesRef.current.has(osmId)) continue;
        const positions = Cartesian3.fromDegreesArray(
          el.geometry.flatMap((p: any) => [p.lon, p.lat]),
        );
        const tags = el.tags ?? {};
        const levels = parseInt(tags["building:levels"] ?? "", 10);
        const height = (Number.isFinite(levels) ? levels : 2) * DEFAULT_HEIGHT_PER_LEVEL_M;
        const entityId = `${ENTITY_PREFIX}${osmId}`;
        viewer.entities.add({
          id: entityId,
          properties: { osm_id: osmId, tags },
          polygon: {
            hierarchy: positions as any,
            extrudedHeight: height,
            height: 0,
            material: CesiumColor.fromCssColorString("#7dd3fc").withAlpha(0.82) as any,
            outline: true,
            outlineColor: CesiumColor.fromCssColorString("#bae6fd") as any,
          },
        });
        entitiesRef.current.set(osmId, entityId);
        added++;
      }
      setLoadedCount((c) => c + added);
      // Reapply any saved colors immediately
      for (const id of entitiesRef.current.keys()) applyRecordColor(id);
      viewer.scene.requestRender();
      toast.success(`Loaded ${added} new building${added === 1 ? "" : "s"} from OSM`);
    } catch (e: any) {
      console.warn("[OverpassBuildings] fetch failed", e);
      toast.error(`Overpass fetch failed: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [viewerRef, cameraBbox, applyRecordColor]);

  const clearBuildings = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    for (const eid of entitiesRef.current.values()) {
      const e = viewer.entities.getById(eid);
      if (e) viewer.entities.remove(e);
    }
    entitiesRef.current.clear();
    setLoadedCount(0);
    viewer.scene.requestRender();
  }, [viewerRef]);

  /** LEFT_CLICK → open BuildingCard for the picked overpass entity. */
  useEffect(() => {
    if (!active) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    const h = new ScreenSpaceEventHandler(viewer.scene.canvas);
    h.setInputAction(async (click: any) => {
      const p = viewer.scene.pick(click.position);
      const entity = p?.id as Entity | undefined;
      if (!entity?.id || typeof entity.id !== "string") return;
      if (!entity.id.startsWith(ENTITY_PREFIX)) return;
      const osmId = entity.properties?.osm_id?.getValue?.() ?? entity.id.slice(ENTITY_PREFIX.length);
      // Get click world position for lat/lng
      const world = viewer.scene.pickPosition(click.position);
      let lat = 0, lng = 0;
      if (world) {
        const c = Cartographic.fromCartesian(world);
        lat = CesiumMath.toDegrees(c.latitude);
        lng = CesiumMath.toDegrees(c.longitude);
      }
      const tags = entity.properties?.tags?.getValue?.() ?? {};
      const base: PickedBuilding = {
        osm_id: osmId,
        lat, lng,
        name: tags.name ?? null,
        address: null,
        building_kind: tags.building ?? null,
        levels: parseInt(tags["building:levels"] ?? "", 10) || null,
        footprint_m2: null,
        raw: { tags, source: "overpass-live" },
      };
      // Compute footprint from entity polygon
      try {
        const hierarchy = (entity.polygon?.hierarchy as any)?.getValue?.()?.positions as Cartesian3[] | undefined;
        if (hierarchy?.length) {
          const pts = hierarchy.map((p) => {
            const c = Cartographic.fromCartesian(p);
            return { lat: CesiumMath.toDegrees(c.latitude), lon: CesiumMath.toDegrees(c.longitude) };
          });
          base.footprint_m2 = polygonAreaM2(pts);
        }
      } catch {}
      setPicked(base);
      await records.ensureRecord(base);
      // Enrich residents in the background
      try {
        const est = await estimateBuildingResidents({
          lat: base.lat, lng: base.lng,
          levels: base.levels, footprint_m2: base.footprint_m2, building_kind: base.building_kind,
        });
        base.est_population = est.residents;
        base.population_source = est.source;
        base.population_note = est.note ?? null;
        setPicked((cur) => (cur?.osm_id === osmId ? { ...base } : cur));
        await records.ensureRecord(base);
      } catch {}
      // Nominatim reverse geocode for address
      try {
        const nr = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { "Accept-Language": "en" } },
        );
        if (nr.ok) {
          const nj = await nr.json();
          base.address = nj.display_name ?? null;
          setPicked((cur) => (cur?.osm_id === osmId ? { ...base } : cur));
        }
      } catch {}
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => { h.destroy(); };
  }, [active, viewerRef, records]);

  /** Reapply colors whenever the records map changes. */
  useEffect(() => {
    for (const id of entitiesRef.current.keys()) applyRecordColor(id);
  }, [records.records, applyRecordColor]);

  /** Remove all entities on unmount / mode-off. */
  useEffect(() => {
    if (!active) return;
    return () => { clearBuildings(); };
  }, [active, clearBuildings]);

  const onColor = async (osmId: string, hex: string | null) => {
    await records.patchRecord(osmId, { color: hex }, {
      kind: "color",
      message: hex ? `Color set to ${hex} (Overpass)` : "Color cleared",
      payload: { source: "overpass" },
    });
  };

  const activeCount = groups.activeGroup?.osm_ids.length ?? 0;
  const statusLine = useMemo(() => {
    if (!active) return null;
    return (
      <div className="pointer-events-auto fixed left-3 bottom-64 z-30 flex items-center gap-2">
        <button
          onClick={loadBuildings}
          disabled={loading}
          className="px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs flex items-center gap-2 hover:bg-white/10 disabled:opacity-60"
          title="Fetch every OSM building in your current viewport (Overpass live)"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {loading ? "Fetching OSM…" : "Load OSM ✚"}
        </button>
        {loadedCount > 0 && (
          <span className="px-2 py-1 rounded-md bg-black/60 border border-white/15 text-[11px] text-white/80 tabular-nums flex items-center gap-1">
            <MapPinned className="w-3 h-3 text-sky-300" />
            {loadedCount} live
            <button onClick={clearBuildings} className="ml-1 opacity-60 hover:opacity-100">✕</button>
          </span>
        )}
      </div>
    );
  }, [active, loading, loadedCount, loadBuildings, clearBuildings]);

  if (!active) return null;
  return (
    <>
      {statusLine}
      {picked && (
        <BuildingCard
          picked={picked}
          record={currentRecord}
          multiSelectCount={1}
          onClose={() => setPicked(null)}
          onColor={onColor}
          onTag={async (osmId, tag) => { await records.patchRecord(osmId, { tag }, { kind: "tag", message: `Tag set to “${tag}”` }); }}
          onNotes={async (osmId, notes) => { await records.patchRecord(osmId, { notes }, { kind: "note", message: notes.slice(0, 140) }); }}
          onTogglePublish={async (osmId, isPublic) => { await records.patchRecord(osmId, { is_public: isPublic }, { kind: "publish", message: isPublic ? "Published" : "Made private" }); }}
          onUploadModel={async () => {}}
          onClearModel={async () => {}}
          onApplyColorToSelection={undefined}
          onOpenModelControls={() => {}}
          loadLedger={records.listLedger}
        />
      )}
      {activeCount > 0 && null /* group state is shared with the tileset overlay */}
    </>
  );
}