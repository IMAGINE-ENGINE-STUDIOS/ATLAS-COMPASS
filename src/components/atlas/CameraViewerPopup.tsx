import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, Radio, Camera, Video, Square, Pause, Play, Film } from "lucide-react";
import type { TrafficCamera } from "./IntelligencePanel";
import { cameraRecordings, formatDuration, type CameraRecording } from "@/lib/camera-recordings";
import InlineVideoPlayer from "./InlineVideoPlayer";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-camera-image`;

function isStream(url?: string) {
  if (!url) return false;
  return /\.(mjpg|mjpeg|mp4|m3u8)(\?|$)|mjpeg|mjpg|\.stream|hls|playlist\.m3u/i.test(url);
}

function sanitize(name: string) {
  return name.replace(/[^a-z0-9\-_]+/gi, "_").slice(0, 60);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  camera: TrafficCamera;
  onClose: () => void;
  onOpenGallery?: () => void;
}

export default function CameraViewerPopup({ camera, onClose, onOpenGallery }: Props) {
  const [tick, setTick] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const refreshRate = Math.max(camera.refreshRate ?? 10, 1);
  const stream = isStream(camera.streamUrl);

  // Subscribe to the global recordings manager so this popup reflects the
  // active recording (if any) for this camera, even when started elsewhere.
  const [active, setActive] = useState<CameraRecording | undefined>(
    () => cameraRecordings.activeForCamera(camera.id),
  );
  const [galleryCount, setGalleryCount] = useState<number>(cameraRecordings.count());
  useEffect(() => {
    const sync = () => {
      setActive(cameraRecordings.activeForCamera(camera.id));
      setGalleryCount(cameraRecordings.count());
    };
    sync();
    return cameraRecordings.subscribe(sync);
  }, [camera.id]);

  useEffect(() => {
    if (stream) return;
    const id = setInterval(() => setTick(t => t + 1), refreshRate * 1000);
    return () => clearInterval(id);
  }, [stream, refreshRate]);

  const imageSrc = `${PROXY_URL}?url=${encodeURIComponent(camera.imageUrl)}&_t=${tick}`;

  const takeScreenshot = async () => {
    const canvas = document.createElement("canvas");
    let w = 1280, h = 720;
    if (stream && videoRef.current) {
      w = videoRef.current.videoWidth || 1280;
      h = videoRef.current.videoHeight || 720;
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0, w, h);
    } else if (imgRef.current && imgRef.current.complete) {
      w = imgRef.current.naturalWidth || 1280;
      h = imgRef.current.naturalHeight || 720;
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")?.drawImage(imgRef.current, 0, 0, w, h);
    } else {
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${sanitize(camera.name)}_${Date.now()}.png`);
    }, "image/png");
  };

  const startRecording = () => {
    cameraRecordings.start({
      id: camera.id,
      name: camera.name,
      source: camera.source,
      imageUrl: camera.imageUrl,
      streamUrl: camera.streamUrl,
      refreshRate: camera.refreshRate,
    });
  };
  const pauseRecording  = () => active && cameraRecordings.pause(active.id);
  const resumeRecording = () => active && cameraRecordings.resume(active.id);
  const stopRecording   = () => active && cameraRecordings.stop(active.id);

  return (
    <div className="absolute top-20 right-4 z-40 w-[calc(100vw-2rem)] max-w-[391px]">
      <div className="rounded-xl bg-black/85 backdrop-blur-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/[0.06]">
          <div className="w-6 h-6 rounded-md bg-red-500/20 flex items-center justify-center">
            <Radio className="w-2.5.5 h-2.5.5 text-red-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{camera.name}</p>
            <p className="text-[9px] text-white/50 font-mono uppercase">{camera.source} · {stream ? "live stream" : `${refreshRate}s refresh`}</p>
          </div>
          {onOpenGallery && (
            <button
              onClick={onOpenGallery}
              title={`Recordings gallery (${galleryCount})`}
              className="relative p-1 rounded-md text-white/70 hover:text-white hover:bg-white/[0.06]"
            >
              <Film className="w-2.5.5 h-2.5.5" />
              {galleryCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[11.9px] h-[11.9px] px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                  {galleryCount}
                </span>
              )}
            </button>
          )}
          <button onClick={() => setTick(t => t + 1)} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/[0.06]">
            <RefreshCw className="w-2.5.5 h-2.5.5" />
          </button>
          <button onClick={onClose} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/[0.06]">
            <X className="w-2.5.5 h-2.5.5" />
          </button>
        </div>
        <div className="aspect-video bg-black relative">
          {stream && camera.streamUrl ? (
            <InlineVideoPlayer
              src={camera.streamUrl}
              className="w-full h-full"
              videoRef={(el) => { videoRef.current = el; }}
            />
          ) : (
            <img ref={imgRef} key={tick} src={imageSrc} alt={camera.name} crossOrigin="anonymous" className="w-full h-full object-contain" />
          )}
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full bg-red-500/80 text-white text-[10px] font-bold tracking-wider">LIVE</div>
          {active && (
            <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/70 border text-[10px] font-mono flex items-center gap-1 ${
              active.state === "recording" ? "border-red-500/50 text-red-300" : "border-amber-400/50 text-amber-300"
            }`}>
              <span className={`w-1 h-1 rounded-full ${active.state === "recording" ? "bg-red-500 animate-pulse" : "bg-amber-400"}`} />
              {active.state === "recording" ? "REC" : "PAUSED"} {formatDuration(active.durationSec)}
            </div>
          )}
        </div>
        {/* Capture controls */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-t border-white/[0.06] bg-black/40">
          <button
            onClick={takeScreenshot}
            className="flex items-center gap-1 px-1.5.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/[0.06] text-white/80 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition"
            title="Save current frame as PNG"
          >
            <Camera className="w-2.5 h-2.5" /> Screenshot
          </button>
          {!active && (
            <button
              onClick={startRecording}
              className="flex items-center gap-1 px-1.5.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition"
              title="Record live feed (unlimited duration)"
            >
              <Video className="w-2.5 h-2.5" /> Record
            </button>
          )}
          {active?.state === "recording" && (
            <>
              <button
                onClick={pauseRecording}
                className="flex items-center gap-1 px-1.5.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition"
                title="Pause"
              >
                <Pause className="w-2.5 h-2.5" /> Pause
              </button>
              <button
                onClick={stopRecording}
                className="flex items-center gap-1 px-1.5.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/30 text-red-200 border border-red-500/50 hover:bg-red-500/40 transition"
                title="Stop & save"
              >
                <Square className="w-2.5 h-2.5" /> Stop
              </button>
            </>
          )}
          {active?.state === "paused" && (
            <>
              <button
                onClick={resumeRecording}
                className="flex items-center gap-1 px-1.5.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition"
                title="Resume"
              >
                <Play className="w-2.5 h-2.5" /> Resume
              </button>
              <button
                onClick={stopRecording}
                className="flex items-center gap-1 px-1.5.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/30 text-red-200 border border-red-500/50 hover:bg-red-500/40 transition"
                title="Stop & save"
              >
                <Square className="w-2.5 h-2.5" /> Stop
              </button>
            </>
          )}
          <div className="flex-1" />
          {onOpenGallery && (
            <button
              onClick={onOpenGallery}
              className="flex items-center gap-1 px-1.5.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition"
              title="Open recordings gallery"
            >
              <Film className="w-2.5 h-2.5" /> Gallery
            </button>
          )}
        </div>
      </div>
    </div>
  );
}