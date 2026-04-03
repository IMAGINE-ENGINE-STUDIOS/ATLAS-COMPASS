import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, Clock, DollarSign, MapPin, Navigation, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getDeliveryQuote, DeliveryZone, zoneInfo } from "@/lib/delivery-service";

interface DeliveryQuoteCardProps {
  pickupAddress: string;
  dropoffAddress: string;
  zone: DeliveryZone;
  distanceKm: number;
  onQuoteReceived?: (quote: any) => void;
}

export default function DeliveryQuoteCard({
  pickupAddress,
  dropoffAddress,
  zone,
  distanceKm,
  onQuoteReceived,
}: DeliveryQuoteCardProps) {
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const info = zoneInfo[zone];

  const fetchQuote = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDeliveryQuote(pickupAddress, dropoffAddress);
      if (result.error) {
        setError(result.error);
      } else {
        setQuote(result);
        onQuoteReceived?.(result);
      }
    } catch (err) {
      setError("Failed to fetch delivery quote. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/40 overflow-hidden"
      style={{ background: "hsl(var(--card) / 0.6)", backdropFilter: "blur(20px)" }}
    >
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-xl" style={{ background: `${info.color}15` }}>
            <Truck className="w-4 h-4" style={{ color: info.color }} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">Uber Direct Delivery</h4>
            <p className="text-[10px] text-muted-foreground">{info.label} · {distanceKm.toFixed(1)}km away</p>
          </div>
        </div>

        {/* Addresses */}
        <div className="space-y-2 mb-4">
          <div className="flex items-start gap-2">
            <div className="mt-1">
              <div className="w-2 h-2 rounded-full bg-success" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Pickup</p>
              <p className="text-xs text-foreground">{pickupAddress}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="mt-1">
              <Navigation className="w-2 h-2 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Dropoff</p>
              <p className="text-xs text-foreground">{dropoffAddress}</p>
            </div>
          </div>
        </div>

        {/* Estimated info */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/20">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Clock className="w-3 h-3" />
              <span className="text-[10px] font-mono uppercase">Est. Time</span>
            </div>
            <p className="text-sm font-bold text-foreground">{info.eta}</p>
          </div>
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/20">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <DollarSign className="w-3 h-3" />
              <span className="text-[10px] font-mono uppercase">Est. Cost</span>
            </div>
            <p className="text-sm font-bold text-foreground">{info.costTier}</p>
          </div>
        </div>

        {/* Quote result or button */}
        <AnimatePresence mode="wait">
          {quote ? (
            <motion.div
              key="quote"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-xl bg-success/10 border border-success/20"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-xs font-semibold text-success">Quote Ready</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl font-mono font-bold text-foreground">
                  ${((quote.fee || quote.estimated_fee || 0) / 100).toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">delivery fee</span>
              </div>
              {quote.eta && (
                <p className="text-xs text-muted-foreground mt-1">ETA: {quote.eta} min</p>
              )}
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 rounded-xl bg-destructive/10 border border-destructive/20"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-xs text-destructive">{error}</span>
              </div>
              <button onClick={fetchQuote} className="mt-2 text-[10px] text-primary hover:underline">
                Retry
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={fetchQuote}
              disabled={loading}
              className="w-full py-3 rounded-xl text-xs font-bold text-primary-foreground flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Getting Quote...
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  Get Delivery Quote
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
