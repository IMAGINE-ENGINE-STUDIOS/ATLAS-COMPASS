/**
 * Web Mercator XYZ tile math for the Geofence / Tile Intelligence system.
 * All functions use the standard slippy-map convention:
 *   z=0 → one tile covering the world
 *   y grows southward, x grows eastward
 *
 * Tile IDs are stored as "z/x/y" strings for compact JSON persistence.
 */

export type TileId = string; // "z/x/y"

export interface TileXYZ { z: number; x: number; y: number; }
export interface LngLat { lng: number; lat: number; }

export function tileId(t: TileXYZ): TileId {
  return `${t.z}/${t.x}/${t.y}`;
}

export function parseTileId(id: TileId): TileXYZ {
  const [z, x, y] = id.split("/").map((n) => parseInt(n, 10));
  return { z, x, y };
}

/** Convert lng/lat (degrees) to tile coords at zoom `z`. */
export function lngLatToTile(lng: number, lat: number, z: number): TileXYZ {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { z, x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)) };
}

/** Return the lng/lat rectangle covered by a tile in degrees. */
export function tileBounds(t: TileXYZ): { west: number; south: number; east: number; north: number } {
  const n = 2 ** t.z;
  const west = (t.x / n) * 360 - 180;
  const east = ((t.x + 1) / n) * 360 - 180;
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * t.y) / n)));
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.y + 1)) / n)));
  return {
    west,
    east,
    north: (northRad * 180) / Math.PI,
    south: (southRad * 180) / Math.PI,
  };
}

/** Point-in-polygon (ray cast). Polygon is a closed ring of {lng,lat} points. */
export function pointInPolygon(point: LngLat, polygon: LngLat[]): boolean {
  let inside = false;
  const { lng: x, lat: y } = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Compute all tile IDs at zoom `z` covered by a polygon (centroid inside). */
export function polygonToTiles(polygon: LngLat[], z: number): TileId[] {
  if (polygon.length < 3) return [];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of polygon) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  const tl = lngLatToTile(minLng, maxLat, z);
  const br = lngLatToTile(maxLng, minLat, z);
  const ids: TileId[] = [];
  const cap = 10_000; // safety
  for (let x = tl.x; x <= br.x; x++) {
    for (let y = tl.y; y <= br.y; y++) {
      const b = tileBounds({ z, x, y });
      const cx = (b.west + b.east) / 2;
      const cy = (b.south + b.north) / 2;
      if (pointInPolygon({ lng: cx, lat: cy }, polygon)) {
        ids.push(tileId({ z, x, y }));
        if (ids.length >= cap) return ids;
      }
    }
  }
  return ids;
}