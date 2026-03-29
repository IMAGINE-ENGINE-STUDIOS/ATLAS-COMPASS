import { CreditCard, Building, BarChart3, Shield, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { StatCard, SectionHeader, DataTable, StatusBadge } from "@/components/DashboardWidgets";

const paymentStats = [
  { title: "Processed Today", value: "$124.7M", change: "+18.2% vs yesterday", changeType: "up" as const, icon: <CreditCard className="w-6 h-6" /> },
  { title: "Merchant Accounts", value: "12,847", change: "+342 this week", changeType: "up" as const, icon: <Building className="w-6 h-6" /> },
  { title: "Acceptance Rate", value: "99.2%", change: "Industry-leading", changeType: "up" as const, icon: <BarChart3 className="w-6 h-6" /> },
  { title: "Fraud Blocked", value: "$2.1M", change: "847 attempts today", changeType: "neutral" as const, icon: <Shield className="w-6 h-6" /> },
];

const transactions = [
  ["TXN-847291", "Aramco → NEXUS Escrow", "$24,500,000", "Wire Transfer", <StatusBadge key="1" status="Completed" variant="success" />, "2 min ago"],
  ["TXN-847290", "Maersk → Fleet Ops", "$8,240,000", "SWIFT", <StatusBadge key="2" status="Processing" variant="warning" />, "15 min ago"],
  ["TXN-847289", "Card Issuance Batch", "$124,000", "Card Program", <StatusBadge key="3" status="Issued" variant="success" />, "1 hr ago"],
  ["TXN-847288", "Singapore Govt.", "$142,000,000", "Sovereign Wire", <StatusBadge key="4" status="Under Review" variant="warning" />, "3 hrs ago"],
  ["TXN-847287", "Walmart Settlement", "$12,800,000", "ACH Batch", <StatusBadge key="5" status="Completed" variant="success" />, "5 hrs ago"],
];

export default function PaymentsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Payments & Banking</h1>
        <p className="text-muted-foreground mt-1">Powered by Checkout.com — merchant services, card issuing & intelligent acceptance</p>
      </div>

      <div className="bg-card rounded-lg border border-primary/20 p-5 glow-primary">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Checkout.com Integration</p>
            <p className="text-xs text-muted-foreground">Connect your Checkout.com API keys to enable live payment processing, card issuing, and intelligent acceptance.</p>
          </div>
          <button className="ml-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
            Connect API
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {paymentStats.map((stat) => <StatCard key={stat.title} {...stat} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SectionHeader title="Recent Transactions" subtitle="All payment types and channels" />
          <DataTable headers={["Transaction", "Parties", "Amount", "Type", "Status", "Time"]} rows={transactions} />
        </div>

        <div>
          <SectionHeader title="Services" subtitle="Checkout.com modules" />
          <div className="space-y-3">
            {[
              { name: "Online Banking", desc: "ACH, SWIFT, Wire transfers", status: "Ready" },
              { name: "Merchant Services", desc: "POS, payment links, invoicing", status: "Ready" },
              { name: "Card Issuing", desc: "Virtual & physical cards", status: "Ready" },
              { name: "Intelligent Acceptance", desc: "AI-powered routing & optimization", status: "Ready" },
              { name: "Fraud Detection", desc: "Real-time risk scoring", status: "Ready" },
              { name: "Settlement", desc: "Multi-currency settlement", status: "Ready" },
            ].map((s) => (
              <div key={s.name} className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                  <StatusBadge status={s.status} variant="success" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
