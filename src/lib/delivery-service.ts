// ── Delivery Service: Full Uber Direct API client ──

// Haversine distance in km
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type DeliveryZone = "immediate" | "standard" | "extended" | "out_of_range";

export function getDeliveryZone(distanceKm: number): DeliveryZone {
  if (distanceKm < 5) return "immediate";
  if (distanceKm < 15) return "standard";
  if (distanceKm < 30) return "extended";
  return "out_of_range";
}

export const zoneInfo: Record<DeliveryZone, { label: string; eta: string; costTier: string; color: string }> = {
  immediate: { label: "Express", eta: "15-25 min", costTier: "$3-8", color: "hsl(var(--success))" },
  standard: { label: "Standard", eta: "25-45 min", costTier: "$8-15", color: "hsl(var(--primary))" },
  extended: { label: "Extended", eta: "45-90 min", costTier: "$15-30", color: "hsl(var(--warning))" },
  out_of_range: { label: "Out of Range", eta: "N/A", costTier: "N/A", color: "hsl(var(--destructive))" },
};

export interface UserLocation { lat: number; lng: number; }

export function getUserLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export interface StoreLocation {
  id: string; name: string; lat: number; lng: number; address: string;
}

export const mockStoreLocations: StoreLocation[] = [
  { id: "store-1", name: "Aramco Industries", lat: 25.2854, lng: 51.5310, address: "Doha Industrial Area, Qatar" },
  { id: "store-2", name: "CATL Manufacturing", lat: 26.0789, lng: 119.2965, address: "Fuzhou, Fujian, China" },
  { id: "store-3", name: "AgriGlobal Co.", lat: 41.8781, lng: -87.6298, address: "Chicago, IL, USA" },
  { id: "store-4", name: "ArcelorMittal", lat: 49.4987, lng: 5.9490, address: "Luxembourg City, Luxembourg" },
  { id: "store-5", name: "LONGi Green", lat: 34.3416, lng: 108.9398, address: "Xi'an, Shaanxi, China" },
  { id: "store-6", name: "TSMC Global", lat: 24.7736, lng: 121.0177, address: "Hsinchu, Taiwan" },
  { id: "store-7", name: "Azure Partners", lat: 47.6062, lng: -122.3321, address: "Seattle, WA, USA" },
  { id: "store-8", name: "Albemarle Corp", lat: 35.2271, lng: -80.8431, address: "Charlotte, NC, USA" },
];

export function getStoreDistance(userLoc: UserLocation, store: StoreLocation): number {
  return haversineDistance(userLoc.lat, userLoc.lng, store.lat, store.lng);
}

export function getNearbyStores(userLoc: UserLocation, maxDistKm = 30) {
  return mockStoreLocations
    .map(store => ({
      ...store,
      distance: getStoreDistance(userLoc, store),
      zone: getDeliveryZone(getStoreDistance(userLoc, store)),
    }))
    .filter(s => s.distance <= maxDistKm)
    .sort((a, b) => a.distance - b.distance);
}

// ── API helpers ──
function apiUrl(path: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uber-direct${path}`;
}

function apiHeaders() {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(apiUrl(path), { method: "POST", headers: apiHeaders(), body: JSON.stringify(body) });
  return res.json();
}

async function apiGet(path: string) {
  const res = await fetch(apiUrl(path), { method: "GET", headers: apiHeaders() });
  return res.json();
}

// ── Uber Direct API Methods ──

/** Get delivery quote */
export async function getDeliveryQuote(pickupAddress: string, dropoffAddress: string, coords?: {
  pickup_latitude?: number; pickup_longitude?: number;
  dropoff_latitude?: number; dropoff_longitude?: number;
}) {
  return apiPost("/quote", { pickup_address: pickupAddress, dropoff_address: dropoffAddress, ...coords });
}

/** Create a delivery from a quote */
export async function createDelivery(quoteId: string, pickup: any, dropoff: any, manifest: any, options?: {
  tip?: number; requires_dropoff_signature?: boolean; requires_id_verification?: boolean;
  pickup_notes?: string; dropoff_notes?: string; external_id?: string;
  pickup_ready_dt?: string; pickup_deadline_dt?: string;
  dropoff_ready_dt?: string; dropoff_deadline_dt?: string;
  undeliverable_action?: string; manifest_items?: any[];
}) {
  return apiPost("/create", { quote_id: quoteId, pickup, dropoff, manifest, ...options });
}

/** Get delivery status */
export async function getDeliveryStatus(deliveryId: string) {
  return apiGet(`/status?id=${deliveryId}`);
}

/** List all deliveries */
export async function listDeliveries(filter?: string, limit = 50, offset = 0) {
  let path = `/list?limit=${limit}&offset=${offset}`;
  if (filter) path += `&filter=${encodeURIComponent(filter)}`;
  return apiGet(path);
}

/** Cancel a delivery */
export async function cancelDelivery(deliveryId: string) {
  return apiPost("/cancel", { delivery_id: deliveryId });
}

/** Update tip for a delivery */
export async function updateTip(deliveryId: string, tipAmount: number) {
  return apiPost("/tip", { delivery_id: deliveryId, tip_amount: tipAmount });
}

/** Get proof of delivery */
export async function getProofOfDelivery(deliveryId: string) {
  return apiGet(`/pod?id=${deliveryId}`);
}

/** Update a delivery in progress */
export async function updateDelivery(deliveryId: string, updates: {
  dropoff_notes?: string; pickup_notes?: string; manifest_items?: any[];
  requires_dropoff_signature?: boolean; tip_by_customer?: number;
}) {
  return apiPost("/update", { delivery_id: deliveryId, ...updates });
}

/** Get batch quotes */
export async function getBatchQuotes(requests: { pickup_address: string; dropoff_address: string }[]) {
  return apiPost("/batch-quote", { requests });
}

/** Quick fee estimate */
export async function getDeliveryEstimate(pickupAddress: string, dropoffAddress: string) {
  return apiPost("/estimate", { pickup_address: pickupAddress, dropoff_address: dropoffAddress });
}
