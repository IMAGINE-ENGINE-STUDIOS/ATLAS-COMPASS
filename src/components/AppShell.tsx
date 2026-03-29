import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Users, Package, Truck,
  CreditCard, FolderKanban, ChevronLeft, ChevronRight,
  Globe, Settings, Bell, Search, Menu
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: ShoppingCart, label: "Marketplace", path: "/marketplace" },
  { icon: Users, label: "CRM", path: "/crm" },
  { icon: Package, label: "ERP", path: "/erp" },
  { icon: Truck, label: "Logistics", path: "/logistics" },
  { icon: CreditCard, label: "Payments", path: "/payments" },
  { icon: FolderKanban, label: "Projects", path: "/projects" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-all duration-300 ${collapsed ? "w-16" : "w-60"}`}>
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Globe className="w-7 h-7 text-primary" />
            <span className="text-lg font-bold text-gradient tracking-tight">NEXUS</span>
          </div>
        )}
        {collapsed && <Globe className="w-7 h-7 text-primary mx-auto" />}
        <button onClick={onToggle} className="ml-auto text-sidebar-foreground hover:text-primary transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group
                ${isActive
                  ? "bg-primary/10 text-primary glow-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
            >
              <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground"}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground flex-shrink-0">
            A
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">Admin</p>
              <p className="text-xs text-muted-foreground truncate">Super Administrator</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export function AppHeader() {
  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-6 justify-between sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search across all modules..."
            className="bg-muted border-none rounded-md pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-80"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="relative text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
        </button>
        <div className="text-xs font-mono text-muted-foreground">
          NEXUS v1.0
        </div>
      </div>
    </header>
  );
}
