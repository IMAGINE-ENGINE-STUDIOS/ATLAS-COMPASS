import { Shield, Bell, Globe, Database, Key, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { PageContainer, AnimatedSection, HeroHeader, EditorialDivider, fadeUp, staggerContainer } from "@/components/AnimatedLayout";

const sections = [
  { icon: Shield, title: "Security", desc: "Authentication, 2FA, API keys, and access control", color: "from-primary/20 to-primary/5" },
  { icon: Bell, title: "Notifications", desc: "Email, SMS, and push notification preferences", color: "from-accent/20 to-accent/5" },
  { icon: Globe, title: "Regional", desc: "Currency, timezone, and language settings", color: "from-success/20 to-success/5" },
  { icon: Database, title: "Data Management", desc: "Backup, export, and data retention policies", color: "from-warning/20 to-warning/5" },
  { icon: Key, title: "API & Integrations", desc: "Checkout.com, third-party connectors, webhooks", color: "from-primary/20 to-accent/5" },
];

export default function SettingsPage() {
  return (
    <PageContainer>
      <HeroHeader
        accent="Settings"
        title="Platform Configuration"
        subtitle="Manage security, integrations, notifications and system preferences for your ATLAS environment"
      />

      <EditorialDivider label="Modules" />

      <AnimatedSection>
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((s, i) => (
            <motion.div
              key={s.title}
              variants={fadeUp}
              whileHover={{ y: -4, scale: 1.01 }}
              className="relative overflow-hidden bg-card rounded-xl border border-border p-6 hover:border-primary/20 transition-all cursor-pointer group"
            >
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${s.color}`} />
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                  <s.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </AnimatedSection>
    </PageContainer>
  );
}
