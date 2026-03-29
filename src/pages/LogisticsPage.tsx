import { Truck, MapPin, Ship, Plane, Clock, CheckCircle, ArrowRight, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { PageContainer, AnimatedSection, HeroHeader, GlassCard, EditorialDivider, fadeUp, staggerContainer } from "@/components/AnimatedLayout";
import { StatusBadge } from "@/components/DashboardWidgets";

const logStats = [
  { title: "Active Shipments", value: "8,421", sub: "194 countries", icon: <Truck className="w-5 h-5" /> },
  { title: "On-Time Rate", value: "98.7%", sub: "+0.4% vs last month", icon: <CheckCircle className="w-5 h-5" /> },
  { title: "Avg Transit", value: "4.2d", sub: "-0.3 days improved", icon: <Clock className="w-5 h-5" /> },
  { title: "Active Routes", value: "2,847", sub: "Sea, Air, Land, Rail", icon: <MapPin className="w-5 h-5" /> },
];

const shipments = [
  { id: "SHP-98421", route: "Rotterdam → Singapore", mode: "Sea", modeIcon: Ship, cargo: "24 containers", status: "In Transit", variant: "default" as const, progress: "Day 12 of 18", eta: "Mar 28", pct: 67 },
  { id: "SHP-98420", route: "Dubai → Houston", mode: "Sea", modeIcon: Ship, cargo: "500K bbl crude", status: "In Transit", variant: "default" as const, progress: "Day 8 of 22", eta: "Apr 5", pct: 36 },
  { id: "SHP-98419", route: "Shanghai → LA", mode: "Air", modeIcon: Plane, cargo: "2,400 units", status: "Customs", variant: "warning" as const, progress: "Awaiting clearance", eta: "Mar 22", pct: 85 },
  { id: "SHP-98418", route: "São Paulo → Hamburg", mode: "Sea", modeIcon: Ship, cargo: "45K tons ore", status: "Loading", variant: "warning" as const, progress: "Departure tomorrow", eta: "Apr 15", pct: 5 },
  { id: "SHP-98417", route: "Tokyo → Sydney", mode: "Multi", modeIcon: Truck, cargo: "820 pallets", status: "Delivered", variant: "success" as const, progress: "Completed", eta: "Delivered", pct: 100 },
];

const routeModes = [
  { mode: "Sea Freight", icon: Ship, count: "5,842", pct: 69, color: "bg-primary" },
  { mode: "Air Freight", icon: Plane, count: "1,847", pct: 22, color: "bg-accent" },
  { mode: "Land/Rail", icon: Truck, count: "732", pct: 9, color: "bg-warning" },
];

export default function LogisticsPage() {
  return (
    <PageContainer>
      <HeroHeader
        accent="Logistics"
        title="Supply Chain Command"
        subtitle="Real-time cargo tracking across sea, air and land — 8,421 active shipments traversing 2,847 routes worldwide"
      />

      {/* Stats */}
      <AnimatedSection>
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {logStats.map((s) => (
            <motion.div key={s.title} variants={fadeUp} whileHover={{ y: -2, scale: 1.02 }} className="bg-card rounded-xl border border-border p-5 group hover:border-primary/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:bg-primary/20 transition-colors">{s.icon}</div>
              <p className="text-2xl font-mono font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{s.title}</p>
              <p className="text-[10px] text-success font-semibold mt-1">{s.sub}</p>
            </motion.div>
          ))}
        </motion.div>
      </AnimatedSection>

      <EditorialDivider label="Active Shipments" />

      {/* Shipment Cards */}
      <AnimatedSection>
        <div className="space-y-3">
          {shipments.map((ship, i) => (
            <motion.div
              key={ship.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
              whileHover={{ x: 4 }}
              className="bg-card rounded-xl border border-border p-5 hover:border-primary/20 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ship.modeIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{ship.route}</h3>
                      <span className="text-[10px] font-mono text-muted-foreground">{ship.id}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{ship.mode} · {ship.cargo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs font-medium text-foreground">{ship.progress}</p>
                    <p className="text-[10px] text-muted-foreground">ETA: {ship.eta}</p>
                  </div>
                  <StatusBadge status={ship.status} variant={ship.variant} />
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${ship.pct}%` }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.8 }}
                  className={`h-full rounded-full ${ship.variant === "success" ? "bg-success" : ship.variant === "warning" ? "bg-warning" : "bg-primary"}`}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      <EditorialDivider label="Route Distribution" />

      {/* Route Mode Breakdown */}
      <AnimatedSection>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {routeModes.map((r, i) => (
            <motion.div
              key={r.mode}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="bg-card rounded-xl border border-border p-6 hover:border-primary/20 transition-all text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <r.icon className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-bold text-foreground">{r.mode}</p>
              <p className="text-3xl font-mono font-bold text-foreground mt-2">{r.count}</p>
              <p className="text-xs text-muted-foreground mt-1">shipments</p>
              <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${r.pct}%` }}
                  transition={{ delay: 0.6 + i * 0.15, duration: 0.8 }}
                  className={`h-full rounded-full ${r.color}`}
                />
              </div>
              <p className="text-lg font-mono font-bold text-primary mt-2">{r.pct}%</p>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>
    </PageContainer>
  );
}
