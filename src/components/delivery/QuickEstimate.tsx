import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, MapPin, Loader2, DollarSign, Clock } from "lucide-react";
import { getDeliveryEstimate } from "@/lib/delivery-service";
import AddressAutocomplete from "./AddressAutocomplete";

export default function QuickEstimate() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);

  const handleEstimate = async () => {
    if (!pickup || !dropoff) return;
    setLoading(true);
    try {
      const data = await getDeliveryEstimate(pickup, dropoff);
      setEstimate(data);
    } catch { setEstimate({ error: "Failed" }); }
    setLoading(false);
  };

  const inputCls = "w-full bg-secondary/30 border border-border/30 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" /> Quick Fee Estimate
      </h3>
      <p className="text-xs text-muted-foreground">Instantly estimate delivery cost without creating a binding quote.</p>

      <div className="space-y-3">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-success" />
          <input value={pickup} onChange={e => setPickup(e.target.value)} placeholder="Pickup address" className={`${inputCls} pl-8`} />
        </div>
        <div className="relative">
          <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary" />
          <input value={dropoff} onChange={e => setDropoff(e.target.value)} placeholder="Dropoff address" className={`${inputCls} pl-8`} />
        </div>
      </div>

      <button onClick={handleEstimate} disabled={loading || !pickup || !dropoff}
        className="w-full py-3 rounded-xl text-xs font-bold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Estimating...</> : <><Zap className="w-4 h-4" /> Get Estimate</>}
      </button>

      {estimate && !estimate.error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl border border-primary/20 bg-primary/5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Fee</p>
              <p className="text-xl font-mono font-bold text-foreground">${((estimate.fee || 0) / 100).toFixed(2)}</p>
            </div>
            <div>
              <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">ETA</p>
              <p className="text-xl font-mono font-bold text-foreground">{estimate.eta || "~30"}m</p>
            </div>
            <div>
              <MapPin className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Currency</p>
              <p className="text-sm font-bold text-foreground">{estimate.currency || "USD"}</p>
            </div>
          </div>
          {estimate.expires_at && (
            <p className="text-[10px] text-muted-foreground text-center mt-3">Estimated at: {new Date(estimate.estimated_at).toLocaleString()}</p>
          )}
        </motion.div>
      )}

      {estimate?.error && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">{estimate.error}</div>
      )}
    </div>
  );
}
