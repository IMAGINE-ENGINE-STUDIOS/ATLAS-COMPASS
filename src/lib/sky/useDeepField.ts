/**
 * Streams telescope cutouts for the direction the camera is pointing.
 *
 * Polls the camera geometry, and whenever the view has drifted or zoomed enough
 * to invalidate the current frame it fetches a new gnomonic cutout, decodes it
 * off-screen, and only then swaps it in — so the overlay never flashes empty.
 */
import { useEffect, useRef, useState } from "react";
import type { SkySurveyId } from "./skySurveys";
import {
  DEEP_FIELD_MAX_FOV, cutoutUrl, cutoutWidth, deepFieldGeometry, needsRefresh,
  type DeepFieldFrame,
} from "./deepField";

export function useDeepField(viewer: any, survey: SkySurveyId, enabled: boolean) {
  const [frame, setFrame] = useState<DeepFieldFrame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const pending = useRef(false);
  const shown = useRef<Omit<DeepFieldFrame, "url"> | null>(null);
  const surveyRef = useRef(survey);

  useEffect(() => {
    if (surveyRef.current !== survey) {
      surveyRef.current = survey;
      shown.current = null;
      setFrame(null);
    }
  }, [survey]);

  useEffect(() => {
    if (!enabled || !viewer) {
      shown.current = null;
      setFrame(null);
      setLive(false);
      return;
    }
    let cancelled = false;

    const tick = async () => {
      const geo = deepFieldGeometry(viewer);
      if (!geo) return;
      const deep = geo.fov <= DEEP_FIELD_MAX_FOV;
      setLive(deep);
      if (!deep || pending.current || !needsRefresh(shown.current, geo)) return;

      pending.current = true;
      setLoading(true);
      const url = cutoutUrl(survey, geo.ra, geo.dec, geo.fov, cutoutWidth(geo.size));
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        await img.decode();
        if (cancelled) return;
        shown.current = geo;
        setFrame({ ...geo, url });
        setError(null);
      } catch {
        if (!cancelled) setError("Cutout unavailable for this survey here");
      } finally {
        pending.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 500);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [viewer, survey, enabled]);

  return { frame, loading, error, live };
}
