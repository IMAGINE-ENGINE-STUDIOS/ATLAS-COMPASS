import { useEffect, useState } from "react";
import { X, Pause, Play, Square, Download, Trash2, Film, Radio } from "lucide-react";
import { cameraRecordings, formatBytes, formatDuration, type CameraRecording } from "@/lib/camera-recordings";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CameraRecordingsGallery({ open, onClose }: Props) {
  const [items, setItems] = useState<CameraRecording[]>(cameraRecordings.list());

  useEffect(() => {
    const unsub = cameraRecordings.subscribe(() => setItems(cameraRecordings.list()));
    return unsub;
  }, []);

  if (!open) return null;

  return (
    <div className="absolute top-20 left-4 z-40 w-[calc(100vw-2rem)] max-w-[420px]">
      <div className="rounded-2xl bg-black/85 backdrop-blur-2xl border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-7rem)]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
          <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <Film className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">Recordings</p>
            <p className="text-[9px] text-white/50 font-mono uppercase">
              {items.length} clip{items.length === 1 ? "" : "s"} ·{" "}
              {items.filter(i => i.state !== "finished").length} active
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
          {items.length === 0 && (
            <div className="text-center py-8 text-xs text-white/60">
              No recordings yet. Open a camera and tap <span className="text-red-300 font-bold">Record</span>.
            </div>
          )}
          {items.map(rec => (
            <div key={rec.id} className="flex items-center gap-2 p-2 rounded-xl bg-black/40 border border-white/[0.04]">
              <div className="w-14 h-10 rounded-lg overflow-hidden bg-black/70 border border-white/[0.06] shrink-0 relative">
                {rec.thumbnail ? (
                  <img src={rec.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Radio className="w-3 h-3 text-red-400 animate-pulse" />
                  </div>
                )}
                {rec.state === "recording" && (
                  <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {rec.state === "paused" && (
                  <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{rec.cameraName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] uppercase font-mono text-red-300/80">{rec.source}</span>
                  <span className="text-[9px] text-white/50 font-mono">{formatDuration(rec.durationSec)}</span>
                  <span className="text-[9px] text-white/40 font-mono">{formatBytes(rec.sizeBytes)}</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {rec.state === "recording" && (
                  <button onClick={() => cameraRecordings.pause(rec.id)} title="Pause"
                    className="p-1.5 rounded-lg text-amber-300 hover:bg-white/[0.06] transition">
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                )}
                {rec.state === "paused" && (
                  <button onClick={() => cameraRecordings.resume(rec.id)} title="Resume"
                    className="p-1.5 rounded-lg text-emerald-300 hover:bg-white/[0.06] transition">
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
                {rec.state !== "finished" && (
                  <button onClick={() => cameraRecordings.stop(rec.id)} title="Stop & save"
                    className="p-1.5 rounded-lg text-red-300 hover:bg-white/[0.06] transition">
                    <Square className="w-3.5 h-3.5" />
                  </button>
                )}
                {rec.state === "finished" && rec.blobUrl && (
                  <a href={rec.blobUrl} target="_blank" rel="noreferrer" title="Watch"
                    className="p-1.5 rounded-lg text-white/80 hover:bg-white/[0.06] transition">
                    <Play className="w-3.5 h-3.5" />
                  </a>
                )}
                {rec.state === "finished" && (
                  <button onClick={() => cameraRecordings.download(rec.id)} title="Download"
                    className="p-1.5 rounded-lg text-white/80 hover:bg-white/[0.06] transition">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => cameraRecordings.remove(rec.id)} title="Delete"
                  className="p-1.5 rounded-lg text-white/50 hover:text-red-300 hover:bg-white/[0.06] transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}