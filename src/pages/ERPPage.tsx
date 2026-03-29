import { Warehouse, FileText, AlertTriangle, CheckCircle, TrendingUp, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { PageContainer, AnimatedSection, HeroHeader, GlassCard, EditorialDivider, fadeUp, staggerContainer } from "@/components/AnimatedLayout";
import { StatusBadge } from "@/components/DashboardWidgets";

const erpStats = [
  { title: "Inventory Value", value: "$1.24B", change: "+3.2%", icon: <Warehouse className="w-5 h-5" /> },
  { title: "Purchase Orders", value: "4,218", change: "892 pending", icon: <FileText className="w-5 h-5" /> },
  { title: "Stock Alerts", value: "47", change: "12 critical", icon: <AlertTriangle className="w-5 h-5" /> },
  { title: "Fulfillment", value: "98.4%", change: "+0.6%", icon: <CheckCircle className="w-5 h-5" /> },
];

const inventory = [
  { product: "Crude Oil (WTI)", sector: "Energy", capacity: "500,000 bbl", current: "450,000 bbl", status: "Optimal", variant: "success" as const, value: "$39.2M", pct: 90 },
  { product: "Lithium Carbonate", sector: "Raw Materials", capacity: "8,000 tons", current: "2,100 tons", status: "Low Stock", variant: "warning" as const, value: "$52.1M", pct: 26 },
  { product: "Steel Coils (HRC)", sector: "Metals", capacity: "120,000 tons", current: "15,000 tons", status: "Critical", variant: "destructive" as const, value: "$6.2M", pct: 12 },
  { product: "EV Battery Cells", sector: "Technology", capacity: "2,400,000 units", current: "1,800,000 units", status: "Optimal", variant: "success" as const, value: "$2.2M", pct: 75 },
  { product: "Organic Wheat", sector: "Agriculture", capacity: "45,000 tons", current: "38,000 tons", status: "Optimal", variant: "success" as const, value: "$23.3M", pct: 84 },
];

const invoices = [
  { id: "INV-2024-8421", client: "Aramco Industries", amount: "$24,500,000", date: "2024-03-15", status: "Paid", variant: "success" as const, terms: "Net 30" },
  { id: "INV-2024-8420", client: "Maersk Logistics", amount: "$8,240,000", date: "2024-03-14", status: "Pending", variant: "warning" as const, terms: "Net 60" },
  { id: "INV-2024-8419", client: "CATL Manufacturing", amount: "$3,720,000", date: "2024-03-13", status: "Overdue", variant: "destructive" as const, terms: "Net 30" },
  { id: "INV-2024-8418", client: "Tesla Supply Chain", amount: "$12,100,000", date: "2024-03-12", status: "Paid", variant: "success" as const, terms: "Net 45" },
];

export default function ERPPage() {
  return (
    <PageContainer>
      <HeroHeader
        accent="ERP"
        title="Enterprise Resource Hub"
        subtitle="Inventory, procurement & finance management — $1.24B in tracked assets across every warehouse and supply node"
      />

      {/* Stats */}
      <AnimatedSection>
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {erpStats.map((s) => (
            <motion.div key={s.title} variants={fadeUp} whileHover={{ y: -2, scale: 1.02 }} className="bg-card rounded-xl border border-border p-5 group hover:border-primary/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:bg-primary/20 transition-colors">{s.icon}</div>
              <p className="text-2xl font-mono font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{s.title}</p>
              <p className="text-[10px] text-success font-semibold mt-1">{s.change}</p>
            </motion.div>
          ))}
        </motion.div>
      </AnimatedSection>

      <EditorialDivider label="Inventory" />

      {/* Inventory Cards */}
      <AnimatedSection>
        <div className="space-y-3">
          {inventory.map((item, i) => (
            <motion.div
              key={item.product}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
              whileHover={{ x: 4 }}
              className="bg-card rounded-xl border border-border p-5 hover:border-primary/20 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{item.product}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.sector} · Capacity: {item.capacity}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-mono font-bold text-foreground">{item.value}</span>
                  <StatusBadge status={item.status} variant={item.variant} />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.pct}%` }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.8 }}
                    className={`h-full rounded-full ${item.variant === "success" ? "bg-success" : item.variant === "warning" ? "bg-warning" : "bg-destructive"}`}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-16 text-right">{item.current}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      <EditorialDivider label="Invoices" />

      {/* Invoices */}
      <AnimatedSection>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {invoices.map((inv, i) => (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              whileHover={{ y: -3 }}
              className="bg-card rounded-xl border border-border p-5 hover:border-primary/20 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-muted-foreground">{inv.id}</span>
                <StatusBadge status={inv.status} variant={inv.variant} />
              </div>
              <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{inv.client}</p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                <span className="text-xl font-mono font-bold text-foreground">{inv.amount}</span>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">{inv.date}</p>
                  <p className="text-[10px] text-muted-foreground">{inv.terms}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>
    </PageContainer>
  );
}
