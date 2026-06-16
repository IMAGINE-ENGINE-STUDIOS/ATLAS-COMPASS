export interface TrafficCamera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  imageUrl: string;
  source: string;
  lastUpdated?: string;
  streamUrl?: string;
  refreshRate?: number;
  feedVerified?: boolean;
  feedDead?: boolean;
}
