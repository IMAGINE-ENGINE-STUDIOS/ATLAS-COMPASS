import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TrafficCamera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  imageUrl: string;
  source: string;
  lastUpdated?: string;
  streamUrl?: string;
  refreshRate?: number;
  feedVerified?: boolean;
  feedDead?: boolean;
}

interface UseBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Fetches cameras from the persistent catalog (DB-backed).
 * Supports pagination — fetches all pages for the viewport progressively.
 * Cameras appear immediately and are never cleared during pan/zoom.
 */
export const useTrafficCameras = (
  map: mapboxgl.Map | null,
  mapReady: boolean,
  enabled: boolean
) => {
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);
  const camerasRef = useRef<TrafficCamera[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<TrafficCamera | null>(null);
  const [totalInViewport, setTotalInViewport] = useState(0);
  const selectedCameraRef = useRef<TrafficCamera | null>(null);
  const fetchTimeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastBoundsRef = useRef<UseBounds | null>(null);

  const handleSetSelectedCamera = useCallback((cam: TrafficCamera | null) => {
    selectedCameraRef.current = cam;
    setSelectedCamera(cam);
  }, []);

  const fetchCameras = useCallback(async (bounds: UseBounds) => {
    // Skip if bounds barely moved (reduced threshold for responsiveness)
    if (lastBoundsRef.current) {
      const cb = lastBoundsRef.current;
      if (
        Math.abs(cb.north - bounds.north) < 0.005 &&
        Math.abs(cb.south - bounds.south) < 0.005 &&
        Math.abs(cb.east - bounds.east) < 0.005 &&
        Math.abs(cb.west - bounds.west) < 0.005
      ) {
        return;
      }
    }

    // Abort previous fetch
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    lastBoundsRef.current = bounds;
    setIsLoading(true);
    setError(null);

    try {
      const fetchedCameras: TrafficCamera[] = [];
      let cursor: number | undefined = 0;
      let hasMore = true;
      const PAGE_SIZE = 1000;

      while (hasMore && !controller.signal.aborted) {
        const { data, error: fnError } = await supabase.functions.invoke('traffic-cameras', {
          body: { bounds, cursor, limit: PAGE_SIZE },
        });

        if (fnError) throw fnError;
        if (controller.signal.aborted) return;

        const pageCameras = (data?.cameras || []) as TrafficCamera[];
        fetchedCameras.push(...pageCameras);
        
        hasMore = data?.hasMore || false;
        cursor = data?.nextCursor;
        setTotalInViewport(data?.total || fetchedCameras.length);

        // Accumulative merge: add new cameras to existing set, never remove during fetch
        if (!controller.signal.aborted) {
          const prev = camerasRef.current;
          const existingIds = new Set(prev.map(c => c.id));
          const newCameras = fetchedCameras.filter(c => !existingIds.has(c.id));
          if (newCameras.length > 0) {
            const merged = [...prev, ...newCameras];
            camerasRef.current = merged;
            setCameras(merged);
          }
        }
      }

      // After full fetch completes, do a clean replace with all viewport cameras
      // but keep any cameras from outside viewport that user might pan back to
      if (!controller.signal.aborted) {
        const fetchedIds = new Set(fetchedCameras.map(c => c.id));
        const outsideViewport = camerasRef.current.filter(c => !fetchedIds.has(c.id));
        const final = [...fetchedCameras, ...outsideViewport];
        camerasRef.current = final;
        setCameras(final);
        setIsLoading(false);
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        console.error('Traffic cameras fetch error:', err);
        setError(err.message || 'Failed to fetch cameras');
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!map || !enabled) {
      setCameras([]);
      setTotalInViewport(0);
      return;
    }

    if (!mapReady) return;

    const handleMoveEnd = () => {
      if (selectedCameraRef.current) return;

      const b = map.getBounds();
      if (!b) return;

      const bounds: UseBounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };

      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = window.setTimeout(() => fetchCameras(bounds), 300);
    };

    handleMoveEnd();

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [map, mapReady, enabled, fetchCameras]);

  return {
    cameras,
    isLoading,
    error,
    selectedCamera,
    setSelectedCamera: handleSetSelectedCamera,
    totalInViewport,
  };
};
