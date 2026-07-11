/**
 * Standalone R3F sphere viewer for the outer/inner planets that don't have
 * a full Cesium Atlas mode yet.  Streams the highest-res NASA-derived
 * albedo texture onto a sphere, drops it in a starfield, and lets the user
 * orbit / zoom with the mouse.  Kept intentionally lightweight so it opens
 * instantly from the top-center planet switcher.
 */
import { Suspense, useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { TextureLoader, SRGBColorSpace, DoubleSide } from "three";
import PlanetSwitcher from "@/components/atlas/PlanetSwitcher";
import { findPlanet } from "@/lib/planets/config";

function Planet({ url }: { url: string }) {
  const map = useLoader(TextureLoader, url);
  map.colorSpace = SRGBColorSpace;
  return (
    <mesh>
      <sphereGeometry args={[1, 128, 128]} />
      <meshStandardMaterial map={map} metalness={0.02} roughness={0.9} />
    </mesh>
  );
}

function Ring({ url }: { url: string }) {
  const map = useLoader(TextureLoader, url);
  map.colorSpace = SRGBColorSpace;
  return (
    <mesh rotation={[Math.PI / 2.15, 0, 0]}>
      <ringGeometry args={[1.35, 2.35, 128]} />
      <meshBasicMaterial map={map} transparent opacity={0.9} side={DoubleSide} />
    </mesh>
  );
}

function SunGlow({ url }: { url: string }) {
  const map = useLoader(TextureLoader, url);
  map.colorSpace = SRGBColorSpace;
  return (
    <>
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={4} distance={0} decay={0} />
    </>
  );
}

export default function PlanetPage() {
  const { id = "" } = useParams();
  const planet = useMemo(() => findPlanet(id), [id]);
  if (!planet) return <Navigate to="/atlas" replace />;

  const isSun = planet.id === "sun";

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <Canvas
        camera={{ position: [0, 0.6, 3.2], fov: 45, near: 0.01, far: 1000 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#04050a"]} />
        <Stars radius={80} depth={40} count={6000} factor={2.5} fade />
        {!isSun && <ambientLight intensity={0.35} />}
        {!isSun && <directionalLight position={[5, 2, 3]} intensity={1.6} />}
        <Suspense fallback={null}>
          {isSun ? (
            <SunGlow url={planet.textureUrl} />
          ) : (
            <Planet url={planet.textureUrl} />
          )}
          {!isSun && planet.ringUrl && (
            <Ring url={planet.ringUrl} />
          )}
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={1.4}
          maxDistance={12}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
        />
      </Canvas>

      {/* Top bar: back + planet switcher */}
      <div className="absolute top-0 inset-x-0 z-20 p-3 flex items-start justify-between gap-3 pointer-events-none">
        <Link
          to="/atlas"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/60 backdrop-blur-xl px-3 py-1.5 text-xs font-mono uppercase tracking-widest hover:bg-black/80 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Atlas
        </Link>
        <div className="flex-1 flex justify-center">
          <PlanetSwitcher />
        </div>
        <div className="w-16" />
      </div>

      {/* Bottom info panel */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl px-5 py-3 text-center max-w-[520px]">
        <div className="text-xs font-mono uppercase tracking-[0.3em] text-white/60">
          {planet.blurb}
        </div>
        <div className="text-2xl font-bold mt-1 tracking-tight">{planet.name}</div>
        <div className="text-[11px] font-mono text-white/50 mt-1">
          Equatorial radius {planet.radiusKm.toLocaleString()} km · NASA-derived albedo (Solar System Scope, CC BY 4.0)
        </div>
      </div>
    </div>
  );
}