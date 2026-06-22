/**
 * AtlasScreenshotMenu
 * -------------------
 * Camera icon in the Atlas top icon bar. Click captures a high-fidelity
 * screenshot of the current Cesium view (supersampled), auto-downloads the
 * JPG, and adds it to an IndexedDB-backed gallery. A chevron opens the
 * gallery dropdown for browsing, re-downloading, or deleting past shots.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Image as ImageIcon, Trash2, X, Loader2 } from "lucide-react";
import type { Viewer } from "cesium";
import { toast } from "sonner";
import {
  captureAtlasShot,
  deleteShot,
  downloadBlob,
  listShots,
  shotFilename,
  type AtlasShot,
} from "@/lib/atlasScreenshots";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
}

export default function AtlasScreenshotMenu({ viewerRef }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<AtlasShot[]>([]);
  const [preview, setPreview] = useState<AtlasShot | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const thumbUrls = useRef<Map<string, string>>(new Map());

  const refresh = async () => {
    const list = await listShots();
    // Recycle thumbnail object URLs.
    const next = new Map<string, string>();
    for (const s of list) {
      const existing = thumbUrls.current.get(s.id);
      next.set(s.id, existing ?? URL.createObjectURL(s.thumb));
    }
    for (const [id, url] of thumbUrls.current) {
      if (!next.has(id)) URL.revokeObjectURL(url);
    }
    thumbUrls.current = next;
    setShots(list);
  };

  useEffect(() => {
    void refresh();
    return () => {
      for (const url of thumbUrls.current.values()) URL.revokeObjectURL(url);
      thumbUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  const capture = async () => {
    const viewer = viewerRef.current;
    if (!viewer || busy) return;
    setBusy(true);
    try {
      const shot = await captureAtlasShot(viewer, { supersample: 2 });
      downloadBlob(shot.jpeg, shotFilename(shot, "jpg"));
      toast.success("Atlas screenshot saved", {
        description: `${shot.width}×${shot.height} · JPG downloaded · added to gallery`,
      });
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error("Screenshot failed", { description: String((err as Error)?.message ?? err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: AtlasShot) => {
    await deleteShot(s.id);
    if (preview?.id === s.id) setPreview(null);
    await refresh();
  };

  return (
    <div ref={rootRef} className="relative flex items-center shrink-0">
      <button
        onClick={capture}
        disabled={busy}
        className={`p-1.5 sm:p-1 rounded-md transition-colors shrink-0 ${
          busy ? "text-cyan-300" : "text-white/75 hover:text-white"
        }`}
        title="Capture high-quality screenshot (JPG)"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ScreenshotIcon className="w-3.5 h-3.5" />
        )}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`p-0.5 rounded-md transition-colors shrink-0 ${
          open ? "bg-cyan-500/20 text-cyan-300" : "text-white/55 hover:text-white"
        }`}
        title="Screenshot gallery"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl text-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <ImageIcon className="w-3.5 h-3.5 text-cyan-300" /> Screenshot gallery
              <span className="text-[10px] font-mono text-white/50 ml-1">{shots.length}</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-white/10 text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2 max-h-[60vh] overflow-y-auto">
            {shots.length === 0 ? (
              <div className="text-[11px] text-white/55 px-2 py-6 text-center">
                No screenshots yet. Click the camera icon to capture the current view.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {shots.map((s) => {
                  const url = thumbUrls.current.get(s.id);
                  return (
                    <div
                      key={s.id}
                      className="group relative rounded-lg overflow-hidden border border-white/10 bg-black/40"
                    >
                      <button
                        onClick={() => setPreview(s)}
                        className="block w-full aspect-video bg-black"
                      >
                        {url && <img src={url} alt={s.label} className="w-full h-full object-cover" />}
                      </button>
                      <div className="px-1.5 py-1 text-[9px] font-mono text-white/70 flex items-center justify-between">
                        <span className="truncate">{s.width}×{s.height}</span>
                        <span className="flex items-center gap-0.5">
                          <button
                            onClick={() => downloadBlob(s.jpeg, shotFilename(s, "jpg"))}
                            className="p-0.5 rounded hover:bg-white/10"
                            title="Download JPG"
                          >
                            <Download className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => downloadBlob(s.png, shotFilename(s, "png"))}
                            className="px-0.5 rounded hover:bg-white/10 text-[8px]"
                            title="Download PNG (lossless)"
                          >
                            PNG
                          </button>
                          <button
                            onClick={() => remove(s)}
                            className="p-0.5 rounded hover:bg-red-500/30 text-red-300"
                            title="Delete"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {preview && (
        <PreviewLightbox shot={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function PreviewLightbox({ shot, onClose }: { shot: AtlasShot; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(shot.jpeg);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [shot]);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div onClick={(e) => e.stopPropagation()} className="relative max-w-[95vw] max-h-[90vh]">
        {url && (
          <img
            src={url}
            alt={shot.label}
            className="max-w-[95vw] max-h-[80vh] object-contain rounded-lg border border-white/15"
          />
        )}
        <div className="mt-2 flex items-center justify-between text-white text-xs font-mono">
          <span>{shot.label} · {shot.width}×{shot.height}</span>
          <span className="flex items-center gap-1.5">
            <button
              onClick={() => downloadBlob(shot.jpeg, shotFilename(shot, "jpg"))}
              className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
            >
              <Download className="w-3 h-3" /> JPG
            </button>
            <button
              onClick={() => downloadBlob(shot.png, shotFilename(shot, "png"))}
              className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15"
            >
              <Download className="w-3 h-3" /> PNG
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function ScreenshotIcon({ className }: { className?: string }) {
  // Custom camera glyph with a small "+" sparkle to distinguish from the
  // traffic-camera glyph already in the bar.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7h3l2-2h8l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="4" />
      <path d="M19 9.5h.01" />
    </svg>
  );
}