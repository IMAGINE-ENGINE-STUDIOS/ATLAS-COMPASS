import { motion } from "framer-motion";

const orbs = [
  { color: "from-[hsl(280,80%,40%)] to-[hsl(320,70%,30%)]", size: 800, x: "15%", y: "10%", dur: 25 },
  { color: "from-[hsl(200,90%,35%)] to-[hsl(240,80%,25%)]", size: 700, x: "75%", y: "5%", dur: 30 },
  { color: "from-[hsl(330,70%,35%)] to-[hsl(280,60%,20%)]", size: 600, x: "60%", y: "30%", dur: 22 },
  { color: "from-[hsl(185,80%,30%)] to-[hsl(220,70%,20%)]", size: 750, x: "30%", y: "50%", dur: 28 },
  { color: "from-[hsl(260,75%,45%)] to-[hsl(300,65%,25%)]", size: 650, x: "80%", y: "60%", dur: 35 },
  { color: "from-[hsl(340,80%,30%)] to-[hsl(20,70%,25%)]", size: 500, x: "10%", y: "70%", dur: 20 },
  { color: "from-[hsl(210,85%,40%)] to-[hsl(260,75%,30%)]", size: 550, x: "50%", y: "80%", dur: 32 },
  { color: "from-[hsl(170,70%,30%)] to-[hsl(200,80%,20%)]", size: 700, x: "90%", y: "90%", dur: 27 },
];

export default function NebulaBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Base dark */}
      <div className="absolute inset-0 bg-[hsl(240,20%,4%)]" />

      {/* Gas orbs */}
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full bg-gradient-to-br ${orb.color} opacity-[0.15]`}
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            filter: `blur(${orb.size / 4}px)`,
            transform: "translate(-50%, -50%)",
          }}
          animate={{
            x: [0, 60, -40, 30, 0],
            y: [0, -50, 30, -20, 0],
            scale: [1, 1.15, 0.9, 1.1, 1],
            opacity: [0.15, 0.22, 0.12, 0.2, 0.15],
          }}
          transition={{
            duration: orb.dur,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Star dust */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(1px 1px at 20px 30px, hsl(var(--foreground)), transparent), radial-gradient(1px 1px at 40px 70px, hsl(var(--primary)), transparent), radial-gradient(1px 1px at 80px 20px, hsl(var(--accent)), transparent)",
          backgroundSize: "200px 200px",
        }}
      />

      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")" }} />
    </div>
  );
}
