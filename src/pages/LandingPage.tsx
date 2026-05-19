import { Link } from "react-router-dom";
import { useRef, useState, ReactNode } from "react";
import NebulaBackground from "@/components/NebulaBackground";
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

/* ── Glass Card primitive ─────────────────────── */
function Glass({ children, className = "", hover = true }: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <div
     
     
      className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.4)] ${hover ? "cursor-pointer hover:border-white/[0.15] hover:bg-white/[0.06]" : ""} transition-all duration-500 ${className}`}
    >
      {/* Glass sheen */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ── Navbar ─────────────────────── */
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav
     
     
     
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl bg-white/[0.03] border-b border-white/[0.06]"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <Globe className="w-7 h-7 text-primary" />
          <span className="text-xl font-bold text-gradient tracking-tight">ATLAS</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {["Platform", "Marketplace", "Enterprise", "Logistics", "Payments"].map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} className="text-sm text-white/50 hover:text-white transition-colors duration-300">
              {item}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-sm text-white/50 hover:text-white transition-colors hidden sm:block">Sign In</Link>
          <Link to="/dashboard">
            <button
             
             
              className="px-5 py-2 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-full text-sm font-semibold hover:bg-white/15 transition-colors"
            >
              Get Started
            </button>
          </Link>
          <button className="md:hidden text-white" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden bg-black/60 backdrop-blur-2xl border-t border-white/[0.06] px-6 py-4 space-y-3">
          {["Platform", "Marketplace", "Enterprise", "Logistics", "Payments"].map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMobileOpen(false)} className="block text-sm text-white/50 hover:text-white py-2">{item}</a>
          ))}
        </div>
      )}
    </nav>
  );
}

/* ── Hero ─────────────────────── */
function HeroSection() {
  const ref = useRef(null);

  return (
    <section ref={ref} className="relative h-screen overflow-hidden">
      <div className="absolute inset-0">
        <img src={heroBg} alt="ATLAS Command Center" className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(240,20%,4%)]/70 via-transparent to-[hsl(240,20%,4%)]/95" />
      </div>

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
        <div className="max-w-4xl mx-auto text-center -mt-[5vh]">
          <div>
            <div
             
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-2xl text-primary text-xs font-mono uppercase tracking-[0.2em] mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              StartupFactoryHub Global Command
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[0.95]">
              <span className="block">Where Supply</span>
              <span className="block text-gradient mt-1">Meets Demand</span>
              <span className="block text-white/40 text-3xl sm:text-4xl md:text-5xl mt-2 font-light">Into Infinity.</span>
            </h1>

            <p className="text-base md:text-lg text-white/60 mt-6 max-w-xl mx-auto leading-relaxed">
              The world's most advanced B2B & B2C marketplace. One command center for the entire global economic arena.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
              <Link to="/atlas">
                <button
                  className="px-8 py-3.5 bg-white/10 backdrop-blur-2xl border border-white/20 text-white rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-white/15 transition-colors shadow-[0_0_30px_rgba(0,200,255,0.1)]"
                >
                  Enter Command Center <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <Link to="/dashboard">
                <button
                  className="px-8 py-3.5 bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-full text-sm font-medium text-white/70 hover:text-white hover:border-white/20 transition-all"
                >
                  Dashboard
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* HUD Stats */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/[0.08] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
            {[
              { label: "Trade Volume", value: "$847M+" },
              { label: "Countries", value: "194" },
              { label: "Active Merchants", value: "12,847" },
              { label: "Products Listed", value: "2.4M+" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-xl md:text-2xl font-mono font-bold text-white">{stat.value}</p>
                <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Platform Flow Diagram ─────────────────────── */
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

  const np: Record<string, { x: number; y: number }> = {
    marketplace: { x: 50, y: 8 }, crm: { x: 18, y: 35 }, erp: { x: 82, y: 35 },
    logistics: { x: 12, y: 68 }, payments: { x: 50, y: 55 }, intel: { x: 88, y: 68 },
  };

  return (
    <section id="platform" className="py-32 px-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Platform</span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mt-4 tracking-tight">
            Everything. <span className="text-gradient">Connected.</span>
          </h2>
          <p className="text-lg text-white/50 mt-6 max-w-2xl mx-auto">
            A living ecosystem where every module feeds into the next — an integrated nervous system for the world's economy.
          </p>
        </div>

        <div className="relative w-full aspect-[16/10] max-h-[600px]">
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            {connections.map((c, i) => (
              <line key={i} x1={np[c.from].x} y1={np[c.from].y + 5} x2={np[c.to].x} y2={np[c.to].y}
                stroke="url(#lineGrad)" strokeWidth="0.15"
               
               
              />
            ))}
            {connections.map((c, i) => (
              <circle key={`p-${i}`} r="0.4" fill="hsl(var(--primary))"
               
               
              >
                <animateMotion dur={`${2.5 + i * 0.3}s`} repeatCount="indefinite" begin={`${1.5 + i * 0.2}s`}
                  path={`M ${np[c.from].x} ${np[c.from].y + 5} L ${np[c.to].x} ${np[c.to].y}`}
                />
              </circle>
            ))}
          </svg>

          {nodes.map((node, i) => (
            <div key={node.id}
             
             
             
              className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
             
            >
              <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl"
               
               
              />
              <div className="relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-4 md:p-5 min-w-[120px] md:min-w-[160px] text-center group-hover:border-white/20 group-hover:shadow-[0_0_40px_rgba(0,200,255,0.1)] transition-all duration-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/[0.06] flex items-center justify-center mx-auto mb-2 group-hover:bg-white/10 transition-colors">
                  <node.icon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                </div>
                <h3 className="text-sm md:text-base font-bold text-white">{node.title}</h3>
                <p className="text-[10px] md:text-xs text-white/40 mt-1">{node.desc}</p>
              </div>
            </div>
          ))}

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary"
           
           
          />
        </div>
      </div>
    </section>
  );
}

/* ── Sectors ─────────────────────── */
function SectorsSection() {
  const sectors = [
    { name: "Primary Sector", examples: "Oil & Gas · Mining · Agriculture · Forestry", value: "$284.1M", growth: "+18.2%", icon: "🛢️" },
    { name: "Secondary Sector", examples: "Manufacturing · Processing · Construction", value: "$312.7M", growth: "+9.5%", icon: "🏭" },
    { name: "Tertiary Sector", examples: "Finance · Retail · Services · Technology", value: "$250.4M", growth: "+6.1%", icon: "🏦" },
  ];

  return (
    <section className="py-32 px-6 relative z-10 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Economic Sectors</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mt-4 tracking-tight leading-[1.1]">
              From Raw Earth<br /><span className="text-gradient">To Final Product.</span>
            </h2>
            <p className="text-lg text-white/50 mt-6 leading-relaxed">
              ATLAS connects every node in the global supply chain — from primary extraction to industrial processing to consumer delivery.
            </p>
            <div className="mt-8">
              <Link to="/dashboard/marketplace">
                <button
                  className="px-6 py-3 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-white/15 transition-colors"
                >
                  Explore Marketplace <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            {sectors.map((s) => (
              <Glass key={s.name} className="p-6">
                <div className="flex items-center gap-5">
                  <div className="text-4xl">{s.icon}</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">{s.name}</h3>
                    <p className="text-xs text-white/40 mt-1">{s.examples}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-mono font-bold text-white">{s.value}</p>
                    <p className="text-xs font-semibold text-[hsl(var(--success))]">{s.growth}</p>
                  </div>
                </div>
              </Glass>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Logistics ─────────────────────── */
function LogisticsShowcase() {
  const routes = [
    { from: "Rotterdam", to: "Singapore", mode: Ship, cargo: "24 containers", days: "18 days" },
    { from: "Dubai", to: "Houston", mode: Ship, cargo: "500K bbl crude", days: "22 days" },
    { from: "Shanghai", to: "Los Angeles", mode: Plane, cargo: "2,400 units", days: "2 days" },
  ];

  return (
    <section id="logistics" className="py-32 px-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Logistics</span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mt-4 tracking-tight">
            Track <span className="text-gradient">Everything.</span>
          </h2>
          <p className="text-lg text-white/50 mt-6 max-w-xl mx-auto">
            Real-time visibility across every shipment, route, and cargo — sea, air, and land.
          </p>
        </div>

        <div className="space-y-4 max-w-3xl mx-auto">
          {routes.map((route, i) => (
            <Glass key={i} className="p-6">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                  <route.mode className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-sm font-bold text-white">{route.from}</span>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="h-px flex-1 bg-white/10" />
                    <div>
                      <ArrowRight className="w-4 h-4 text-primary" />
                    </div>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                  <span className="text-sm font-bold text-white">{route.to}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/40">{route.cargo}</p>
                  <p className="text-xs font-mono text-primary font-semibold">{route.days}</p>
                </div>
              </div>
            </Glass>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Payments ─────────────────────── */
function PaymentsSection() {
  return (
    <section id="payments" className="py-32 px-6 relative z-10 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Payments</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mt-4 tracking-tight leading-[1.1]">
              Money Moves<br /><span className="text-gradient">At Scale.</span>
            </h2>
            <p className="text-lg text-white/50 mt-6 leading-relaxed">
              Powered by Checkout.com. Online banking, merchant services, card issuing, intelligent acceptance — processing $124.7M daily across every payment rail.
            </p>
            <div className="grid grid-cols-2 gap-4 mt-8">
              {[
                { label: "Acceptance Rate", value: "99.2%" },
                { label: "Processed Daily", value: "$124.7M" },
                { label: "Merchant Accounts", value: "12,847" },
                { label: "Fraud Blocked", value: "$2.1M" },
              ].map((s) => (
                <div key={s.label} className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl p-4">
                  <p className="text-2xl font-mono font-bold text-white">{s.value}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {[
              { icon: CreditCard, name: "Merchant Services", desc: "POS, payment links, invoicing" },
              { icon: Building, name: "Online Banking", desc: "ACH, SWIFT, wire transfers" },
              { icon: Shield, name: "Card Issuing", desc: "Virtual & physical cards" },
              { icon: Zap, name: "Intelligent Acceptance", desc: "AI-powered routing & optimization" },
              { icon: BarChart3, name: "Settlement", desc: "Multi-currency, real-time settlement" },
            ].map((s) => (
              <Glass key={s.name} className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-primary shrink-0">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">{s.name}</p>
                    <p className="text-xs text-white/40">{s.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20" />
                </div>
              </Glass>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── CTA ─────────────────────── */
function CTASection() {
  return (
    <section className="py-32 px-6 relative z-10 overflow-hidden">
      <div
       
       
        className="max-w-4xl mx-auto text-center"
      >
        <Glass hover={false} className="p-12 md:p-20">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight">
            The Future of<br /><span className="text-gradient">Global Commerce.</span>
          </h2>
          <p className="text-lg text-white/50 mt-6 max-w-xl mx-auto">
            Cargo companies, governments, oil companies, dealers, and consumers — all in one platform. Join the world's largest economic arena.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link to="/dashboard">
              <button
                className="px-10 py-4 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-full text-base font-semibold flex items-center gap-2 hover:bg-white/15 shadow-[0_0_40px_rgba(0,200,255,0.1)] transition-all"
              >
                Enter ATLAS <ArrowRight className="w-5 h-5" />
              </button>
            </Link>
          </div>
        </Glass>
      </div>
    </section>
  );
}

/* ── Footer ─────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-16 px-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {[
            { title: "Platform", links: ["Dashboard", "Marketplace", "CRM", "ERP"] },
            { title: "Services", links: ["Logistics", "Payments", "Banking", "Card Issuing"] },
            { title: "Enterprise", links: ["API Docs", "Integrations", "Security", "Compliance"] },
            { title: "Company", links: ["About", "Careers", "Press", "Contact"] },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}><a href="#" className="text-sm text-white/40 hover:text-white transition-colors">{link}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-gradient">ATLAS</span>
          </div>
          <p className="text-xs text-white/30 mt-4 md:mt-0">© 2026 ATLAS Global Commerce Platform. Powered by StartupFactoryHub.</p>
        </div>
      </div>
    </footer>
  );
}

/* ── Main Export ─────────────────────── */
export default function LandingPage() {
  return (
    <div className="min-h-screen relative">
      <NebulaBackground />
      <div className="relative z-10">
        <Navbar />
        <HeroSection />
        <PlatformSection />
        <SectorsSection />
        <LogisticsShowcase />
        <PaymentsSection />
        <CTASection />
        <Footer />
      </div>
    </div>
  );
}
