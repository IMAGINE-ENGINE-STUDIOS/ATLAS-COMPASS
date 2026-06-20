/**
 * CameraHistoryTimeline
 * ---------------------
 * A bottom-of-screen HUD that records the Atlas camera state over time
 * and lets the user scrub through history to instantly jump to any past
 * pose. It also exposes a "Save view" control so users can author their
 * own named camera shortcuts (persisted in localStorage) and recall
 * them in one click.
 *
 * Why a ring buffer in memory: the history is a moment-to-moment debug
 * / "undo for the camera" tool — it should never grow unbounded and
 * doesn't need to outlive the page. Named bookmarks survive reloads.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Cartesian3, Matrix4, type Viewer } from "cesium";
import { Bookmark, History, Plus, Trash2, X } from "lucide-react";

interface CamState {
  t: number;
  px: number; py: number; pz: number;
  dx: number; dy: number; dz: number;
  ux: number; uy: number; uz: number;
}

interface NamedView extends CamState {
  id: string;
  name: string;
}

const MAX_HISTORY = 60;
const SAMPLE_MS = 1200;
const MIN_MOVE_M = 5;        // meters; ignore micro jitter
const BOOKMARKS_KEY = "atlas.cameraBookmarks.v1";

function snapshot(viewer: Viewer): CamState {
  const p = viewer.camera.positionWC;
  const d = viewer.camera.directionWC;
  const u = viewer.camera.upWC;
  return {
    t: Date.now(),
    px: p.x, py: p.y, pz: p.z,
    dx: d.x, dy: d.y, dz: d.z,
    ux: u.x, uy: u.y, uz: u.z,
  };
}

function distSq(a: CamState, b: CamState) {
  const dx = a.px - b.px, dy = a.py - b.py, dz = a.pz - b.pz;
  return dx * dx + dy * dy + dz * dz;
}

function applyState(viewer: Viewer, s: CamState) {
  try {
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.camera.setView({
      destination: new Cartesian3(s.px, s.py, s.pz),
      orientation: {
        direction: new Cartesian3(s.dx, s.dy, s.dz),
        up: new Cartesian3(s.ux, s.uy, s.uz),
      },
    });
  } catch {}
}

function fmtTime(t: number) {
  const d = new Date(t);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function CameraHistoryTimeline({
  viewerRef,
  isLoaded,
  embedded = false,
}: {
  viewerRef: React.MutableRefObject<Viewer | null>;
  isLoaded: boolean;
  /** When true, renders only the panel body (no fixed wrapper / toggle pill)
   *  so it can be embedded inside another menu/dropdown. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<CamState[]>([]);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [bookmarks, setBookmarks] = useState<NamedView[]>(() => {
    try {
      const raw = localStorage.getItem(BOOKMARKS_KEY);
      return raw ? (JSON.parse(raw) as NamedView[]) : [];
    } catch {
      return [];
    }
  });
  const [namingOpen, setNamingOpen] = useState(false);
  const [draftName, setDraftName] = useState("");

  // Persist bookmarks
  useEffect(() => {
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)); } catch {}
  }, [bookmarks]);

  // Sample camera periodically; only record when it actually moved.
  const lastRef = useRef<CamState | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    const id = window.setInterval(() => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      const s = snapshot(v);
      const last = lastRef.current;
      if (last && distSq(s, last) < MIN_MOVE_M * MIN_MOVE_M) return;
      lastRef.current = s;
      setHistory((prev) => {
        const next = prev.concat(s);
        if (next.length > MAX_HISTORY) next.splice(0, next.length - MAX_HISTORY);
        return next;
      });
    }, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [isLoaded, viewerRef]);

  // When the user scrubs we apply that pose live. Releasing the slider
  // leaves the camera there (no auto-reset — that's the "instantly
  // apply" behavior they asked for).
  const onScrub = (idx: number) => {
    setScrubIdx(idx);
    const s = history[idx];
    const v = viewerRef.current;
    if (s && v && !v.isDestroyed()) applyState(v, s);
  };

  const saveCurrent = () => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    setDraftName(`View ${bookmarks.length + 1}`);
    setNamingOpen(true);
  };

  const commitBookmark = () => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    const s = snapshot(v);
    const name = draftName.trim() || `View ${bookmarks.length + 1}`;
    setBookmarks((prev) => [
      ...prev,
      { ...s, id: `bm-${Date.now()}`, name },
    ]);
    setNamingOpen(false);
    setDraftName("");
  };

  const sliderMax = Math.max(0, history.length - 1);
  const liveIdx = scrubIdx ?? sliderMax;
  const liveState = history[liveIdx];

  const sortedBookmarks = useMemo(
    () => [...bookmarks].sort((a, b) => b.t - a.t),
    [bookmarks],
  );

  if (!isLoaded) return null;

  // --- Embedded mode: just the body, no toggle pill, no fixed positioning.
  if (embedded) {
    return (
      <div className="text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/80">
            <History className="w-3.5 h-3.5 text-emerald-300" />
            Camera Timeline
            <span className="text-[10px] font-normal text-white/40 tabular-nums">
              {history.length}/{MAX_HISTORY}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={saveCurrent}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-medium border border-emerald-500/30"
              title="Save current camera as a bookmark"
            >
              <Plus className="w-3 h-3" /> Save
            </button>
            <button
              onClick={() => setHistory([])}
              className="px-2 py-1 rounded-md hover:bg-white/10 text-white/60 text-[11px]"
              title="Clear history"
            >
              Clear
            </button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          value={liveIdx}
          disabled={history.length === 0}
          onChange={(e) => onScrub(Number(e.target.value))}
          onMouseUp={() => setScrubIdx(null)}
          onTouchEnd={() => setScrubIdx(null)}
          className="w-full accent-emerald-400 disabled:opacity-30"
        />
        <div className="flex items-center justify-between text-[10px] text-white/50 tabular-nums mt-0.5">
          <span>{history[0] ? fmtTime(history[0].t) : "—"}</span>
          <span className="text-emerald-300">
            {liveState ? fmtTime(liveState.t) : "no samples yet"}
          </span>
          <span>{history[sliderMax] ? fmtTime(history[sliderMax].t) : "—"}</span>
        </div>
        {sortedBookmarks.length > 0 && (
          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50 mb-1.5">
              <Bookmark className="w-3 h-3" /> Saved views
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {sortedBookmarks.map((b) => (
                <div
                  key={b.id}
                  className="group flex items-center gap-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 pl-2 pr-1 py-0.5 text-[11px]"
                >
                  <button
                    onClick={() => {
                      const v = viewerRef.current;
                      if (v && !v.isDestroyed()) applyState(v, b);
                    }}
                    className="text-white/90 hover:text-emerald-300"
                  >
                    {b.name}
                  </button>
                  <button
                    onClick={() =>
                      setBookmarks((prev) => prev.filter((x) => x.id !== b.id))
                    }
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/30 text-white/50 hover:text-red-200"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {namingOpen && (
          <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitBookmark();
                if (e.key === "Escape") setNamingOpen(false);
              }}
              placeholder="Name this view"
              className="flex-1 bg-black/40 border border-white/15 rounded-md px-2 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400/60"
            />
            <button
              onClick={commitBookmark}
              className="px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white text-[11px] font-semibold"
            >
              Save
            </button>
            <button
              onClick={() => setNamingOpen(false)}
              className="px-2 py-1 rounded-md hover:bg-white/10 text-white/60 text-[11px]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Toggle pill */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-4 z-[60] flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900/80 hover:bg-slate-800/90 text-white text-xs font-medium border border-white/15 backdrop-blur-md shadow-lg pointer-events-auto"
          title="Camera history"
        >
          <History className="w-4 h-4 text-emerald-300" />
          Camera
          {history.length > 0 && (
            <span className="text-[10px] text-white/60 tabular-nums">
              {history.length}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[min(720px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-slate-900/85 backdrop-blur-xl shadow-2xl text-white p-3 pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
              <History className="w-4 h-4 text-emerald-300" />
              Camera Timeline
              <span className="text-[10px] font-normal text-white/40 tabular-nums">
                {history.length}/{MAX_HISTORY}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={saveCurrent}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-medium border border-emerald-500/30"
                title="Save current camera as a bookmark"
              >
                <Plus className="w-3 h-3" /> Save view
              </button>
              <button
                onClick={() => setHistory([])}
                className="px-2 py-1 rounded-md hover:bg-white/10 text-white/60 text-[11px]"
                title="Clear history"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-white/10 text-white/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrubber */}
          <div className="px-1">
            <input
              type="range"
              min={0}
              max={sliderMax}
              value={liveIdx}
              disabled={history.length === 0}
              onChange={(e) => onScrub(Number(e.target.value))}
              onMouseUp={() => setScrubIdx(null)}
              onTouchEnd={() => setScrubIdx(null)}
              className="w-full accent-emerald-400 disabled:opacity-30"
            />
            <div className="flex items-center justify-between text-[10px] text-white/50 tabular-nums mt-0.5">
              <span>{history[0] ? fmtTime(history[0].t) : "—"}</span>
              <span className="text-emerald-300">
                {liveState ? fmtTime(liveState.t) : "no samples yet"}
              </span>
              <span>{history[sliderMax] ? fmtTime(history[sliderMax].t) : "—"}</span>
            </div>
          </div>

          {/* Bookmarks */}
          {sortedBookmarks.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50 mb-1.5">
                <Bookmark className="w-3 h-3" /> Saved views
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {sortedBookmarks.map((b) => (
                  <div
                    key={b.id}
                    className="group flex items-center gap-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 pl-2 pr-1 py-0.5 text-[11px]"
                  >
                    <button
                      onClick={() => {
                        const v = viewerRef.current;
                        if (v && !v.isDestroyed()) applyState(v, b);
                      }}
                      className="text-white/90 hover:text-emerald-300"
                      title={`Apply ${b.name}`}
                    >
                      {b.name}
                    </button>
                    <button
                      onClick={() =>
                        setBookmarks((prev) => prev.filter((x) => x.id !== b.id))
                      }
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/30 text-white/50 hover:text-red-200"
                      title="Delete bookmark"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {namingOpen && (
            <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBookmark();
                  if (e.key === "Escape") setNamingOpen(false);
                }}
                placeholder="Name this view"
                className="flex-1 bg-black/40 border border-white/15 rounded-md px-2 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400/60"
              />
              <button
                onClick={commitBookmark}
                className="px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white text-[11px] font-semibold"
              >
                Save
              </button>
              <button
                onClick={() => setNamingOpen(false)}
                className="px-2 py-1 rounded-md hover:bg-white/10 text-white/60 text-[11px]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}