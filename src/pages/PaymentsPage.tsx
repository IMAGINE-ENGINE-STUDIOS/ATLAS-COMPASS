import { CreditCard, Building, BarChart3, Shield, ArrowUpRight, Zap, Banknote, Fingerprint } from "lucide-react";
import { motion } from "framer-motion";
import { PageContainer, AnimatedSection, HeroHeader, GlassCard, EditorialDivider, fadeUp, staggerContainer } from "@/components/AnimatedLayout";
import { StatusBadge } from "@/components/DashboardWidgets";

const paymentStats = [
  { title: "Processed Today", value: "$124.7M", change: "+18.2%", icon: <CreditCard className="w-5 h-5" /> },
  { title: "Merchant Accounts", value: "12,847", change: "+342", icon: <Building className="w-5 h-5" /> },
  { title: "Acceptance Rate", value: "99.2%", change: "Best-in-class", icon: <BarChart3 className="w-5 h-5" /> },
  { title: "Fraud Blocked", value: "$2.1M", change: "847 attempts", icon: <Shield className="w-5 h-5" /> },
];

const transactions = [
  { id: "TXN-847291", parties: "Aramco → ATLAS Escrow", amount: "$24,500,000", type: "Wire Transfer", status: "Completed", variant: "success" as const, time: "2 min ago" },
  { id: "TXN-847290", parties: "Maersk → Fleet Ops", amount: "$8,240,000", type: "SWIFT", status: "Processing", variant: "warning" as const, time: "15 min ago" },
  { id: "TXN-847289", parties: "Card Issuance Batch", amount: "$124,000", type: "Card Program", status: "Issued", variant: "success" as const, time: "1 hr ago" },
  { id: "TXN-847288", parties: "Singapore Govt.", amount: "$142,000,000", type: "Sovereign Wire", status: "Under Review", variant: "warning" as const, time: "3 hrs ago" },
  { id: "TXN-847287", parties: "Walmart Settlement", amount: "$12,800,000", type: "ACH Batch", status: "Completed", variant: "success" as const, time: "5 hrs ago" },
];

const services = [
  { name: "Online Banking", desc: "ACH, SWIFT, Wire transfers", icon: Banknote },
  { name: "Merchant Services", desc: "POS, payment links, invoicing", icon: CreditCard },
  { name: "Card Issuing", desc: "Virtual & physical cards", icon: CreditCard },
  { name: "Intelligent Acceptance", desc: "AI-powered routing", icon: Zap },
  { name: "Fraud Detection", desc: "Real-time risk scoring", icon: Fingerprint },
  { name: "Settlement", desc: "Multi-currency settlement", icon: BarChart3 },
];

export default function PaymentsPage() {
  return (
    <PageContainer>
      <HeroHeader
        accent="Payments & Banking"
        title="Financial Operations"
        subtitle="Powered by Checkout.com — merchant services, card issuing & intelligent acceptance processing $124.7M daily"
      />

      {/* Checkout.com Banner */}
      <AnimatedSection variant="scaleIn">
        <motion.div whileHover={{ scale: 1.01 }} className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 p-6 glow-primary">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shrink-0">
              <CreditCard className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Checkout.com Integration</p>
              <p className="text-xs text-muted-foreground mt-0.5">Connect your API keys to enable live payment processing, card issuing, and intelligent acceptance.</p>
            </div>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="px-6 py-2.5 gradient-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/20">
              Connect API
            </motion.button>
          </div>
          <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-primary/5 blur-3xl" />
        </motion.div>
      </AnimatedSection>

      {/* Stats */}
      <AnimatedSection>
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {paymentStats.map((s) => (
            <motion.div key={s.title} variants={fadeUp} whileHover={{ y: -2, scale: 1.02 }} className="bg-card rounded-xl border border-border p-5 group hover:border-primary/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:bg-primary/20 transition-colors">{s.icon}</div>
              <p className="text-2xl font-mono font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{s.title}</p>
              <p className="text-[10px] text-success font-semibold mt-1">{s.change}</p>
            </motion.div>
          ))}
        </motion.div>
      </AnimatedSection>

      <EditorialDivider label="Transactions" />

      {/* Layout: Transactions + Services */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <AnimatedSection className="lg:col-span-3" variant="slideRight">
          <div className="space-y-2">
            {transactions.map((txn, i) => (
              <motion.div
                key={txn.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-primary/20 transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                  <span className="text-xs font-mono text-primary font-bold">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate">{txn.parties}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{txn.id}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{txn.type}</p>
                </div>
                <span className="text-sm font-mono font-bold text-foreground">{txn.amount}</span>
                <StatusBadge status={txn.status} variant={txn.variant} />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{txn.time}</span>
              </motion.div>
            ))}
          </div>
        </AnimatedSection>

        <AnimatedSection className="lg:col-span-2" variant="slideLeft">
          <h3 className="text-lg font-bold text-foreground mb-4">Services</h3>
          <div className="grid grid-cols-1 gap-3">
            {services.map((s, i) => (
              <motion.div
                key={s.name}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.06 }}
                whileHover={{ x: 4, scale: 1.01 }}
                className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/20 transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors shrink-0">
                  <s.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                </div>
                <StatusBadge status="Ready" variant="success" />
              </motion.div>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </PageContainer>
  );
}
