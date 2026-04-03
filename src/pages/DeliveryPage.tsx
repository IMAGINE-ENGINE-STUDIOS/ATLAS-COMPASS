import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck, Plus, List, Zap, Layers, Settings2, Globe,
  Package, BarChart3, FileSignature, Shield, MapPin
} from "lucide-react";
import NewDeliveryForm from "@/components/delivery/NewDeliveryForm";
import DeliveryList from "@/components/delivery/DeliveryList";
import BatchQuoteTool from "@/components/delivery/BatchQuoteTool";
import QuickEstimate from "@/components/delivery/QuickEstimate";

type Tab = "overview" | "new" | "deliveries" | "estimate" | "batch" | "tools";

const tabs: { id: Tab; label: string; icon: typeof Truck }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "new", label: "New Delivery", icon: Plus },
  { id: "deliveries", label: "All Deliveries", icon: List },
  { id: "estimate", label: "Quick Estimate", icon: Zap },
  { id: "batch", label: "Batch Quotes", icon: Layers },
  { id: "tools", label: "API Tools", icon: Settings2 },
];

const uberDirectFeatures = [
  { icon: Truck, title: "On-Demand Delivery", desc: "Request courier delivery in real-time with live tracking" },
  { icon: Zap, title: "Instant Quotes", desc: "Get fee and ETA estimates before committing to a delivery" },
  { icon: Layers, title: "Batch Quotes", desc: "Quote multiple routes simultaneously for operations planning" },
  { icon: MapPin, title: "Geofenced Zones", desc: "Automatic proximity detection: Express, Standard, Extended" },
  { icon: FileSignature, title: "Proof of Delivery", desc: "Signatures, photos, and PIN verification on dropoff" },
  { icon: Shield, title: "ID Verification", desc: "Age/identity verification required at delivery point" },
  { icon: Globe, title: "Scheduling", desc: "Schedule pickups for future date/time windows" },
  { icon: Package, title: "Manifest Items", desc: "Detailed item descriptions with size categories" },
];

const apiEndpoints = [
  { method: "POST", path: "/quote", desc: "Get delivery quote with fee, ETA, and expiry" },
  { method: "POST", path: "/create", desc: "Create delivery from quote with full options" },
  { method: "GET", path: "/status?id=", desc: "Real-time delivery status + courier location" },
  { method: "GET", path: "/list", desc: "List all deliveries with filter/pagination" },
  { method: "POST", path: "/cancel", desc: "Cancel an in-progress delivery" },
  { method: "POST", path: "/tip", desc: "Add/update courier tip amount" },
  { method: "GET", path: "/pod?id=", desc: "Proof of delivery: signature, photo, PIN" },
  { method: "POST", path: "/update", desc: "Update notes, manifest, or requirements mid-delivery" },
  { method: "POST", path: "/batch-quote", desc: "Get multiple quotes in parallel" },
  { method: "POST", path: "/estimate", desc: "Quick fee estimate without binding quote" },
];

