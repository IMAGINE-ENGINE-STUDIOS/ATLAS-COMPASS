import { useState } from "react";
import { Plus, Search, Phone, Mail, MoreHorizontal, TrendingUp, Users, Target, Award } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageContainer, AnimatedSection, HeroHeader, GlassCard, EditorialDivider, fadeUp, staggerContainer } from "@/components/AnimatedLayout";
import { StatusBadge } from "@/components/DashboardWidgets";

const pipelineStages = [
  { name: "Lead", count: 124, value: "$18.4M", color: "bg-muted-foreground", pct: 100 },
  { name: "Qualified", count: 67, value: "$42.1M", color: "bg-primary", pct: 54 },
  { name: "Proposal", count: 34, value: "$87.3M", color: "bg-accent", pct: 27 },
  { name: "Negotiation", count: 18, value: "$124.7M", color: "bg-warning", pct: 15 },
  { name: "Closed Won", count: 45, value: "$312.8M", color: "bg-success", pct: 36 },
];

const contacts = [
  { name: "Sarah Chen", company: "Petronas Global", role: "VP Procurement", email: "s.chen@petronas.com", phone: "+60 12-345-6789", status: "Active", deals: "$45.2M" },
  { name: "James Wright", company: "Maersk Shipping", role: "Fleet Director", email: "j.wright@maersk.com", phone: "+45 33-123-456", status: "Active", deals: "$28.7M" },
  { name: "Maria Santos", company: "Vale Mining", role: "Chief Supply Officer", email: "m.santos@vale.com", phone: "+55 21-9876-5432", status: "Prospect", deals: "$12.1M" },
  { name: "Ahmed Al-Rashid", company: "Saudi Investment Fund", role: "Managing Director", email: "a.rashid@sif.sa", phone: "+966 50-123-4567", status: "VIP", deals: "$142M" },
  { name: "Yuki Tanaka", company: "Toyota Motor Corp", role: "Supply Chain Lead", email: "y.tanaka@toyota.jp", phone: "+81 3-1234-5678", status: "Active", deals: "$67.8M" },
];

const crmStats = [
  { label: "Total Pipeline", value: "$585M", icon: <TrendingUp className="w-5 h-5" /> },
  { label: "Active Contacts", value: "2,847", icon: <Users className="w-5 h-5" /> },
  { label: "Win Rate", value: "36%", icon: <Target className="w-5 h-5" /> },
  { label: "Avg Deal Size", value: "$6.9M", icon: <Award className="w-5 h-5" /> },
];

export default function CRMPage() {
  const [view, setView] = useState<"pipeline" | "contacts">("pipeline");

  return (
    <PageContainer>
      <HeroHeader
        accent="CRM"
        title="Relationship Intelligence"
        subtitle="Enterprise relationship management — tracking $585M in active pipeline across every sector and continent"
      />

      {/* Quick Stats */}
      <AnimatedSection>
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {crmStats.map((s) => (
            <motion.div key={s.label} variants={fadeUp} whileHover={{ y: -2, scale: 1.02 }} className="bg-card rounded-xl border border-border p-5 group hover:border-primary/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:bg-primary/20 transition-colors">{s.icon}</div>
              <p className="text-2xl font-mono font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </AnimatedSection>

      {/* View Switcher */}
      <AnimatedSection variant="fadeUp">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(["pipeline", "contacts"] as const).map((v) => (
              <motion.button
                key={v}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setView(v)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold capitalize transition-all duration-300 ${view === v ? "gradient-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
              >
                {v}
              </motion.button>
            ))}
          </div>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-5 py-2.5 gradient-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> Add Contact
          </motion.button>
        </div>
      </AnimatedSection>

      <EditorialDivider label={view === "pipeline" ? "Sales Pipeline" : "Contact Directory"} />

      <AnimatePresence mode="wait">
        {view === "pipeline" && (
          <motion.div key="pipeline" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            {/* Pipeline Funnel */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {pipelineStages.map((stage, i) => (
                <motion.div
                  key={stage.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  className="bg-card rounded-xl border border-border p-5 hover:border-primary/20 transition-all"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stage.name}</span>
                  </div>
                  <p className="text-3xl font-mono font-bold text-foreground">{stage.count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stage.value}</p>
                  <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stage.pct}%` }}
                      transition={{ delay: 0.4 + i * 0.1, duration: 0.8 }}
                      className={`h-full rounded-full ${stage.color}`}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Funnel Visualization */}
            <GlassCard hover={false} className="!p-8">
              <h3 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wider">Conversion Funnel</h3>
              <div className="flex items-end gap-2 h-48">
                {pipelineStages.map((stage, i) => (
                  <div key={stage.name} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">{stage.count}</span>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${stage.pct}%` }}
                      transition={{ delay: 0.5 + i * 0.12, duration: 0.6, ease: "easeOut" }}
                      className={`w-full rounded-t-lg ${stage.color} min-h-[4px]`}
                    />
                    <span className="text-[9px] text-muted-foreground font-medium">{stage.name}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}

        {view === "contacts" && (
          <motion.div key="contacts" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search contacts..." className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
            </div>
            <div className="space-y-3">
              {contacts.map((contact, i) => (
                <motion.div
                  key={contact.email}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  whileHover={{ x: 4 }}
                  className="bg-card rounded-xl border border-border p-5 hover:border-primary/20 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <motion.div whileHover={{ scale: 1.1 }} className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary font-bold text-sm">
                      {contact.name.split(" ").map(n => n[0]).join("")}
                    </motion.div>
                    <div>
                      <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{contact.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{contact.role} · {contact.company}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <StatusBadge status={contact.status} variant={contact.status === "VIP" ? "warning" : contact.status === "Active" ? "success" : "default"} />
                    <span className="text-sm font-mono font-bold text-foreground">{contact.deals}</span>
                    <div className="flex items-center gap-1">
                      {[Mail, Phone, MoreHorizontal].map((Icon, j) => (
                        <motion.button key={j} whileHover={{ scale: 1.2 }} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                          <Icon className="w-4 h-4" />
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}
