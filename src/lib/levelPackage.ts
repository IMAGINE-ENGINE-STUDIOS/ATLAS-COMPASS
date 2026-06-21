/**
 * Level Package (.lvlpkg) — build / read.
 *
 * A package is a zip with a strict, content-addressed layout:
 *
 *   manifest.json                  → LevelManifest
 *   scene.json                     → LevelScene
 *   index.json                     → PackageIndex (kind/sha/mime/size per file)
 *   models/<sha>.glb               → every referenced 3D model
 *   terrain/<sha>.{glb,bin}
 *   characters/<sha>.glb
 *   animations/<sha>.glb
 *   textures/<sha>.{png,webp,ktx2}
 *   hdri/<sha>.hdr
 *   audio/<sha>.{mp3,ogg,wav}
 *   scripts/<name>.json            → behavior graphs / interactions
 *
 * Building is done client-side in a single pass: walk the scene, collect
 * every asset blob it references (data URLs, IndexedDB blobs, http URLs),
 * hash, dedupe, write the zip with `fflate`.
 */

import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";
import type { LevelManifest } from "./levelManifest";
import { makePkgfsUrl, mountPackage, type PkgFile } from "./pkgfs";

export type PackageKind =
  | "manifest"
  | "scene"
  | "index"
  | "model"
  | "terrain"
  | "character"
  | "animation"
  | "texture"
  | "hdri"
  | "audio"
  | "script";

export interface PackageIndexEntry {
  kind: PackageKind;
  path: string;
  sha: string;
  mime: string;
  size: number;
  originalName?: string;
}

export interface PackageIndex {
  packageId: string;
  packageVersion: string;
  levelId: string;
  builtAt: string;
  entries: PackageIndexEntry[];
}

export interface BuildPackageInput {
  manifest: LevelManifest;
  scene: unknown; // LevelScene, kept opaque to avoid circular import
  /** Pre-fetched asset blobs. Caller is responsible for resolving from
   *  data URLs / IndexedDB / network before calling. */
  assets: Array<{
    kind: Exclude<PackageKind, "manifest" | "scene" | "index">;
    blob: Blob;
    originalName?: string;
  }>;
  packageVersion: string;
}

export interface BuildPackageResult {
  bytes: Uint8Array;
  sha256: string;
  index: PackageIndex;
}

/** Build a .lvlpkg zip in-memory. */
export async function buildLevelPackage(input: BuildPackageInput): Promise<BuildPackageResult> {
  const files: Record<string, Uint8Array> = {};
  const entries: PackageIndexEntry[] = [];
  const seen = new Map<string, PackageIndexEntry>();

  for (const a of input.assets) {
    const bytes = new Uint8Array(await a.blob.arrayBuffer());
    const sha = await sha256Hex(bytes);
    const ext = extFromMime(a.blob.type) || extFromName(a.originalName) || "bin";
    const dir = dirForKind(a.kind);
    const path = `${dir}/${sha}.${ext}`;
    if (seen.has(sha)) continue;
    files[path] = bytes;
    const entry: PackageIndexEntry = {
      kind: a.kind,
      path,
      sha,
      mime: a.blob.type || "application/octet-stream",
      size: bytes.byteLength,
      originalName: a.originalName,
    };
    entries.push(entry);
    seen.set(sha, entry);
  }

  const packageId = crypto.randomUUID();
  const index: PackageIndex = {
    packageId,
    packageVersion: input.packageVersion,
    levelId: input.manifest.levelId,
    builtAt: new Date().toISOString(),
    entries,
  };

  files["manifest.json"] = strToU8(JSON.stringify(input.manifest, null, 2));
  files["scene.json"] = strToU8(JSON.stringify(input.scene));
  files["index.json"] = strToU8(JSON.stringify(index, null, 2));

  const bytes = zipSync(files, { level: 6 });
  const sha256 = await sha256Hex(bytes);
  return { bytes, sha256, index };
}

export interface OpenedPackage {
  manifest: LevelManifest;
  scene: unknown;
  index: PackageIndex;
  files: PkgFile[];
}

/** Parse a .lvlpkg zip into manifest, scene, and pkgfs-ready PkgFile list. */
export async function openLevelPackage(bytes: Uint8Array): Promise<OpenedPackage> {
  const entries = unzipSync(bytes);

  const manifestBytes = entries["manifest.json"];
  const sceneBytes = entries["scene.json"];
  const indexBytes = entries["index.json"];
  if (!manifestBytes || !sceneBytes || !indexBytes) {
    throw new Error("Invalid level package: missing manifest.json / scene.json / index.json");
  }

  const manifest = JSON.parse(strFromU8(manifestBytes)) as LevelManifest;
  const scene = JSON.parse(strFromU8(sceneBytes));
  const index = JSON.parse(strFromU8(indexBytes)) as PackageIndex;

  const byPath = new Map(index.entries.map((e) => [e.path, e]));
  const files: PkgFile[] = [];
  for (const [path, data] of Object.entries(entries)) {
    if (path === "manifest.json" || path === "scene.json" || path === "index.json") continue;
    const e = byPath.get(path);
    files.push({
      path,
      mime: e?.mime ?? "application/octet-stream",
      size: data.byteLength,
      blob: new Blob([new Uint8Array(data)], { type: e?.mime ?? "application/octet-stream" }),
    });
  }

  return { manifest, scene, index, files };
}

/**
 * Open a package and immediately mount its files into pkgfs. Returns the
 * pkgfs base URL `pkgfs://<levelId>/` so callers can rewrite scene asset
 * URLs by stripping it and looking up the entry by sha.
 */
export async function openAndMountPackage(bytes: Uint8Array): Promise<OpenedPackage & { pkgfsBase: string }> {
  const opened = await openLevelPackage(bytes);
  mountPackage(opened.manifest.levelId, opened.files);
  return { ...opened, pkgfsBase: makePkgfsUrl(opened.manifest.levelId, "") };
}

/* ---------------------------- helpers ---------------------------- */

function dirForKind(kind: PackageKind): string {
  switch (kind) {
    case "model": return "models";
    case "terrain": return "terrain";
    case "character": return "characters";
    case "animation": return "animations";
    case "texture": return "textures";
    case "hdri": return "hdri";
    case "audio": return "audio";
    case "script": return "scripts";
    default: return "misc";
  }
}

function extFromMime(mime: string): string | null {
  if (!mime) return null;
  if (mime.includes("gltf-binary")) return "glb";
  if (mime.includes("gltf+json")) return "gltf";
  if (mime === "model/obj") return "obj";
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/ktx2") return "ktx2";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/wav" || mime === "audio/x-wav") return "wav";
  if (mime === "application/json") return "json";
  if (mime === "text/plain") return "txt";
  return null;
}

function extFromName(name?: string): string | null {
  if (!name) return null;
  const i = name.lastIndexOf(".");
  return i < 0 ? null : name.slice(i + 1).toLowerCase();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}