import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  Globe, ArrowRight, ShoppingCart, Users, Truck, CreditCard,
  BarChart3, Shield, Zap, Package, ChevronRight, ArrowUpRight,
  Layers, Building, Ship, Plane, TrendingUp, Star
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};

function Navbar() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/50"
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
        </div>
      </div>
    </motion.nav>
  );
}

function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Ambient Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-accent/8 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/3 blur-[200px]" />
      </div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      <motion.div style={{ y, opacity }} className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-mono uppercase tracking-[0.2em] mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            The Future of Global Commerce
          </motion.div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-foreground tracking-tight leading-[0.95]">
            <span className="block">Where Supply</span>
            <span className="block text-gradient mt-2">Meets Demand</span>
            <span className="block text-muted-foreground/60 text-4xl sm:text-5xl md:text-6xl lg:text-7xl mt-2">Into Infinity.</span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-lg md:text-xl text-muted-foreground mt-8 max-w-2xl mx-auto leading-relaxed"
          >
            The world's most advanced B2B & B2C marketplace. Source from primary sectors 
            to industry to services. One platform for the entire global economic arena.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
          >
            <Link to="/dashboard">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 gradient-primary text-primary-foreground rounded-full text-base font-semibold shadow-xl shadow-primary/30 flex items-center gap-2"
              >
                Enter Platform <ArrowRight className="w-5 h-5" />
              </motion.button>
            </Link>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-card border border-border rounded-full text-base font-medium text-foreground hover:border-primary/30 transition-colors"
            >
              Watch Demo
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Live Stats Ticker */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.7 }}
          className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
        >
          {[
            { label: "Trade Volume", value: "$847M+" },
            { label: "Countries", value: "194" },
            { label: "Active Merchants", value: "12,847" },
            { label: "Products Listed", value: "2.4M+" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl md:text-3xl font-mono font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-1.5">
          <div className="w-1 h-2 rounded-full bg-primary" />
        </motion.div>
      </motion.div>
    </section>
  );
}

function PlatformSection() {
  const features = [
    { icon: ShoppingCart, title: "Global Marketplace", desc: "Multi-sector B2B & B2C exchange across every industry — raw materials, energy, manufacturing, technology, agriculture, and services.", color: "from-primary/20 to-primary/5" },
    { icon: Users, title: "Enterprise CRM", desc: "Relationship intelligence that outperforms Salesforce. Track $585M+ in pipeline across every continent and sector.", color: "from-accent/20 to-accent/5" },
    { icon: Layers, title: "Full ERP Suite", desc: "Inventory, procurement, invoicing, and finance — managing $1.24B in tracked assets across every warehouse.", color: "from-success/20 to-success/5" },
    { icon: Truck, title: "Logistics Command", desc: "Real-time cargo tracking across sea, air, and land. 8,421 active shipments, 98.7% on-time delivery.", color: "from-warning/20 to-warning/5" },
    { icon: CreditCard, title: "Payments & Banking", desc: "Powered by Checkout.com — merchant services, card issuing, intelligent acceptance, and multi-currency settlement.", color: "from-primary/20 to-accent/5" },
    { icon: BarChart3, title: "Intelligence Hub", desc: "Real-time analytics, market feeds, commodity tracking, and AI-driven insights across 194 global markets.", color: "from-accent/20 to-primary/5" },
  ];

  return (
    <section id="platform" className="py-32 px-6 relative">
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)", backgroundSize: "40px 40px" }} />
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} className="text-center mb-20">
          <motion.span variants={fadeUp} className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Platform</motion.span>
          <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mt-4 tracking-tight">
            Everything. <span className="text-gradient">Everywhere.</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
            A complete operating system for the world's economy. Every tool, every sector, one platform.
          </motion.p>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-50px" }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              whileHover={{ y: -8, transition: { duration: 0.25 } }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 cursor-pointer hover:border-primary/20 transition-all duration-500"
            >
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-br ${f.color}`} />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <f.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{f.desc}</p>
                <div className="flex items-center gap-1 mt-6 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                  Learn more <ArrowUpRight className="w-3 h-3" />
                </div>
              </div>
            </motion.div>
          ))}
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
              NEXUS connects every node in the global supply chain — from primary extraction to industrial processing to consumer delivery. The complete economic cycle, digitized.
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
            {sectors.map((s, i) => (
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
          <p className="text-xs text-muted-foreground mt-4 md:mt-0">© 2026 NEXUS Global Commerce Platform. All rights reserved.</p>
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
