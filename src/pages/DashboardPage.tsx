import { DollarSign, ShoppingCart, Users, Package, Truck, Globe, ArrowUpRight, ArrowDownRight, Activity, Zap, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { PageContainer, AnimatedSection, HeroHeader, GlassCard, EditorialDivider, MetricHighlight, fadeUp, staggerContainer } from "@/components/AnimatedLayout";
import { StatusBadge } from "@/components/DashboardWidgets";

const stats = [
  { title: "Total Revenue", value: "$847.2M", change: "+12.4%", up: true, icon: <DollarSign className="w-5 h-5" /> },
  { title: "Active Orders", value: "34,892", change: "+8.2%", up: true, icon: <ShoppingCart className="w-5 h-5" /> },
  { title: "Active Merchants", value: "12,847", change: "+342", up: true, icon: <Users className="w-5 h-5" /> },
  { title: "In Transit", value: "8,421", change: "98.7%", up: true, icon: <Truck className="w-5 h-5" /> },
  { title: "Products Listed", value: "2.4M", change: "+15K", up: true, icon: <Package className="w-5 h-5" /> },
  { title: "Markets Active", value: "194", change: "Global", up: true, icon: <Globe className="w-5 h-5" /> },
];

const recentOrders = [
  { id: "#NX-847291", client: "Aramco Industries", category: "Crude Oil Futures", value: "$24.5M", status: "Processing", variant: "warning" as const, time: "2 min ago" },
  { id: "#NX-847290", client: "Maersk Logistics", category: "Container Fleet", value: "$8.2M", status: "Confirmed", variant: "success" as const, time: "15 min ago" },
  { id: "#NX-847289", client: "Tesla Supply", category: "Lithium Batteries", value: "$3.7M", status: "In Transit", variant: "default" as const, time: "1 hr ago" },
  { id: "#NX-847288", client: "Govt. of Singapore", category: "Infrastructure", value: "$142M", status: "Under Review", variant: "warning" as const, time: "3 hrs ago" },
  { id: "#NX-847287", client: "Walmart Global", category: "Consumer Goods", value: "$12.8M", status: "Delivered", variant: "success" as const, time: "5 hrs ago" },
];

const commodities = [
  { name: "Crude Oil", price: "$78.42", change: "+1.2%", up: true },
  { name: "Gold", price: "$2,034", change: "-0.3%", up: false },
  { name: "Lithium", price: "$24.8K", change: "+4.7%", up: true },
  { name: "Steel", price: "$412", change: "+0.8%", up: true },
  { name: "Copper", price: "$8,921", change: "-1.1%", up: false },
  { name: "Wheat", price: "$612", change: "+2.3%", up: true },
];

const sectors = [
  { name: "Primary Sector", desc: "Agriculture, Mining, Oil & Gas", value: "$284.1M", growth: "+18.2%", pct: 85 },
  { name: "Secondary Sector", desc: "Manufacturing, Processing", value: "$312.7M", growth: "+9.5%", pct: 72 },
  { name: "Tertiary Sector", desc: "Services, Retail, Finance", value: "$250.4M", growth: "+6.1%", pct: 60 },
];

export default function DashboardPage() {
  return (
    <PageContainer>
      <HeroHeader
        accent="Command Center"
        title="Global Economic Intelligence"
        subtitle="Real-time supply chain analytics across 194 markets — monitoring $847M in active trade volume"
      />

      {/* Stats Bento Grid */}
      <AnimatedSection>
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((stat) => (
            <motion.div
              key={stat.title}
              variants={fadeUp}
              whileHover={{ y: -2, scale: 1.02 }}
              className="bg-card rounded-xl border border-border p-4 hover:border-primary/20 transition-all duration-300 group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                  {stat.icon}
                </div>
                <span className={`text-[10px] font-mono font-semibold flex items-center gap-0.5 ${stat.up ? "text-success" : "text-destructive"}`}>
                  {stat.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {stat.change}
                </span>
              </div>
              <p className="text-xl font-bold font-mono text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{stat.title}</p>
            </motion.div>
          ))}
        </motion.div>
      </AnimatedSection>

      <EditorialDivider label="Live Activity" />

      {/* Magazine Split: Orders + Sectors */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <AnimatedSection className="lg:col-span-3" variant="slideRight">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Recent Orders</h2>
              <p className="text-sm text-muted-foreground mt-1">Across all sectors and markets</p>
            </div>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              View All <ArrowUpRight className="w-3 h-3" />
            </motion.button>
          </div>
          <div className="space-y-2">
            {recentOrders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
                whileHover={{ x: 4, backgroundColor: "hsl(var(--muted) / 0.3)" }}
                className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-primary/20 transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                  <span className="text-xs font-mono text-primary font-bold">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{order.client}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{order.id}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{order.category}</p>
                </div>
                <span className="text-sm font-mono font-bold text-foreground">{order.value}</span>
                <StatusBadge status={order.status} variant={order.variant} />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{order.time}</span>
              </motion.div>
            ))}
          </div>
        </AnimatedSection>

        <AnimatedSection className="lg:col-span-2" variant="slideLeft">
          <div className="mb-5">
            <h2 className="text-2xl font-bold text-foreground">Sector Performance</h2>
            <p className="text-sm text-muted-foreground mt-1">Quarterly breakdown</p>
          </div>
          <div className="space-y-4">
            {sectors.map((sector, i) => (
              <motion.div
                key={sector.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.12 }}
                whileHover={{ scale: 1.02 }}
                className="bg-card rounded-xl border border-border p-5 hover:border-primary/20 transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-foreground">{sector.name}</h3>
                  <span className="text-xs font-mono font-bold text-success">{sector.growth}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-4">{sector.desc}</p>
                <div className="relative h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${sector.pct}%` }}
                    transition={{ delay: 0.6 + i * 0.15, duration: 0.8, ease: "easeOut" }}
                    className="absolute inset-y-0 left-0 bg-primary rounded-full"
                  />
                </div>
                <p className="text-2xl font-mono font-bold text-foreground">{sector.value}</p>
              </motion.div>
            ))}
          </div>
        </AnimatedSection>
      </div>

      <EditorialDivider label="Markets" />

      {/* Live Market Ticker */}
      <AnimatedSection variant="scaleIn">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <h2 className="text-2xl font-bold text-foreground">Live Market Feed</h2>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Real-time</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {commodities.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.06 }}
              whileHover={{ scale: 1.06, y: -4 }}
              className="relative overflow-hidden rounded-xl border border-border bg-card p-5 text-center cursor-pointer group hover:border-primary/20 transition-all"
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b from-primary/5 to-transparent" />
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground relative z-10">{item.name}</p>
              <p className="text-xl font-mono font-bold text-foreground mt-2 relative z-10">{item.price}</p>
              <p className={`text-xs font-bold mt-2 flex items-center justify-center gap-1 relative z-10 ${item.up ? "text-success" : "text-destructive"}`}>
                {item.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {item.change}
              </p>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>
    </PageContainer>
  );
}
