import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { CameraSnapshot } from '@/hooks/useCameraTimeline';
import { Play, Pause, SkipBack, SkipForward, FastForward, Rewind, Calendar } from 'lucide-react';

interface CameraVideoPlayerProps {
  snapshots: CameraSnapshot[];
  onClose: () => void;
  fullscreen?: boolean;
  /** If provided, plays back actual video instead of frame-by-frame */
  videoUrl?: string;
  videoDurationMs?: number;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8, 16];

export const CameraVideoPlayer = ({ snapshots, onClose, fullscreen = false, videoUrl, videoDurationMs }: CameraVideoPlayerProps) => {
  // ─── Video mode (real video playback) ───
  if (videoUrl) {
    return (
      <VideoPlayback
        videoUrl={videoUrl}
        durationMs={videoDurationMs}
        onClose={onClose}
        fullscreen={fullscreen}
      />
    );
  }

  // ─── Frame mode (snapshot-based playback) ───
  return (
    <FramePlayback
      snapshots={snapshots}
      onClose={onClose}
      fullscreen={fullscreen}
    />
  );
};

// ═══════════════════════════════════════════
// Real Video Playback Component
// ═══════════════════════════════════════════
const VideoPlayback = ({
  videoUrl,
  durationMs,
  onClose,
  fullscreen,
}: {
  videoUrl: string;
  durationMs?: number;
  onClose: () => void;
  fullscreen: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((durationMs || 0) / 1000);
  const [playbackRate, setPlaybackRate] = useState(1);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const changeSpeed = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex flex-col ${fullscreen ? 'h-full' : ''}`}>
      {/* Video display */}
      <div className={`relative bg-black ${fullscreen ? 'flex-1 min-h-0' : 'aspect-video'}`}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          playsInline
        />
        {/* Time overlay */}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] text-white/80 font-mono">
          {formatTime(currentTime)}
        </div>
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] text-white/80 font-mono">
          {formatTime(duration)}
        </div>
        {isPlaying && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-green-500/90 text-[10px] text-white font-bold flex items-center gap-1">
            <Play className="w-2.5 h-2.5 fill-white" /> {playbackRate}x
          </div>
        )}
      </div>

      {/* Scrubber */}
      <div className="px-3 pt-2">
        <Slider
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={[currentTime]}
          onValueChange={([v]) => seek(v)}
          className="w-full [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-green-500 [&_[role=slider]]:bg-green-500 [&_.relative]:h-1.5 [&_.absolute]:bg-green-500/80"
        />
      </div>

      {/* Time labels */}
      <div className="flex items-center justify-between px-3 mt-1 text-[9px] text-white/40 font-mono">
        <span>{formatTime(0)}</span>
        <span>VIDEO</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-1 px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => seek(Math.max(0, currentTime - 10))} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 rounded-lg">
          <Rewind className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seek(Math.max(0, currentTime - 5))} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 rounded-lg">
          <SkipBack className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={togglePlay} className="h-9 w-9 text-white hover:bg-white/10 rounded-full border border-white/20">
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seek(Math.min(duration, currentTime + 5))} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 rounded-lg">
          <SkipForward className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seek(Math.min(duration, currentTime + 10))} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 rounded-lg">
          <FastForward className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Speed selector */}
      <div className="flex items-center justify-center gap-1.5 px-3 pb-2">
        {[0.25, 0.5, 1, 2, 4, 8, 16].map((s) => (
          <button
            key={s}
            onClick={() => changeSpeed(s)}
            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${
              playbackRate === s
                ? 'bg-green-500/30 text-green-400 border border-green-500/40'
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Close button */}
      {!fullscreen && (
        <div className="px-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="w-full h-7 text-[10px] text-white/50 hover:text-white hover:bg-white/10 border border-white/10"
          >
            Back to Live Feed
          </Button>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════
// Frame-by-Frame Playback Component (original)
// ═══════════════════════════════════════════
const FramePlayback = ({
  snapshots,
  onClose,
  fullscreen,
}: {
  snapshots: CameraSnapshot[];
  onClose: () => void;
  fullscreen: boolean;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(Math.max(snapshots.length - 1, 0));
  const frameRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const lastFrameTime = useRef(0);

  const currentSpeed = SPEED_OPTIONS[speed];
  const frameDelay = Math.max(6, 100 / currentSpeed);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => {
    setIsPlaying(false);
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
  }, []);

  const seekTo = useCallback((frame: number) => {
    const clamped = Math.max(startFrame, Math.min(endFrame, frame));
    frameRef.current = clamped;
    setCurrentFrame(clamped);
  }, [startFrame, endFrame]);

  useEffect(() => {
    if (!isPlaying || snapshots.length < 2) return;
    const tick = (time: number) => {
      if (time - lastFrameTime.current >= frameDelay) {
        lastFrameTime.current = time;
        const next = frameRef.current + 1;
        if (next > endFrame) { frameRef.current = startFrame; setCurrentFrame(startFrame); }
        else { frameRef.current = next; setCurrentFrame(next); }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, snapshots.length, frameDelay, startFrame, endFrame]);

  useEffect(() => { setEndFrame(Math.max(snapshots.length - 1, 0)); }, [snapshots.length]);

  const currentSnap = snapshots[currentFrame];
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString();
  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

  if (snapshots.length < 2) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-white/50 text-xs">Need at least 2 snapshots to play video.</p>
        <p className="text-white/30 text-[10px] mt-1">Recording… {snapshots.length}/2 frames</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${fullscreen ? 'h-full' : ''}`}>
      <div className={`relative bg-black ${fullscreen ? 'flex-1 min-h-0' : 'aspect-video'}`}>
        {currentSnap && <img src={currentSnap.url} alt={`Frame ${currentFrame}`} className="w-full h-full object-contain" />}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] text-white/80 font-mono">
          {currentSnap ? formatTime(currentSnap.timestamp) : '--'}
        </div>
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] text-white/80 font-mono">
          {currentFrame + 1}/{snapshots.length}
        </div>
        {isPlaying && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-green-500/90 text-[10px] text-white font-bold flex items-center gap-1">
            <Play className="w-2.5 h-2.5 fill-white" /> {currentSpeed}x
          </div>
        )}
      </div>

      <div className="px-3 pt-2">
        <Slider min={0} max={Math.max(snapshots.length - 1, 0)} step={1} value={[currentFrame]}
          onValueChange={([v]) => { pause(); seekTo(v); }}
          className="w-full [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-green-500 [&_[role=slider]]:bg-green-500 [&_.relative]:h-1.5 [&_.absolute]:bg-green-500/80" />
      </div>

      <div className="flex items-center justify-between px-3 mt-1 text-[9px] text-white/40 font-mono">
        <span>{snapshots[0] ? formatTime(snapshots[0].timestamp) : '--'}</span>
        <span>{currentSnap ? formatDate(currentSnap.timestamp) : '--'}</span>
        <span>{snapshots[snapshots.length - 1] ? formatTime(snapshots[snapshots.length - 1].timestamp) : '--'}</span>
      </div>

      <div className="flex items-center justify-center gap-1 px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => setSpeed(s => Math.max(0, s - 1))} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 rounded-lg" disabled={speed === 0}>
          <Rewind className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seekTo(currentFrame - 10)} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 rounded-lg">
          <SkipBack className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => isPlaying ? pause() : play()} className="h-9 w-9 text-white hover:bg-white/10 rounded-full border border-white/20">
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seekTo(currentFrame + 10)} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 rounded-lg">
          <SkipForward className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setSpeed(s => Math.min(SPEED_OPTIONS.length - 1, s + 1))} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 rounded-lg" disabled={speed === SPEED_OPTIONS.length - 1}>
          <FastForward className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex items-center justify-center gap-1.5 px-3 pb-2">
        {SPEED_OPTIONS.map((s, i) => (
          <button key={s} onClick={() => setSpeed(i)}
            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${i === speed ? 'bg-green-500/30 text-green-400 border border-green-500/40' : 'text-white/30 hover:text-white/60'}`}>
            {s}x
          </button>
        ))}
      </div>

      <div className="px-3 pb-2 space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-white/40">
          <Calendar className="w-3 h-3" /><span>Playback range</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-white/40 w-8">From</span>
          <Slider min={0} max={Math.max(snapshots.length - 2, 0)} step={1} value={[startFrame]}
            onValueChange={([v]) => { setStartFrame(v); if (currentFrame < v) seekTo(v); }}
            className="flex-1 [&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5 [&_[role=slider]]:border-blue-500 [&_[role=slider]]:bg-blue-500 [&_.relative]:h-0.5" />
          <span className="text-white/50 font-mono w-16 text-right">{snapshots[startFrame] ? formatTime(snapshots[startFrame].timestamp) : '--'}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-white/40 w-8">To</span>
          <Slider min={Math.min(startFrame + 1, snapshots.length - 1)} max={Math.max(snapshots.length - 1, 0)} step={1} value={[endFrame]}
            onValueChange={([v]) => { setEndFrame(v); if (currentFrame > v) seekTo(v); }}
            className="flex-1 [&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5 [&_[role=slider]]:border-blue-500 [&_[role=slider]]:bg-blue-500 [&_.relative]:h-0.5" />
          <span className="text-white/50 font-mono w-16 text-right">{snapshots[endFrame] ? formatTime(snapshots[endFrame].timestamp) : '--'}</span>
        </div>
      </div>

      {!fullscreen && (
        <div className="px-3 pb-2">
          <Button variant="ghost" size="sm" onClick={onClose}
            className="w-full h-7 text-[10px] text-white/50 hover:text-white hover:bg-white/10 border border-white/10">
            Back to Live Feed
          </Button>
        </div>
      )}
    </div>
  );
};
