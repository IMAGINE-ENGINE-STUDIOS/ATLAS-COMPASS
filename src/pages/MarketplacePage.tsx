import { useState } from "react";
import { Search, Plus, Star, Package, ArrowUpRight, Sparkles, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageContainer, AnimatedSection, HeroHeader, EditorialDivider, fadeUp, staggerContainer } from "@/components/AnimatedLayout";
import { StatusBadge } from "@/components/DashboardWidgets";

const categories = ["All", "Raw Materials", "Energy", "Manufacturing", "Technology", "Agriculture", "Consumer Goods", "Services"];

const products = [
  { id: "PRD-001", name: "Grade A Crude Oil", seller: "Aramco Industries", sector: "Energy", price: "$78.42/bbl", stock: "500K barrels", rating: 4.9, status: "Active", featured: true },
  { id: "PRD-002", name: "EV Battery Cells (21700)", seller: "CATL Manufacturing", sector: "Technology", price: "$1.24/unit", stock: "2.4M units", rating: 4.8, status: "Active", featured: true },
  { id: "PRD-003", name: "Organic Wheat (Grade 1)", seller: "AgriGlobal Co.", sector: "Agriculture", price: "$612/ton", stock: "45K tons", rating: 4.7, status: "Active", featured: false },
  { id: "PRD-004", name: "Steel Coils (HRC)", seller: "ArcelorMittal", sector: "Manufacturing", price: "$412/ton", stock: "120K tons", rating: 4.6, status: "Low Stock", featured: false },
  { id: "PRD-005", name: "Cloud Computing (Enterprise)", seller: "Azure Partners", sector: "Services", price: "$0.12/hr", stock: "Unlimited", rating: 4.9, status: "Active", featured: true },
  { id: "PRD-006", name: "Lithium Carbonate (99.5%)", seller: "Albemarle Corp", sector: "Raw Materials", price: "$24.8K/ton", stock: "8K tons", rating: 4.5, status: "Active", featured: false },
];

export default function MarketplacePage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = products.filter(p =>
    (activeCategory === "All" || p.sector === activeCategory) &&
    (searchQuery === "" || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.seller.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const featured = filtered.filter(p => p.featured);
  const regular = filtered.filter(p => !p.featured);

  return (
    <PageContainer>
      <HeroHeader
        accent="Marketplace"
        title="Global Trade Exchange"
        subtitle="Multi-sector B2B & B2C marketplace — source raw materials, energy, manufacturing, technology and services from 12,847 verified merchants"
      />

      {/* Search & Actions */}
      <AnimatedSection variant="fadeUp">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search products, sellers, categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-6 py-3 gradient-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> List Product
          </motion.button>
        </div>
      </AnimatedSection>

      {/* Category Pills */}
      <AnimatedSection variant="fadeUp">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat, i) => (
            <motion.button
              key={cat}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                activeCategory === cat
                  ? "gradient-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
              }`}
            >
              {cat}
            </motion.button>
          ))}
        </div>
      </AnimatedSection>

      {/* Featured Products — Magazine Hero Cards */}
      {featured.length > 0 && (
        <>
          <EditorialDivider label="Featured" />
          <AnimatedSection>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <AnimatePresence mode="popLayout">
                {featured.map((product, i) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ y: -6, transition: { duration: 0.2 } }}
                    className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-card to-card/50 p-6 cursor-pointer group"
                  >
                    <div className="absolute top-3 right-3">
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded-full">
                        <Sparkles className="w-3 h-3" /> Featured
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{product.id}</span>
                    <h3 className="text-lg font-bold text-foreground mt-2 group-hover:text-primary transition-colors">{product.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{product.seller}</p>
                    <div className="flex items-center gap-3 mt-4">
                      <span className="text-[10px] bg-secondary px-2 py-1 rounded-md text-secondary-foreground font-medium">{product.sector}</span>
                      <span className="text-[10px] text-warning font-semibold flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-warning" /> {product.rating}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
                      <span className="text-2xl font-mono font-bold text-foreground">{product.price}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Package className="w-3 h-3" /> {product.stock}
                      </span>
                    </div>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </AnimatedSection>
        </>
      )}

      {/* Regular Products */}
      {regular.length > 0 && (
        <>
          <EditorialDivider label="All Products" />
          <AnimatedSection>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {regular.map((product, i) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: 0.2 + i * 0.08 }}
                    whileHover={{ y: -4 }}
                    className="bg-card rounded-xl border border-border p-5 hover:border-primary/20 transition-all duration-300 group cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-[10px] font-mono text-muted-foreground">{product.id}</span>
                      <StatusBadge status={product.status} variant={product.status === "Active" ? "success" : "warning"} />
                    </div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{product.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{product.seller}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">{product.sector}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Star className="w-3 h-3 text-warning fill-warning" /> {product.rating}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                      <span className="text-lg font-mono font-bold text-foreground">{product.price}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Package className="w-3 h-3" /> {product.stock}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </AnimatedSection>
        </>
      )}
    </PageContainer>
  );
}
