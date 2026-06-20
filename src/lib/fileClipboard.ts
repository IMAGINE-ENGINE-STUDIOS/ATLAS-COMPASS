// Universal in-memory + localStorage clipboard for "files".
// A file is any user-owned entity that can be copied / pasted / shared:
// scene objects, dynamic-object payloads, levels, rigs, geometries, etc.

export type FileClipboardKind =
  | "scene-object"
  | "dynamic-object"
  | "level"
  | "rig-save"
  | "geometry"
  | "terrain"
  | "generic";

export interface FileClipboardEntry {
  kind: FileClipboardKind;
  name: string;
  /** Arbitrary JSON payload — interpreted by whichever surface handles paste. */
  payload: unknown;
  /** Optional source identifier (db id, local id, etc.). */
  sourceId?: string;
  /** Optional source table when this came from cloud. */
  sourceTable?: string;
  /** Optional preview image (data URL or storage URL). */
  thumbnailUrl?: string;
  cutMode?: boolean;
  copiedAt: number;
}

const LS_KEY = "lovable.fileClipboard.v1";
const LISTENERS = new Set<(entry: FileClipboardEntry | null) => void>();
let current: FileClipboardEntry | null = null;

function load(): FileClipboardEntry | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FileClipboardEntry;
  } catch {
    return null;
  }
}

function persist(e: FileClipboardEntry | null) {
  try {
    if (e) localStorage.setItem(LS_KEY, JSON.stringify(e));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  current = load();
  window.addEventListener("storage", (ev) => {
    if (ev.key === LS_KEY) {
      current = load();
      LISTENERS.forEach((l) => l(current));
    }
  });
}

export function getClipboard(): FileClipboardEntry | null {
  return current;
}

export function setClipboard(entry: FileClipboardEntry | null) {
  current = entry;
  persist(entry);
  LISTENERS.forEach((l) => l(entry));
}

export function copyToClipboard(e: Omit<FileClipboardEntry, "copiedAt" | "cutMode">) {
  setClipboard({ ...e, cutMode: false, copiedAt: Date.now() });
}

export function cutToClipboard(e: Omit<FileClipboardEntry, "copiedAt" | "cutMode">) {
  setClipboard({ ...e, cutMode: true, copiedAt: Date.now() });
}

export function clearClipboard() {
  setClipboard(null);
}

export function subscribeClipboard(fn: (e: FileClipboardEntry | null) => void) {
  LISTENERS.add(fn);
  return () => LISTENERS.delete(fn);
}