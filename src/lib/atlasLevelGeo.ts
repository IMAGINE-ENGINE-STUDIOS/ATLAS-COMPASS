// Anchor a (lat,lng) to the slippy-map tile whose size best fits a level's world size.
// Returns the tile center coordinates + the chosen zoom + the snapped tile bounds.

export const DEFAULT_LEVEL_SIZE_M = 400;
export const LEVEL_HEIGHT_M = 80;

function tileToLngLat(x: number, y: number, z: number) {
  const n = Math.pow(2, z);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lng, lat: (latRad * 180) / Math.PI };
}

function lngLatToTile(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

export function pickLevelTileZoom(lat: number, sizeM: number) {
  const equatorTile = 156543.03392 * Math.cos((lat * Math.PI) / 180);
  const z = Math.round(Math.log2(equatorTile / Math.max(50, sizeM)));
  return Math.max(0, Math.min(22, z));
}

export interface SnappedLevelTile {
  lat: number;
  lng: number;
  zoom: number;
  tileSizeM: number;
  bounds: { north: number; south: number; east: number; west: number };
}

export function snapToLevelTile(lat: number, lng: number, sizeM = DEFAULT_LEVEL_SIZE_M): SnappedLevelTile {
  const zoom = pickLevelTileZoom(lat, sizeM);
  const { x, y } = lngLatToTile(lat, lng, zoom);
  const nw = tileToLngLat(x, y, zoom);
  const se = tileToLngLat(x + 1, y + 1, zoom);
  const bounds = { north: nw.lat, south: se.lat, west: nw.lng, east: se.lng };
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const tileSizeM = (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, zoom);
  return { lat: centerLat, lng: centerLng, zoom, tileSizeM, bounds };
}