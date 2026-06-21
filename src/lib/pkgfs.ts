/**
 * pkgfs — tiny in-memory virtual filesystem for unpacked Level Packages.
 *
 * Each level package is unzipped once and its files are exposed under a
 * `pkgfs://<levelId>/<path>` URL. Consumers (R3F loaders, audio system,
 * script runtime) ask `resolvePkgfsUrl(url)` for a real `blob:` URL they can
 * feed to existing loaders without any per-loader changes.
 */

export interface PkgFile {
  path: string;       // e.g. "models/abc123.glb"
  mime: string;
  size: number;
  blob: Blob;
}

export interface PkgVolume {
  levelId: string;
  files: Map<string, PkgFile>;
  /** Cache of created blob: URLs, lazily materialized. */
  blobUrls: Map<string, string>;
}

const VOLUMES = new Map<string, PkgVolume>();

export function mountPackage(levelId: string, files: PkgFile[]): PkgVolume {
  unmountPackage(levelId);
  const volume: PkgVolume = {
    levelId,
    files: new Map(files.map((f) => [normalize(f.path), f])),
    blobUrls: new Map(),
  };
  VOLUMES.set(levelId, volume);
  return volume;
}

export function unmountPackage(levelId: string) {
  const v = VOLUMES.get(levelId);
  if (!v) return;
  for (const url of v.blobUrls.values()) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }
  VOLUMES.delete(levelId);
}

export function getMountedPackage(levelId: string): PkgVolume | null {
  return VOLUMES.get(levelId) ?? null;
}

export function listMountedPackages(): string[] {
  return Array.from(VOLUMES.keys());
}

/**
 * Resolve a pkgfs:// URL to a real blob: URL. Returns null when the volume
 * isn't mounted or the file is missing.
 */
export function resolvePkgfsUrl(url: string): string | null {
  const parsed = parsePkgfsUrl(url);
  if (!parsed) return null;
  const v = VOLUMES.get(parsed.levelId);
  if (!v) return null;
  const file = v.files.get(parsed.path);
  if (!file) return null;
  const cached = v.blobUrls.get(parsed.path);
  if (cached) return cached;
  const blobUrl = URL.createObjectURL(file.blob);
  v.blobUrls.set(parsed.path, blobUrl);
  return blobUrl;
}

export function isPkgfsUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("pkgfs://");
}

export function makePkgfsUrl(levelId: string, path: string): string {
  return `pkgfs://${levelId}/${normalize(path)}`;
}

function parsePkgfsUrl(url: string): { levelId: string; path: string } | null {
  if (!url.startsWith("pkgfs://")) return null;
  const rest = url.slice("pkgfs://".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { levelId: rest.slice(0, slash), path: normalize(rest.slice(slash + 1)) };
}

function normalize(path: string): string {
  return path.replace(/^\/+/, "").replace(/\\/g, "/");
}