import { useState, useRef, useEffect } from "react";
import { Search, Plus, Star, Package, Sparkles, Filter, ArrowUpRight, Eye, Heart, ShoppingCart, TrendingUp, Zap, Globe, ChevronRight, X, Truck, MapPin } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";

/* ── DATA ── */
const categories = ["All", "Nearby", "Raw Materials", "Energy", "Manufacturing", "Technology", "Agriculture", "Consumer Goods", "Services"];
import { getUserLocation, haversineDistance, getDeliveryZone, zoneInfo, type UserLocation } from "@/lib/delivery-service";
import DeliveryBanner from "@/components/delivery/DeliveryBanner";
import DeliveryQuoteCard from "@/components/delivery/DeliveryQuoteCard";

const products = [
  { id: "PRD-001", name: "Grade A Crude Oil", seller: "Aramco Industries", sector: "Energy", price: "$78.42", unit: "/bbl", stock: "500K barrels", rating: 4.9, status: "Active", featured: true, views: "24.8K", image: "🛢️", storeLat: 25.2854, storeLng: 51.5310 },
  { id: "PRD-002", name: "EV Battery Cells (21700)", seller: "CATL Manufacturing", sector: "Technology", price: "$1.24", unit: "/unit", stock: "2.4M units", rating: 4.8, status: "Active", featured: true, views: "18.2K", image: "🔋", storeLat: 26.0789, storeLng: 119.2965 },
  { id: "PRD-003", name: "Organic Wheat (Grade 1)", seller: "AgriGlobal Co.", sector: "Agriculture", price: "$612", unit: "/ton", stock: "45K tons", rating: 4.7, status: "Active", featured: false, views: "9.1K", image: "🌾", storeLat: 41.8781, storeLng: -87.6298 },
  { id: "PRD-004", name: "Steel Coils (HRC)", seller: "ArcelorMittal", sector: "Manufacturing", price: "$412", unit: "/ton", stock: "120K tons", rating: 4.6, status: "Low Stock", featured: false, views: "12.4K", image: "🏗️", storeLat: 49.4987, storeLng: 5.9490 },
  { id: "PRD-005", name: "Cloud Computing (Enterprise)", seller: "Azure Partners", sector: "Services", price: "$0.12", unit: "/hr", stock: "Unlimited", rating: 4.9, status: "Active", featured: true, views: "31.5K", image: "☁️", storeLat: 47.6062, storeLng: -122.3321 },
  { id: "PRD-006", name: "Lithium Carbonate (99.5%)", seller: "Albemarle Corp", sector: "Raw Materials", price: "$24.8K", unit: "/ton", stock: "8K tons", rating: 4.5, status: "Active", featured: false, views: "7.3K", image: "⚗️", storeLat: 35.2271, storeLng: -80.8431 },
  { id: "PRD-007", name: "Solar Panel Array (500W)", seller: "LONGi Green", sector: "Energy", price: "$142", unit: "/panel", stock: "890K units", rating: 4.8, status: "Active", featured: true, views: "22.1K", image: "☀️", storeLat: 34.3416, storeLng: 108.9398 },
  { id: "PRD-008", name: "Semiconductor Wafers (8\")", seller: "TSMC Global", sector: "Technology", price: "$3.2K", unit: "/lot", stock: "15K lots", rating: 4.9, status: "Active", featured: false, views: "14.7K", image: "💎", storeLat: 24.7736, storeLng: 121.0177 },
];

const liveStats = [
  { label: "Live Orders", value: "12,847", change: "+342", up: true },
  { label: "Volume (24h)", value: "$2.4B", change: "+18.2%", up: true },
  { label: "Active Sellers", value: "48,291", change: "+1,204", up: true },
  { label: "Sectors", value: "142", change: "+7", up: true },
];

/* ── TILT CARD ── */
function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 200, damping: 20 });

  const handleMouse = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── FLOATING ORB ── */
