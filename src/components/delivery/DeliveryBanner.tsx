import { Truck, Clock, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { DeliveryZone, zoneInfo } from "@/lib/delivery-service";

interface DeliveryBannerProps {
  zone: DeliveryZone;
  distanceKm: number;
  storeName: string;
}

export default function DeliveryBanner({ zone, distanceKm, storeName }: DeliveryBannerProps) {
  if (zone === "out_of_range") return null;
  
  const info = zoneInfo[zone];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-semibold border backdrop-blur-md"
      style={{
        borderColor: `${info.color}40`,
        background: `${info.color}15`,
        color: info.color,
      }}
    >
      {zone === "immediate" ? (
        <Zap className="w-3 h-3" />
      ) : (
        <Truck className="w-3 h-3" />
      )}
      <span>Uber delivers in {info.eta}</span>
      <span className="opacity-60">·</span>
      <Clock className="w-3 h-3 opacity-60" />
      <span className="opacity-70">{distanceKm.toFixed(1)}km</span>
    </motion.div>
  );
}
