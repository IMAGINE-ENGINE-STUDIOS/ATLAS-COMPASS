import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import heroBg from "@/assets/hero-cockpit.png";
import {
  Globe, ArrowRight, ShoppingCart, Users, Truck, CreditCard,
  BarChart3, Shield, Zap, Package, ChevronRight, ArrowUpRight,
  Layers, Building, Ship, Plane, TrendingUp, Star, Menu, X
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};

const glowPulse = {
  animate: {
    boxShadow: [
      "0 0 20px hsl(185 80% 50% / 0.1)",
      "0 0 60px hsl(185 80% 50% / 0.2)",
      "0 0 20px hsl(185 80% 50% / 0.1)",
    ],
    transition: { duration: 3, repeat: Infinity },
  },
};

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/40 border-b border-border/30"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <Globe className="w-7 h-7 text-primary" />
          <span className="text-xl font-bold text-gradient tracking-tight">NEXUS</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {["Platform", "Marketplace", "Enterprise", "Logistics", "Payments"].map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {item}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
            Sign In
          </Link>
          <Link to="/dashboard">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="px-5 py-2 gradient-primary text-primary-foreground rounded-full text-sm font-semibold shadow-lg shadow-primary/25"
            >
              Get Started
            </motion.button>
          </Link>
          <button className="md:hidden text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="md:hidden bg-background/95 backdrop-blur-xl border-t border-border/30 px-6 py-4 space-y-3">
          {["Platform", "Marketplace", "Enterprise", "Logistics", "Payments"].map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMobileOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground py-2">{item}</a>
          ))}
        </motion.div>
      )}
    </motion.nav>
  );
}