function FloatingOrb({ delay = 0, size = 300, color = "primary" }: { delay?: number; size?: number; color?: string }) {
  const colors: Record<string, string> = {
    primary: "from-primary/20 to-primary/5",
    accent: "from-accent/20 to-accent/5",
    warning: "from-warning/15 to-warning/5",
  };
  return (
    <motion.div
      className={`absolute rounded-full bg-gradient-to-br ${colors[color] || colors.primary} blur-3xl pointer-events-none`}
      style={{ width: size, height: size }}
      animate={{
        x: [0, 40, -30, 0],
        y: [0, -50, 20, 0],
        scale: [1, 1.15, 0.9, 1],
      }}
      transition={{ duration: 12 + delay * 2, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

/* ── MAIN PAGE ── */
export default function MarketplacePage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);

  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [deliveryProduct, setDeliveryProduct] = useState<typeof products[0] | null>(null);

  useEffect(() => {
    getUserLocation().then(setUserLocation).catch(() => {});
  }, []);

  const getProductDistance = (p: typeof products[0]) => {
    if (!userLocation) return null;
    return haversineDistance(userLocation.lat, userLocation.lng, p.storeLat, p.storeLng);
  };

  const filtered = products.filter(p => {
    if (activeCategory === "Nearby") {
      const dist = getProductDistance(p);
      return dist !== null && dist < 30;
    }
    return (activeCategory === "All" || p.sector === activeCategory) &&
      (searchQuery === "" || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.seller.toLowerCase().includes(searchQuery.toLowerCase()));
  }).sort((a, b) => {
    if (activeCategory === "Nearby" && userLocation) {
      return (getProductDistance(a) || 999) - (getProductDistance(b) || 999);
    }
    return 0;
  });

  const featured = filtered.filter(p => p.featured);
  const regular = filtered.filter(p => !p.featured);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <FloatingOrb delay={0} size={500} color="primary" />
        <FloatingOrb delay={2} size={350} color="accent" />
        <FloatingOrb delay={4} size={400} color="warning" />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-3xl" />
      </div>

      <div className="relative z-10 space-y-8 p-2 sm:p-4 md:p-6">
        {/* ── HERO HEADER ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative overflow-hidden rounded-3xl border border-border/50 p-8 md:p-12"
          style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.6) 50%, hsl(var(--secondary) / 0.3) 100%)" }}
        >
          <div className="absolute inset-0 backdrop-blur-sm" />
          <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)", backgroundSize: "24px 24px" }} />

          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 backdrop-blur-md mb-4"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                </span>
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-primary">Live · 12,847 trades active</span>
              </motion.div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                <span className="text-foreground">Global Trade</span>
                <br />
                <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">Exchange</span>
              </h1>
              <p className="text-muted-foreground mt-3 max-w-lg text-base leading-relaxed">
                Multi-sector B2B & B2C marketplace — 48,291 verified merchants across 142 economic sectors
              </p>
            </div>

            {/* Live Stats Ticker */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="grid grid-cols-2 gap-3 w-full lg:w-auto"
            >
              {liveStats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  className="px-5 py-3 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl"
                >
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold font-mono text-foreground mt-0.5">{stat.value}</p>
                  <span className="text-[10px] font-mono text-success flex items-center gap-0.5 mt-0.5">
                    <TrendingUp className="w-3 h-3" /> {stat.change}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div className="absolute -right-32 -bottom-32 w-96 h-96 rounded-full bg-primary/5 blur-[100px]" />
          <div className="absolute -left-20 -top-20 w-60 h-60 rounded-full bg-accent/5 blur-[80px]" />
        </motion.div>

        {/* ── SEARCH BAR ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="relative"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 group">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20 opacity-0 group-focus-within:opacity-100 blur-xl transition-opacity duration-500" />
              <div className="relative flex items-center bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden group-focus-within:border-primary/40 transition-all duration-300">
                <Search className="ml-5 w-5 h-5 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Search products, sellers, sectors across the global exchange..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent px-4 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="mr-2 p-2 rounded-xl bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
                  <Filter className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: "0 0 30px hsl(var(--primary) / 0.3)" }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-7 py-4 rounded-2xl text-sm font-semibold text-primary-foreground"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
            >
              <Plus className="w-4 h-4" /> List Product
            </motion.button>
          </div>
        </motion.div>

        {/* ── CATEGORY PILLS ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
        >
          {categories.map((cat, i) => (
            <motion.button
              key={cat}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.05 }}
              whileHover={{ scale: 1.08, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveCategory(cat)}
              className={`relative px-5 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all duration-300 overflow-hidden ${
                activeCategory === cat
                  ? "text-primary-foreground shadow-lg"
                  : "bg-card/40 backdrop-blur-xl border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              {activeCategory === cat && (
                <motion.div
                  layoutId="activeCat"
                  className="absolute inset-0 rounded-2xl"
                  style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span className="relative z-10">{cat}</span>
            </motion.button>
          ))}
        </motion.div>

        {/* ── FEATURED ── */}
        {featured.length > 0 && (
          <section>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex items-center gap-4 mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary">Featured Products</span>
              <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <AnimatePresence mode="popLayout">
                {featured.map((product, i) => (
                  <TiltCard key={product.id} className="perspective-1000">
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: i * 0.12 }}
                      onClick={() => setSelectedProduct(product)}
                      onMouseEnter={() => setHoveredProduct(product.id)}
                      onMouseLeave={() => setHoveredProduct(null)}
                      className="relative overflow-hidden rounded-3xl border border-border/40 cursor-pointer group"
                      style={{ background: "linear-gradient(160deg, hsl(var(--card) / 0.8) 0%, hsl(var(--card) / 0.4) 100%)", backdropFilter: "blur(20px)" }}
                    >
                      {/* Glass reflection */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none" />

                      <div className="p-7">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-5">
                          <div className="flex items-center gap-3">
                            <motion.span
                              animate={hoveredProduct === product.id ? { scale: 1.2, rotate: 10 } : { scale: 1, rotate: 0 }}
                              className="text-4xl"
                            >
                              {product.image}
                            </motion.span>
                            <div>
                              <span className="text-[10px] font-mono text-muted-foreground">{product.id}</span>
                              <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors duration-300">{product.name}</h3>
                            </div>
                          </div>
                          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full backdrop-blur-md">
                            <Sparkles className="w-3 h-3" /> Featured
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Globe className="w-3 h-3" /> {product.seller}
                        </p>

                        {/* Stats row */}
                        <div className="flex items-center gap-3 mt-5">
                          <span className="text-[10px] bg-secondary/60 backdrop-blur-sm px-3 py-1 rounded-full text-secondary-foreground font-medium border border-border/30">{product.sector}</span>
                          <span className="text-[10px] text-warning font-semibold flex items-center gap-1">
                            <Star className="w-3 h-3 fill-warning" /> {product.rating}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {product.views}
                          </span>
                        </div>

                        {/* Price footer */}
                        <div className="flex items-end justify-between mt-7 pt-5 border-t border-border/30">
                          <div>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Price</p>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-3xl font-mono font-bold text-foreground">{product.price}</span>
                              <span className="text-sm text-muted-foreground">{product.unit}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2.5 rounded-xl bg-secondary/50 backdrop-blur-sm border border-border/30 text-muted-foreground hover:text-foreground transition-colors">
                              <Heart className="w-4 h-4" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05, boxShadow: "0 0 24px hsl(var(--primary) / 0.4)" }}
                              whileTap={{ scale: 0.95 }}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-primary-foreground"
                              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
                            >
                              <ShoppingCart className="w-3.5 h-3.5" /> Order
                            </motion.button>
                          </div>
                        </div>
                      </div>

                      {/* Hover glow */}
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={hoveredProduct === product.id ? { opacity: 1 } : { opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        style={{ background: "radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.06) 0%, transparent 70%)" }}
                      />
                    </motion.div>
                  </TiltCard>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* ── ALL PRODUCTS GRID ── */}
        {regular.length > 0 && (
          <section>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="flex items-center gap-4 mb-6">
              <Package className="w-4 h-4 text-muted-foreground" />
              <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground">All Products</span>
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] font-mono text-muted-foreground">{regular.length} items</span>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {regular.map((product, i) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    whileHover={{ y: -6, transition: { duration: 0.25 } }}
                    onClick={() => setSelectedProduct(product)}
                    onMouseEnter={() => setHoveredProduct(product.id)}
                    onMouseLeave={() => setHoveredProduct(null)}
                    className="relative overflow-hidden rounded-2xl border border-border/30 p-5 cursor-pointer group"
                    style={{ background: "hsl(var(--card) / 0.5)", backdropFilter: "blur(16px)" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

                    <div className="relative z-10">
                      <div className="flex items-start justify-between mb-3">
                        <motion.span animate={hoveredProduct === product.id ? { scale: 1.3 } : { scale: 1 }} className="text-3xl">
                          {product.image}
                        </motion.span>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${product.status === "Active" ? "bg-success" : "bg-warning"}`} />
                          <span className="text-[9px] font-mono text-muted-foreground">{product.status}</span>
                        </div>
                      </div>

                      <span className="text-[9px] font-mono text-muted-foreground">{product.id}</span>
                      <h3 className="text-sm font-bold text-foreground mt-1 group-hover:text-primary transition-colors duration-300 line-clamp-1">{product.name}</h3>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Globe className="w-3 h-3" /> {product.seller}
                      </p>

                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          <span className="text-[10px] bg-secondary/40 backdrop-blur-sm px-2 py-0.5 rounded-full text-secondary-foreground border border-border/20">{product.sector}</span>
                          <span className="text-[10px] text-warning flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-warning" /> {product.rating}
                          </span>
                          {(() => {
                            const dist = getProductDistance(product);
                            if (dist === null) return null;
                            const zone = getDeliveryZone(dist);
                            if (zone === "out_of_range") return null;
                            return (
                              <span className="text-[9px] flex items-center gap-0.5 px-2 py-0.5 rounded-full border" style={{ borderColor: `${zoneInfo[zone].color}40`, background: `${zoneInfo[zone].color}15`, color: zoneInfo[zone].color }}>
                                <Truck className="w-2.5 h-2.5" /> {zoneInfo[zone].eta}
                              </span>
                            );
                          })()}
                        </div>

                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/20">
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-lg font-mono font-bold text-foreground">{product.price}</span>
                          <span className="text-[10px] text-muted-foreground">{product.unit}</span>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          onClick={(e) => { e.stopPropagation(); }}
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                        </motion.button>
                      </div>
                    </div>

                    <motion.div
                      className="absolute inset-0 pointer-events-none rounded-2xl"
                      animate={hoveredProduct === product.id ? { opacity: 1 } : { opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ boxShadow: "inset 0 0 40px hsl(var(--primary) / 0.05), 0 0 30px hsl(var(--primary) / 0.08)" }}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}
      </div>

      {/* ── PRODUCT DETAIL MODAL ── */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedProduct(null)}
          >
            <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-3xl border border-border/40 overflow-hidden"
              style={{ background: "linear-gradient(160deg, hsl(var(--card) / 0.95) 0%, hsl(var(--card) / 0.8) 100%)", backdropFilter: "blur(40px)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

              <div className="relative p-8">
                <button onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 p-2 rounded-xl bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>

                <div className="text-center mb-6">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }} className="text-6xl inline-block">
                    {selectedProduct.image}
                  </motion.span>
                </div>

                <span className="text-[10px] font-mono text-muted-foreground">{selectedProduct.id}</span>
                <h2 className="text-2xl font-bold text-foreground mt-1">{selectedProduct.name}</h2>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> {selectedProduct.seller}
                </p>

                <div className="flex items-center gap-3 mt-4">
                  <span className="text-xs bg-secondary/50 backdrop-blur-sm px-3 py-1 rounded-full text-secondary-foreground border border-border/30">{selectedProduct.sector}</span>
                  <span className="text-xs text-warning flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-warning" /> {selectedProduct.rating}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {selectedProduct.views}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                  <div className="p-4 rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Price</p>
                    <p className="text-2xl font-mono font-bold text-foreground mt-1">{selectedProduct.price}<span className="text-sm text-muted-foreground">{selectedProduct.unit}</span></p>
                  </div>
                  <div className="p-4 rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Stock</p>
                    <p className="text-2xl font-mono font-bold text-foreground mt-1">{selectedProduct.stock}</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <motion.button
                    whileHover={{ scale: 1.02, boxShadow: "0 0 30px hsl(var(--primary) / 0.3)" }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold text-primary-foreground"
                    style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
                  >
                    <ShoppingCart className="w-4 h-4" /> Place Order
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-4 rounded-2xl bg-secondary/40 border border-border/30 text-muted-foreground hover:text-foreground transition-colors">
                    <Heart className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
