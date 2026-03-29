import {
  DollarSign, ShoppingCart, Users, Package, Truck, TrendingUp,
  Globe, Activity, ArrowUpRight, ArrowDownRight, BarChart3, Layers
} from "lucide-react";
import { StatCard, SectionHeader, DataTable, StatusBadge } from "@/components/DashboardWidgets";

const stats = [
  { title: "Total Revenue", value: "$847.2M", change: "+12.4% vs last quarter", changeType: "up" as const, icon: <DollarSign className="w-6 h-6" /> },
  { title: "Active Orders", value: "34,892", change: "+8.2% this month", changeType: "up" as const, icon: <ShoppingCart className="w-6 h-6" /> },
  { title: "Active Merchants", value: "12,847", change: "+342 new this week", changeType: "up" as const, icon: <Users className="w-6 h-6" /> },
  { title: "Shipments In Transit", value: "8,421", change: "98.7% on time", changeType: "neutral" as const, icon: <Truck className="w-6 h-6" /> },
  { title: "Products Listed", value: "2.4M", change: "+15K new listings", changeType: "up" as const, icon: <Package className="w-6 h-6" /> },
  { title: "Markets Active", value: "194", change: "Countries connected", changeType: "neutral" as const, icon: <Globe className="w-6 h-6" /> },
];

const recentOrders = [
  ["#NX-847291", "Aramco Industries", "Crude Oil Futures", "$24.5M", <StatusBadge key="1" status="Processing" variant="warning" />, "2 min ago"],
  ["#NX-847290", "Maersk Logistics", "Container Fleet", "$8.2M", <StatusBadge key="2" status="Confirmed" variant="success" />, "15 min ago"],
  ["#NX-847289", "Tesla Supply", "Lithium Batteries", "$3.7M", <StatusBadge key="3" status="In Transit" variant="default" />, "1 hr ago"],
  ["#NX-847288", "Govt. of Singapore", "Infrastructure", "$142M", <StatusBadge key="4" status="Under Review" variant="warning" />, "3 hrs ago"],
  ["#NX-847287", "Walmart Global", "Consumer Goods", "$12.8M", <StatusBadge key="5" status="Delivered" variant="success" />, "5 hrs ago"],
];

const sectorActivity = [
  ["Primary Sector", "Agriculture, Mining, Oil & Gas", "$284.1M", <StatusBadge key="1" status="High Activity" variant="success" />, "+18.2%"],
  ["Secondary Sector", "Manufacturing, Processing", "$312.7M", <StatusBadge key="2" status="High Activity" variant="success" />, "+9.5%"],
  ["Tertiary Sector", "Services, Retail, Finance", "$250.4M", <StatusBadge key="3" status="Moderate" variant="warning" />, "+6.1%"],
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Command Center</h1>
        <p className="text-muted-foreground mt-1">Global economic activity overview — real-time supply chain intelligence</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SectionHeader title="Recent Orders" subtitle="Across all sectors and markets" />
          <DataTable
            headers={["Order ID", "Client", "Category", "Value", "Status", "Time"]}
            rows={recentOrders}
          />
        </div>

        <div>
          <SectionHeader title="Sector Performance" subtitle="This quarter" />
          <div className="space-y-3">
            {sectorActivity.map((row, i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground">{row[0]}</span>
                  {row[3]}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{row[1]}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-mono font-bold text-foreground">{row[2]}</span>
                  <span className="text-xs text-success font-medium">{row[4]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Live Market Feed" subtitle="Global commodity and trade activity" />
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { name: "Crude Oil", price: "$78.42", change: "+1.2%", up: true },
              { name: "Gold", price: "$2,034", change: "-0.3%", up: false },
              { name: "Lithium", price: "$24.8K", change: "+4.7%", up: true },
              { name: "Steel", price: "$412", change: "+0.8%", up: true },
              { name: "Copper", price: "$8,921", change: "-1.1%", up: false },
              { name: "Wheat", price: "$612", change: "+2.3%", up: true },
            ].map((item) => (
              <div key={item.name} className="text-center p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                <p className="text-xs text-muted-foreground">{item.name}</p>
                <p className="text-sm font-mono font-bold text-foreground mt-1">{item.price}</p>
                <p className={`text-xs font-medium mt-0.5 flex items-center justify-center gap-0.5 ${item.up ? "text-success" : "text-destructive"}`}>
                  {item.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {item.change}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
