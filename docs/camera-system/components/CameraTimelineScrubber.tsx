import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { CameraSnapshot } from '@/hooks/useCameraTimeline';
import { Clock, Trash2, Film, Radio } from 'lucide-react';

interface CameraTimelineScrubberProps {
  snapshots: CameraSnapshot[];
  currentIndex: number;
  onSeek: (index: number) => void;
  onBackToLive: () => void;
  isScrubbingTimeline: boolean;
  onOpenVideoPlayer: () => void;
  onClearHistory: () => void;
}

export const CameraTimelineScrubber = ({
  snapshots,
  currentIndex,
  onSeek,
  onBackToLive,
  isScrubbingTimeline,
  onOpenVideoPlayer,
  onClearHistory,
}: CameraTimelineScrubberProps) => {
  if (snapshots.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-white/40">
        <Clock className="w-3 h-3" />
        <span>Capturing frames… waiting for first snapshot</span>
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse ml-auto" />
      </div>
    );
  }

  const firstTime = snapshots[0]?.timestamp;
  const lastTime = snapshots[snapshots.length - 1]?.timestamp;
  const currentSnap = snapshots[currentIndex];
  const duration = lastTime - firstTime;

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString();
  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  return (
    <div className="space-y-1.5">
      {/* Timeline scrubber */}
      <div className="px-3 pt-2">
        <Slider
          min={0}
          max={Math.max(snapshots.length - 1, 0)}
          step={1}
          value={[currentIndex]}
          onValueChange={([v]) => onSeek(v)}
          className="w-full [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-red-500 [&_[role=slider]]:bg-red-500 [&_.relative]:h-1 [&_.absolute]:bg-red-500/80"
        />
      </div>

      {/* Time info */}
      <div className="flex items-center justify-between px-3 text-[10px] text-white/50 font-mono">
        <span>{currentSnap ? formatTime(currentSnap.timestamp) : '--'}</span>
        <span>{snapshots.length} frames · {formatDuration(duration)}</span>
        <span>{formatTime(lastTime)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 px-3 pb-1.5">
        {/* Back to Live */}
        {isScrubbingTimeline && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToLive}
            className="h-6 text-[10px] px-2 rounded text-green-400 hover:text-green-300 hover:bg-green-500/20"
          >
            <Radio className="w-2.5 h-2.5 mr-1" />
            Back to Live
          </Button>
        )}
        {/* Video Playback */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenVideoPlayer}
          className="h-6 text-[10px] px-2 rounded text-white/50 hover:text-white/80"
        >
          <Film className="w-2.5 h-2.5 mr-1" />
          Playback
        </Button>
        {/* Clear */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearHistory}
          className="h-6 text-[10px] px-2 rounded text-white/40 hover:text-white/80 ml-auto"
        >
          <Trash2 className="w-2.5 h-2.5 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
};