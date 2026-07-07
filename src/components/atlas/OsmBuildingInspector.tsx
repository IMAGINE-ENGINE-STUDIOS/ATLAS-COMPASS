/**
 * OsmBuildingInspector
 * --------------------
 * Popup card shown when the user clicks an OSM building in Atlas.
 * Displays the building's name / house number / street (from OSM tags
 * on the feature, backfilled via Nominatim reverse geocoding) and
 * exposes a color palette (green, blue, red, purple, orange, yellow)
 * for painting the selected building. "Clear paint" restores the
 * original Cesium OSM Buildings colour.
 */

import { useEffect, useState } from "react";
import { X, Paintbrush, MapPin, Building2, Eraser } from "lucide-react";

export interface OsmBuildingSelection {
  id: string;                    // OSM elementId, stable across LOD swaps
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  postcode?: string;
  country?: string;
  lat: number;
  lng: number;
  currentColor?: string | null;  // css hex if painted
}

interface Props {
  building: OsmBuildingSelection;
  onClose: () => void;
  onPaint: (cssColor: string | null) => void;
}

const PAINT_COLORS: { label: string; css: string }[] = [
  { label: "Green",  css: "#22c55e" },
  { label: "Blue",   css: "#3b82f6" },
  { label: "Red",    css: "#ef4444" },
  { label: "Purple", css: "#a855f7" },
  { label: "Orange", css: "#f97316" },
  { label: "Yellow", css: "#eab308" },
];

export default function OsmBuildingInspector({ building, onClose, onPaint }: Props) {
  const [resolved, setResolved] = useState<OsmBuildingSelection>(building);

  useEffect(() => {
    setResolved(building);
    // Reverse-geocode when the feature didn't already carry an address.
    const hasAddress = building.housenumber || building.street;
    if (hasAddress) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${building.lat}&lon=${building.lng}&zoom=18&addressdetails=1`;
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { "Accept-Language": "en" },
        });
        if (!res.ok) return;
        const j = await res.json();
        const a = j.address || {};
        setResolved((prev) => ({
          ...prev,
          name: prev.name || a.building || a.amenity || a.shop || j.name || undefined,
          housenumber: prev.housenumber || a.house_number,
          street:      prev.street      || a.road || a.pedestrian || a.footway,
          city:        prev.city        || a.city || a.town || a.village || a.suburb,
          postcode:    prev.postcode    || a.postcode,
          country:     prev.country     || a.country,
        }));
      } catch {}
    })();
    return () => ctrl.abort();
  }, [building]);

  const streetLine = [resolved.housenumber, resolved.street].filter(Boolean).join(" ");
  const cityLine   = [resolved.postcode, resolved.city, resolved.country].filter(Boolean).join(", ");
  const title      = resolved.name
    || (streetLine ? streetLine : `Building ${resolved.id.slice(0, 8)}`);

  return (
    <div className="animate-scale-in relative w-full max-w-sm rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl text-white shadow-2xl overflow-hidden">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/50">
          <Building2 className="w-3 h-3" /> OSM Building
        </div>
        <div className="mt-1 text-[15px] font-semibold leading-snug tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
          {title}
        </div>
        {(streetLine || cityLine) && (
          <div className="mt-1 flex items-start gap-1.5 text-xs text-white/70 leading-snug">
            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div>
              {streetLine && <div>{streetLine}</div>}
              {cityLine   && <div className="text-white/50">{cityLine}</div>}
            </div>
          </div>
        )}
        <div className="mt-2 text-[10px] text-white/40 tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
          id {resolved.id} · {resolved.lat.toFixed(5)}, {resolved.lng.toFixed(5)}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/50 mb-2">
          <Paintbrush className="w-3 h-3" /> Paint
        </div>
        <div className="grid grid-cols-6 gap-2">
          {PAINT_COLORS.map((c) => {
            const active = resolved.currentColor?.toLowerCase() === c.css.toLowerCase();
            return (
              <button
                key={c.css}
                title={c.label}
                onClick={() => { setResolved((p) => ({ ...p, currentColor: c.css })); onPaint(c.css); }}
                className={`aspect-square rounded-lg border transition-all ${active ? "border-white scale-110 shadow-lg" : "border-white/15 hover:border-white/40"}`}
                style={{ background: c.css, boxShadow: active ? `0 0 12px ${c.css}` : undefined }}
              />
            );
          })}
        </div>
        <button
          onClick={() => { setResolved((p) => ({ ...p, currentColor: null })); onPaint(null); }}
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-white/70 hover:text-white py-1.5 rounded-md border border-white/10 hover:border-white/30 transition-colors"
        >
          <Eraser className="w-3 h-3" /> Clear paint
        </button>
      </div>
    </div>
  );
}