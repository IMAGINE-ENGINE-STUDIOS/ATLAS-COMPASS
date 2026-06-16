import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CameraSnapshot {
  url: string;
  timestamp: number;
  blob?: Blob;
  persisted?: boolean;
}

interface UseCameraTimelineOptions {
  imageUrl: string;
  proxyUrl: string | null;
  refreshRate: number;
  isStream: boolean;
  cameraId?: string;
  maxSnapshots?: number;
  videoElement?: HTMLVideoElement | null;
}

/**
 * Records camera snapshots over time for timeline playback.
 * Supports both image-based cameras and video streams (via canvas capture).
 */
export const useCameraTimeline = ({
  imageUrl,
  proxyUrl,
  refreshRate,
  isStream,
  cameraId,
  maxSnapshots = 600,
  videoElement,
}: UseCameraTimelineOptions) => {
  const [snapshots, setSnapshots] = useState<CameraSnapshot[]>([]);
  const [isRecording, setIsRecording] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const snapshotsRef = useRef<CameraSnapshot[]>([]);
  const recordingRef = useRef(true);
  const persistQueueRef = useRef<CameraSnapshot[]>([]);
  const persistingRef = useRef(false);
  const persistCountRef = useRef(0);
  const cameraIdRef = useRef(cameraId);

  cameraIdRef.current = cameraId;

  const persistSnapshot = useCallback(async (snap: CameraSnapshot) => {
    if (!cameraId || !snap.blob) return;
    try {
      const date = new Date(snap.timestamp);
      const dateStr = date.toISOString().split('T')[0];
      const path = `${cameraId}/${dateStr}/${snap.timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('camera-snapshots')
        .upload(path, snap.blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) return;

      await supabase.from('camera_snapshots' as any).insert({
        camera_id: cameraId,
        captured_at: date.toISOString(),
        storage_path: path,
        file_size: snap.blob.size,
      });

      snap.persisted = true;
    } catch {}
  }, [cameraId]);

  const processPersistQueue = useCallback(async () => {
    if (persistingRef.current || persistQueueRef.current.length === 0) return;
    persistingRef.current = true;
    while (persistQueueRef.current.length > 0) {
      const snap = persistQueueRef.current.shift();
      if (snap) await persistSnapshot(snap);
    }
    persistingRef.current = false;
  }, [persistSnapshot]);

  const addSnapshot = useCallback((snap: CameraSnapshot) => {
    const updated = [...snapshotsRef.current, snap];
    if (updated.length > maxSnapshots) {
      const removed = updated.shift();
      if (removed && !removed.persisted) URL.revokeObjectURL(removed.url);
    }
    snapshotsRef.current = updated;
    setSnapshots([...updated]);

    persistCountRef.current++;
    if (cameraIdRef.current && persistCountRef.current % 3 === 0) {
      persistQueueRef.current.push(snap);
      processPersistQueue();
    }
  }, [maxSnapshots, processPersistQueue]);

  // Capture from video element (for streams)
  const captureVideoFrame = useCallback(() => {
    if (!videoElement || !recordingRef.current || !cameraIdRef.current) return;
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoElement, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob || cameraIdRef.current !== cameraIdRef.current) return;
        const objectUrl = URL.createObjectURL(blob);
        addSnapshot({ url: objectUrl, timestamp: Date.now(), blob });
      }, 'image/jpeg', 0.85);
    } catch {}
  }, [videoElement, addSnapshot]);

  // Capture from image URL (for static cameras)
  const captureSnapshot = useCallback(async () => {
    if (!proxyUrl || isStream || !recordingRef.current || !cameraIdRef.current) return;

    const capturedForCamera = cameraIdRef.current;
    const ts = Date.now();
    const url = `${proxyUrl}?url=${encodeURIComponent(imageUrl)}&_t=${ts}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      if (cameraIdRef.current !== capturedForCamera) return;

      const blob = await resp.blob();
      if (cameraIdRef.current !== capturedForCamera) return;

      const objectUrl = URL.createObjectURL(blob);
      addSnapshot({ url: objectUrl, timestamp: ts, blob });
    } catch {}
  }, [imageUrl, proxyUrl, isStream, addSnapshot]);

  // Load historical snapshots
  const loadHistory = useCallback(async (fromTime: Date, toTime: Date): Promise<CameraSnapshot[]> => {
    if (!cameraId) return [];
    setIsLoadingHistory(true);
    try {
      const { data: records, error } = await supabase
        .from('camera_snapshots' as any)
        .select('*')
        .eq('camera_id', cameraId)
        .gte('captured_at', fromTime.toISOString())
        .lte('captured_at', toTime.toISOString())
        .order('captured_at', { ascending: true })
        .limit(500);

      if (error || !records || records.length === 0) {
        setIsLoadingHistory(false);
        return [];
      }

      const historicalSnaps: CameraSnapshot[] = [];
      for (const record of records as any[]) {
        const { data: urlData } = supabase.storage
          .from('camera-snapshots')
          .getPublicUrl(record.storage_path);
        if (urlData?.publicUrl) {
          historicalSnaps.push({
            url: urlData.publicUrl,
            timestamp: new Date(record.captured_at).getTime(),
            persisted: true,
          });
        }
      }
      setIsLoadingHistory(false);
      return historicalSnaps;
    } catch {
      setIsLoadingHistory(false);
      return [];
    }
  }, [cameraId]);

  const loadHistoryRange = useCallback(async (fromTime: Date, toTime: Date) => {
    const historicalSnaps = await loadHistory(fromTime, toTime);
    if (historicalSnaps.length === 0) return 0;
    const existingTs = new Set(snapshotsRef.current.map(s => s.timestamp));
    const newSnaps = historicalSnaps.filter(s => !existingTs.has(s.timestamp));
    const merged = [...newSnaps, ...snapshotsRef.current].sort((a, b) => a.timestamp - b.timestamp);
    while (merged.length > maxSnapshots * 2) {
      const removed = merged.shift();
      if (removed && !removed.persisted) URL.revokeObjectURL(removed.url);
    }
    snapshotsRef.current = merged;
    setSnapshots([...merged]);
    return newSnaps.length;
  }, [loadHistory, maxSnapshots]);

  const getHistoryStats = useCallback(async (): Promise<{ total: number; oldestAt: string | null }> => {
    if (!cameraId) return { total: 0, oldestAt: null };
    try {
      const { data } = await supabase
        .from('camera_snapshots' as any)
        .select('captured_at')
        .eq('camera_id', cameraId)
        .order('captured_at', { ascending: true })
        .limit(1);

      const { count } = await supabase
        .from('camera_snapshots' as any)
        .select('*', { count: 'exact', head: true })
        .eq('camera_id', cameraId);

      return {
        total: count || 0,
        oldestAt: (data && data.length > 0) ? (data[0] as any).captured_at : null,
      };
    } catch {
      return { total: 0, oldestAt: null };
    }
  }, [cameraId]);

  // Reset snapshots when camera changes
  useEffect(() => {
    snapshotsRef.current.forEach(s => {
      if (!s.persisted) URL.revokeObjectURL(s.url);
    });
    snapshotsRef.current = [];
    persistQueueRef.current = [];
    persistCountRef.current = 0;
    setSnapshots([]);
  }, [cameraId]);

  // Auto-record: image-based cameras
  useEffect(() => {
    if (isStream) return;
    captureSnapshot();
    const interval = setInterval(captureSnapshot, refreshRate * 1000);
    return () => clearInterval(interval);
  }, [captureSnapshot, refreshRate, isStream]);

  // Auto-record: video stream cameras (capture frame every refreshRate or 5s)
  useEffect(() => {
    if (!isStream || !videoElement) return;
    const captureRate = Math.max(refreshRate, 5) * 1000;
    // Wait a bit for video to start playing
    const startDelay = setTimeout(() => {
      captureVideoFrame();
    }, 2000);
    const interval = setInterval(captureVideoFrame, captureRate);
    return () => {
      clearTimeout(startDelay);
      clearInterval(interval);
    };
  }, [isStream, videoElement, captureVideoFrame, refreshRate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      snapshotsRef.current.forEach(s => {
        if (!s.persisted) URL.revokeObjectURL(s.url);
      });
      snapshotsRef.current = [];
    };
  }, []);

  const toggleRecording = useCallback(() => {
    recordingRef.current = !recordingRef.current;
    setIsRecording(recordingRef.current);
  }, []);

  const clearHistory = useCallback(() => {
    snapshotsRef.current.forEach(s => {
      if (!s.persisted) URL.revokeObjectURL(s.url);
    });
    snapshotsRef.current = [];
    setSnapshots([]);
  }, []);

  return {
    snapshots,
    isRecording,
    isLoadingHistory,
    toggleRecording,
    clearHistory,
    snapshotCount: snapshots.length,
    loadHistoryRange,
    getHistoryStats,
  };
};