function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1]);

  return (
    <section ref={ref} className="relative h-screen overflow-hidden">
      {/* Cockpit Background */}
      <motion.div style={{ scale }} className="absolute inset-0">
        <img
          src={heroBg}
          alt="NEXUS Command Center"
          className="w-full h-full object-cover object-center"
        />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background/90" />
        <div className="absolute inset-0 bg-background/20" />
      </motion.div>

      {/* Content positioned in the "screen" area of the cockpit */}
      <motion.div style={{ y, opacity: contentOpacity }} className="relative z-10 h-full flex flex-col items-center justify-center px-6">
        {/* Main hero content — positioned to appear "on screen" */}
        <div className="max-w-4xl mx-auto text-center -mt-[5vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-md text-primary text-xs font-mono uppercase tracking-[0.2em] mb-6"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              StartupFactoryHub Global Command
            </motion.div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground tracking-tight leading-[0.95] drop-shadow-2xl">
              <motion.span
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className="block"
              >
                Where Supply
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75, duration: 0.8 }}
                className="block text-gradient mt-1"
              >
                Meets Demand
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.8 }}
                className="block text-foreground/50 text-3xl sm:text-4xl md:text-5xl mt-2 font-light"
              >
                Into Infinity.
              </motion.span>
            </h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
              className="text-base md:text-lg text-foreground/70 mt-6 max-w-xl mx-auto leading-relaxed drop-shadow-lg"
            >
              The world's most advanced B2B & B2C marketplace. One command center 
              for the entire global economic arena.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8"
            >
              <Link to="/dashboard">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  animate={glowPulse.animate}
                  className="px-8 py-3.5 gradient-primary text-primary-foreground rounded-full text-sm font-semibold flex items-center gap-2"
                >
                  Enter Command Center <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-3.5 bg-card/30 backdrop-blur-md border border-border/50 rounded-full text-sm font-medium text-foreground hover:border-primary/30 transition-colors"
              >
                Watch Demo
              </motion.button>
            </motion.div>
          </motion.div>
        </div>

        {/* Live Stats — bottom of viewport, like a HUD overlay */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 0.7 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-card/20 backdrop-blur-xl rounded-2xl border border-border/30 p-4">
            {[
              { label: "Trade Volume", value: "$847M+" },
              { label: "Countries", value: "194" },
              { label: "Active Merchants", value: "12,847" },
              { label: "Products Listed", value: "2.4M+" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-xl md:text-2xl font-mono font-bold text-foreground">{stat.value}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function PlatformSection() {
  const nodes = [
    { id: "marketplace", icon: ShoppingCart, title: "Marketplace", desc: "B2B & B2C exchange", x: "50%", y: "8%" },
    { id: "crm", icon: Users, title: "CRM", desc: "Pipeline intelligence", x: "18%", y: "35%" },
    { id: "erp", icon: Layers, title: "ERP Suite", desc: "Assets & finance", x: "82%", y: "35%" },
    { id: "logistics", icon: Truck, title: "Logistics", desc: "Global cargo tracking", x: "12%", y: "68%" },
    { id: "payments", icon: CreditCard, title: "Payments", desc: "Checkout.com powered", x: "50%", y: "55%" },
    { id: "intel", icon: BarChart3, title: "Intelligence", desc: "AI-driven insights", x: "88%", y: "68%" },
  ];

  const connections = [
    { from: "marketplace", to: "crm" }, { from: "marketplace", to: "erp" },
    { from: "crm", to: "logistics" }, { from: "crm", to: "payments" },
    { from: "erp", to: "payments" }, { from: "erp", to: "intel" },
    { from: "logistics", to: "payments" }, { from: "payments", to: "intel" },
  ];

  const nodePositions: Record<string, { x: number; y: number }> = {
    marketplace: { x: 50, y: 8 }, crm: { x: 18, y: 35 }, erp: { x: 82, y: 35 },
    logistics: { x: 12, y: 68 }, payments: { x: 50, y: 55 }, intel: { x: 88, y: 68 },
  };

  return (
    <section id="platform" className="py-32 px-6 relative">
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)", backgroundSize: "40px 40px" }} />
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} className="text-center mb-16">
          <motion.span variants={fadeUp} className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Platform</motion.span>
          <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mt-4 tracking-tight">
            Everything. <span className="text-gradient">Connected.</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
            A living ecosystem where every module feeds into the next — an integrated nervous system for the world's economy.
          </motion.p>
        </motion.div>

        {/* Flow Diagram */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
          variants={stagger}
          className="relative w-full aspect-[16/10] max-h-[600px]"
        >
          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
                <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            {connections.map((c, i) => {
              const from = nodePositions[c.from];
              const to = nodePositions[c.to];
              return (
                <motion.line
                  key={i}
                  x1={from.x} y1={from.y + 5}
                  x2={to.x} y2={to.y}
                  stroke="url(#lineGrad)"
                  strokeWidth="0.15"
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: 0.3 + i * 0.1, ease: "easeInOut" }}
                />
              );
            })}
            {/* Animated pulse dots traveling along lines */}
            {connections.map((c, i) => {
              const from = nodePositions[c.from];
              const to = nodePositions[c.to];
              return (
                <motion.circle
                  key={`pulse-${i}`}
                  r="0.4"
                  fill="hsl(var(--primary))"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: [0, 1, 1, 0] }}
                  viewport={{ once: true }}
                  transition={{ duration: 2.5, delay: 1.5 + i * 0.2, repeat: Infinity, repeatDelay: 3 }}
                >
                  <animateMotion
                    dur={`${2.5 + i * 0.3}s`}
                    repeatCount="indefinite"
                    begin={`${1.5 + i * 0.2}s`}
                    path={`M ${from.x} ${from.y + 5} L ${to.x} ${to.y}`}
                  />
                </motion.circle>
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((node, i) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 * i, type: "spring", stiffness: 200 }}
              whileHover={{ scale: 1.12, zIndex: 20 }}
              className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
              style={{ left: node.x, top: node.y }}
            >
              {/* Glow ring */}
              <motion.div
                className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl"
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, delay: i * 0.4 }}
              />
              {/* Card */}
              <div className="relative bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-4 md:p-5 min-w-[120px] md:min-w-[160px] text-center group-hover:border-primary/40 group-hover:shadow-[0_0_30px_hsl(var(--primary)/0.15)] transition-all duration-500">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2 group-hover:bg-primary/20 transition-colors">
                  <node.icon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                </div>
                <h3 className="text-sm md:text-base font-bold text-foreground">{node.title}</h3>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{node.desc}</p>
              </div>
            </motion.div>
          ))}

          {/* Central pulsing core */}
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary"
            animate={{ scale: [1, 2, 1], opacity: [0.8, 0.2, 0.8] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          />
        </motion.div>
      </div>
    </section>
  );
}

