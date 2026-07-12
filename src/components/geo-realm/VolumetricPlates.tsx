import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  fetchGeoJSON,
  lonLatToUnit,
  type GeoFeatureCollection,
} from "@/lib/geoRealm/dataSources";
import {
  poleForPlateName,
  velocityAt,
  MORVEL_EULER_POLES,
  activityColor,
  type EulerPole,
} from "@/lib/geoRealm/plateMotion";

export interface SelectedPlate {
  code: string;
  name: string;
  areaSteradian: number;
  centroid: { lon: number; lat: number };
  pole: EulerPole | null;
  velocity: { east_mm_yr: number; north_mm_yr: number; speed_mm_yr: number; azimuth_deg: number } | null;
  source: string;
  color: string;
}

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
  selectedCode = null,
  onSelect,
  colorMode = "plate",
}: {
  visible: boolean;
  radius: number;
  thicknessKm?: number;
  showMotion?: boolean;
  animate?: boolean;
  selectedCode?: string | null;
  onSelect?: (plate: SelectedPlate | null) => void;
  colorMode?: "plate" | "activity";
}) {
  const [data, setData] = useState<GeoFeatureCollection | null>(null);
  const [hoverCode, setHoverCode] = useState<string | null>(null);

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

  const plates = useMemo(() => {
    if (!data) return [] as PlateEntry[];
    const list: PlateEntry[] = [];
    for (const feature of data.features) {
      const props = (feature.properties ?? {}) as { PlateName?: string; Code?: string };
      const code = props.Code ?? props.PlateName ?? `P${list.length}`;
      const pole =
        (props.Code ? MORVEL_EULER_POLES.find((p) => p.code === props.Code) : null) ??
        poleForPlateName(props.PlateName) ??
        null;
      const wallsPos: number[] = [];
      const capsPos: number[] = [];
      const rings = extractRings(feature);
      let cLon = 0, cLat = 0, cN = 0;

      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i]; const b = ring[i + 1];
          if (!a || !b) continue;
          const [ax, ay, az] = lonLatToUnit(a[0], a[1], rTop);
          const [bx, by, bz] = lonLatToUnit(b[0], b[1], rTop);
          const [ax2, ay2, az2] = lonLatToUnit(a[0], a[1], rBot);
          const [bx2, by2, bz2] = lonLatToUnit(b[0], b[1], rBot);
          wallsPos.push(ax, ay, az,  bx, by, bz,  bx2, by2, bz2);
          wallsPos.push(ax, ay, az,  bx2, by2, bz2, ax2, ay2, az2);
          capsPos.push(ax, ay, az, bx, by, bz);
          cLon += a[0]; cLat += a[1]; cN += 1;
        }
      }

      if (wallsPos.length === 0) continue;
      const walls = new THREE.BufferGeometry();
      walls.setAttribute("position", new THREE.Float32BufferAttribute(wallsPos, 3));
      walls.computeVertexNormals();
      const caps = new THREE.BufferGeometry();
      caps.setAttribute("position", new THREE.Float32BufferAttribute(capsPos, 3));

      const centroid = cN > 0 ? { lon: cLon / cN, lat: cLat / cN } : { lon: 0, lat: 0 };
      const v = pole ? velocityAt(pole, centroid.lat, centroid.lon) : null;
      const velocity = v
        ? {
            east_mm_yr: v.east_mm_yr,
            north_mm_yr: v.north_mm_yr,
            speed_mm_yr: v.speed_mm_yr,
            azimuth_deg: (Math.atan2(v.east_mm_yr, v.north_mm_yr) * 180) / Math.PI,
          }
        : null;

      const colorHex =
        colorMode === "activity"
          ? activityColor(velocity?.speed_mm_yr ?? null)
          : pole?.color ?? "#5a7fa8";
      const col = new THREE.Color(colorHex);

      list.push({
        code,
        name: pole?.name ?? props.PlateName ?? code,
        color: colorHex,
        colorObj: col,
        walls,
        caps,
        centroid,
        pole,
        velocity,
      });
    }
    return list;
  }, [data, rTop, rBot, colorMode]);

  if (!visible) return null;

  return (
    <group>
      {plates.map((p) => {
        const isSelected = selectedCode === p.code;
        const isHover = hoverCode === p.code;
        const opacity = isSelected ? 0.75 : isHover ? 0.55 : 0.28;
        return (
          <group key={p.code}>
            <mesh
              geometry={p.walls}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onSelect?.({
                  code: p.code,
                  name: p.name,
                  areaSteradian: 0,
                  centroid: p.centroid,
                  pole: p.pole,
                  velocity: p.velocity,
                  source: p.pole ? "NNR-MORVEL 2010 (DeMets, Gordon, Argus)" : "no MORVEL pole assigned",
                  color: p.color,
                });
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                setHoverCode(p.code);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHoverCode((c) => (c === p.code ? null : c));
                document.body.style.cursor = "";
              }}
            >
              <meshBasicMaterial
                color={p.colorObj}
                transparent
                opacity={opacity}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <lineSegments geometry={p.caps}>
              <lineBasicMaterial
                color={p.colorObj}
                transparent
                opacity={isSelected ? 1 : 0.75}
              />
            </lineSegments>
          </group>
        );
      })}

      {showMotion && plates.map((p) => (
        p.velocity && p.pole ? (
          <PlateMotionArrow
            key={p.code}
            spec={{
              lon: p.centroid.lon,
              lat: p.centroid.lat,
              east: p.velocity.east_mm_yr,
              north: p.velocity.north_mm_yr,
              speed: p.velocity.speed_mm_yr,
              color: p.color,
              name: p.name,
            }}
            radius={rTop * 1.008}
            animate={animate}
            highlighted={selectedCode === p.code}
          />
        ) : null
      ))}
    </group>
  );
}

interface PlateEntry {
  code: string;
  name: string;
  color: string;
  colorObj: THREE.Color;
  walls: THREE.BufferGeometry;
  caps: THREE.BufferGeometry;
  centroid: { lon: number; lat: number };
  pole: EulerPole | null;
  velocity: { east_mm_yr: number; north_mm_yr: number; speed_mm_yr: number; azimuth_deg: number } | null;
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
  highlighted = false,
}: {
  spec: ArrowSpec;
  radius: number;
  animate: boolean;
  highlighted?: boolean;
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
      const base = highlighted ? 1.4 : 1;
      const s = base + Math.sin(clock.elapsedTime * 2.2 + spec.lat) * (highlighted ? 0.25 : 0.15);
      coneRef.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      <line>
        <bufferGeometry attach="geometry" {...{ ref: (g: THREE.BufferGeometry | null) => g && g.copy(geom) }} />
        <lineBasicMaterial color={spec.color} transparent opacity={highlighted ? 1 : 0.9} linewidth={2} />
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