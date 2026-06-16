import { X, RefreshCw, Camera, ExternalLink, MapPin, Maximize2, Minimize2, Radio, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrafficCamera } from '@/hooks/useTrafficCameras';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useCameraTimeline } from '@/hooks/useCameraTimeline';
import { CameraTimelineScrubber } from './CameraTimelineScrubber';
import { CameraVideoPlayer } from './CameraVideoPlayer';
import { useRecordingSessions, DurationMode } from '@/stores/useRecordingSessions';
import { useAuth } from '@/contexts/AuthContext';
import { useVideoRecorder } from '@/hooks/useVideoRecorder';
import { toast } from 'sonner';

interface TrafficCameraPopupProps {
  camera: TrafficCamera;
  onClose: () => void;
}

function isStreamUrl(url?: string): boolean {
  if (!url) return false;
  // Only match genuinely streaming formats — NOT FL511 GetVideo (returns single frames)
  if (/\.(mjpg|mjpeg|mp4|m3u8)(\?|$)/i.test(url)) return true;
  if (/mjpeg|mjpg|\.stream|hls|playlist\.m3u/i.test(url)) return true;
  return false;
}

function isMjpegStream(url?: string): boolean {
  if (!url) return false;
  if (/\.(mjpg|mjpeg)(\?|$)/i.test(url)) return true;
  if (/mjpeg|mjpg/i.test(url)) return true;
  return false;
}