function SectorsSection() {
  const sectors = [
    { name: "Primary Sector", examples: "Oil & Gas · Mining · Agriculture · Forestry", value: "$284.1M", growth: "+18.2%", icon: "🛢️" },
    { name: "Secondary Sector", examples: "Manufacturing · Processing · Construction", value: "$312.7M", growth: "+9.5%", icon: "🏭" },
    { name: "Tertiary Sector", examples: "Finance · Retail · Services · Technology", value: "$250.4M", growth: "+6.1%", icon: "🏦" },
  ];

  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/3 blur-[200px]" />

      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.span variants={fadeUp} className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Economic Sectors</motion.span>
            <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl font-bold text-foreground mt-4 tracking-tight leading-[1.1]">
              From Raw Earth<br />
              <span className="text-gradient">To Final Product.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground mt-6 leading-relaxed">
              NEXUS connects every node in the global supply chain — from primary extraction to industrial processing to consumer delivery.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8">
              <Link to="/dashboard/marketplace">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="px-6 py-3 gradient-primary text-primary-foreground rounded-full text-sm font-semibold shadow-lg shadow-primary/25 flex items-center gap-2">
                  Explore Marketplace <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
            </motion.div>
          </div>

          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="space-y-4">
            {sectors.map((s) => (
              <motion.div
                key={s.name}
                variants={fadeUp}
                whileHover={{ x: 8, transition: { duration: 0.2 } }}
                className="group bg-card rounded-2xl border border-border p-6 hover:border-primary/20 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-5">
                  <div className="text-4xl">{s.icon}</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{s.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{s.examples}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-mono font-bold text-foreground">{s.value}</p>
                    <p className="text-xs font-semibold text-success">{s.growth}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function LogisticsShowcase() {
  const routes = [
    { from: "Rotterdam", to: "Singapore", mode: Ship, cargo: "24 containers", days: "18 days" },
    { from: "Dubai", to: "Houston", mode: Ship, cargo: "500K bbl crude", days: "22 days" },
    { from: "Shanghai", to: "Los Angeles", mode: Plane, cargo: "2,400 units", days: "2 days" },
  ];

  return (
    <section id="logistics" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} className="text-center mb-20">
          <motion.span variants={fadeUp} className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Logistics</motion.span>
          <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mt-4 tracking-tight">
            Track <span className="text-gradient">Everything.</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="text-lg text-muted-foreground mt-6 max-w-xl mx-auto">
            Real-time visibility across every shipment, route, and cargo — sea, air, and land.
          </motion.p>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="space-y-4 max-w-3xl mx-auto">
          {routes.map((route, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              whileHover={{ scale: 1.02 }}
              className="group bg-card rounded-2xl border border-border p-6 hover:border-primary/20 transition-all"
            >
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <route.mode className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-sm font-bold text-foreground">{route.from}</span>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="h-px flex-1 bg-border" />
                    <motion.div animate={{ x: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}>
                      <ArrowRight className="w-4 h-4 text-primary" />
                    </motion.div>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <span className="text-sm font-bold text-foreground">{route.to}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{route.cargo}</p>
                  <p className="text-xs font-mono text-primary font-semibold">{route.days}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function PaymentsSection() {
  return (
    <section id="payments" className="py-32 px-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent/5 blur-[150px]" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div variants={stagger}>
            <motion.span variants={fadeUp} className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Payments</motion.span>
            <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl font-bold text-foreground mt-4 tracking-tight leading-[1.1]">
              Money Moves<br />
              <span className="text-gradient">At Scale.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground mt-6 leading-relaxed">
              Powered by Checkout.com. Online banking, merchant services, card issuing, 
              intelligent acceptance — processing $124.7M daily across every payment rail.
            </motion.p>
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 mt-8">
              {[
                { label: "Acceptance Rate", value: "99.2%" },
                { label: "Processed Daily", value: "$124.7M" },
                { label: "Merchant Accounts", value: "12,847" },
                { label: "Fraud Blocked", value: "$2.1M" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-mono font-bold text-foreground">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="space-y-3">
            {[
              { icon: CreditCard, name: "Merchant Services", desc: "POS, payment links, invoicing" },
              { icon: Building, name: "Online Banking", desc: "ACH, SWIFT, wire transfers" },
              { icon: Shield, name: "Card Issuing", desc: "Virtual & physical cards" },
              { icon: Zap, name: "Intelligent Acceptance", desc: "AI-powered routing & optimization" },
              { icon: BarChart3, name: "Settlement", desc: "Multi-currency, real-time settlement" },
            ].map((s) => (
              <motion.div
                key={s.name}
                variants={fadeUp}
                whileHover={{ x: 8 }}
                className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/20 transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
                  <s.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/3 to-background" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[150px]" />
      
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="max-w-4xl mx-auto text-center relative z-10"
      >
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground tracking-tight">
          The Future of<br />
          <span className="text-gradient">Global Commerce.</span>
        </h2>
        <p className="text-lg text-muted-foreground mt-6 max-w-xl mx-auto">
          Cargo companies, governments, oil companies, dealers, and consumers — 
          all in one platform. Join the world's largest economic arena.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <Link to="/dashboard">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-10 py-4 gradient-primary text-primary-foreground rounded-full text-base font-semibold shadow-xl shadow-primary/30 flex items-center gap-2"
            >
              Enter NEXUS <ArrowRight className="w-5 h-5" />
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {[
            { title: "Platform", links: ["Dashboard", "Marketplace", "CRM", "ERP"] },
            { title: "Services", links: ["Logistics", "Payments", "Banking", "Card Issuing"] },
            { title: "Enterprise", links: ["API Docs", "Integrations", "Security", "Compliance"] },
            { title: "Company", links: ["About", "Careers", "Press", "Contact"] },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-border">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-gradient">NEXUS</span>
          </div>
          <p className="text-xs text-muted-foreground mt-4 md:mt-0">© 2026 NEXUS Global Commerce Platform. Powered by StartupFactoryHub.</p>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <PlatformSection />
      <SectorsSection />
      <LogisticsShowcase />
      <PaymentsSection />
      <CTASection />
      <Footer />
    </div>
  );
}
