import { Truck, MapPin, Ship, Plane, Clock, CheckCircle } from "lucide-react";
import { StatCard, SectionHeader, DataTable, StatusBadge } from "@/components/DashboardWidgets";

const logStats = [
  { title: "Active Shipments", value: "8,421", change: "Across 194 countries", changeType: "neutral" as const, icon: <Truck className="w-6 h-6" /> },
  { title: "On-Time Delivery", value: "98.7%", change: "+0.4% vs last month", changeType: "up" as const, icon: <CheckCircle className="w-6 h-6" /> },
  { title: "Avg Transit Time", value: "4.2 days", change: "-0.3 days improvement", changeType: "up" as const, icon: <Clock className="w-6 h-6" /> },
  { title: "Active Routes", value: "2,847", change: "Sea, Air, Land, Rail", changeType: "neutral" as const, icon: <MapPin className="w-6 h-6" /> },
];

const shipments = [
  ["SHP-98421", "Rotterdam → Singapore", <span key="s1" className="flex items-center gap-1"><Ship className="w-3 h-3 text-primary" /> Sea</span>, "24 containers", <StatusBadge key="1" status="In Transit" variant="default" />, "Day 12 of 18", "ETA: Mar 28"],
  ["SHP-98420", "Dubai → Houston", <span key="s2" className="flex items-center gap-1"><Ship className="w-3 h-3 text-primary" /> Sea</span>, "500K bbl crude", <StatusBadge key="2" status="In Transit" variant="default" />, "Day 8 of 22", "ETA: Apr 5"],
  ["SHP-98419", "Shanghai → LA", <span key="s3" className="flex items-center gap-1"><Plane className="w-3 h-3 text-accent" /> Air</span>, "2,400 units", <StatusBadge key="3" status="Customs" variant="warning" />, "Awaiting clearance", "ETA: Mar 22"],
  ["SHP-98418", "São Paulo → Hamburg", <span key="s4" className="flex items-center gap-1"><Ship className="w-3 h-3 text-primary" /> Sea</span>, "45K tons ore", <StatusBadge key="4" status="Loading" variant="warning" />, "Departure tomorrow", "ETA: Apr 15"],
  ["SHP-98417", "Tokyo → Sydney", <span key="s5" className="flex items-center gap-1"><Truck className="w-3 h-3 text-success" /> Multi</span>, "820 pallets", <StatusBadge key="5" status="Delivered" variant="success" />, "Completed", "Delivered Mar 18"],
];

export default function LogisticsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Logistics</h1>
        <p className="text-muted-foreground mt-1">Global supply chain tracking & cargo management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {logStats.map((stat) => <StatCard key={stat.title} {...stat} />)}
      </div>

      <div>
        <SectionHeader title="Active Shipments" subtitle="Real-time cargo tracking across all transport modes" />
        <DataTable headers={["Tracking ID", "Route", "Mode", "Cargo", "Status", "Progress", "ETA"]} rows={shipments} />
      </div>

      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Route Distribution</h3>
        <div className="grid grid-cols-3 gap-6">
          {[
            { mode: "Sea Freight", icon: Ship, count: "5,842", pct: "69%" },
            { mode: "Air Freight", icon: Plane, count: "1,847", pct: "22%" },
            { mode: "Land/Rail", icon: Truck, count: "732", pct: "9%" },
          ].map((r) => (
            <div key={r.mode} className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <r.icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{r.mode}</p>
                <p className="text-xs text-muted-foreground">{r.count} shipments · {r.pct}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
