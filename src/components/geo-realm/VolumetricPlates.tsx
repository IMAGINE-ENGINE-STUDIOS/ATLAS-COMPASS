import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  fetchGeoJSON,
  lonLatToUnit,
  type GeoFeatureCollection,
} from "@/lib/geoRealm/dataSources";
import { poleForPlateName, velocityAt, MORVEL_EULER_POLES } from "@/lib/geoRealm/plateMotion";

const PB2002_PLATES = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_plates.json";
const EARTH_KM = 6371;

/**
 * Volumetric lithospheric shells: each plate polygon is extruded between two
 * radii (surface → lithospheric base, default 100 km). We render the *side
 * walls* (ribbons along polygon edges) — this gives a real volumetric feel
 * without heavy CAP triangulation, and the crustal thickness is scientifically
 * meaningful (Conrad & Lithgow-Bertelloni 2006 mean oceanic + continental).
 *
 * Motion arrows: each plate's Euler pole (NNR-MORVEL 2010) yields a surface
 * velocity at its centroid; we render an animated tangent arrow whose length
 * is proportional to mm/yr and whose color matches the plate.
 */
export function VolumetricPlates({
  visible,
  radius,
  thicknessKm = 100,
  showMotion = true,
  animate = true,
}: {
  visible: boolean;
  radius: number;
  thicknessKm?: number;
  showMotion?: boolean;
  animate?: boolean;
}) {
  const [data, setData] = useState<GeoFeatureCollection | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancel = false;
    fetchGeoJSON(PB2002_PLATES)
      .then((d) => !cancel && setData(d))
      .catch((e) => console.warn("VolumetricPlates load failed", e));
    return () => {
      cancel = true;
    };
  }, [visible]);

  const rTop = radius * 1.006;
  const rBot = radius * (1 - thicknessKm / EARTH_KM) * 1.002;

  const { wallsGeom, capsGeom, arrows } = useMemo(() => {
    if (!data) return { wallsGeom: null, capsGeom: null, arrows: [] as ArrowSpec[] };

    const wallsPos: number[] = [];
    const wallsCol: number[] = [];
    const capsPos: number[] = [];
    const capsCol: number[] = [];
    const arrows: ArrowSpec[] = [];

    for (const feature of data.features) {
      const props = (feature.properties ?? {}) as { PlateName?: string; Code?: string };
      const pole = poleForPlateName(props.PlateName) ??
        MORVEL_EULER_POLES.find((p) => p.code === props.Code) ?? null;
      const colorHex = pole?.color ?? "#5a7fa8";
      const col = new THREE.Color(colorHex);

      const rings = extractRings(feature);
      let cLon = 0, cLat = 0, cN = 0;

      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i];
          const b = ring[i + 1];
          if (!a || !b) continue;
          const [ax, ay, az] = lonLatToUnit(a[0], a[1], rTop);
          const [bx, by, bz] = lonLatToUnit(b[0], b[1], rTop);
          const [ax2, ay2, az2] = lonLatToUnit(a[0], a[1], rBot);
          const [bx2, by2, bz2] = lonLatToUnit(b[0], b[1], rBot);

          // side wall (two triangles per segment)
          wallsPos.push(ax, ay, az,  bx, by, bz,  bx2, by2, bz2);
          wallsPos.push(ax, ay, az,  bx2, by2, bz2, ax2, ay2, az2);
          for (let k = 0; k < 6; k++) wallsCol.push(col.r, col.g, col.b);

          // top edge highlight (thin ribbon slightly above)
          capsPos.push(ax, ay, az, bx, by, bz);
          capsCol.push(col.r, col.g, col.b, col.r, col.g, col.b);

          cLon += a[0]; cLat += a[1]; cN += 1;
        }
      }

      if (cN > 0 && pole) {
        const clon = cLon / cN;
        const clat = cLat / cN;
        const v = velocityAt(pole, clat, clon);
        arrows.push({
          lon: clon,
          lat: clat,
          east: v.east_mm_yr,
          north: v.north_mm_yr,
          speed: v.speed_mm_yr,
          color: colorHex,
          name: pole.name,
        });
      }
    }

    const walls = new THREE.BufferGeometry();
    walls.setAttribute("position", new THREE.Float32BufferAttribute(wallsPos, 3));
    walls.setAttribute("color", new THREE.Float32BufferAttribute(wallsCol, 3));
    walls.computeVertexNormals();

    const caps = new THREE.BufferGeometry();
    caps.setAttribute("position", new THREE.Float32BufferAttribute(capsPos, 3));
    caps.setAttribute("color", new THREE.Float32BufferAttribute(capsCol, 3));

    return { wallsGeom: walls, capsGeom: caps, arrows };
  }, [data, rTop, rBot]);

  if (!visible || !wallsGeom || !capsGeom) return null;

  return (
    <group>
      {/* side walls — the volumetric lithosphere */}
      <mesh geometry={wallsGeom}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* bright top edge */}
      <lineSegments geometry={capsGeom}>
        <lineBasicMaterial vertexColors transparent opacity={0.85} />
      </lineSegments>

      {showMotion && arrows.map((a, i) => (
        <PlateMotionArrow key={i} spec={a} radius={rTop * 1.008} animate={animate} />
      ))}
    </group>
  );
}

