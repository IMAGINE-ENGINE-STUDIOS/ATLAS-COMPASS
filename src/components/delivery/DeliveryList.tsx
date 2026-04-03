import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck, Package, Clock, CheckCircle2, XCircle, MapPin,
  RefreshCw, Search, Loader2, DollarSign, Phone, User,
  Navigation, AlertCircle, Ban, FileSignature, Eye
} from "lucide-react";
import {
  listDeliveries, getDeliveryStatus, cancelDelivery,
  updateTip, getProofOfDelivery
} from "@/lib/delivery-service";
import DeliveryTracker from "./DeliveryTracker";

type Filter = "all" | "pending" | "pickup" | "dropoff" | "delivered" | "canceled" | "returned";

const statusConfig: Record<string, { color: string; icon: typeof Package; label: string }> = {
  pending: { color: "hsl(var(--warning))", icon: Clock, label: "Pending" },
  pickup: { color: "hsl(var(--primary))", icon: MapPin, label: "Picking Up" },
  pickup_complete: { color: "hsl(var(--primary))", icon: CheckCircle2, label: "Picked Up" },
  dropoff: { color: "hsl(var(--primary))", icon: Truck, label: "En Route" },
  delivered: { color: "hsl(142 76% 36%)", icon: CheckCircle2, label: "Delivered" },
  canceled: { color: "hsl(var(--destructive))", icon: XCircle, label: "Cancelled" },
  returned: { color: "hsl(var(--muted-foreground))", icon: RefreshCw, label: "Returned" },
};

