import { motion, type Variants } from "framer-motion";
import { ReactNode } from "react";

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6 } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const slideRight: Variants = {
  hidden: { opacity: 0, x: -30 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const slideLeft: Variants = {
  hidden: { opacity: 0, x: 30 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={`space-y-10 ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedSection({ children, className = "", variant = "fadeUp" }: { children: ReactNode; className?: string; variant?: "fadeUp" | "fadeIn" | "scaleIn" | "slideRight" | "slideLeft" }) {
  const variants = { fadeUp, fadeIn, scaleIn, slideRight, slideLeft };
  return (
    <motion.div variants={variants[variant]} className={className}>
      {children}
    </motion.div>
  );
}

export function HeroHeader({ title, subtitle, accent }: { title: string; subtitle: string; accent?: string }) {
  return (
    <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card to-secondary/50 border border-border p-8 md:p-12">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
      <div className="relative z-10">
        {accent && <motion.span className="inline-block text-xs font-mono uppercase tracking-[0.3em] text-primary mb-3 px-3 py-1 rounded-full border border-primary/20 bg-primary/5">{accent}</motion.span>}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground tracking-tight leading-[1.1]">{title}</h1>
        <p className="text-lg md:text-xl text-muted-foreground mt-4 max-w-2xl leading-relaxed">{subtitle}</p>
      </div>
      <div className="absolute -right-20 -bottom-20 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-accent/5 blur-3xl" />
    </motion.div>
  );
}

export function MagazineGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className={`grid gap-6 ${className}`}>
      {children}
    </motion.div>
  );
}

export function GlassCard({ children, className = "", hover = true }: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={hover ? { y: -4, transition: { duration: 0.2 } } : undefined}
      className={`bg-card/80 backdrop-blur-sm rounded-xl border border-border p-6 transition-colors duration-300 ${hover ? "hover:border-primary/30 hover:shadow-[0_8px_32px_hsl(var(--primary)/0.08)] cursor-pointer" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function EditorialDivider({ label }: { label?: string }) {
  return (
    <motion.div variants={fadeIn} className="flex items-center gap-4 py-2">
      <div className="flex-1 h-px bg-border" />
      {label && <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">{label}</span>}
      <div className="flex-1 h-px bg-border" />
    </motion.div>
  );
}

export function MetricHighlight({ value, label, sublabel, icon }: { value: string; label: string; sublabel?: string; icon?: ReactNode }) {
  return (
    <motion.div variants={fadeUp} whileHover={{ scale: 1.02 }} className="group">
      <div className="flex items-start gap-4">
        {icon && <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors shrink-0">{icon}</div>}
        <div>
          <p className="text-3xl md:text-4xl font-bold font-mono text-foreground tracking-tight">{value}</p>
          <p className="text-sm font-medium text-foreground/80 mt-1">{label}</p>
          {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
        </div>
      </div>
    </motion.div>
  );
}

export { staggerContainer, fadeUp, fadeIn, scaleIn, slideRight, slideLeft };
