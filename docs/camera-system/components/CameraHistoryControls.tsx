import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { History, Clock, Loader2, ChevronDown, ChevronUp, Database } from 'lucide-react';

interface HistoryStats {
  total: number;
  oldestAt: string | null;
}

interface CameraHistoryControlsProps {
  onLoadRange: (from: Date, to: Date) => Promise<number>;
  getHistoryStats: () => Promise<HistoryStats>;
  isLoading: boolean;
  snapshotCount: number;
}

const TIME_PRESETS = [
  { label: '5 min ago', minutes: 5 },
  { label: '15 min ago', minutes: 15 },
  { label: '30 min ago', minutes: 30 },
  { label: '1 hour ago', minutes: 60 },
  { label: '2 hours ago', minutes: 120 },
  { label: '5 hours ago', minutes: 300 },
  { label: '12 hours ago', minutes: 720 },
  { label: '24 hours ago', minutes: 1440 },
];

export const CameraHistoryControls = ({
  onLoadRange,
  getHistoryStats,
  isLoading,
  snapshotCount,
}: CameraHistoryControlsProps) => {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<HistoryStats>({ total: 0, oldestAt: null });
  const [loadingPreset, setLoadingPreset] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Load stats on mount
  useEffect(() => {
    getHistoryStats().then(setStats);
  }, [getHistoryStats, snapshotCount]);

  const handleLoadPreset = useCallback(async (minutes: number) => {
    setLoadingPreset(minutes);
    setLastResult(null);

    const to = new Date();
    const from = new Date(Date.now() - minutes * 60 * 1000);

    try {
      const loaded = await onLoadRange(from, to);
      if (loaded > 0) {
        setLastResult(`Loaded ${loaded} frames from the last ${minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}`);
      } else {
        setLastResult(`No stored frames found for this time range`);
      }
      // Refresh stats
      getHistoryStats().then(setStats);
    } catch {
      setLastResult('Failed to load history');
    }

    setLoadingPreset(null);
  }, [onLoadRange, getHistoryStats]);

  return (
    <div className="border-t border-white/10">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-white/50 hover:text-white/70 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <History className="w-3 h-3" />
          <span>Time Travel</span>
          {stats.total > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px] font-mono">
              {stats.total} stored
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {/* Stats */}
          {stats.total > 0 && stats.oldestAt && (
            <div className="flex items-center gap-1.5 text-[9px] text-white/30">
              <Database className="w-2.5 h-2.5" />
              <span>
                Oldest recording: {new Date(stats.oldestAt).toLocaleString()}
              </span>
            </div>
          )}

          {/* Quick time jump buttons */}
          <div className="grid grid-cols-4 gap-1">
            {TIME_PRESETS.map(({ label, minutes }) => (
              <Button
                key={minutes}
                variant="ghost"
                size="sm"
                onClick={() => handleLoadPreset(minutes)}
                disabled={isLoading || loadingPreset !== null}
                className="h-7 text-[9px] px-1.5 text-white/50 hover:text-white hover:bg-white/10 border border-white/10 rounded-lg flex items-center justify-center gap-1"
              >
                {loadingPreset === minutes ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Clock className="w-2.5 h-2.5" />
                )}
                <span className="truncate">{label}</span>
              </Button>
            ))}
          </div>

          {/* Result message */}
          {lastResult && (
            <p className={`text-[9px] text-center ${lastResult.includes('No stored') ? 'text-amber-400/70' : 'text-green-400/70'}`}>
              {lastResult}
            </p>
          )}

          {/* Info */}
          <p className="text-[8px] text-white/20 text-center">
            Snapshots are stored every ~45s while viewing a camera. History is kept for 24 hours.
          </p>
        </div>
      )}
    </div>
  );
};
