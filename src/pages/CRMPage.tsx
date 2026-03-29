import { useState } from "react";
import { Plus, Search, Phone, Mail, Building, MoreHorizontal } from "lucide-react";
import { SectionHeader, StatCard, DataTable, StatusBadge } from "@/components/DashboardWidgets";

const pipelineStages = [
  { name: "Lead", count: 124, value: "$18.4M", color: "bg-muted-foreground" },
  { name: "Qualified", count: 67, value: "$42.1M", color: "bg-primary" },
  { name: "Proposal", count: 34, value: "$87.3M", color: "bg-accent" },
  { name: "Negotiation", count: 18, value: "$124.7M", color: "bg-warning" },
  { name: "Closed Won", count: 45, value: "$312.8M", color: "bg-success" },
];

const contacts = [
  { name: "Sarah Chen", company: "Petronas Global", role: "VP Procurement", email: "s.chen@petronas.com", phone: "+60 12-345-6789", status: "Active", deals: "$45.2M" },
  { name: "James Wright", company: "Maersk Shipping", role: "Fleet Director", email: "j.wright@maersk.com", phone: "+45 33-123-456", status: "Active", deals: "$28.7M" },
  { name: "Maria Santos", company: "Vale Mining", role: "Chief Supply Officer", email: "m.santos@vale.com", phone: "+55 21-9876-5432", status: "Prospect", deals: "$12.1M" },
  { name: "Ahmed Al-Rashid", company: "Saudi Investment Fund", role: "Managing Director", email: "a.rashid@sif.sa", phone: "+966 50-123-4567", status: "VIP", deals: "$142M" },
  { name: "Yuki Tanaka", company: "Toyota Motor Corp", role: "Supply Chain Lead", email: "y.tanaka@toyota.jp", phone: "+81 3-1234-5678", status: "Active", deals: "$67.8M" },
];

export default function CRMPage() {
  const [view, setView] = useState<"pipeline" | "contacts">("pipeline");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">CRM</h1>
          <p className="text-muted-foreground mt-1">Relationship management across all sectors</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Add Contact
        </button>
      </div>

      <div className="flex gap-2">
        {(["pipeline", "contacts"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {v}
          </button>
        ))}
      </div>

      {view === "pipeline" && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-3">
            {pipelineStages.map((stage) => (
              <div key={stage.name} className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{stage.name}</span>
                </div>
                <p className="text-2xl font-mono font-bold text-foreground">{stage.count}</p>
                <p className="text-xs text-muted-foreground mt-1">Total: {stage.value}</p>
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${(stage.count / 124) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline Summary</h3>
            <div className="flex items-end gap-1 h-40">
              {pipelineStages.map((stage) => (
                <div key={stage.name} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-mono text-muted-foreground">{stage.count}</span>
                  <div className={`w-full rounded-t ${stage.color} transition-all`} style={{ height: `${(stage.count / 124) * 100}%` }} />
                  <span className="text-[10px] text-muted-foreground">{stage.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === "contacts" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search contacts..." className="w-full bg-card border border-border rounded-md pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div key={contact.email} className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-all flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                    {contact.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{contact.name}</p>
                    <p className="text-xs text-muted-foreground">{contact.role} · {contact.company}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <StatusBadge status={contact.status} variant={contact.status === "VIP" ? "warning" : contact.status === "Active" ? "success" : "default"} />
                  <span className="text-sm font-mono font-bold text-foreground">{contact.deals}</span>
                  <div className="flex items-center gap-2">
                    <button className="text-muted-foreground hover:text-primary transition-colors"><Mail className="w-4 h-4" /></button>
                    <button className="text-muted-foreground hover:text-primary transition-colors"><Phone className="w-4 h-4" /></button>
                    <button className="text-muted-foreground hover:text-foreground transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
