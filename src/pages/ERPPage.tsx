import { Package, FileText, Warehouse, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { StatCard, SectionHeader, DataTable, StatusBadge } from "@/components/DashboardWidgets";

const erpStats = [
  { title: "Total Inventory Value", value: "$1.24B", change: "+3.2% this month", changeType: "up" as const, icon: <Warehouse className="w-6 h-6" /> },
  { title: "Purchase Orders", value: "4,218", change: "892 pending approval", changeType: "neutral" as const, icon: <FileText className="w-6 h-6" /> },
  { title: "Stock Alerts", value: "47", change: "12 critical items", changeType: "down" as const, icon: <AlertTriangle className="w-6 h-6" /> },
  { title: "Fulfillment Rate", value: "98.4%", change: "+0.6% improvement", changeType: "up" as const, icon: <CheckCircle className="w-6 h-6" /> },
];

const invoices = [
  ["INV-2024-8421", "Aramco Industries", "$24,500,000", "2024-03-15", <StatusBadge key="1" status="Paid" variant="success" />, "Net 30"],
  ["INV-2024-8420", "Maersk Logistics", "$8,240,000", "2024-03-14", <StatusBadge key="2" status="Pending" variant="warning" />, "Net 60"],
  ["INV-2024-8419", "CATL Manufacturing", "$3,720,000", "2024-03-13", <StatusBadge key="3" status="Overdue" variant="destructive" />, "Net 30"],
  ["INV-2024-8418", "Tesla Supply Chain", "$12,100,000", "2024-03-12", <StatusBadge key="4" status="Paid" variant="success" />, "Net 45"],
  ["INV-2024-8417", "Vale Mining Corp", "$5,890,000", "2024-03-11", <StatusBadge key="5" status="Paid" variant="success" />, "Net 30"],
];

const inventory = [
  ["Crude Oil (WTI)", "Energy", "500,000 bbl", "450,000 bbl", <StatusBadge key="1" status="Optimal" variant="success" />, "$39.2M"],
  ["Lithium Carbonate", "Raw Materials", "8,000 tons", "2,100 tons", <StatusBadge key="2" status="Low Stock" variant="warning" />, "$52.1M"],
  ["Steel Coils (HRC)", "Metals", "120,000 tons", "15,000 tons", <StatusBadge key="3" status="Critical" variant="destructive" />, "$6.2M"],
  ["EV Battery Cells", "Technology", "2,400,000 units", "1,800,000 units", <StatusBadge key="4" status="Optimal" variant="success" />, "$2.2M"],
  ["Organic Wheat", "Agriculture", "45,000 tons", "38,000 tons", <StatusBadge key="5" status="Optimal" variant="success" />, "$23.3M"],
];

export default function ERPPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">ERP</h1>
        <p className="text-muted-foreground mt-1">Enterprise resource planning — inventory, procurement & finance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {erpStats.map((stat) => <StatCard key={stat.title} {...stat} />)}
      </div>

      <div>
        <SectionHeader title="Inventory Management" subtitle="Real-time stock levels across all warehouses" />
        <DataTable headers={["Product", "Sector", "Capacity", "Current Stock", "Status", "Value"]} rows={inventory} />
      </div>

      <div>
        <SectionHeader title="Recent Invoices" subtitle="Accounts receivable & payable" />
        <DataTable headers={["Invoice", "Client", "Amount", "Date", "Status", "Terms"]} rows={invoices} />
      </div>
    </div>
  );
}