interface ArrowSpec {
  lon: number;
  lat: number;
  east: number;
  north: number;
  speed: number;
  color: string;
  name: string;
}

function PlateMotionArrow({
  spec,
  radius,
  animate,
}: {
  spec: ArrowSpec;
  radius: number;
  animate: boolean;
}) {
  const coneRef = useRef<THREE.Mesh>(null);

  const { geom, tip, quat, len } = useMemo(() => {
    const [ox, oy, oz] = lonLatToUnit(spec.lon, spec.lat, radius);
    const origin = new THREE.Vector3(ox, oy, oz);
    // Build east/north unit vectors at (lat, lon)
    const D2R = Math.PI / 180;
    const lat = spec.lat * D2R;
    const lon = spec.lon * D2R;
    const east = new THREE.Vector3(-Math.sin(lon), 0, Math.cos(lon));
    const north = new THREE.Vector3(
      -Math.sin(lat) * Math.cos(lon),
      Math.cos(lat),
      -Math.sin(lat) * Math.sin(lon),
    );
    // Length: scale mm/yr → scene units (1 unit ≈ full earth radius).
    // Max realistic speed ≈ 100 mm/yr → arrow len ≈ 0.08 units.
    const len = Math.min(0.12, Math.max(0.015, spec.speed * 0.0008));
    const dir = east.clone().multiplyScalar(spec.east).add(north.clone().multiplyScalar(spec.north));
    if (dir.lengthSq() === 0) dir.copy(east);
    dir.normalize();
    const tip = origin.clone().add(dir.clone().multiplyScalar(len));

    const g = new THREE.BufferGeometry().setFromPoints([origin, tip]);
    // Orient a cone from +Y to dir
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { geom: g, tip, quat, len };
  }, [spec, radius]);

  useFrame(({ clock }) => {
    if (!animate) return;
    if (coneRef.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 2.2 + spec.lat) * 0.15;
      coneRef.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      <line>
        <bufferGeometry attach="geometry" {...{ ref: (g: THREE.BufferGeometry | null) => g && g.copy(geom) }} />
        <lineBasicMaterial color={spec.color} transparent opacity={0.9} linewidth={2} />
      </line>
      <mesh ref={coneRef} position={tip} quaternion={quat}>
        <coneGeometry args={[len * 0.18, len * 0.4, 8]} />
        <meshBasicMaterial color={spec.color} transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

function extractRings(f: GeoFeatureCollection["features"][number]): number[][][] {
  const g = f.geometry;
  if (g.type === "Polygon") return g.coordinates;
  if (g.type === "MultiPolygon") return g.coordinates.flat();
  return [];
}

export default VolumetricPlates;