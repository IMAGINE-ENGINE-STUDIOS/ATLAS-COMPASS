/**
 * AtlasTectonicPlatesPill
 * -----------------------
 * Toggles Bird (2003) PB2002 tectonic plates on the Cesium globe.
 *
 * Coordinates: every polygon vertex and boundary vertex is used verbatim
 * from the GeoJSON (fraxen/tectonicplates mirror of Bird 2003) — no
 * reprojection, no interpolation. The shell is lifted to a small geodetic
 * altitude so it sits above Google Photorealistic 3D Tiles / satellite
 * imagery at the same lat/lon.
 *
 * Look: crisp coloured plate outlines + a bright red boundary web, so
 * users can read where each plate sits with respect to the continents.
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

// Signature Bird-2003 short codes → distinct hues.
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

const BOUNDARY_COLOR = Color.fromCssColorString("#ff2d55");
const PLATE_ALT_M = 12_000;    // above every mountain / 3D building
const BOUNDARY_ALT_M = 22_000; // sits just above the fills

function liftCartesian(c: Cartesian3, altMeters: number): Cartesian3 {
  const carto = Cartographic.fromCartesian(c, Ellipsoid.WGS84, new Cartographic());
  return Cartesian3.fromRadians(carto.longitude, carto.latitude, altMeters);
}

async function loadPlates(viewer: Viewer): Promise<GeoJsonDataSource[]> {
  const created: GeoJsonDataSource[] = [];

  // Plate polygons — thin translucent fill + coloured outline per plate.
  const plates = await GeoJsonDataSource.load(PLATES_URL, {
    stroke: Color.WHITE.withAlpha(0.75),
    strokeWidth: 1,
    fill: Color.TRANSPARENT,
  });
  plates.name = "PB2002 · Tectonic plates";
  for (const entity of plates.entities.values) {
    const props: any = entity.properties;
    const code: string | undefined =
      props?.Code?.getValue?.() ?? props?.PlateName?.getValue?.();
    const poly: any = entity.polygon;
    if (poly) {
      poly.material = new ColorMaterialProperty(plateColor(code, 0.18));
      poly.height = new ConstantProperty(PLATE_ALT_M);
      poly.outline = new ConstantProperty(true);
      poly.outlineColor = new ConstantProperty(plateColor(code, 0.95));
      poly.outlineWidth = new ConstantProperty(2);
      poly.perPositionHeight = new ConstantProperty(false);
      poly.arcType = new ConstantProperty(ArcType.GEODESIC);
      poly.heightReference = new ConstantProperty(HeightReference.NONE);
    }
  }
  await viewer.dataSources.add(plates);
  created.push(plates);

  // Bright red plate-boundary web on top, at exact lat/lon.
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
    const raw = line.positions?.getValue?.(undefined as any) as Cartesian3[] | undefined;
    if (Array.isArray(raw) && raw.length) {
      line.positions = new ConstantProperty(raw.map((c) => liftCartesian(c, BOUNDARY_ALT_M)));
    }
  }
  await viewer.dataSources.add(bnds);
  created.push(bnds);

  viewer.scene.requestRender?.();
  requestAnimationFrame(() => viewer.scene.requestRender?.());
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
