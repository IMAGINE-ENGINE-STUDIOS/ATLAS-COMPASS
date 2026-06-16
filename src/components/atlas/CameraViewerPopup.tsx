import { useEffect, useState } from "react";
import { X, RefreshCw, Radio, ExternalLink } from "lucide-react";
import type { TrafficCamera } from "./IntelligencePanel";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-camera-image`;

function isStream(url?: string) {
  if (!url) return false;
  return /\.(mjpg|mjpeg|mp4|m3u8)(\?|$)|mjpeg|mjpg|\.stream|hls|playlist\.m3u/i.test(url);
}

interface Props {
  camera: TrafficCamera;
  onClose: () => void;
}

export default function CameraViewerPopup({ camera, onClose }: Props) {
  const [tick, setTick] = useState(0);
  const refreshRate = Math.max(camera.refreshRate ?? 10, 1);
  const stream = isStream(camera.streamUrl);

  useEffect(() => {
    if (stream) return;
    const id = setInterval(() => setTick(t => t + 1), refreshRate * 1000);
    return () => clearInterval(id);
  }, [stream, refreshRate]);

  const imageSrc = `${PROXY_URL}?url=${encodeURIComponent(camera.imageUrl)}&_t=${tick}`;

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
            <video src={camera.streamUrl} autoPlay muted loop playsInline className="w-full h-full object-contain" />
          ) : (
            <img key={tick} src={imageSrc} alt={camera.name} className="w-full h-full object-contain" />
          )}
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-500/80 text-white text-[10px] font-bold tracking-wider">LIVE</div>
        </div>
      </div>
    </div>
  );
}