export const TrafficCameraPopup = ({ camera, onClose }: TrafficCameraPopupProps) => {
  const { user } = useAuth();
  const [imageKey, setImageKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [isScrubbingTimeline, setIsScrubbingTimeline] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<DurationMode>('indefinite');
  const videoRef = useRef<HTMLVideoElement>(null);

  const hasStream = isStreamUrl(camera.streamUrl) && !streamFailed;
  const isMjpeg = isMjpegStream(camera.streamUrl) && !streamFailed;
  const refreshRate = Math.max(camera.refreshRate || 10, 1);

  const { startSession, stopSession, hasActiveSessionForCamera, getActiveSessionForCamera, setSessionVideo } = useRecordingSessions();
  const activeSession = getActiveSessionForCamera(camera.id);
  const isSessionRecording = hasActiveSessionForCamera(camera.id);

  const handleVideoRecordingComplete = useCallback((blob: Blob, durationMs: number) => {
    const session = getActiveSessionForCamera(camera.id);
    if (session) {
      setSessionVideo(session.id, blob, durationMs);
    }
  }, [camera.id, getActiveSessionForCamera, setSessionVideo]);

  const videoRecorder = useVideoRecorder({
    onRecordingComplete: handleVideoRecordingComplete,
  });

  useEffect(() => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zqiihhmdsdgwdcwmryym';
    const fnUrl = `https://${projectId}.supabase.co/functions/v1/proxy-camera-image`;
    setProxyUrl(fnUrl);
    setImageError(false);
    setStreamFailed(false);
    setImageKey(0);
    setIsScrubbingTimeline(false);
    setShowVideoPlayer(false);
    setVideoReady(false);
  }, [camera.id]);

  // Timeline hook - pass videoElement for stream capture
  const timeline = useCameraTimeline({
    imageUrl: camera.imageUrl,
    proxyUrl,
    refreshRate,
    isStream: hasStream,
    cameraId: camera.id,
    videoElement: hasStream && !isMjpeg && videoReady ? videoRef.current : null,
  });

  const handleToggleSession = () => {
    if (isSessionRecording && activeSession) {
      if (hasStream && videoRecorder.isRecording) {
        videoRecorder.stopRecording();
      }
      stopSession(activeSession.id);
      setShowDurationPicker(false);
      toast.success('Recording stopped');
    } else if (proxyUrl) {
      if (!user?.id) {
        toast.error('Please sign in to record camera feeds');
        return;
      }
      // Show duration picker instead of starting immediately
      setShowDurationPicker(true);
    }
  };

  const handleStartRecordingWithDuration = (duration: DurationMode) => {
    if (!proxyUrl) return;
    setSelectedDuration(duration);
    setShowDurationPicker(false);
    startSession({
      cameraId: camera.id,
      cameraName: camera.name,
      proxyUrl,
      imageUrl: camera.imageUrl,
      refreshRate,
      userId: user?.id,
      isStream: hasStream,
      existingSnapshots: hasStream ? [] : timeline.snapshots,
      durationMode: duration,
    });
    // For stream cameras, use MediaRecorder for proper video recording
    if (hasStream && videoRef.current && videoReady) {
      setTimeout(() => {
        if (videoRef.current) videoRecorder.startRecording(videoRef.current);
      }, 500);
    }
    toast.success(`Recording started — frames captured every ${refreshRate}s on the server. Track progress in Recordings.`);
  };

  const durationOptions: { value: DurationMode; label: string }[] = [
    { value: '1h', label: '1 Hour' },
    { value: '6h', label: '6 Hours' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: 'indefinite', label: 'Indefinite' },
  ];

  // Auto-refresh for live image view (not streams)
  useEffect(() => {
    if (hasStream || isScrubbingTimeline) return;
    console.log(`[CCTV] Starting auto-refresh for ${camera.name} every ${refreshRate}s`);
    const interval = setInterval(() => {
      setImageKey(k => {
        const next = k + 1;
        console.log(`[CCTV] Refreshing frame #${next} for ${camera.name}`);
        return next;
      });
      setLastRefreshTime(new Date());
      setImageError(false);
    }, refreshRate * 1000);
    return () => clearInterval(interval);
  }, [refreshRate, hasStream, isScrubbingTimeline, camera.name]);

  // Keep timeline index at latest when not scrubbing
  useEffect(() => {
    if (!isScrubbingTimeline && timeline.snapshots.length > 0) {
      setTimelineIndex(timeline.snapshots.length - 1);
    }
  }, [isScrubbingTimeline, timeline.snapshots.length]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setImageKey(k => k + 1);
    setLastRefreshTime(new Date());
    setImageError(false);
    if (videoRef.current) videoRef.current.load();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleVideoReady = useCallback(() => {
    setVideoReady(true);
  }, []);

  const imageUrl = proxyUrl
    ? `${proxyUrl}?url=${encodeURIComponent(camera.imageUrl)}&_k=${camera.id}_${imageKey}&_t=${Date.now()}`
    : `${camera.imageUrl}${camera.imageUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;

  const renderFeed = () => {
    if (isScrubbingTimeline && timeline.snapshots.length > 0) {
      const snap = timeline.snapshots[timelineIndex];
      return snap ? (
        <img src={snap.url} alt={`Snapshot ${timelineIndex}`} className="w-full h-full object-contain" />
      ) : null;
    }

    if (imageError) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center">
            <Camera className="w-10 h-10 text-white/30 mx-auto mb-2" />
            <p className="text-white/50 text-sm">Camera feed unavailable</p>
            <Button variant="ghost" size="sm" onClick={handleRefresh} className="mt-2 text-white/60">
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        </div>
      );
    }

    if (hasStream && isMjpeg && camera.streamUrl) {
      return <img src={camera.streamUrl} alt={camera.name} className="w-full h-full object-contain" onError={() => {
        console.warn(`[CCTV] MJPEG stream failed for ${camera.name}, falling back to image mode`);
        setStreamFailed(true);
      }} />;
    }

    if (hasStream && camera.streamUrl) {
      return (
        <video
          ref={videoRef}
          src={camera.streamUrl}
          autoPlay muted loop playsInline
          className="w-full h-full object-contain"
          onError={() => {
            console.warn(`[CCTV] Video stream failed for ${camera.name}, falling back to image mode`);
            setStreamFailed(true);
          }}
          onLoadedData={handleVideoReady}
          onPlaying={handleVideoReady}
          crossOrigin="anonymous"
        />
      );
    }

    return <img key={imageKey} src={imageUrl} alt={camera.name} className="w-full h-full object-contain" onError={() => setImageError(true)} />;
  };

  return (
    <div className={cn(
      "transition-all duration-300 translate-x-0 opacity-100",
      isFullscreen
        ? "fixed inset-0 z-[10001]"
        : "absolute right-2 top-2 bottom-2 z-30 w-[420px] max-w-[90vw]"
    )}>
      <div className={cn(
        "h-full backdrop-blur-3xl bg-black/70 border border-white/20 shadow-2xl flex flex-col",
        isFullscreen ? "rounded-none border-0 bg-black" : "rounded-2xl overflow-hidden"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between border-b border-white/10 flex-shrink-0",
          isFullscreen ? "p-4" : "p-3"
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              "rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0",
              isFullscreen ? "w-10 h-10" : "w-8 h-8"
            )}>
              <Camera className={cn(isFullscreen ? "w-5 h-5" : "w-4 h-4", "text-red-400")} />
            </div>
            <div className="min-w-0">
              <span className={cn(
                "font-medium text-white truncate block",
                isFullscreen ? "text-base" : "text-sm"
              )}>{camera.name}</span>
              <span className={cn(isFullscreen ? "text-xs" : "text-[10px]", "text-white/50")}>{camera.source}</span>
            </div>
          </div>
          <div className={cn("flex items-center flex-shrink-0", isFullscreen ? "gap-2" : "gap-1")}>
            {/* Record to Studio button — available for ALL camera types */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleSession}
              className={cn(
                "rounded-lg relative flex items-center justify-center",
                isFullscreen ? "h-10 w-10" : "h-7 w-7",
                isSessionRecording
                  ? 'bg-red-500/20 hover:bg-red-500/30'
                  : 'hover:bg-white/10'
              )}
              title={isSessionRecording ? "Stop recording" : "Record to Studio"}
            >
              {isSessionRecording ? (
                <>
                  <span className={cn(
                    "bg-red-500 rounded-sm",
                    isFullscreen ? "w-4 h-4" : "w-3 h-3"
                  )} />
                  <span className="absolute inset-0 rounded-lg border-2 border-red-500 animate-pulse" />
                </>
              ) : (
                <span className={cn(
                  "bg-red-500 rounded-full",
                  isFullscreen ? "w-5 h-5" : "w-3.5 h-3.5"
                )} />
              )}
            </Button>
            {/* Duration picker dropdown */}
            {showDurationPicker && (
              <div className="absolute top-full right-0 mt-1 z-50 w-[160px] rounded-lg backdrop-blur-xl bg-black/90 border border-white/20 shadow-2xl overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-white/10">
                  <span className="text-[10px] text-white/60 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Recording Duration
                  </span>
                </div>
                {durationOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleStartRecordingWithDuration(opt.value)}
                    className="w-full text-left px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowDurationPicker(false)}
                  className="w-full text-left px-3 py-1.5 text-[10px] text-white/40 hover:bg-white/10 border-t border-white/10"
                >
                  Cancel
                </button>
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={() => setIsFullscreen(!isFullscreen)} className={cn(
              "text-white/60 hover:text-white hover:bg-white/10 rounded-lg",
              isFullscreen ? "h-10 w-10" : "h-7 w-7"
            )}>
              {isFullscreen ? <Minimize2 className={cn(isFullscreen ? "w-5 h-5" : "w-3.5 h-3.5")} /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleRefresh} className={cn(
              "text-white/60 hover:text-white hover:bg-white/10 rounded-lg",
              isFullscreen ? "h-10 w-10" : "h-7 w-7"
            )}>
              <RefreshCw className={cn(isFullscreen ? "w-5 h-5" : "w-3.5 h-3.5", isRefreshing && 'animate-spin')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className={cn(
                "rounded-lg",
                isFullscreen
                  ? "h-12 w-12 bg-white/10 hover:bg-white/20 text-white"
                  : "h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
              )}
              title="Close"
            >
              <X className={cn(isFullscreen ? "w-6 h-6" : "w-3.5 h-3.5")} />
            </Button>
          </div>
        </div>

        {/* Video Player Mode (fullscreen playback) */}
        {showVideoPlayer ? (
          <ScrollArea className="flex-1 min-h-0">
            <CameraVideoPlayer
              snapshots={timeline.snapshots}
              onClose={() => setShowVideoPlayer(false)}
            />
          </ScrollArea>
        ) : (
          <>
            {/* Live Image / Stream / Timeline scrub */}
            <div className="relative flex-1 min-h-0 bg-black">
              {renderFeed()}
              {/* Mode indicator */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur"
                style={{
                  backgroundColor: isScrubbingTimeline
                    ? 'rgba(59,130,246,0.9)'
                    : hasStream ? 'rgba(34,197,94,0.9)' : 'rgba(220,38,38,0.9)'
                }}>
                {isScrubbingTimeline ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-white" />
                    <span className="text-[11px] text-white font-bold tracking-wider">SCRUBBING</span>
                  </>
                ) : hasStream ? (
                  <>
                    <Radio className="w-3 h-3 text-white animate-pulse" />
                    <span className="text-[11px] text-white font-bold tracking-wider">STREAMING</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-[11px] text-white font-bold tracking-wider">LIVE</span>
                  </>
                )}
              </div>
              {/* Refresh rate */}
              {!isScrubbingTimeline && !hasStream && (
                <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/60 backdrop-blur">
                  <span className="text-[10px] text-white/70 font-mono">{refreshRate}s refresh</span>
                </div>
              )}
              {/* Snapshot counter + session indicator — for ALL camera types */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                {isSessionRecording && (
                  <div className="px-2 py-1 rounded-full bg-red-500/80 backdrop-blur flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] text-white font-bold">STUDIO</span>
                    <span className="text-[9px] text-white/70 font-mono">{activeSession?.snapshots.length || 0}</span>
                  </div>
                )}
                {timeline.snapshotCount > 0 && (
                  <div className="px-2 py-1 rounded-full bg-black/60 backdrop-blur">
                    <span className="text-[10px] text-white/50 font-mono">{timeline.snapshotCount} frames</span>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline Scrubber — for ALL camera types */}
            <div className="flex-shrink-0 border-t border-white/10">
              <CameraTimelineScrubber
                snapshots={timeline.snapshots}
                currentIndex={timelineIndex}
                onSeek={(i) => {
                  setTimelineIndex(i);
                  setIsScrubbingTimeline(true);
                }}
                onBackToLive={() => setIsScrubbingTimeline(false)}
                isScrubbingTimeline={isScrubbingTimeline}
                onOpenVideoPlayer={() => setShowVideoPlayer(true)}
                onClearHistory={timeline.clearHistory}
              />
            </div>
          </>
        )}

        {/* Metadata Panel */}
        <div className="flex-shrink-0 border-t border-white/10">
          <ScrollArea className="max-h-[140px]">
            <div className="p-3 space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <MapPin className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white/80 font-medium">Location</p>
                  <p className="text-white/50 font-mono text-[11px]">{camera.lat.toFixed(6)}, {camera.lng.toFixed(6)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] border-white/20 text-white/60 bg-white/5">
                  {camera.source}
                </Badge>
                {hasStream ? (
                  <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 bg-green-500/10">Live stream</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400 bg-red-500/10">{refreshRate}s refresh</Badge>
                )}
                {timeline.snapshotCount > 0 && (
                  <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/10">
                    {timeline.snapshotCount} recorded
                  </Badge>
                )}
              </div>
              {camera.imageUrl && (
                <a href={camera.imageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition w-fit">
                  <ExternalLink className="w-3.5 h-3.5" /> Open original feed
                </a>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};
