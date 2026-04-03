import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, Package, Clock, CheckCircle2, XCircle, MapPin, RefreshCw, Filter, Search, Eye } from "lucide-react";
import DeliveryTracker from "@/components/delivery/DeliveryTracker";

type DeliveryStatus = "all" | "pending" | "in_transit" | "delivered" | "cancelled";

interface MockDelivery {
  id: string;
  product: string;
  customer: string;
  pickup: string;
  dropoff: string;
  status: "pending" | "in_transit" | "delivered" | "cancelled";
  fee: string;
  eta: string;
  created: string;
}

const mockDeliveries: MockDelivery[] = [
  { id: "DEL-001", product: "Grade A Crude Oil", customer: "John Smith", pickup: "Doha Industrial Area", dropoff: "Al Wakrah, Qatar", status: "in_transit", fee: "$12.50", eta: "25 min", created: "2 min ago" },
  { id: "DEL-002", product: "EV Battery Cells", customer: "Sarah Chen", pickup: "Fuzhou Warehouse", dropoff: "Fuzhou CBD", status: "pending", fee: "$8.00", eta: "35 min", created: "5 min ago" },
  { id: "DEL-003", product: "Solar Panel Array", customer: "Mike Johnson", pickup: "Xi'an Distribution Center", dropoff: "Xi'an Tech Park", status: "delivered", fee: "$15.00", eta: "Delivered", created: "1 hr ago" },
  { id: "DEL-004", product: "Organic Wheat", customer: "Emma Davis", pickup: "Chicago Grain Exchange", dropoff: "Lincoln Park, Chicago", status: "cancelled", fee: "$10.00", eta: "Cancelled", created: "3 hrs ago" },
  { id: "DEL-005", product: "Steel Coils", customer: "Alex Kim", pickup: "Luxembourg Industrial", dropoff: "Brussels, Belgium", status: "in_transit", fee: "$28.00", eta: "55 min", created: "15 min ago" },
];

const statusConfig: Record<string, { color: string; icon: typeof Package; label: string }> = {
  pending: { color: "hsl(var(--warning))", icon: Clock, label: "Pending" },
  in_transit: { color: "hsl(var(--primary))", icon: Truck, label: "In Transit" },
  delivered: { color: "hsl(var(--success))", icon: CheckCircle2, label: "Delivered" },
  cancelled: { color: "hsl(var(--destructive))", icon: XCircle, label: "Cancelled" },
};

export default function DeliveryPage() {
  const [filter, setFilter] = useState<DeliveryStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);

  const filtered = mockDeliveries.filter(d => {
    const matchStatus = filter === "all" || d.status === filter;
    const matchSearch = searchQuery === "" ||
      d.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const stats = {
    total: mockDeliveries.length,
    pending: mockDeliveries.filter(d => d.status === "pending").length,
    in_transit: mockDeliveries.filter(d => d.status === "in_transit").length,
    delivered: mockDeliveries.filter(d => d.status === "delivered").length,
  };

  return (
    <div className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-2xl" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
            <Truck className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Delivery Management</h1>
            <p className="text-sm text-muted-foreground">Powered by Uber Direct · Real-time tracking</p>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "hsl(var(--foreground))" },
          { label: "Pending", value: stats.pending, color: "hsl(var(--warning))" },
          { label: "In Transit", value: stats.in_transit, color: "hsl(var(--primary))" },
          { label: "Delivered", value: stats.delivered, color: "hsl(var(--success))" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 rounded-2xl border border-border/40"
            style={{ background: "hsl(var(--card) / 0.5)", backdropFilter: "blur(16px)" }}
          >
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-bold font-mono mt-1" style={{ color: stat.color }}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deliveries..."
            className="w-full bg-card/60 border border-border/40 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary backdrop-blur-xl"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(["all", "pending", "in_transit", "delivered", "cancelled"] as DeliveryStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-card/40 border border-border/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s === "in_transit" ? "In Transit" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Deliveries list */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((delivery, i) => {
            const config = statusConfig[delivery.status];
            const Icon = config.icon;
            return (
              <motion.div
                key={delivery.id}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-border/30 overflow-hidden cursor-pointer group hover:border-primary/30 transition-all"
                style={{ background: "hsl(var(--card) / 0.5)", backdropFilter: "blur(16px)" }}
                onClick={() => setSelectedDelivery(selectedDelivery === delivery.id ? null : delivery.id)}
              >
                <div className="p-4 flex items-center gap-4">
                  <div className="p-2.5 rounded-xl" style={{ background: `${config.color}15` }}>
                    <Icon className="w-5 h-5" style={{ color: config.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">{delivery.id}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                        style={{ background: `${config.color}15`, color: config.color }}
                      >
                        {config.label}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mt-0.5 truncate">{delivery.product}</h3>
                    <p className="text-[11px] text-muted-foreground">{delivery.customer}</p>
                  </div>

                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-mono font-bold text-foreground">{delivery.fee}</p>
                    <p className="text-[10px] text-muted-foreground">{delivery.eta}</p>
                  </div>

                  <div className="text-[10px] text-muted-foreground hidden md:block">
                    {delivery.created}
                  </div>
                </div>

                {/* Expanded tracking */}
                <AnimatePresence>
                  {selectedDelivery === delivery.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border/20 overflow-hidden"
                    >
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full bg-success mt-1.5" />
                            <div>
                              <p className="text-[10px] font-mono text-muted-foreground">PICKUP</p>
                              <p className="text-xs text-foreground">{delivery.pickup}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin className="w-2 h-2 text-primary mt-1.5" />
                            <div>
                              <p className="text-[10px] font-mono text-muted-foreground">DROPOFF</p>
                              <p className="text-xs text-foreground">{delivery.dropoff}</p>
                            </div>
                          </div>
                        </div>
                        {delivery.status === "in_transit" && (
                          <div className="flex items-center justify-center">
                            <div className="text-center">
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="w-8 h-8 mx-auto mb-2"
                              >
                                <RefreshCw className="w-8 h-8 text-primary" />
                              </motion.div>
                              <p className="text-[10px] text-muted-foreground">Tracking live · Updates every 30s</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No deliveries found</p>
          </div>
        )}
      </div>
    </div>
  );
}
