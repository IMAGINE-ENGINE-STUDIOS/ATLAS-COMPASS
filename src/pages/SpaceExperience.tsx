import { Suspense, useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Html, useTexture, OrbitControls, useKeyboardControls, KeyboardControls, PointerLockControls, Environment, Float } from "@react-three/drei";
import * as THREE from "three";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Maximize2, Search } from "lucide-react";

/* ───────── Earth Component ───────── */
function Earth({ onClick }: { onClick: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create earth-like texture procedurally
  const [earthMap, bumpMap] = useMemo(() => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Ocean base
    ctx.fillStyle = "#1a4a7a";
    ctx.fillRect(0, 0, size, size);

    // Landmasses - simplified continent shapes
    ctx.fillStyle = "#2d6b3f";
    // North America
    ctx.beginPath();
    ctx.ellipse(120, 140, 60, 50, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // South America
    ctx.beginPath();
    ctx.ellipse(160, 280, 30, 60, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Europe/Africa
    ctx.beginPath();
    ctx.ellipse(270, 160, 25, 40, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(275, 260, 35, 55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Asia
    ctx.beginPath();
    ctx.ellipse(360, 140, 70, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    // Australia
    ctx.beginPath();
    ctx.ellipse(410, 310, 25, 18, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Add some variation
    ctx.fillStyle = "#3a8a55";
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 8 + 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Clouds
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.random() * 30 + 10, Math.random() * 8 + 3, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;

    // Bump map
    const bumpCanvas = document.createElement("canvas");
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bctx = bumpCanvas.getContext("2d")!;
    bctx.drawImage(canvas, 0, 0);
    const bumpTex = new THREE.CanvasTexture(bumpCanvas);

    return [texture, bumpTex];
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <group position={[0, 2, -25]}>
      {/* Atmosphere glow */}
      <mesh scale={[8.3, 8.3, 8.3]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color="#4a9eff" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
      
      {/* Earth */}
      <mesh ref={meshRef} scale={[8, 8, 8]} onClick={onClick}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          map={earthMap}
          bumpMap={bumpMap}
          bumpScale={0.05}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      {/* City lights on dark side - dots */}
      {Array.from({ length: 60 }).map((_, i) => {
        const phi = Math.acos(2 * Math.random() - 1);
        const theta = Math.random() * Math.PI * 2;
        const r = 8.05;
        return (
          <mesh key={i} position={[
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi) + 2,
            r * Math.sin(phi) * Math.sin(theta) - 25
          ].map((v, idx) => idx === 1 ? v - 2 : idx === 2 ? v + 25 : v) as [number, number, number]}>
            <sphereGeometry args={[0.03, 4, 4]} />
            <meshBasicMaterial color="#ffaa44" />
          </mesh>
        );
      })}
    </group>
  );
}

/* ───────── Spaceship Interior ───────── */
function SpaceshipInterior() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[20, 30]} />
        <meshStandardMaterial color="#2a2a35" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Floor grid lines */}
      {Array.from({ length: 21 }).map((_, i) => (
        <mesh key={`gx-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[-10 + i, -0.99, 0]}>
          <planeGeometry args={[0.02, 30]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0.1} />
        </mesh>
      ))}
      {Array.from({ length: 31 }).map((_, i) => (
        <mesh key={`gz-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.99, -15 + i]}>
          <planeGeometry args={[20, 0.02]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0.1} />
        </mesh>
      ))}

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 6, 0]}>
        <planeGeometry args={[20, 30]} />
        <meshStandardMaterial color="#1a1a25" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* Side walls */}
      <mesh position={[-10, 2.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[30, 7]} />
        <meshStandardMaterial color="#1e1e2a" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[10, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[30, 7]} />
        <meshStandardMaterial color="#1e1e2a" roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Front window frame - curved */}
      <mesh position={[0, 3, -14.9]}>
        <boxGeometry args={[16, 0.3, 0.2]} />
        <meshStandardMaterial color="#d4d4d8" roughness={0.2} metalness={0.9} />
      </mesh>
      <mesh position={[0, -0.5, -14.9]}>
        <boxGeometry args={[16, 0.3, 0.2]} />
        <meshStandardMaterial color="#d4d4d8" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* Console/Dashboard */}
      <group position={[0, 0, -10]}>
        {/* Main console surface */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[8, 0.15, 2]} />
          <meshStandardMaterial color="#d0cfc8" roughness={0.3} metalness={0.5} />
        </mesh>
        {/* Console front panel */}
        <mesh position={[0, -0.1, 1]}>
          <boxGeometry args={[8, 1, 0.1]} />
          <meshStandardMaterial color="#1a1a22" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* HUD screens on console */}
        <mesh position={[0, 0.58, 0]} rotation={[-0.3, 0, 0]}>
          <planeGeometry args={[6, 1.5]} />
          <meshBasicMaterial color="#0a1628" />
        </mesh>
        {/* HUD elements */}
        <HUDScreen position={[-2, 0.6, -0.1]} />
        <HUDScreen position={[0, 0.6, -0.1]} color="#00ff88" />
        <HUDScreen position={[2, 0.6, -0.1]} color="#ffaa00" />

        {/* Globe on console */}
        <Float speed={2} rotationIntensity={0.3} floatIntensity={0.2}>
          <mesh position={[0, 1.5, 0]} scale={[0.5, 0.5, 0.5]}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshStandardMaterial color="#2255aa" transparent opacity={0.6} wireframe />
          </mesh>
        </Float>

        {/* Side wings of console */}
        <mesh position={[-5, 0.3, 0.5]} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[3, 0.1, 1.5]} />
          <meshStandardMaterial color="#d0cfc8" roughness={0.3} metalness={0.5} />
        </mesh>
        <mesh position={[5, 0.3, 0.5]} rotation={[0, -0.3, 0]}>
          <boxGeometry args={[3, 0.1, 1.5]} />
          <meshStandardMaterial color="#d0cfc8" roughness={0.3} metalness={0.5} />
        </mesh>
      </group>

      {/* Ambient light strips along walls */}
      {[-9.9, 9.9].map((x, i) => (
        <mesh key={`light-strip-${i}`} position={[x, 0, 0]} rotation={[0, x > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          <planeGeometry args={[28, 0.05]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0.5} />
        </mesh>
      ))}

      {/* Ceiling light strips */}
      {[-3, 0, 3].map((x, i) => (
        <mesh key={`ceil-${i}`} position={[x, 5.99, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.1, 28]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* ───────── HUD Screen elements ───────── */
function HUDScreen({ position, color = "#00d4ff" }: { position: [number, number, number]; color?: string }) {
  const ref = useRef<THREE.Group>(null);
  
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      ref.current.children.forEach((child, i) => {
        if ((child as THREE.Mesh).material) {
          ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 
            0.3 + Math.sin(t * 2 + i) * 0.2;
        }
      });
    }
  });

  return (
    <group ref={ref} position={position} rotation={[-0.3, 0, 0]}>
      {/* Animated bars */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[-0.4 + i * 0.2, 0, 0.01]}>
          <planeGeometry args={[0.12, 0.3 + Math.random() * 0.4]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
      ))}
      {/* Circle indicator */}
      <mesh position={[0, 0.5, 0.01]}>
        <ringGeometry args={[0.15, 0.18, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/* ───────── Player Controller ───────── */
function PlayerController() {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const keys = useRef({ w: false, a: false, s: false, d: false });

  // Set initial position
  useMemo(() => {
    camera.position.set(0, 1.6, 5);
    camera.lookAt(0, 1.6, -10);
  }, [camera]);

  useFrame((_, delta) => {
    const speed = 5;
    const direction = new THREE.Vector3();

    if (keys.current.w) direction.z -= 1;
    if (keys.current.s) direction.z += 1;
    if (keys.current.a) direction.x -= 1;
    if (keys.current.d) direction.x += 1;

    if (direction.length() > 0) {
      direction.normalize();
      direction.applyEuler(camera.rotation);
      direction.y = 0;
      camera.position.addScaledVector(direction, speed * delta);
    }

    // Clamp position to spaceship bounds
    camera.position.x = Math.max(-9, Math.min(9, camera.position.x));
    camera.position.z = Math.max(-13, Math.min(14, camera.position.z));
    camera.position.y = 1.6;
  });

  // Keyboard events
  useMemo(() => {
    const onDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) (keys.current as any)[key] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) (keys.current as any)[key] = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  return <PointerLockControls />;
}

/* ───────── Search Panel (HTML overlay in 3D) ───────── */
function EarthSearchPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results] = useState([
    { name: "North America", sector: "Technology & Finance", gdp: "$28.5T" },
    { name: "Europe", sector: "Manufacturing & Services", gdp: "$23.1T" },
    { name: "Asia Pacific", sector: "Production & Export", gdp: "$38.2T" },
    { name: "Africa", sector: "Resources & Agriculture", gdp: "$3.1T" },
    { name: "South America", sector: "Agriculture & Mining", gdp: "$4.2T" },
    { name: "Middle East", sector: "Energy & Trade", gdp: "$3.8T" },
  ]);

  const filtered = results.filter(r => 
    r.name.toLowerCase().includes(query.toLowerCase()) || 
    r.sector.toLowerCase().includes(query.toLowerCase())
  );

  if (!visible) return null;

  return (
    <Html fullscreen>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="w-full max-w-2xl mx-4 rounded-2xl border p-6"
          style={{
            background: "rgba(20, 25, 40, 0.95)",
            borderColor: "rgba(0, 212, 255, 0.2)",
            boxShadow: "0 0 60px rgba(0, 212, 255, 0.1)",
          }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold" style={{ color: "#00d4ff" }}>
              🌍 StartupFactoryHub Earth — Global Search
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">✕</button>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#00d4ff" }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search regions, sectors, markets..."
              className="w-full rounded-xl pl-12 pr-4 py-3 text-sm outline-none"
              style={{
                background: "rgba(0, 212, 255, 0.05)",
                border: "1px solid rgba(0, 212, 255, 0.2)",
                color: "#e0e0e0",
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filtered.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all"
                style={{
                  background: "rgba(0, 212, 255, 0.03)",
                  border: "1px solid rgba(0, 212, 255, 0.08)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(0, 212, 255, 0.1)";
                  e.currentTarget.style.borderColor = "rgba(0, 212, 255, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(0, 212, 255, 0.03)";
                  e.currentTarget.style.borderColor = "rgba(0, 212, 255, 0.08)";
                }}
              >
                <div>
                  <p className="font-semibold text-white">{r.name}</p>
                  <p className="text-xs" style={{ color: "#888" }}>{r.sector}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold" style={{ color: "#00d4ff" }}>{r.gdp}</p>
                  <p className="text-xs" style={{ color: "#666" }}>GDP</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </Html>
  );
}

/* ───────── Main Scene ───────── */
function Scene() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, -5]} intensity={1} color="#ffffff" />
      <pointLight position={[0, 5, -10]} intensity={0.5} color="#00d4ff" />
      <pointLight position={[0, 1, -9]} intensity={0.3} color="#00ff88" />

      {/* Stars background */}
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      {/* Earth */}
      <Earth onClick={() => setSearchOpen(true)} />

      {/* Spaceship */}
      <SpaceshipInterior />

      {/* Search panel */}
      <EarthSearchPanel visible={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Player */}
      <PlayerController />
    </>
  );
}

/* ───────── Page Wrapper ───────── */
export default function SpaceExperience() {
  const [entered, setEntered] = useState(false);

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden">
      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 200 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Suspense fallback={null}>
          {entered && <Scene />}
          {!entered && (
            <>
              <ambientLight intensity={0.3} />
              <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
              <Earth onClick={() => {}} />
            </>
          )}
        </Suspense>
      </Canvas>

      {/* UI Overlay */}
      {!entered ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center"
          style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 100%)" }}
        >
          <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 text-sm" style={{ color: "#00d4ff" }}>
            <ArrowLeft className="w-4 h-4" /> Back to ATLAS
          </Link>

          <motion.h1
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-5xl md:text-7xl font-black tracking-tight text-white mb-4 text-center"
          >
            STARTUP<span style={{ color: "#00d4ff" }}>FACTORY</span>HUB
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-lg mb-8 max-w-md text-center"
            style={{ color: "#888" }}
          >
            Walk the bridge. Explore Earth's markets in 3D. The global economy at your fingertips.
          </motion.p>

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setEntered(true)}
            className="px-8 py-4 rounded-xl text-lg font-bold tracking-wide flex items-center gap-3"
            style={{
              background: "linear-gradient(135deg, #00d4ff, #0088cc)",
              color: "#000",
              boxShadow: "0 0 40px rgba(0, 212, 255, 0.3)",
            }}
          >
            <Maximize2 className="w-5 h-5" />
            Enter Command Center
          </motion.button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-6 text-xs font-mono"
            style={{ color: "#555" }}
          >
            WASD to move · Mouse to look · Click Earth to search
          </motion.p>
        </motion.div>
      ) : (
        <div className="absolute top-4 left-4 z-10">
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: "rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(0, 212, 255, 0.2)",
              color: "#00d4ff",
            }}
          >
            <ArrowLeft className="w-4 h-4" /> Exit
          </Link>
          <p className="mt-2 text-xs font-mono px-2" style={{ color: "#555" }}>
            WASD move · Click Earth to search
          </p>
        </div>
      )}
    </div>
  );
}
