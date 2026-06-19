import { useEffect, useRef, useState } from "react";
import { Maximize2, Settings } from "lucide-react";
import Hls from "hls.js";

interface QualityLevel {
  id: number; // -1 = auto
  label: string;
  height?: number;
}

interface Props {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  crossOrigin?: "anonymous" | "use-credentials" | "";
  videoRef?: (el: HTMLVideoElement | null) => void;
}

/**
 * Inline HTML5 video player with native controls, a fullscreen toggle, and a
 * quality-picker when the source is an adaptive HLS (.m3u8) stream. Playback
 * always happens inside the page — never via an external link.
 */
export default function InlineVideoPlayer({
  src, poster, className, autoPlay = true, muted = true, loop = true,
  crossOrigin = "anonymous", videoRef,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const vRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const video = vRef.current;
    if (!video) return;
    if (videoRef) videoRef(video);

    const isHls = /\.m3u8(\?|$)/i.test(src);
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const lvls: QualityLevel[] = hls.levels.map((l, i) => ({
          id: i,
          label: l.height ? `${l.height}p` : `${Math.round((l.bitrate || 0) / 1000)}k`,
          height: l.height,
        }));
        setLevels(lvls);
        setCurrentLevel(-1);
        if (autoPlay) video.play().catch(() => {});
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
        setLevels([]);
      };
    }
    // Native playback (Safari HLS, MP4, MJPEG)
    video.src = src;
    if (autoPlay) video.play().catch(() => {});
    return () => {
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch {}
    };
  }, [src, autoPlay, videoRef]);

  const setLevel = (id: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = id;
    setCurrentLevel(id);
    setMenuOpen(false);
  };

  const enterFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    const anyEl = el as any;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el.requestFullscreen) await el.requestFullscreen();
      else if (anyEl.webkitRequestFullscreen) anyEl.webkitRequestFullscreen();
      else if ((vRef.current as any)?.webkitEnterFullscreen) (vRef.current as any).webkitEnterFullscreen();
    } catch {}
  };

  return (
    <div ref={wrapRef} className={`relative bg-black ${className ?? ""}`}>
      <video
        ref={vRef}
        poster={poster}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline
        controls
        controlsList="nodownload noremoteplayback"
        crossOrigin={crossOrigin || undefined}
        className="w-full h-full object-contain bg-black"
      />
      <div className="absolute bottom-12 right-2 flex items-center gap-1">
        {levels.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(v => !v)}
              title="Quality"
              className="px-1.5 py-1 rounded-sm bg-black/70 hover:bg-black/90 border border-white/15 text-[10px] font-bold text-white flex items-center gap-1"
            >
              <Settings className="w-2.5 h-2.5" />
              {currentLevel === -1 ? "AUTO" : (levels.find(l => l.id === currentLevel)?.label ?? "")}
            </button>
            {menuOpen && (
              <div className="absolute bottom-full right-0 mb-1 min-w-[74.8px] rounded-md bg-black/95 border border-white/15 shadow-xl overflow-hidden">
                <button
                  onClick={() => setLevel(-1)}
                  className={`w-full text-left px-2 py-1 text-[10px] font-mono hover:bg-white/10 ${currentLevel === -1 ? "text-emerald-300" : "text-white/80"}`}
                >
                  AUTO
                </button>
                {levels.slice().sort((a, b) => (b.height ?? 0) - (a.height ?? 0)).map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLevel(l.id)}
                    className={`w-full text-left px-2 py-1 text-[10px] font-mono hover:bg-white/10 ${currentLevel === l.id ? "text-emerald-300" : "text-white/80"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={enterFullscreen}
          title="Fullscreen"
          className="p-1 rounded-sm bg-black/70 hover:bg-black/90 border border-white/15 text-white"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}