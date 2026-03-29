import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  icon: ReactNode;
  subtitle?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon, subtitle }: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-5 hover:border-primary/30 transition-all duration-300 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1 font-mono">{value}</p>
          {change && (
            <p className={`text-xs font-medium mt-1 ${changeType === "up" ? "text-success" : changeType === "down" ? "text-destructive" : "text-muted-foreground"}`}>
              {changeType === "up" ? "↑" : changeType === "down" ? "↓" : "→"} {change}
            </p>
          )}
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="text-primary/60 group-hover:text-primary transition-colors">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {headers.map((h, i) => (
                <th key={i} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-sm text-foreground">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusBadge({ status, variant }: { status: string; variant: "success" | "warning" | "destructive" | "default" }) {
  const classes = {
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    default: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${classes[variant]}`}>
      {status}
    </span>
  );
}
