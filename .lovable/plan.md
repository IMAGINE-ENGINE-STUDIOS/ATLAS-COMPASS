

## Uber Direct API Integration for Global Deliveries

### Overview
Integrate the Uber Direct API to enable on-demand delivery for marketplace products. The system will use geofencing to show products to local consumers and provide delivery options based on proximity, Uber driver availability, and service range.

### Architecture

```text
┌─────────────────────────────────────────────────┐
│  Frontend (MarketplacePage / DeliveryPage)       │
│  - Geolocation detection                        │
│  - Product proximity filtering                  │
│  - Delivery quote UI                            │
│  - Order tracking widget                        │
└──────────────┬──────────────────────────────────┘
               │ supabase.functions.invoke()
┌──────────────▼──────────────────────────────────┐
│  Edge Function: uber-direct                     │
│  - OAuth2 client_credentials → Bearer token     │
│  - POST /v1/customers/{id}/delivery_quotes      │
│  - POST /v1/customers/{id}/deliveries           │
│  - GET  /v1/customers/{id}/deliveries/{id}      │
│  - Webhook handler for status updates           │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Uber Direct API (api.uber.com)                 │
└─────────────────────────────────────────────────┘
```

### Prerequisites
- **Uber Direct Developer Account** at direct.uber.com with API credentials (Client ID, Client Secret, Customer ID)
- **Lovable Cloud** enabled for edge functions
- **3 secrets**: `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`, `UBER_CUSTOMER_ID`

### Implementation Steps

#### 1. Create Edge Function: `supabase/functions/uber-direct/index.ts`
Handles all Uber Direct API communication server-side:
- **OAuth2 token management**: `POST https://login.uber.com/oauth/v2/token` with `client_credentials` grant, scope `eats.deliveries`
- **Endpoints exposed**:
  - `POST /quote` — Get delivery quote (fee, ETA, deliverability) between pickup/dropoff addresses
  - `POST /create` — Create a delivery order with quote_id, manifest items, contacts
  - `GET /status/:id` — Get delivery status and driver location
  - `POST /cancel/:id` — Cancel a delivery
- Input validation with Zod for all request bodies
- CORS headers on all responses

#### 2. Create Geofencing & Proximity Service: `src/lib/delivery-service.ts`
- **Browser geolocation** to detect consumer's current position
- **Haversine distance calculation** to filter products/stores within configurable radius (default 15km)
- **Service area check**: Call Uber quote endpoint to verify deliverability before showing delivery option
- **Delivery zone types**: Immediate (< 5km), Standard (5-15km), Extended (15-30km) with estimated cost tiers

#### 3. Create Delivery UI Components: `src/components/delivery/`
- **DeliveryBanner.tsx** — Shows "Delivery available" badge on eligible products with estimated time/cost
- **DeliveryQuoteCard.tsx** — Detailed quote display: fee breakdown, ETA, pickup/dropoff addresses, driver availability indicator
- **DeliveryTracker.tsx** — Real-time order tracking: status timeline (pending → pickup → en_route → delivered), driver location on map, ETA countdown
- **DeliveryCheckout.tsx** — Delivery address form, quote confirmation, place order flow

#### 4. Update Marketplace Page: `src/pages/MarketplacePage.tsx`
- Add geolocation prompt on page load to detect user position
- Add "Nearby" filter tab that uses proximity to sort/filter products
- Add delivery availability badge on each product card
- Add delivery option in product detail modal with inline quote fetching
- Show "Uber delivers in ~XX min" when hovering delivery-eligible products

#### 5. Create Delivery Management Page: `src/pages/DeliveryPage.tsx`
- Dashboard for merchants to manage active deliveries
- List of pending, in-transit, and completed deliveries
- Real-time status updates via polling (every 30s)
- Add route to `/dashboard/deliveries` in App.tsx and nav in AppShell.tsx

### Geofencing Logic
- Products tagged with a store location (lat/lng)
- Consumer location obtained via `navigator.geolocation`
- Distance calculated client-side using Haversine formula
- Uber quote API called to confirm actual deliverability and get real pricing
- Products outside Uber's service range show "Pickup Only" or "Shipping" instead

### Data Flow for a Delivery
1. Consumer browses marketplace → geolocation detected
2. Products filtered by proximity → delivery badge shown on eligible items
3. Consumer clicks "Get Delivery Quote" → edge function calls Uber `/delivery_quotes`
4. Quote returned with fee + ETA → consumer confirms
5. "Order with Delivery" → edge function calls Uber `/deliveries`
6. Tracking URL returned → DeliveryTracker shows real-time status
7. Status polled every 30s until delivered

### Technical Notes
- Uber Direct sandbox mode available for testing (no real drivers dispatched)
- OAuth tokens cached in-memory with TTL (token expires in ~30 min)
- All API keys stored as Lovable secrets, never exposed to client
- Uber Direct API requires written approval from Uber for production access

