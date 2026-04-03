import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, Truck, MapPin, CheckCircle2, Clock, Phone, User, Navigation } from "lucide-react";
import { getDeliveryStatus } from "@/lib/delivery-service";

interface DeliveryTrackerProps {
  deliveryId: string;
  onComplete?: () => void;
}

const statusSteps = [
  { key: "pending", label: "Order Placed", icon: Package },
  { key: "pickup", label: "Picking Up", icon: MapPin },
  { key: "pickup_complete", label: "Picked Up", icon: CheckCircle2 },
  { key: "dropoff", label: "En Route", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
];

export default function DeliveryTracker({ deliveryId, onComplete }: DeliveryTrackerProps) {
  const [status, setStatus] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await getDeliveryStatus(deliveryId);
        setStatus(data);

        const stepMap: Record<string, number> = {
          pending: 0,
          pickup: 1,
          pickup_complete: 2,
          dropoff: 3,
          delivered: 4,
        };
        const step = stepMap[data.status] ?? 0;
        setCurrentStep(step);

        if (data.status === "delivered") {
          onComplete?.();
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [deliveryId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/40 overflow-hidden"
      style={{ background: "hsl(var(--card) / 0.6)", backdropFilter: "blur(20px)" }}
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            <h4 className="text-sm font-bold text-foreground">Delivery Tracker</h4>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            ID: {deliveryId.slice(0, 8)}...
          </span>
        </div>

        {/* Status timeline */}
        <div className="space-y-0">
          {statusSteps.map((step, i) => {
            const isActive = i === currentStep;
            const isDone = i < currentStep;
            const Icon = step.icon;

            return (
              <div key={step.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <motion.div
                    animate={{
                      scale: isActive ? [1, 1.2, 1] : 1,
                      backgroundColor: isDone || isActive ? "hsl(var(--primary))" : "hsl(var(--muted))",
                    }}
                    transition={isActive ? { repeat: Infinity, duration: 2 } : {}}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                  >
                    <Icon className={`w-4 h-4 ${isDone || isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  </motion.div>
                  {i < statusSteps.length - 1 && (
                    <div
                      className="w-0.5 h-6"
                      style={{ backgroundColor: isDone ? "hsl(var(--primary))" : "hsl(var(--muted))" }}
                    />
                  )}
                </div>
                <div className="pt-1.5">
                  <p className={`text-xs font-semibold ${isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[10px] text-muted-foreground mt-0.5"
                    >
                      In progress...
                    </motion.p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Driver info */}
        {status?.courier && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-5 p-3 rounded-xl bg-secondary/30 border border-border/20"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{status.courier.name}</p>
                <p className="text-[10px] text-muted-foreground">{status.courier.vehicle_type}</p>
              </div>
              {status.courier.phone_number && (
                <a
                  href={`tel:${status.courier.phone_number}`}
                  className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </div>
            {status.courier.location && (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Navigation className="w-3 h-3" />
                <span>
                  {status.courier.location.lat.toFixed(4)}, {status.courier.location.lng.toFixed(4)}
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* ETA countdown */}
        {status?.dropoff_eta && (
          <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Estimated arrival: {new Date(status.dropoff_eta).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
