/**
 * AtlasTectonicPlatesPill
 * -----------------------
 * Toggles Bird (2003) PB2002 tectonic plates on the Cesium globe.
 *
 * Coordinates: every polygon and boundary line uses the GeoJSON's lon/lat
 * verbatim (fraxen/tectonicplates mirror of Bird 2003). No reprojection.
 *
 * Rendering: `clampToGround` is intentionally OFF because Google
 * Photorealistic 3D Tiles hide `scene.globe`, so ground clamping has
 * nothing to project onto. Instead we lift polygons + boundaries to a
 * fixed geodetic altitude above any terrain (`PLATE_ALT_M`) — same
 * lat/lon everywhere, guaranteed to be visible above 3D tiles, satellite
 * imagery, or the plain ellipsoid.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Loader2 } from "lucide-react";
import {
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  GeoJsonDataSource,
  Ellipsoid,
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

// Altitude of the plate shell in metres. High enough to sit above every
// natural feature (Everest ≈ 8.85 km) and above Google's 3D tile geometry.
const PLATE_ALT_M = 60_000;
const BOUNDARY_ALT_M = 62_000;

// Deterministic color per plate code (Bird 2003 short codes).
const PLATE_COLORS: Record<string, string> = {
  PA: "#4a90e2", NA: "#e74c3c", SA: "#f39c12", EU: "#9b59b6",
  AF: "#e67e22", AN: "#95a5a6", AU: "#1abc9c", NB: "#3498db",
  IN: "#e91e63", PS: "#00bcd4", NZ: "#ff6b6b", CO: "#feca57",
  CA: "#ff9ff3", AR: "#5f27cd", JF: "#00d2d3", RI: "#ff6348",
  SC: "#7bed9f", SW: "#a29bfe", SU: "#fd79a8", BU: "#fdcb6e",
  MO: "#6c5ce7", MA: "#00cec9", SO: "#e17055", YA: "#74b9ff",
  PM: "#8e44ad", TI: "#fab1a0", SB: "#55efc4", NH: "#81ecec",
  ND: "#ffeaa7", MS: "#dfe6e9", AT: "#b2bec3", OK: "#00b894",
  ON: "#fdcb6e", SL: "#e17055", KE: "#0984e3", NI: "#d63031",
  AS: "#fab1a0", GP: "#00cec9", JZ: "#e84393", TO: "#fdcb6e",
  MN: "#b71540", CL: "#78e08f", CR: "#f8c291", EA: "#82ccdd",
  FT: "#b8e994", GA: "#f6b93b", NB2: "#eb2f06", SS: "#78e08f",
  BR: "#b8e994", BS: "#fa983a", BH: "#eb2f06", SG: "#e58e26",
  KL: "#079992", MT: "#78e08f",
};

function plateColor(code: string | undefined, alpha: number): Color {
  const hex = (code && PLATE_COLORS[code]) || "#5a7fa8";
  return Color.fromCssColorString(hex).withAlpha(alpha);
}

// Bright, high-contrast boundary color regardless of type — one shade so the
// tectonic seams read instantly against Google 3D imagery.
const BOUNDARY_COLOR = Color.fromCssColorString("#ff1f4e");

async function loadPlates(viewer: Viewer): Promise<GeoJsonDataSource[]> {
  const created: GeoJsonDataSource[] = [];
  console.log("[Plates] loading PB2002…");

  // Filled polygons — coords are used verbatim from the GeoJSON.
  const plates = await GeoJsonDataSource.load(PLATES_URL);
  plates.name = "PB2002 · Tectonic plates";
  console.log(`[Plates] loaded ${plates.entities.values.length} plate polygons`);
  for (const entity of plates.entities.values) {
    const props: any = entity.properties;
    const code: string | undefined =
      props?.Code?.getValue?.() ?? props?.PlateName?.getValue?.();
    if (entity.polygon) {
      const poly: any = entity.polygon;
      poly.material = new ColorMaterialProperty(plateColor(code, 0.42));
      poly.height = new ConstantProperty(PLATE_ALT_M);
      poly.outline = new ConstantProperty(false);
      poly.perPositionHeight = new ConstantProperty(false);
      poly.arcType = new ConstantProperty(1); // ArcType.GEODESIC — hug the ellipsoid
    }
  }
  viewer.dataSources.add(plates);
  created.push(plates);

  // Boundary vectors — lifted just above the fill so seams read on top.
  const bnds = await GeoJsonDataSource.load(BOUNDARIES_URL);
  bnds.name = "PB2002 · Plate boundaries";
  for (const entity of bnds.entities.values) {
    if (entity.polyline) {
      const line: any = entity.polyline;
      line.material = new ColorMaterialProperty(BOUNDARY_COLOR);
      line.width = new ConstantProperty(3);
      line.clampToGround = new ConstantProperty(false);
      line.arcType = new ConstantProperty(1);
      const raw = entity.polyline.positions?.getValue?.(undefined as any) as Cartesian3[] | undefined;
      if (Array.isArray(raw)) {
        const lifted = raw.map((c) => {
          const carto = Cartographic.fromCartesian(c, Ellipsoid.WGS84, new Cartographic());
          return Cartesian3.fromRadians(carto.longitude, carto.latitude, BOUNDARY_ALT_M);
        });
        line.positions = new ConstantProperty(lifted);
      }
    }
  }
  viewer.dataSources.add(bnds);
  created.push(bnds);

  console.log(`[Plates] added ${created.length} datasources, requesting render`);
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

  useEffect(() => () => removeAll(), []); // cleanup on unmount

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
