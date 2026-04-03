import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Package, Truck, Loader2, CheckCircle2 } from "lucide-react";
import { createDelivery } from "@/lib/delivery-service";

interface DeliveryCheckoutProps {
  quote: any;
  productName: string;
  pickupAddress: string;
  onDeliveryCreated?: (delivery: any) => void;
  onCancel?: () => void;
}

export default function DeliveryCheckout({
  quote,
  productName,
  pickupAddress,
  onDeliveryCreated,
  onCancel,
}: DeliveryCheckoutProps) {
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffName, setDropoffName] = useState("");
  const [dropoffPhone, setDropoffPhone] = useState("");
  const [pickupName, setPickupName] = useState("Store Manager");
  const [pickupPhone, setPickupPhone] = useState("+1234567890");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleCreateDelivery = async () => {
    if (!dropoffAddress || !dropoffName || !dropoffPhone) return;

    setLoading(true);
    try {
      const delivery = await createDelivery(
        quote.id || quote.quote_id,
        {
          name: pickupName,
          phone_number: pickupPhone,
          address: pickupAddress,
        },
        {
          name: dropoffName,
          phone_number: dropoffPhone,
          address: dropoffAddress,
        },
        {
          description: productName,
          quantity: 1,
        }
      );

      if (delivery.id) {
        setSuccess(true);
        onDeliveryCreated?.(delivery);
      }
    } catch (err) {
      console.error("Create delivery error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-6 rounded-2xl border border-success/30 bg-success/5 text-center"
      >
        <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
        <h4 className="text-lg font-bold text-foreground">Delivery Created!</h4>
        <p className="text-sm text-muted-foreground mt-1">Your order is being processed. A driver will be assigned shortly.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/40 overflow-hidden"
      style={{ background: "hsl(var(--card) / 0.6)", backdropFilter: "blur(20px)" }}
    >
      <div className="p-5">
        <div className="flex items-center gap-2 mb-5">
          <Package className="w-5 h-5 text-primary" />
          <h4 className="text-sm font-bold text-foreground">Delivery Details</h4>
        </div>

        {/* Pickup summary */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/20 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Pickup</span>
          </div>
          <p className="text-xs text-foreground">{pickupAddress}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Item: {productName}</p>
        </div>

        {/* Dropoff form */}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">
              Delivery Address
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                placeholder="Enter delivery address..."
                className="w-full bg-secondary/30 border border-border/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">
                Recipient Name
              </label>
              <input
                type="text"
                value={dropoffName}
                onChange={(e) => setDropoffName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-secondary/30 border border-border/30 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">
                Phone
              </label>
              <input
                type="tel"
                value={dropoffPhone}
                onChange={(e) => setDropoffPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full bg-secondary/30 border border-border/30 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Quote summary */}
        {quote && (
          <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Delivery Fee</span>
              <span className="text-sm font-mono font-bold text-foreground">
                ${((quote.fee || quote.estimated_fee || 0) / 100).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreateDelivery}
            disabled={loading || !dropoffAddress || !dropoffName || !dropoffPhone}
            className="flex-1 py-3 rounded-xl text-xs font-bold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Creating...
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" /> Order Delivery
              </>
            )}
          </motion.button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-3 rounded-xl text-xs font-semibold bg-secondary/40 text-muted-foreground hover:text-foreground border border-border/30 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
