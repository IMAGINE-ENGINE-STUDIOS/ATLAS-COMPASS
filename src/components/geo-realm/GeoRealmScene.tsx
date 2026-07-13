import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  CANONICAL_DATASETS,
  CRUST1_LAYERS,
  HYPOCENTER_FEEDS,
  fetchGeoJSON,
  lonLatDepthToUnit,
  lonLatToUnit,
  type GeoFeatureCollection,
} from "@/lib/geoRealm/dataSources";
import type { CanonicalDataset } from "@/lib/geoRealm/types";
import VolumetricPlates, { type SelectedPlate } from "./VolumetricPlates";

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
  // CRUST1.0 continental means (Laske et al. 2013) stacked from surface down,
  // plus deep-Earth shells (upper/lower mantle, outer/inner core) at PREM
  // radii — all rendered as back-side transparent shells for X-ray view.
  const EARTH_KM = 6371;
  const stacked: { r: number; color: string }[] = [];
  let depthKm = 0;
  for (const l of CRUST1_LAYERS) {
    depthKm += l.thickness_km;
    stacked.push({ r: R * (1 - depthKm / EARTH_KM), color: l.color });
  }
  const shells = [
    ...stacked,
    { r: R * 0.55, color: "#f5a623" }, // lower mantle
    { r: R * 0.28, color: "#ffd93d" }, // outer core
    { r: R * 0.19, color: "#ffffff" }, // inner core
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

/**
 * Hypocenter cloud — each earthquake is a point at its real (lon, lat, depth).
 * Together they trace subducting slab geometry (Wadati-Benioff zones).
 * Depth is color-ramped shallow→red / deep→purple. Uses THREE.Points for perf.
 */
function HypocenterCloud({ feedId }: { feedId: string }) {
  const feed = HYPOCENTER_FEEDS.find((f) => f.id === feedId);
  const [data, setData] = useState<GeoFeatureCollection | null>(null);
  useEffect(() => {
    if (!feed) return;
    let cancel = false;
    fetchGeoJSON(feed.url).then((d) => {
      if (!cancel) setData(d);
    });
    return () => {
      cancel = true;
    };
  }, [feed?.url]);
  const geom = useMemo(() => {
    if (!data) return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];
    for (const f of data.features) {
      const g = f.geometry;
      if (g.type !== "Point" || !g.coordinates || g.coordinates.length < 3) continue;
      const [lon, lat, depthKm] = g.coordinates as number[];
      const props = (f.properties ?? {}) as { mag?: number };
      const mag = typeof props.mag === "number" ? props.mag : 4.5;
      const [x, y, z] = lonLatDepthToUnit(lon, lat, depthKm ?? 0, R);
      positions.push(x, y, z);
      // Color ramp by depth: 0 km = orange-red → 700 km = deep purple.
      const t = Math.min(1, Math.max(0, (depthKm ?? 0) / 700));
      const r = 1 - t * 0.75;
      const gg = 0.35 * (1 - t);
      const bb = 0.2 + t * 0.8;
      colors.push(r, gg, bb);
      sizes.push(2 + (mag - 4) * 1.8);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    bg.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    bg.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    return bg;
  }, [data]);
  if (!geom) return null;
  return (
    <points geometry={geom}>
      <pointsMaterial
        vertexColors
        size={0.006}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
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

/**
 * Photoreal Earth — NASA Blue Marble day map draped on the shell so users
 * can see continents/oceans as reference while inspecting plates.
 */
function RealisticEarth({ opacity }: { opacity: number }) {
  // Higher-resolution NASA Blue Marble day map (Solar System Scope, CC BY 4.0)
  // gives the realistic mode enough continent detail to visually verify
  // plate alignment against known landmarks.
  const tex = useLoader(
    THREE.TextureLoader,
    "https://raw.githubusercontent.com/solar-system-scope/textures/main/2k_earth_daymap.jpg",
  );
  // Three.js SphereGeometry maps texture u=0 to −X (longitude −180°) and
  // u=0.25 to +Z (longitude −90°). Our `lonLatToUnit` places longitude 0°
  // at +X and longitude +90° at +Z — i.e. the two conventions are
  // east/west mirrored (opposite chirality). Every geo layer in this
  // scene (plates, hypocenters, arrows) uses `lonLatToUnit`, so we align
  // the reference texture to them by mirroring it horizontally instead
  // of rotating the sphere (a rotation can't fix a chirality flip).
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = -1;
  tex.offset.x = 1;
  tex.needsUpdate = true;
  return (
    <mesh>
      <sphereGeometry args={[R * 0.999, 128, 96]} />
      <meshStandardMaterial
        map={tex}
        roughness={0.95}
        metalness={0}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
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
  realistic?: boolean;
  activeHypocenter?: string | null;
  showVolumetricPlates?: boolean;
  showPlateMotion?: boolean;
  plateThicknessKm?: number;
  selectedPlateCode?: string | null;
  onSelectPlate?: (p: SelectedPlate | null) => void;
  plateColorMode?: "plate" | "activity";
  onCamera?: (info: { alt: number; lat: number; lon: number }) => void;
}

export default function GeoRealmScene({
  activeCanonical,
  showCrust,
  showSurface,
  realistic = false,
  activeHypocenter,
  showVolumetricPlates = false,
  showPlateMotion = true,
  plateThicknessKm = 100,
  selectedPlateCode = null,
  onSelectPlate,
  plateColorMode = "plate",
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

      {realistic ? (
        <RealisticEarth opacity={showSurface ? 1 : 0.25} />
      ) : (
        <EarthShell opacity={showSurface ? 0.6 : 0.05} />
      )}
      <CrustShells visible={showCrust} />

      {active.map((d) => (
        <CanonicalLayerLoader key={d.id} dataset={d} radius={R * 1.005} />
      ))}

      {activeHypocenter ? <HypocenterCloud feedId={activeHypocenter} /> : null}

      <VolumetricPlates
        visible={showVolumetricPlates}
        radius={R}
        thicknessKm={plateThicknessKm}
        showMotion={showPlateMotion}
        selectedCode={selectedPlateCode}
        onSelect={onSelectPlate}
        colorMode={plateColorMode}
      />

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