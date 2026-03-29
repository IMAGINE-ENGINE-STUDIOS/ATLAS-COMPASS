import { Settings, Shield, Bell, Globe, Database, Key } from "lucide-react";

export default function SettingsPage() {
  const sections = [
    { icon: Shield, title: "Security", desc: "Authentication, 2FA, API keys, and access control" },
    { icon: Bell, title: "Notifications", desc: "Email, SMS, and push notification preferences" },
    { icon: Globe, title: "Regional", desc: "Currency, timezone, and language settings" },
    { icon: Database, title: "Data Management", desc: "Backup, export, and data retention policies" },
    { icon: Key, title: "API & Integrations", desc: "Checkout.com, third-party connectors, webhooks" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Platform configuration & administration</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((s) => (
          <div key={s.title} className="bg-card rounded-lg border border-border p-5 hover:border-primary/30 transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <s.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
