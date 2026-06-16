import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, Radio, ExternalLink, Camera, Video, Square, Download } from "lucide-react";
import type { TrafficCamera } from "./IntelligencePanel";

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
}

export default function CameraViewerPopup({ camera, onClose }: Props) {
  const [tick, setTick] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const drawRafRef = useRef<number | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRate = Math.max(camera.refreshRate ?? 10, 1);
  const stream = isStream(camera.streamUrl);

  useEffect(() => {
    if (stream) return;
    const id = setInterval(() => setTick(t => t + 1), refreshRate * 1000);
    return () => clearInterval(id);
  }, [stream, refreshRate]);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }, []);

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

  const startRecording = async () => {
    if (recording) return;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const w = stream ? (videoRef.current?.videoWidth || 1280) : (imgRef.current?.naturalWidth || 1280);
    const h = stream ? (videoRef.current?.videoHeight || 720) : (imgRef.current?.naturalHeight || 720);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      try {
        if (stream && videoRef.current && videoRef.current.readyState >= 2) {
          ctx.drawImage(videoRef.current, 0, 0, w, h);
        } else if (imgRef.current && imgRef.current.complete) {
          ctx.drawImage(imgRef.current, 0, 0, w, h);
        }
      } catch {}
      drawRafRef.current = requestAnimationFrame(draw);
    };
    draw();

    const fps = stream ? 30 : 5;
    const mediaStream = (canvas as any).captureStream(fps) as MediaStream;
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const rec = new MediaRecorder(mediaStream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      downloadBlob(blob, `${sanitize(camera.name)}_${Date.now()}.webm`);
      if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      recTimerRef.current = null;
      setRecordSecs(0);
    };
    recorderRef.current = rec;
    rec.start(1000);
    setRecording(true);
    setRecordSecs(0);
    recTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <div className="absolute top-20 right-4 z-40 w-[calc(100vw-2rem)] max-w-[460px]">
      <div className="rounded-2xl bg-black/85 backdrop-blur-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
          <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{camera.name}</p>
            <p className="text-[9px] text-white/50 font-mono uppercase">{camera.source} · {stream ? "live stream" : `${refreshRate}s refresh`}</p>
          </div>
          <a href={camera.streamUrl || camera.imageUrl} target="_blank" rel="noreferrer"
             className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06]">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={() => setTick(t => t + 1)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06]">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="aspect-video bg-black relative">
          {stream && camera.streamUrl ? (
            <video ref={videoRef} src={camera.streamUrl} autoPlay muted loop playsInline crossOrigin="anonymous" className="w-full h-full object-contain" />
          ) : (
            <img ref={imgRef} key={tick} src={imageSrc} alt={camera.name} crossOrigin="anonymous" className="w-full h-full object-contain" />
          )}
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-500/80 text-white text-[10px] font-bold tracking-wider">LIVE</div>
          {recording && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 border border-red-500/50 text-red-300 text-[10px] font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              REC {String(Math.floor(recordSecs / 60)).padStart(2, "0")}:{String(recordSecs % 60).padStart(2, "0")}
            </div>
          )}
        </div>
        {/* Capture controls */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06] bg-black/40">
          <button
            onClick={takeScreenshot}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/[0.06] text-white/80 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition"
            title="Save current frame as PNG"
          >
            <Camera className="w-3 h-3" /> Screenshot
          </button>
          {!recording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition"
              title="Record live feed to WebM"
            >
              <Video className="w-3 h-3" /> Record
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-500/30 text-red-200 border border-red-500/50 hover:bg-red-500/40 transition"
              title="Stop & download"
            >
              <Square className="w-3 h-3" /> Stop & Save
            </button>
          )}
          <div className="flex-1" />
          <a
            href={camera.imageUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition"
            title="Open source feed"
          >
            <Download className="w-3 h-3" /> Source
          </a>
        </div>
      </div>
    </div>
  );
}