export default function DeliveryList() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tipInput, setTipInput] = useState<Record<string, number>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [podData, setPodData] = useState<Record<string, any>>({});

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listDeliveries(filter === "all" ? undefined : filter);
      if (result.deliveries) setDeliveries(result.deliveries);
      else if (Array.isArray(result)) setDeliveries(result);
      else setDeliveries([]);
    } catch { setDeliveries([]); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  const handleCancel = async (id: string) => {
    setActionLoading(p => ({ ...p, [id]: true }));
    await cancelDelivery(id);
    await fetchDeliveries();
    setActionLoading(p => ({ ...p, [id]: false }));
  };

  const handleTip = async (id: string) => {
    const amount = tipInput[id] || 0;
    if (!amount) return;
    setActionLoading(p => ({ ...p, [`tip-${id}`]: true }));
    await updateTip(id, amount * 100);
    setTipInput(p => ({ ...p, [id]: 0 }));
    setActionLoading(p => ({ ...p, [`tip-${id}`]: false }));
  };

  const handlePod = async (id: string) => {
    setActionLoading(p => ({ ...p, [`pod-${id}`]: true }));
    const data = await getProofOfDelivery(id);
    setPodData(p => ({ ...p, [id]: data }));
    setActionLoading(p => ({ ...p, [`pod-${id}`]: false }));
  };

  const filtered = deliveries.filter(d => {
    const matchSearch = !search || JSON.stringify(d).toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const stats = {
    total: deliveries.length,
    active: deliveries.filter(d => ["pending", "pickup", "dropoff", "pickup_complete"].includes(d.status)).length,
    delivered: deliveries.filter(d => d.status === "delivered").length,
    canceled: deliveries.filter(d => d.status === "canceled").length,
  };

  return (
    <div className="space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "hsl(var(--foreground))" },
          { label: "Active", value: stats.active, color: "hsl(var(--primary))" },
          { label: "Delivered", value: stats.delivered, color: "hsl(142 76% 36%)" },
          { label: "Cancelled", value: stats.canceled, color: "hsl(var(--destructive))" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="p-3 rounded-xl border border-border/30" style={{ background: "hsl(var(--card) / 0.5)" }}>
            <p className="text-[9px] font-mono text-muted-foreground uppercase">{s.label}</p>
            <p className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deliveries..."
            className="w-full bg-card/60 border border-border/40 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary backdrop-blur-xl" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {(["all", "pending", "pickup", "dropoff", "delivered", "canceled"] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-card/40 border border-border/30 text-muted-foreground hover:text-foreground"
              }`}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={fetchDeliveries} disabled={loading} className="p-2.5 rounded-xl bg-card/40 border border-border/30 text-muted-foreground hover:text-primary transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No deliveries found</p>
          <p className="text-[10px] text-muted-foreground mt-1">Create a new delivery to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((d, i) => {
              const cfg = statusConfig[d.status] || statusConfig.pending;
              const Icon = cfg.icon;
              const isExpanded = expandedId === d.id;

              return (
                <motion.div key={d.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.03 }}
                  className="rounded-xl border border-border/30 overflow-hidden cursor-pointer group hover:border-primary/20 transition-all"
                  style={{ background: "hsl(var(--card) / 0.5)", backdropFilter: "blur(16px)" }}>
                  <div className="p-3 flex items-center gap-3" onClick={() => setExpandedId(isExpanded ? null : d.id)}>
                    <div className="p-2 rounded-lg" style={{ background: `${cfg.color}15` }}>
                      <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-muted-foreground">{d.id?.slice(0, 12)}</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider" style={{ background: `${cfg.color}15`, color: cfg.color }}>{cfg.label}</span>
                      </div>
                      <h4 className="text-xs font-semibold text-foreground truncate mt-0.5">{d.manifest?.description || "Delivery"}</h4>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-mono font-bold text-foreground">${((d.fee || 0) / 100).toFixed(2)}</p>
                      {d.dropoff_eta && <p className="text-[9px] text-muted-foreground">ETA {new Date(d.dropoff_eta).toLocaleTimeString()}</p>}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border/20 overflow-hidden">
                        <div className="p-4 space-y-4">
                          {/* Route */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <div className="flex items-start gap-2">
                                <div className="w-2 h-2 rounded-full bg-success mt-1.5" />
                                <div>
                                  <p className="text-[9px] font-mono text-muted-foreground">PICKUP</p>
                                  <p className="text-xs text-foreground">{d.pickup?.address || "—"}</p>
                                  {d.pickup?.name && <p className="text-[10px] text-muted-foreground">{d.pickup.name}</p>}
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <Navigation className="w-2 h-2 text-primary mt-1.5" />
                                <div>
                                  <p className="text-[9px] font-mono text-muted-foreground">DROPOFF</p>
                                  <p className="text-xs text-foreground">{d.dropoff?.address || "—"}</p>
                                  {d.dropoff?.name && <p className="text-[10px] text-muted-foreground">{d.dropoff.name}</p>}
                                </div>
                              </div>
                            </div>

                            {/* Courier */}
                            {d.courier && (
                              <div className="p-3 rounded-xl bg-secondary/20 border border-border/20">
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-primary" />
                                  <div>
                                    <p className="text-xs font-semibold text-foreground">{d.courier.name}</p>
                                    <p className="text-[9px] text-muted-foreground">{d.courier.vehicle_type}</p>
                                  </div>
                                  {d.courier.phone_number && (
                                    <a href={`tel:${d.courier.phone_number}`} className="ml-auto p-1.5 rounded-lg bg-primary/10 text-primary">
                                      <Phone className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2">
                            {["pending", "pickup", "dropoff", "pickup_complete"].includes(d.status) && (
                              <button onClick={() => handleCancel(d.id)} disabled={actionLoading[d.id]}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1.5">
                                {actionLoading[d.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />} Cancel
                              </button>
                            )}
                            {d.status === "delivered" && (
                              <button onClick={() => handlePod(d.id)} disabled={actionLoading[`pod-${d.id}`]}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                                {actionLoading[`pod-${d.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSignature className="w-3 h-3" />} Proof of Delivery
                              </button>
                            )}
                            <div className="flex items-center gap-1.5 ml-auto">
                              <input type="number" min={0} placeholder="$" value={tipInput[d.id] || ""} onChange={e => setTipInput(p => ({ ...p, [d.id]: +e.target.value }))}
                                className="w-16 bg-secondary/30 border border-border/30 rounded-lg px-2 py-1.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                              <button onClick={() => handleTip(d.id)} disabled={!tipInput[d.id] || actionLoading[`tip-${d.id}`]}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-success/10 text-success border border-success/20 disabled:opacity-40 flex items-center gap-1">
                                {actionLoading[`tip-${d.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />} Tip
                              </button>
                            </div>
                          </div>

                          {/* POD Data */}
                          {podData[d.id] && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                              <p className="text-[10px] font-mono text-primary font-bold uppercase">Proof of Delivery</p>
                              {podData[d.id].signature && <p className="text-xs text-foreground">✍️ Signature collected</p>}
                              {podData[d.id].photo && <p className="text-xs text-foreground">📷 Photo captured</p>}
                              {podData[d.id].pin_code_verified && <p className="text-xs text-foreground">🔑 PIN verified</p>}
                              {podData[d.id].complete_dt && <p className="text-[10px] text-muted-foreground">Completed: {new Date(podData[d.id].complete_dt).toLocaleString()}</p>}
                              {!podData[d.id].signature && !podData[d.id].photo && !podData[d.id].pin_code_verified && (
                                <p className="text-xs text-muted-foreground">No proof data available</p>
                              )}
                            </motion.div>
                          )}

                          {/* Tracking */}
                          {["pending", "pickup", "dropoff", "pickup_complete"].includes(d.status) && (
                            <DeliveryTracker deliveryId={d.id} />
                          )}

                          {/* Tracking URL */}
                          {d.tracking_url && (
                            <a href={d.tracking_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                              <Eye className="w-3 h-3" /> Open Uber Tracking Page →
                            </a>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
