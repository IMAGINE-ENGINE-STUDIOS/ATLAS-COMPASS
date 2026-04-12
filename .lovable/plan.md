

# Atlas Marketplace Pins + Product Commerce Pipeline

## Overview
Add marketplace product pins to the Atlas 3D globe with glassmorphic product cards (inspired by the uploaded reference image), expandable detail views with 3D model viewer, photo gallery, purchase pipeline via Stripe, Uber Direct delivery integration, and directions/routing.

## Architecture

```text
Atlas Globe (SpaceshipPage.tsx)
  ├── Business POI pins (existing)
  ├── NEW: Marketplace product pins (ShoppingBag icon, distinct color)
  │     └── Click → MarketplaceProductCard (glassmorphic overlay)
  │           ├── Collapsed: image, price, short description
  │           └── Expanded:
  │               ├── 3D Model viewer (if available)
  │               ├── Photo gallery carousel
  │               ├── Price, options, quantity selector
  │               ├── "Buy Now" → Stripe checkout
  │               ├── "Deliver" → AtlasDeliveryPanel (prefilled)
  │               └── "Directions" → route polyline on globe
  └── Toolbar: new Marketplace toggle button
```

## Steps

### 1. Create `src/components/atlas/MarketplaceProductCard.tsx`
- Glassmorphic card matching the uploaded reference style: `backdrop-blur-2xl`, `bg-white/[0.06]`, `border border-white/[0.1]`, rounded-2xl, subtle gradient overlays
- **Collapsed state**: product image/emoji, name, price, short description, distance
- **Expanded state** (click to expand):
  - Photo gallery with horizontal scroll/carousel
  - 3D model viewer embed (using `<model-viewer>` web component or Three.js inline) when a `modelUrl` is available
  - Options selector (size, color, variant as tags)
  - Quantity stepper
  - "Buy Now" button → triggers Stripe checkout
  - "Deliver Here" button → opens AtlasDeliveryPanel with seller address prefilled
  - "Directions" button → draws route from camera to product location
- Seller info, rating, stock status

### 2. Create `src/lib/marketplace-products.ts`
- Define `MarketplaceProduct` interface: `id, name, description, images[], modelUrl?, price, currency, unit, options[], seller, sellerLat, sellerLng, category, stock, rating`
- Function `fetchMarketplaceProducts(bbox)` — initially returns curated real-world product data from the existing marketplace products array, mapped with real coordinates
- Export product data with real store coordinates (reuse existing marketplace data + extend)

### 3. Enable Stripe integration
- Use `stripe--enable_stripe` tool to set up Stripe
- Create edge function `stripe-checkout` that creates a Checkout Session for a given product
- Wire "Buy Now" in the card to call the edge function and redirect to Stripe

### 4. Update `SpaceshipPage.tsx` — Add marketplace pin layer
- New toolbar toggle button (ShoppingBag icon) to show/hide marketplace pins
- When enabled, place billboard entities for each marketplace product (distinct purple/violet pin color, ShoppingBag icon)
- On click, show `MarketplaceProductCard` overlay positioned near the pin
- Wire delivery button → open `AtlasDeliveryPanel` with seller address prefilled
- Wire directions button → `fetchRoute()` from camera position to product location, draw polyline
- Wire buy button → Stripe checkout edge function

### 5. Update `AtlasDeliveryPanel.tsx`
- Accept optional `productInfo` prop (name, weight, dimensions) to pre-populate item details in the delivery wizard step

### 6. Database table for products (optional, for persistence)
- Create `marketplace_products` table for real product listings
- For MVP, use client-side data; migrate to DB later

## Technical Details

- **Glassmorphic styling**: Match reference image — outer container with `bg-white/[0.06] backdrop-blur-2xl border border-white/[0.1]`, inner sections with `bg-white/[0.04]` cards, subtle `bg-gradient-to-br from-white/[0.08] to-transparent` overlays
- **3D model viewer**: Use `@google/model-viewer` web component (`<model-viewer>` tag) for inline GLB/glTF preview — lightweight, no extra Cesium entity needed
- **Stripe flow**: Edge function creates checkout session → redirect to Stripe hosted page → return to Atlas on success
- **Pin differentiation**: Business pins = emerald, Marketplace pins = violet/purple with ShoppingBag SVG billboard
- **Route visualization**: Reuse existing OSRM `fetchRoute` logic already in SpaceshipPage

