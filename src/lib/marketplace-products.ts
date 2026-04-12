export interface MarketplaceProduct {
  id: string;
  name: string;
  description: string;
  images: string[];
  modelUrl?: string;
  price: number;
  currency: string;
  unit?: string;
  options?: { label: string; values: string[] }[];
  seller: string;
  sellerLat: number;
  sellerLng: number;
  sellerAddress?: string;
  category: string;
  stock: number;
  rating: number;
  emoji?: string;
}

// Curated global product listings with real coordinates
export const MARKETPLACE_PRODUCTS: MarketplaceProduct[] = [
  {
    id: "mp-001", name: "Artisan Coffee Beans", description: "Single-origin Ethiopian Yirgacheffe, light roast with floral and citrus notes.",
    images: ["☕"], price: 24.99, currency: "USD", unit: "500g bag",
    options: [{ label: "Roast", values: ["Light", "Medium", "Dark"] }],
    seller: "Brooklyn Roasters", sellerLat: 40.6892, sellerLng: -73.9857, sellerAddress: "123 Atlantic Ave, Brooklyn, NY",
    category: "Food & Beverage", stock: 150, rating: 4.8, emoji: "☕"
  },
  {
    id: "mp-002", name: "Handmade Leather Wallet", description: "Full-grain Italian leather bifold wallet, hand-stitched with waxed thread.",
    images: ["👛"], price: 89.00, currency: "USD",
    options: [{ label: "Color", values: ["Tan", "Brown", "Black"] }],
    seller: "Firenze Leather Co", sellerLat: 43.7696, sellerLng: 11.2558, sellerAddress: "Via de' Tornabuoni, Florence, Italy",
    category: "Accessories", stock: 35, rating: 4.9, emoji: "👛"
  },
  {
    id: "mp-003", name: "Mechanical Keyboard Kit", description: "65% hot-swap PCB, aluminum case, Cherry MX compatible. Build your dream board.",
    images: ["⌨️"], price: 159.00, currency: "USD",
    options: [{ label: "Layout", values: ["ANSI", "ISO"] }, { label: "Color", values: ["Silver", "Space Gray", "Navy"] }],
    seller: "Akihabara Keys", sellerLat: 35.7023, sellerLng: 139.7745, sellerAddress: "1-12 Sotokanda, Chiyoda, Tokyo",
    category: "Electronics", stock: 42, rating: 4.7, emoji: "⌨️"
  },
  {
    id: "mp-004", name: "Organic Matcha Powder", description: "Ceremonial-grade stone-ground matcha from Uji, Kyoto. Smooth and umami-rich.",
    images: ["🍵"], price: 34.50, currency: "USD", unit: "100g tin",
    seller: "Uji Matcha House", sellerLat: 34.8843, sellerLng: 135.7979, sellerAddress: "Uji, Kyoto Prefecture, Japan",
    category: "Food & Beverage", stock: 200, rating: 4.9, emoji: "🍵"
  },
  {
    id: "mp-005", name: "Smart Plant Sensor", description: "Wi-Fi soil moisture, light, and temperature sensor. Works with any plant.",
    images: ["🌱"], price: 29.99, currency: "USD",
    options: [{ label: "Color", values: ["Green", "White"] }],
    seller: "Shenzhen IoT Labs", sellerLat: 22.5431, sellerLng: 114.0579, sellerAddress: "Nanshan District, Shenzhen, China",
    category: "Electronics", stock: 500, rating: 4.3, emoji: "🌱"
  },
  {
    id: "mp-006", name: "Vintage Map Print", description: "Museum-quality giclée print of the 1886 Rand McNally world map on archival paper.",
    images: ["🗺️"], price: 45.00, currency: "USD",
    options: [{ label: "Size", values: ["18×24″", "24×36″", "36×48″"] }],
    seller: "Camden Print Studio", sellerLat: 51.5391, sellerLng: -0.1427, sellerAddress: "Camden High St, London, UK",
    category: "Art & Decor", stock: 80, rating: 4.6, emoji: "🗺️"
  },
  {
    id: "mp-007", name: "Handwoven Basket", description: "Traditional Zulu Ilala palm basket. Each piece is unique and takes days to weave.",
    images: ["🧺"], price: 65.00, currency: "USD",
    options: [{ label: "Size", values: ["Small", "Medium", "Large"] }],
    seller: "Durban Craft Market", sellerLat: -29.8587, sellerLng: 31.0218, sellerAddress: "Victoria St Market, Durban, South Africa",
    category: "Home & Craft", stock: 20, rating: 4.8, emoji: "🧺"
  },
  {
    id: "mp-008", name: "Cold-Pressed Olive Oil", description: "Extra virgin olive oil from century-old groves in Andalusia. Peppery finish.",
    images: ["🫒"], price: 18.99, currency: "USD", unit: "750ml bottle",
    seller: "Hacienda del Olivo", sellerLat: 37.3891, sellerLng: -5.9845, sellerAddress: "Calle Sierpes, Seville, Spain",
    category: "Food & Beverage", stock: 120, rating: 4.7, emoji: "🫒"
  },
  {
    id: "mp-009", name: "Bluetooth Speaker (Bamboo)", description: "Sustainable bamboo shell, 12h battery, IPX5 waterproof. Rich warm sound.",
    images: ["🔊"], price: 49.99, currency: "USD",
    seller: "EcoSound Berlin", sellerLat: 52.5200, sellerLng: 13.4050, sellerAddress: "Friedrichstraße, Berlin, Germany",
    category: "Electronics", stock: 75, rating: 4.5, emoji: "🔊"
  },
  {
    id: "mp-010", name: "Alpaca Wool Scarf", description: "Baby alpaca wool scarf, naturally dyed with cochineal and indigo. Incredibly soft.",
    images: ["🧣"], price: 55.00, currency: "USD",
    options: [{ label: "Color", values: ["Crimson", "Indigo", "Natural"] }],
    seller: "Cusco Textiles", sellerLat: -13.5320, sellerLng: -71.9675, sellerAddress: "Plaza de Armas, Cusco, Peru",
    category: "Accessories", stock: 30, rating: 4.9, emoji: "🧣"
  },
  {
    id: "mp-011", name: "Drone Mini Pro", description: "4K camera, 30 min flight, GPS return-home. Foldable design fits in your pocket.",
    images: ["🛸"], price: 299.00, currency: "USD",
    options: [{ label: "Bundle", values: ["Standard", "Fly More Kit"] }],
    seller: "DJI Flagship Singapore", sellerLat: 1.2838, sellerLng: 103.8591, sellerAddress: "Marina Bay Sands, Singapore",
    category: "Electronics", stock: 60, rating: 4.6, emoji: "🛸"
  },
  {
    id: "mp-012", name: "Moroccan Argan Oil", description: "100% pure cold-pressed argan oil for hair and skin. From cooperatives in Essaouira.",
    images: ["✨"], price: 22.00, currency: "USD", unit: "100ml bottle",
    seller: "Essaouira Co-op", sellerLat: 31.5085, sellerLng: -9.7595, sellerAddress: "Medina, Essaouira, Morocco",
    category: "Beauty", stock: 200, rating: 4.8, emoji: "✨"
  },
];

export function fetchMarketplaceProducts(): MarketplaceProduct[] {
  return MARKETPLACE_PRODUCTS;
}
