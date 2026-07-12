/**
 * AtlasTectonicPlatesPill — toggles Bird (2003) PB2002 tectonic plates &
 * boundaries as GeoJsonDataSources on the Cesium globe. Coordinates are
 * loaded verbatim from the fraxen/tectonicplates mirror — no reprojection,
 * no interpolation — so every polygon sits at its exact real lat/lon.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2, ChevronUp } from "lucide-react";
import {
  Cartesian3,
  Color,
  GeoJsonDataSource,
  type Viewer,
} from "cesium";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  isLoaded: boolean;
}

const PLATES_URL =
  "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_plates.json";
const BOUNDARIES_URL =
  "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json";

// Bird 2003 plate color palette — matches the Geo Realm identity ramp so a
// plate has the same hue in both surfaces.
const PLATE_COLORS: Record<string, string> = {
  PA: "#4a90e2", NA: "#e74c3c", SA: "#f39c12", EU: "#9b59b6",
  AF: "#e67e22", AN: "#95a5a6", AU: "#1abc9c", NB: "#3498db",
  IN: "#e91e63", PS: "#00bcd4", NZ: "#ff6b6b", CO: "#feca57",
  CA: "#ff9ff3", AR: "#5f27cd", JF: "#00d2d3", RI: "#ff6348",
  SC: "#7bed9f", SW: "#a29bfe", SU: "#fd79a8", BU: "#fdcb6e",
  MO: "#6c5ce7", MA: "#00cec9", SO: "#e17055", YA: "#74b9ff",
  PM: "#a29bfe", TI: "#fab1a0", SB: "#55efc4", NH: "#81ecec",
  ND: "#ffeaa7", MS: "#dfe6e9", AT: "#b2bec3",
};

function colorForPlate(code?: string, alpha = 0.28): Color {
  const hex = (code && PLATE_COLORS[code]) || "#5a7fa8";
  const c = Color.fromCssColorString(hex).withAlpha(alpha);
  return c;
}

async function loadPlates(viewer: Viewer): Promise<GeoJsonDataSource[]> {
  const created: GeoJsonDataSource[] = [];

  // Filled polygons — one entity per plate, real lon/lat verbatim.
  const plates = await GeoJsonDataSource.load(PLATES_URL, {
    stroke: Color.WHITE.withAlpha(0.55),
    strokeWidth: 1,
    clampToGround: true,
  });
  plates.name = "PB2002 · Tectonic plates";
  for (const entity of plates.entities.values) {
    const props: any = entity.properties;
    const code = props?.Code?.getValue?.() ?? props?.PlateName?.getValue?.();
    if (entity.polygon) {
      (entity.polygon as any).material = colorForPlate(code, 0.32);
      (entity.polygon as any).outline = true;
      (entity.polygon as any).outlineColor = Color.WHITE.withAlpha(0.7);
      (entity.polygon as any).height = 0;
    }
  }
  viewer.dataSources.add(plates);
  created.push(plates);

  // Boundary vectors — bright red so convergent/divergent/transform lines
  // read clearly against any base map.
  const bnds = await GeoJsonDataSource.load(BOUNDARIES_URL, {
    stroke: Color.fromCssColorString("#ff2d55"),
    strokeWidth: 2,
    clampToGround: true,
  });
  bnds.name = "PB2002 · Plate boundaries";
  viewer.dataSources.add(bnds);
  created.push(bnds);

  viewer.scene.requestRender?.();
  return created;
}

export default function AtlasTectonicPlatesPill({ viewerRef, isLoaded }: Props) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dsRef = useRef<GeoJsonDataSource[]>([]);

  const toggle = async () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed?.()) return;
    if (on) {
      for (const ds of dsRef.current) {
        try { viewer.dataSources.remove(ds, true); } catch {}
      }
      dsRef.current = [];
      setOn(false);
      viewer.scene.requestRender?.();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      dsRef.current = await loadPlates(viewer);
      setOn(true);
    } catch (err) {
      console.warn("[AtlasTectonicPlatesPill] load failed", err);
      setError("Failed to load plates");
    } finally {
      setLoading(false);
    }
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed?.()) return;
      for (const ds of dsRef.current) {
        try { viewer.dataSources.remove(ds, true); } catch {}
      }
    };
  }, [viewerRef]);

  if (!isLoaded) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={on ? "Hide tectonic plates" : "Show tectonic plates (Bird 2003)"}
      className={`group flex items-center gap-1.5 h-8 px-3 rounded-full border backdrop-blur-md text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ${
        on
          ? "border-orange-400/60 bg-orange-400/15 text-white"
          : "border-white/15 bg-black/60 text-white/85 hover:border-orange-400/50 hover:bg-orange-400/10 hover:text-white"
      }`}
    >
      <Globe2
        className={`w-3.5 h-3.5 ${on ? "text-orange-300" : "text-orange-300/80 group-hover:text-orange-200"}`}
        strokeWidth={2.2}
      />
      <span>Plates</span>
      {loading && (
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-orange-300 animate-pulse" />
      )}
      {error && <span className="ml-0.5 text-[9px] text-red-300">!</span>}
    </button>
  );
}
