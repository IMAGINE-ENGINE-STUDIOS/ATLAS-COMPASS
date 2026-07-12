/**
 * AtlasTectonicPlatesPill
 * -----------------------
 * Toggles Bird (2003) PB2002 tectonic plates on the Cesium globe as a
 * volumetric shell. Every polygon and boundary uses the GeoJSON lon/lat
 * verbatim (fraxen/tectonicplates mirror). No reprojection is applied —
 * the shell is drawn at a fixed geodetic altitude so it sits directly
 * above Google Photorealistic 3D Tiles / satellite imagery at the same
 * coordinates.
 */
import { useEffect, useRef, useState } from "react";
import { Globe2, Loader2 } from "lucide-react";
import {
  ArcType,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Ellipsoid,
  GeoJsonDataSource,
  HeightReference,
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

const PLATE_COLORS: Record<string, string> = {
  PA: "#4a90e2", NA: "#e74c3c", SA: "#f39c12", EU: "#9b59b6",
  AF: "#e67e22", AN: "#95a5a6", AU: "#1abc9c", NB: "#3498db",
  IN: "#e91e63", PS: "#00bcd4", NZ: "#ff6b6b", CO: "#feca57",
  CA: "#ff9ff3", AR: "#5f27cd", JF: "#00d2d3", RI: "#ff6348",
  SC: "#7bed9f", SW: "#a29bfe", SU: "#fd79a8", BU: "#fdcb6e",
  MO: "#6c5ce7", MA: "#00cec9", SO: "#e17055", YA: "#74b9ff",
  PM: "#8e44ad", TI: "#fab1a0", SB: "#55efc4", NH: "#81ecec",
  ND: "#ffeaa7", MS: "#dfe6e9", AT: "#b2bec3",
};

function plateColor(code: string | undefined, alpha: number): Color {
  const hex = (code && PLATE_COLORS[code]) || "#5a7fa8";
  return Color.fromCssColorString(hex).withAlpha(alpha);
}

const BOUNDARY_COLOR = Color.fromCssColorString("#ff1f4e");
const PLATE_ALT_M = 15_000;    // ~15 km — above every mountain / 3D building
const BOUNDARY_ALT_M = 25_000; // sits just above the fill

/** Lift a Cartesian3 vertex to a given geodetic altitude along the ellipsoid normal. */
function liftCartesian(c: Cartesian3, altMeters: number): Cartesian3 {
  const carto = Cartographic.fromCartesian(c, Ellipsoid.WGS84, new Cartographic());
  return Cartesian3.fromRadians(carto.longitude, carto.latitude, altMeters);
}

async function loadPlates(viewer: Viewer): Promise<GeoJsonDataSource[]> {
  const created: GeoJsonDataSource[] = [];
  console.log("[Plates] loading PB2002…");

  const plates = await GeoJsonDataSource.load(PLATES_URL, {
    stroke: Color.WHITE.withAlpha(0.65),
    strokeWidth: 1,
    fill: Color.WHITE.withAlpha(0.35),
  });
  plates.name = "PB2002 · Tectonic plates";
  for (const entity of plates.entities.values) {
    const props: any = entity.properties;
    const code: string | undefined =
      props?.Code?.getValue?.() ?? props?.PlateName?.getValue?.();
    const poly: any = entity.polygon;
    if (poly) {
      poly.material = new ColorMaterialProperty(plateColor(code, 0.55));
      poly.height = new ConstantProperty(PLATE_ALT_M);
      poly.outline = new ConstantProperty(true);
      poly.outlineColor = new ConstantProperty(Color.WHITE.withAlpha(0.85));
      poly.outlineWidth = new ConstantProperty(1);
      poly.perPositionHeight = new ConstantProperty(false);
      poly.arcType = new ConstantProperty(ArcType.GEODESIC);
      poly.heightReference = new ConstantProperty(HeightReference.NONE);
    }
  }
  console.log(`[Plates] ${plates.entities.values.length} polygons prepared`);
  viewer.dataSources.add(plates);
  created.push(plates);

  const bnds = await GeoJsonDataSource.load(BOUNDARIES_URL, {
    stroke: BOUNDARY_COLOR,
    strokeWidth: 3,
  });
  bnds.name = "PB2002 · Plate boundaries";
  for (const entity of bnds.entities.values) {
    const line: any = entity.polyline;
    if (!line) continue;
    line.material = new ColorMaterialProperty(BOUNDARY_COLOR);
    line.width = new ConstantProperty(3);
    line.clampToGround = new ConstantProperty(false);
    line.arcType = new ConstantProperty(ArcType.GEODESIC);
    // Re-project each vertex to BOUNDARY_ALT_M while preserving lon/lat.
    const raw = line.positions?.getValue?.(undefined as any) as Cartesian3[] | undefined;
    if (Array.isArray(raw) && raw.length) {
      const lifted = raw.map((c) => liftCartesian(c, BOUNDARY_ALT_M));
      line.positions = new ConstantProperty(lifted);
    }
  }
  viewer.dataSources.add(bnds);
  created.push(bnds);

  console.log(`[Plates] rendered ${created.length} datasources`);
  viewer.scene.requestRender?.();
  return created;
}

export default function AtlasTectonicPlatesPill({ viewerRef, isLoaded }: Props) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dsRef = useRef<GeoJsonDataSource[]>([]);

  const removeAll = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed?.()) return;
    for (const ds of dsRef.current) {
      try { viewer.dataSources.remove(ds, true); } catch {}
    }
    dsRef.current = [];
    viewer.scene?.requestRender?.();
  };

  const toggle = async () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed?.()) return;
    if (on) {
      removeAll();
      setOn(false);
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

  useEffect(() => () => removeAll(), []);

  if (!isLoaded) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={on ? "Hide tectonic plates" : "Show tectonic plates (Bird 2003 · PB2002)"}
      className={`group flex items-center gap-1.5 h-8 px-3 rounded-full border backdrop-blur-md text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ${
        on
          ? "border-orange-400/60 bg-orange-400/15 text-white"
          : "border-white/15 bg-black/60 text-white/85 hover:border-orange-400/50 hover:bg-orange-400/10 hover:text-white"
      }`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 text-orange-300 animate-spin" strokeWidth={2.2} />
      ) : (
        <Globe2
          className={`w-3.5 h-3.5 ${on ? "text-orange-300" : "text-orange-300/80 group-hover:text-orange-200"}`}
          strokeWidth={2.2}
        />
      )}
      <span>Plates</span>
      {error && <span className="ml-0.5 text-[9px] text-red-300">!</span>}
    </button>
  );
}
