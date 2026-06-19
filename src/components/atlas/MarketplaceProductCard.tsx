import { useState } from "react";
import {
  X, ShoppingBag, Truck, Navigation, Route, Star,
  Plus, Minus, ChevronDown, ChevronUp, Package, Box
} from "lucide-react";
import type { MarketplaceProduct } from "@/lib/marketplace-products";

interface Props {
  product: MarketplaceProduct;
  onClose: () => void;
  onDelivery?: (product: MarketplaceProduct) => void;
  onDirections?: (product: MarketplaceProduct) => void;
  onBuy?: (product: MarketplaceProduct, quantity: number, options: Record<string, string>) => void;
}

export default function MarketplaceProductCard({ product, onClose, onDelivery, onDirections, onBuy }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    product.options?.forEach(o => { defaults[o.label] = o.values[0]; });
    return defaults;
  });

  const total = (product.price * quantity).toFixed(2);

  return (
    <div className="w-full max-w-sm animate-scale-in">
      {/* Glassmorphic outer shell */}
      <div className="relative backdrop-blur-2xl bg-black/75 border border-white/[0.1] rounded-xl overflow-hidden shadow-[0_16px_60px_rgba(0,0,0,0.5)]">
        {/* Gradient sheen overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent pointer-events-none rounded-xl" />

        {/* Top accent strip */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-500/50 via-fuchsia-500/40 to-transparent" />

        <div className="relative z-10 p-3">
          {/* Header */}
          <div className="flex items-start gap-2.5 mb-2.5">
            {/* Product icon */}
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 border border-white/[0.1] flex items-center justify-center text-2xl shrink-0">
              {product.emoji || "🛍️"}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-white leading-tight line-clamp-2">{product.name}</h4>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className="text-[10px] font-medium px-1 py-0.5 rounded-sm bg-violet-500/15 text-violet-300 border border-violet-500/20">
                  {product.category}
                </span>
                {product.stock > 0 ? (
                  <span className="text-[10px] text-emerald-400/70 flex items-center gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> In Stock
                  </span>
                ) : (
                  <span className="text-[10px] text-red-400/70">Out of Stock</span>
                )}
              </div>
            </div>

            <button onClick={onClose} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Price + Rating */}
          <div className="flex items-end justify-between mb-2.5">
            <div>
              <p className="text-2xl font-black text-white font-mono">${product.price.toFixed(2)}</p>
              {product.unit && <p className="text-[10px] text-white/70 -mt-0.5">per {product.unit}</p>}
            </div>
            <div className="flex items-center gap-1 text-amber-400/80">
              <Star className="w-2.5.5 h-2.5.5 fill-amber-400/80" />
              <span className="text-xs font-mono font-bold">{product.rating.toFixed(1)}</span>
            </div>
          </div>

          {/* Short description */}
          <p className="text-[11px] text-white/75 leading-relaxed mb-2.5 line-clamp-2">
            {product.description}
          </p>

          {/* Seller info */}
          <div className="flex items-center gap-1.5 bg-black/70 border border-white/[0.06] rounded-lg px-2.5 py-1.5 mb-2.5">
            <Package className="w-2.5.5 h-2.5.5 text-violet-400/60 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-white/85 truncate">{product.seller}</p>
              {product.sellerAddress && (
                <p className="text-[9px] text-white/25 truncate">{product.sellerAddress}</p>
              )}
            </div>
            <span className="text-[9px] font-mono text-white/15 shrink-0">
              {product.sellerLat.toFixed(2)}, {product.sellerLng.toFixed(2)}
            </span>
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-white/70 hover:text-white/85 transition-colors"
          >
            {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            {expanded ? "Show less" : "Options, 3D & Purchase"}
          </button>

          {/* Expanded section */}
          {expanded && (
            <div className="mt-1.5 space-y-2.5 animate-in slide-in-from-top-2 duration-200">
              {/* 3D Model placeholder */}
              {product.modelUrl && (
                <div className="bg-black/65 border border-white/[0.06] rounded-lg p-2.5 flex items-center gap-2.5">
                  <Box className="w-4 h-4 text-violet-400/60" />
                  <div>
                    <p className="text-[10px] text-white/80 font-semibold">3D Model Available</p>
                    <p className="text-[9px] text-white/25">Interactive preview coming soon</p>
                  </div>
                </div>
              )}

              {/* Options */}
              {product.options && product.options.length > 0 && (
                <div className="space-y-1.5">
                  {product.options.map(opt => (
                    <div key={opt.label}>
                      <p className="text-[9px] font-mono text-white/70 uppercase tracking-wider mb-1">{opt.label}</p>
                      <div className="flex flex-wrap gap-1">
                        {opt.values.map(v => (
                          <button
                            key={v}
                            onClick={() => setSelectedOptions(prev => ({ ...prev, [opt.label]: v }))}
                            className={`px-1.5.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                              selectedOptions[opt.label] === v
                                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                                : "bg-black/70 text-white/75 border border-white/[0.06] hover:bg-black/80"
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quantity */}
              <div>
                <p className="text-[9px] font-mono text-white/70 uppercase tracking-wider mb-1">Quantity</p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-7 h-7 rounded-md bg-black/70 border border-white/[0.06] flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors"
                  >
                    <Minus className="w-2.5.5 h-2.5.5" />
                  </button>
                  <span className="text-sm font-mono font-bold text-white w-7 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    className="w-7 h-7 rounded-md bg-black/70 border border-white/[0.06] flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors"
                  >
                    <Plus className="w-2.5.5 h-2.5.5" />
                  </button>
                  <span className="text-[10px] text-white/85 ml-auto">{product.stock} available</span>
                </div>
              </div>

              {/* Total */}
              <div className="flex items-end justify-between bg-black/65 border border-white/[0.06] rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] text-white/70 uppercase tracking-wider">Total</span>
                <span className="text-lg font-black font-mono text-white">${total}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-1 mt-2.5">
            <button
              onClick={() => onBuy?.(product, quantity, selectedOptions)}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 transition-all truncate px-1.5"
            >
              <ShoppingBag className="w-2.5.5 h-2.5.5 shrink-0" /> Buy Now
            </button>
            {onDirections && (
              <button
                onClick={() => onDirections(product)}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25 transition-all truncate px-1.5"
              >
                <Route className="w-2.5.5 h-2.5.5 shrink-0" /> Directions
              </button>
            )}
            {onDelivery && (
              <button
                onClick={() => onDelivery(product)}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all truncate px-1.5"
              >
                <Truck className="w-2.5.5 h-2.5.5 shrink-0" /> Deliver
              </button>
            )}
            <button
              onClick={() => {
                const viewer = (window as any).__cesiumViewer;
                if (viewer && !viewer.isDestroyed()) {
                  const { Cartesian3, Math: CesiumMath } = (window as any).Cesium || {};
                  if (Cartesian3) {
                    viewer.camera.flyTo({
                      destination: Cartesian3.fromDegrees(product.sellerLng, product.sellerLat, 500),
                      orientation: { heading: CesiumMath?.toRadians?.(0) ?? 0, pitch: CesiumMath?.toRadians?.(-50) ?? -0.87, roll: 0 },
                      duration: 1.5,
                    });
                  }
                }
              }}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold bg-black/75 text-white/80 border border-white/[0.08] hover:bg-white/[0.1] transition-all truncate px-1.5"
            >
              <Navigation className="w-2.5.5 h-2.5.5 shrink-0" /> Fly To
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