export default function DeliveryPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 rounded-2xl" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
            <Truck className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Uber Direct</h1>
            <p className="text-sm text-muted-foreground">Full delivery management suite · 10 API endpoints</p>
          </div>
        </div>
      </motion.div>

      {/* Tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card/40 border border-border/30 text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {uberDirectFeatures.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div key={f.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="p-4 rounded-2xl border border-border/30 group hover:border-primary/20 transition-all"
                    style={{ background: "hsl(var(--card) / 0.5)", backdropFilter: "blur(16px)" }}>
                    <div className="p-2 rounded-xl bg-primary/10 w-fit mb-3 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h4 className="text-sm font-bold text-foreground">{f.title}</h4>
                    <p className="text-[11px] text-muted-foreground mt-1">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>

            <div className="p-5 rounded-2xl border border-border/30" style={{ background: "hsl(var(--card) / 0.5)" }}>
              <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" /> API Endpoints
              </h3>
              <div className="space-y-1.5">
                {apiEndpoints.map(ep => (
                  <div key={ep.path} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/20 transition-colors">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono ${
                      ep.method === "GET" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                    }`}>{ep.method}</span>
                    <span className="text-xs font-mono text-foreground flex-shrink-0">/uber-direct{ep.path}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{ep.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setActiveTab("new")} className="p-4 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-center">
                <Plus className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-xs font-bold text-foreground">Create Delivery</p>
              </button>
              <button onClick={() => setActiveTab("estimate")} className="p-4 rounded-2xl border border-border/30 hover:border-primary/20 transition-colors text-center" style={{ background: "hsl(var(--card) / 0.5)" }}>
                <Zap className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-xs font-bold text-foreground">Quick Estimate</p>
              </button>
              <button onClick={() => setActiveTab("batch")} className="p-4 rounded-2xl border border-border/30 hover:border-primary/20 transition-colors text-center" style={{ background: "hsl(var(--card) / 0.5)" }}>
                <Layers className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-xs font-bold text-foreground">Batch Quotes</p>
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === "new" && (
          <motion.div key="new" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <NewDeliveryForm />
          </motion.div>
        )}

        {activeTab === "deliveries" && (
          <motion.div key="list" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <DeliveryList />
          </motion.div>
        )}

        {activeTab === "estimate" && (
          <motion.div key="estimate" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <QuickEstimate />
          </motion.div>
        )}

        {activeTab === "batch" && (
          <motion.div key="batch" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <BatchQuoteTool />
          </motion.div>
        )}

        {activeTab === "tools" && (
          <motion.div key="tools" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="p-5 rounded-2xl border border-border/30" style={{ background: "hsl(var(--card) / 0.5)" }}>
              <h3 className="text-sm font-bold text-foreground mb-3">Delivery Options Reference</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  { param: "quote_id", type: "string", desc: "Quote ID from /quote endpoint" },
                  { param: "pickup / dropoff", type: "object", desc: "{ name, phone_number, address, notes }" },
                  { param: "manifest", type: "object", desc: "{ description, quantity }" },
                  { param: "manifest_items", type: "array", desc: "Detailed items with size: small|medium|large|xlarge" },
                  { param: "tip", type: "integer", desc: "Tip amount in cents" },
                  { param: "requires_dropoff_signature", type: "boolean", desc: "Collect signature on delivery" },
                  { param: "requires_id_verification", type: "boolean", desc: "Verify recipient identity" },
                  { param: "undeliverable_action", type: "string", desc: "return | leave_at_door" },
                  { param: "external_id", type: "string", desc: "Your internal order reference" },
                  { param: "pickup_ready_dt", type: "ISO datetime", desc: "Scheduled pickup window start" },
                  { param: "pickup_deadline_dt", type: "ISO datetime", desc: "Scheduled pickup window end" },
                  { param: "dropoff_ready_dt", type: "ISO datetime", desc: "Earliest acceptable dropoff time" },
                  { param: "dropoff_deadline_dt", type: "ISO datetime", desc: "Latest acceptable dropoff time" },
                  { param: "deliverable_action", type: "string", desc: "deliverable_action override" },
                ].map(p => (
                  <div key={p.param} className="p-2.5 rounded-lg bg-secondary/20 border border-border/20">
                    <span className="font-mono text-primary">{p.param}</span>
                    <span className="ml-2 text-muted-foreground">({p.type})</span>
                    <p className="text-muted-foreground mt-0.5">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-border/30" style={{ background: "hsl(var(--card) / 0.5)" }}>
              <h3 className="text-sm font-bold text-foreground mb-3">Delivery Status Lifecycle</h3>
              <div className="flex flex-wrap gap-2">
                {["pending", "pickup", "pickup_complete", "dropoff", "delivered", "canceled", "returned"].map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-secondary/30 border border-border/20 text-foreground">{s}</span>
                    {i < 6 && <span className="text-muted-foreground text-xs">→</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-border/30" style={{ background: "hsl(var(--card) / 0.5)" }}>
              <h3 className="text-sm font-bold text-foreground mb-3">Geofencing Zones</h3>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { zone: "Express", range: "0–5 km", eta: "15-25 min", cost: "$3-8", color: "hsl(142 76% 36%)" },
                  { zone: "Standard", range: "5–15 km", eta: "25-45 min", cost: "$8-15", color: "hsl(var(--primary))" },
                  { zone: "Extended", range: "15–30 km", eta: "45-90 min", cost: "$15-30", color: "hsl(var(--warning))" },
                  { zone: "Out of Range", range: "30+ km", eta: "N/A", cost: "N/A", color: "hsl(var(--destructive))" },
                ].map(z => (
                  <div key={z.zone} className="p-3 rounded-xl border border-border/20 text-center" style={{ borderTopColor: z.color, borderTopWidth: 2 }}>
                    <p className="text-xs font-bold text-foreground">{z.zone}</p>
                    <p className="text-[10px] text-muted-foreground">{z.range}</p>
                    <p className="text-[10px] text-muted-foreground">{z.eta}</p>
                    <p className="text-xs font-mono font-bold mt-1" style={{ color: z.color }}>{z.cost}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
