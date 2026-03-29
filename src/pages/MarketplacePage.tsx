import { useState } from "react";
import { Search, Filter, Plus, Star, MapPin, Package } from "lucide-react";
import { SectionHeader, DataTable, StatusBadge } from "@/components/DashboardWidgets";

const categories = ["All", "Raw Materials", "Energy", "Manufacturing", "Technology", "Agriculture", "Consumer Goods", "Services"];

const products = [
  { id: "PRD-001", name: "Grade A Crude Oil", seller: "Aramco Industries", sector: "Energy", price: "$78.42/bbl", stock: "500K barrels", rating: 4.9, status: "Active" },
  { id: "PRD-002", name: "EV Battery Cells (21700)", seller: "CATL Manufacturing", sector: "Technology", price: "$1.24/unit", stock: "2.4M units", rating: 4.8, status: "Active" },
  { id: "PRD-003", name: "Organic Wheat (Grade 1)", seller: "AgriGlobal Co.", sector: "Agriculture", price: "$612/ton", stock: "45K tons", rating: 4.7, status: "Active" },
  { id: "PRD-004", name: "Steel Coils (HRC)", seller: "ArcelorMittal", sector: "Manufacturing", price: "$412/ton", stock: "120K tons", rating: 4.6, status: "Low Stock" },
  { id: "PRD-005", name: "Cloud Computing (Enterprise)", seller: "Azure Partners", sector: "Services", price: "$0.12/hr", stock: "Unlimited", rating: 4.9, status: "Active" },
  { id: "PRD-006", name: "Lithium Carbonate (99.5%)", seller: "Albemarle Corp", sector: "Raw Materials", price: "$24.8K/ton", stock: "8K tons", rating: 4.5, status: "Active" },
];

export default function MarketplacePage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = products.filter(p =>
    (activeCategory === "All" || p.sector === activeCategory) &&
    (searchQuery === "" || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.seller.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Marketplace</h1>
        <p className="text-muted-foreground mt-1">Global multi-sector B2B & B2C trading platform</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products, sellers, categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-border rounded-md pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> List Product
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((product) => (
          <div key={product.id} className="bg-card rounded-lg border border-border p-5 hover:border-primary/30 transition-all duration-300 group cursor-pointer">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-mono text-muted-foreground">{product.id}</span>
              <StatusBadge status={product.status} variant={product.status === "Active" ? "success" : "warning"} />
            </div>
            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{product.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{product.seller}</p>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{product.sector}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Star className="w-3 h-3 text-warning fill-warning" /> {product.rating}
              </span>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <span className="text-lg font-mono font-bold text-foreground">{product.price}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Package className="w-3 h-3" /> {product.stock}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
