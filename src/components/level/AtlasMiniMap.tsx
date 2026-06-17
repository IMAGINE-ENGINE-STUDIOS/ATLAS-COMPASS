import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMapsLoader";

interface AtlasMiniMapProps {
  lat: number;
  lng: number;
  /** Called when the user drags the marker. */
  onChange?: (lat: number, lng: number) => void;
  /** Optional Tailwind classes for the container. */
  className?: string;
  /** Map zoom — defaults to 14 for a neighbourhood-level view. */
  zoom?: number;
  /** Disable user interaction (pan / drag). */
  readOnly?: boolean;
}

/**
 * Interactive Atlas-style satellite mini-map with a draggable pin.
 * Uses the Google Maps JS API loaded via the Lovable connector browser key.
 */
export default function AtlasMiniMap({
  lat, lng, onChange, className, zoom = 14, readOnly,
}: AtlasMiniMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false;
    if (!hostRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    loadGoogleMaps().then((google) => {
      if (cancelled || !hostRef.current) return;
      const map = new google.maps.Map(hostRef.current, {
        center: { lat, lng },
        zoom,
        mapTypeId: "hybrid",
        disableDefaultUI: true,
        zoomControl: !readOnly,
        gestureHandling: readOnly ? "none" : "greedy",
        clickableIcons: false,
        tilt: 0,
      });
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        draggable: !readOnly,
        title: "Drag to reposition",
      });
      marker.addListener("dragend", () => {
        const p = marker.getPosition();
        if (!p) return;
        onChangeRef.current?.(p.lat(), p.lng());
      });
      if (!readOnly) {
        map.addListener("click", (e: any) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          onChangeRef.current?.(e.latLng.lat(), e.latLng.lng());
        });
      }
      mapRef.current = map;
      markerRef.current = marker;
    }).catch((err) => console.warn("[AtlasMiniMap] failed to load", err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker / map centred when controlled coordinates change externally.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = { lat, lng };
    markerRef.current.setPosition(pos);
    mapRef.current.panTo(pos);
  }, [lat, lng]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className={`${className ?? ""} grid place-items-center bg-white/5 text-[11px] text-muted-foreground`}>
        Enter valid coordinates
      </div>
    );
  }
  return <div ref={hostRef} className={className} />;
}