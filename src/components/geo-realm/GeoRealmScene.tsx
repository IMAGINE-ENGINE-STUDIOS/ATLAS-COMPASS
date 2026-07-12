import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { CANONICAL_DATASETS, fetchGeoJSON, lonLatToUnit, type GeoFeatureCollection } from "@/lib/geoRealm/dataSources";
import type { CanonicalDataset } from "@/lib/geoRealm/types";

/** Radius of the Earth shell in scene units. */
const R = 1;

/** Convert every ring in a Polygon/MultiPolygon to a flat sphere-projected THREE.Line loop. */
function ringsFromFeature(f: GeoFeatureCollection["features"][number]): number[][][] {
  const g = f.geometry;
  if (g.type === "Polygon") return g.coordinates;
  if (g.type === "MultiPolygon") return g.coordinates.flat();
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "MultiLineString") return g.coordinates;
  return [];
}

function GeoJsonLayer({
  data,
  color,
  radius,
  lineWidth = 1,
  opacity = 1,
  filled = false,
}: {
  data: GeoFeatureCollection;
  color: string;
  radius: number;
  lineWidth?: number;
  opacity?: number;
  filled?: boolean;
}) {
  // Build a single BufferGeometry with LineSegments for all rings — fast.
  const geom = useMemo(() => {
    const positions: number[] = [];
    for (const feature of data.features) {
      for (const ring of ringsFromFeature(feature)) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i];
          const b = ring[i + 1];
          if (!a || !b || a.length < 2 || b.length < 2) continue;
          const [ax, ay, az] = lonLatToUnit(a[0], a[1], radius);
          const [bx, by, bz] = lonLatToUnit(b[0], b[1], radius);
          positions.push(ax, ay, az, bx, by, bz);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [data, radius]);

  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color={color} transparent opacity={opacity} linewidth={lineWidth} />
    </lineSegments>
  );
}

function CanonicalLayerLoader({
  dataset,
  radius,
}: {
  dataset: CanonicalDataset;
  radius: number;
}) {
  const [data, setData] = useState<GeoFeatureCollection | null>(null);
  useEffect(() => {
    let cancel = false;
    fetchGeoJSON(dataset.url)
      .then((d) => {
        if (!cancel) setData(d);
      })
      .catch((err) => console.warn("GeoRealm fetch failed", dataset.id, err));
    return () => {
      cancel = true;
    };
  }, [dataset.url, dataset.id]);
  if (!data) return null;
  return <GeoJsonLayer data={data} color={dataset.color} radius={radius} opacity={0.85} />;
}

/** Concentric semi-transparent shells representing crustal layers. */
function CrustShells({ visible }: { visible: boolean }) {
  if (!visible) return null;
  const shells = [
    { r: R * 0.995, color: "#4a90e2", label: "Ocean / sediment" },
    { r: R * 0.985, color: "#8b6f47", label: "Upper crust" },
    { r: R * 0.965, color: "#5c4530", label: "Lower crust" },
    { r: R * 0.94, color: "#c94f2b", label: "Upper mantle" },
    { r: R * 0.55, color: "#f5a623", label: "Lower mantle" },
    { r: R * 0.28, color: "#ffd93d", label: "Outer core" },
    { r: R * 0.19, color: "#ffffff", label: "Inner core" },
  ];
  return (
    <group>
      {shells.map((s, i) => (
        <mesh key={i}>
          <sphereGeometry args={[s.r, 48, 32]} />
          <meshBasicMaterial
            color={s.color}
            transparent
            opacity={0.08 + i * 0.015}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Earth shell — dark ocean tone, subtle wireframe grid, camera-facing atmosphere. */
function EarthShell({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[R, 96, 64]} />
        <meshStandardMaterial
          color="#0b1a2b"
          roughness={1}
          metalness={0}
          transparent
          opacity={opacity}
          depthWrite={opacity > 0.5}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[R * 1.002, 48, 24]} />
        <meshBasicMaterial color="#1f3550" wireframe transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

function CameraHud({ onChange }: { onChange: (info: { alt: number; lat: number; lon: number }) => void }) {
  const lastRef = useRef({ alt: -1, lat: -999, lon: -999 });
  useFrame(({ camera }) => {
    const p = camera.position;
    const dist = p.length();
    const alt = dist - R;
    const lat = Math.asin(p.y / dist) * (180 / Math.PI);
    const lon = Math.atan2(p.z, p.x) * (180 / Math.PI);
    const last = lastRef.current;
    if (Math.abs(alt - last.alt) > 0.005 || Math.abs(lat - last.lat) > 0.2 || Math.abs(lon - last.lon) > 0.2) {
      lastRef.current = { alt, lat, lon };
      onChange({ alt, lat, lon });
    }
  });
  return null;
}

export interface GeoRealmSceneProps {
  activeCanonical: string[];
  showCrust: boolean;
  showSurface: boolean;
  onCamera?: (info: { alt: number; lat: number; lon: number }) => void;
}

export default function GeoRealmScene({
  activeCanonical,
  showCrust,
  showSurface,
  onCamera,
}: GeoRealmSceneProps) {
  const active = CANONICAL_DATASETS.filter((d) => activeCanonical.includes(d.id));
  return (
    <Canvas
      camera={{ position: [0, 0.4, 2.6], fov: 42, near: 0.001, far: 100 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#04070f" }}
    >
      <color attach="background" args={["#04070f"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-3, -2, -3]} intensity={0.3} color="#4a90ff" />
      <Stars radius={40} depth={20} count={2000} factor={2} fade speed={0.4} />

      <EarthShell opacity={showSurface ? 0.6 : 0.05} />
      <CrustShells visible={showCrust} />

      {active.map((d) => (
        <CanonicalLayerLoader key={d.id} dataset={d} radius={R * 1.005} />
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={0.2}
        maxDistance={8}
        rotateSpeed={0.5}
        zoomSpeed={0.6}
      />
      {onCamera ? <CameraHud onChange={onCamera} /> : null}
    </Canvas>
  );
}