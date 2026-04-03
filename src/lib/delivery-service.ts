import { supabase } from "@/integrations/supabase/client";

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

export interface UserLocation {
  lat: number;
  lng: number;
}

export function getUserLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export interface StoreLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
}

// Mock store locations for demo
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

export function getNearbyStores(userLoc: UserLocation, maxDistKm: number = 30): (StoreLocation & { distance: number; zone: DeliveryZone })[] {
  return mockStoreLocations
    .map(store => ({
      ...store,
      distance: getStoreDistance(userLoc, store),
      zone: getDeliveryZone(getStoreDistance(userLoc, store)),
    }))
    .filter(s => s.distance <= maxDistKm)
    .sort((a, b) => a.distance - b.distance);
}

// Uber Direct API calls via edge function
export async function getDeliveryQuote(pickupAddress: string, dropoffAddress: string) {
  const { data, error } = await supabase.functions.invoke("uber-direct", {
    body: { pickup_address: pickupAddress, dropoff_address: dropoffAddress },
    method: "POST",
  });
  // The edge function routing needs path, so we use headers or body
  // Actually we need to call with the path appended
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  const res = await fetch(`${supabaseUrl}/functions/v1/uber-direct/quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ pickup_address: pickupAddress, dropoff_address: dropoffAddress }),
  });
  
  return res.json();
}

export async function createDelivery(quoteId: string, pickup: any, dropoff: any, manifest: any) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  const res = await fetch(`${supabaseUrl}/functions/v1/uber-direct/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ quote_id: quoteId, pickup, dropoff, manifest }),
  });
  
  return res.json();
}

export async function getDeliveryStatus(deliveryId: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  const res = await fetch(`${supabaseUrl}/functions/v1/uber-direct/status?id=${deliveryId}`, {
    method: "GET",
    headers: {
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
    },
  });
  
  return res.json();
}

export async function cancelDelivery(deliveryId: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  const res = await fetch(`${supabaseUrl}/functions/v1/uber-direct/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ delivery_id: deliveryId }),
  });
  
  return res.json();
}
