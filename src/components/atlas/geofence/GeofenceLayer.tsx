/**
 * Cesium overlay that renders selected tiles (blue fill + border) and the
 * in-progress polygon for the Geofence tool. Uses Entity API for simplicity;
 * tile counts are capped in tileMath.polygonToTiles so entity count stays
 * manageable.
 */
import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import { Cartesian3, Color, PolygonHierarchy, Entity } from "cesium";
import type { Geofence } from "@/lib/tileIntel/geofences";
import { parseTileId, tileBounds, type LngLat, type TileId } from "./tileMath";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  /** Committed geofences (persisted) — rendered in each geofence's own color. */
  geofences: Geofence[];
  /** Currently-selected tiles in the active editor (blue). */
  editingTiles: TileId[];
  /** In-progress polygon vertices (during draw). */
  polygonInProgress: LngLat[];
  /** Highlight (hover) — a single tile shown behind the selection. */
  hoverTile: TileId | null;
}

const BLUE_FILL = Color.fromCssColorString("#38bdf8").withAlpha(0.28);
const BLUE_BORDER = Color.fromCssColorString("#7dd3fc").withAlpha(0.95);
const HOVER_FILL = Color.fromCssColorString("#38bdf8").withAlpha(0.12);

function tileHierarchy(id: TileId): PolygonHierarchy {
  const t = parseTileId(id);
  const b = tileBounds(t);
  return new PolygonHierarchy(
    Cartesian3.fromDegreesArray([
      b.west, b.south,
      b.east, b.south,
      b.east, b.north,
      b.west, b.north,
    ]),
  );
}

export default function GeofenceLayer({ viewerRef, geofences, editingTiles, polygonInProgress, hoverTile }: Props) {
  const entitiesRef = useRef<Entity[]>([]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Clear previous
    entitiesRef.current.forEach((e) => { try { viewer.entities.remove(e); } catch { /* noop */ } });
    entitiesRef.current = [];

    const add = (ent: Entity) => {
      const e = viewer.entities.add(ent);
      entitiesRef.current.push(e);
    };

    // Committed geofences (each in their own color)
    for (const gf of geofences) {
      const fillCss = gf.color || "#38bdf8";
      const fill = Color.fromCssColorString(fillCss).withAlpha(0.22);
      const border = Color.fromCssColorString(fillCss).withAlpha(0.95);
      for (const tid of gf.tile_set) {
        add(new Entity({
          polygon: {
            hierarchy: tileHierarchy(tid),
            material: fill,
            outline: true,
            outlineColor: border,
            height: 0,
          },
        }));
      }
      if (gf.polygon && gf.polygon.length >= 3) {
        add(new Entity({
          polygon: {
            hierarchy: new PolygonHierarchy(
              Cartesian3.fromDegreesArray(gf.polygon.flatMap((p) => [p.lng, p.lat])),
            ),
            material: fill,
            outline: true,
            outlineColor: border,
            height: 0,
          },
        }));
      }
    }

    // Hover
    if (hoverTile) {
      add(new Entity({
        polygon: {
          hierarchy: tileHierarchy(hoverTile),
          material: HOVER_FILL,
          outline: true,
          outlineColor: BLUE_BORDER.withAlpha(0.5),
          height: 0,
        },
      }));
    }

    // Editing tiles (blue)
    for (const tid of editingTiles) {
      add(new Entity({
        polygon: {
          hierarchy: tileHierarchy(tid),
          material: BLUE_FILL,
          outline: true,
          outlineColor: BLUE_BORDER,
          height: 0,
        },
      }));
    }

    // Polygon in progress
    if (polygonInProgress.length >= 2) {
      add(new Entity({
        polyline: {
          positions: Cartesian3.fromDegreesArray(polygonInProgress.flatMap((p) => [p.lng, p.lat])),
          material: BLUE_BORDER,
          width: 2,
          clampToGround: true,
        },
      }));
    }
    if (polygonInProgress.length >= 3) {
      add(new Entity({
        polygon: {
          hierarchy: new PolygonHierarchy(
            Cartesian3.fromDegreesArray(polygonInProgress.flatMap((p) => [p.lng, p.lat])),
          ),
          material: BLUE_FILL,
          outline: false,
          height: 0,
        },
      }));
    }

    viewer.scene.requestRender?.();

    return () => {
      const v = viewerRef.current;
      entitiesRef.current.forEach((e) => { try { v?.entities.remove(e); } catch { /* noop */ } });
      entitiesRef.current = [];
      v?.scene.requestRender?.();
    };
  }, [viewerRef, geofences, editingTiles, polygonInProgress, hoverTile]);

  return null;
}