import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CameraResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
  imageUrl: string;
  source: string;
  streamUrl?: string;
  refreshRate?: number;
  region?: string;
  country?: string;
}

function validStreamUrl(url?: string): string | undefined {
  if (!url) return undefined;
  // Only mark as stream if URL clearly points to a streaming format
  // Do NOT match generic "video" keyword — too many false positives (e.g. FL511 GetVideo returns single frames)
  if (/\.(mjpg|mjpeg|m3u8|mp4)(\?|$)/i.test(url)) return url;
  if (/mjpeg|mjpg|\.stream|hls|playlist\.m3u/i.test(url)) return url;
  // Additional DOT video patterns
  if (/\/video\//i.test(url) && /\.(m3u8|ts|mp4)/i.test(url)) return url;
  if (/\/stream\//i.test(url)) return url;
  if (/LiveStreamUrl|\.flv(\?|$)/i.test(url)) return url;
  return undefined;
}

function toNumber(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function webMercatorToWgs84(x: number, y: number): { lat: number; lng: number } {
  const lng = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return { lat, lng };
}

function normalizeCoordinates(rawLat: any, rawLng: any, fallbackY?: any, fallbackX?: any): { lat: number; lng: number } | null {
  const latCandidate = toNumber(rawLat ?? fallbackY);
  const lngCandidate = toNumber(rawLng ?? fallbackX);
  if (latCandidate == null || lngCandidate == null) return null;
  if (Math.abs(latCandidate) <= 90 && Math.abs(lngCandidate) <= 180) {
    return { lat: latCandidate, lng: lngCandidate };
  }
  const converted = webMercatorToWgs84(lngCandidate, latCandidate);
  if (!Number.isFinite(converted.lat) || !Number.isFinite(converted.lng) || Math.abs(converted.lat) > 90 || Math.abs(converted.lng) > 180) {
    return null;
  }
  return converted;
}

function stableCameraId(prefix: string, explicitId: any, lat: number, lng: number, name: string): string {
  if (explicitId != null && String(explicitId).trim() !== '') {
    return `${prefix}-${String(explicitId).trim()}`;
  }
  const slug = (name || 'camera').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${prefix}-${Math.round(lat * 1e5)}-${Math.round(lng * 1e5)}-${slug || 'camera'}`;
}

function getState511Key(stateCode: string): string {
  return (
    Deno.env.get(`${stateCode}_511_API_KEY`) ||
    Deno.env.get(`${stateCode}511_API_KEY`) ||
    Deno.env.get('API_511_KEY') ||
    Deno.env.get('NATIONAL_511_API_KEY') ||
    'public'
  );
}

// ====== GENERIC 511 v2 FETCHER ======
async function fetch511Cameras(stateCode: string, baseUrl: string, refreshRate = 10): Promise<CameraResult[]> {
  const apiKey = getState511Key(stateCode);
  const urls = [
    `${baseUrl}/api/v2/get/cameras?key=${encodeURIComponent(apiKey)}&format=json`,
    `${baseUrl}/api/getcameras?key=${encodeURIComponent(apiKey)}&format=json`,
    `${baseUrl}/api/getcameras?format=json`,
    `${baseUrl}/api/v2/cameras?key=${encodeURIComponent(apiKey)}&format=json`,
    `${baseUrl}/List/GetData/Cameras?format=json`,
    `${baseUrl}/api/cameras?format=json`,
  ];
  let data: any = null;
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) { await resp.text().catch(() => {}); continue; }
      const text = await resp.text();
      data = JSON.parse(text);
      if (Array.isArray(data) && data.length > 0) break;
      if (data?.CamerasList) { data = data.CamerasList; break; }
      data = null;
    } catch { continue; }
  }
  if (!data || !Array.isArray(data)) return [];
  return data
    .map((c: any) => {
      const coords = normalizeCoordinates(c.Latitude || c.latitude, c.Longitude || c.longitude);
      if (!coords) return null;
      let imgUrl = '';
      let videoUrl = '';
      if (Array.isArray(c.Views) && c.Views.length > 0) {
        const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
        imgUrl = view.Url || view.url || '';
        videoUrl = view.VideoUrl || view.videoUrl || view.StreamUrl || view.streamUrl || '';
      }
      if (!imgUrl) imgUrl = c.Url || c.url || '';
      if (!videoUrl) videoUrl = c.VideoUrl || c.videoUrl || c.StreamUrl || c.streamUrl || c.HlsUrl || c.hlsUrl || '';
      if (!imgUrl && videoUrl) imgUrl = videoUrl;
      const name = c.Name || c.name || c.Location || c.location || c.RoadwayName || c.Roadway || c.Description || `${stateCode} Camera`;
      const streamEndpoint = videoUrl || c.liveStreamUrl || c.LiveStreamUrl || '';
      const camId = stableCameraId(stateCode.toLowerCase(), c.Id || c.ID || c.id, coords.lat, coords.lng, name);
      return {
        id: camId, name,
        lat: coords.lat, lng: coords.lng,
        imageUrl: imgUrl, source: `511${stateCode}`, refreshRate,
        streamUrl: validStreamUrl(streamEndpoint) || validStreamUrl(videoUrl),
        region: stateCode, country: 'US',
      } as CameraResult;
    })
    .filter((c): c is CameraResult => !!c && !!c.imageUrl);
}

// ====== GENERIC ArcGIS FeatureServer FETCHER ======
async function fetchArcGISCameras(
  stateCode: string, featureServerUrl: string,
  fieldMapping: { lat?: string; lng?: string; name?: string; imageUrl?: string; id?: string; streamUrl?: string },
  source: string, refreshRate = 10, country = 'US'
): Promise<CameraResult[]> {
  try {
    const allFeatures: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 2000;
    let hasMore = true;
    while (hasMore) {
      const url = `${featureServerUrl}/query?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=${PAGE_SIZE}&resultOffset=${offset}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!resp.ok) break;
      const data = await resp.json();
      const features = data?.features || [];
      if (!Array.isArray(features) || features.length === 0) break;
      allFeatures.push(...features);
      hasMore = data.exceededTransferLimit === true;
      offset += PAGE_SIZE;
      if (offset > 50000) break;
    }
    return allFeatures
      .map((f: any) => {
        const a = f.attributes || {};
        const coords = normalizeCoordinates(
          a[fieldMapping.lat || 'latitude'] || a.LATITUDE || a.Latitude || a.latitude || a.LAT,
          a[fieldMapping.lng || 'longitude'] || a.LONGITUDE || a.Longitude || a.longitude || a.LON || a.LONG,
          f.geometry?.y, f.geometry?.x
        );
        if (!coords) return null;
        const name = a[fieldMapping.name || 'Name'] || a.Name || a.NAME || a.name || a.DESCRIPT || a.Description || a.locationName || a.Location || a.LOCATION || `${stateCode} Camera`;
        const imgUrl = a[fieldMapping.imageUrl || 'imageUrl'] || a.ImageURL || a.imageUrl || a.IMAGE_URL || a.IMAGE || a.Image || a.Url || a.url || a.URL || a.currentImageURL || '';
        const streamField = fieldMapping.streamUrl ? a[fieldMapping.streamUrl] : (a.streamingVideoURL || a.StreamingVideoURL || a.VideoUrl || a.videoUrl || a.HlsUrl || '');
        const rawId = a[fieldMapping.id || 'OBJECTID'] || a.OBJECTID || a.OBJECTID_1 || a.Id || a.ID || a.id;
        const camId = stableCameraId(stateCode.toLowerCase(), rawId, coords.lat, coords.lng, name);
        return {
          id: camId, name,
          lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source, refreshRate,
          streamUrl: validStreamUrl(streamField),
          region: stateCode, country,
        } as CameraResult;
      })
      .filter((c): c is CameraResult => !!c && !!c.imageUrl);
  } catch { return []; }
}

// ====== CALIFORNIA ======
async function fetchCaltransCameras(): Promise<CameraResult[]> {
  try {
    const allFeatures: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const url = `https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0/query?where=1%3D1&outFields=currentImageURL,streamingVideoURL,locationName,latitude,longitude,district,inService&f=json&resultRecordCount=2000&resultOffset=${offset}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!resp.ok) break;
      const data = await resp.json();
      const features = data?.features || [];
      if (features.length === 0) break;
      allFeatures.push(...features);
      hasMore = data.exceededTransferLimit === true;
      offset += 2000;
      if (offset > 20000) break;
    }
    return allFeatures
      .filter((f: any) => {
        const a = f.attributes || {};
        return (a.latitude || f.geometry?.y) && (a.longitude || f.geometry?.x) && a.inService !== 'FALSE';
      })
      .map((f: any) => {
        const a = f.attributes;
        const name = a.locationName || `CA D${a.district} Camera`;
        const lat = a.latitude || f.geometry?.y;
        const lng = a.longitude || f.geometry?.x;
        return {
          id: stableCameraId('ca', a.OBJECTID || a.ObjectId || a.id, lat, lng, name),
          name, imageUrl: a.currentImageURL || '', source: `Caltrans D${a.district || '?'}`,
          refreshRate: 5, streamUrl: validStreamUrl(a.streamingVideoURL || ''),
          region: 'CA', country: 'US',
        };
      })
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== FLORIDA — ArcGIS (snapshot-first, no forced streams, OBJECTID_1 unique key) ======
async function fetchFLDOT(): Promise<CameraResult[]> {
  try {
    const allFeatures: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const url = `https://services.arcgis.com/3wFbqsFPLeKqOlIK/arcgis/rest/services/FL511_Traffic_Cameras/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=2000&resultOffset=${offset}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!resp.ok) break;
      const data = await resp.json();
      const features = data?.features || [];
      if (features.length === 0) break;
      allFeatures.push(...features);
      hasMore = data.exceededTransferLimit === true;
      offset += 2000;
      if (offset > 20000) break;
    }
    console.log(`[FL-ArcGIS] Fetched ${allFeatures.length} raw features`);
    // Dedupe by OBJECTID_1 to avoid collisions
    const seen = new Set<string>();
    return allFeatures
      .filter((f: any) => {
        const a = f.attributes || {};
        const hasCoords = (a.LATITUDE || a.Latitude || f.geometry?.y) && (a.LONGITUDE || a.Longitude || f.geometry?.x);
        if (!hasCoords) return false;
        const uniqueKey = String(a.OBJECTID_1 || a.OBJECTID || `${f.geometry?.y}_${f.geometry?.x}_${a.DESCRIPT || ''}`);
        if (seen.has(uniqueKey)) return false;
        seen.add(uniqueKey);
        return true;
      })
      .map((f: any) => {
        const a = f.attributes || {};
        const lat = a.LATITUDE || a.Latitude || f.geometry?.y;
        const lng = a.LONGITUDE || a.Longitude || f.geometry?.x;
        const objectId = a.OBJECTID_1 || a.OBJECTID;
        const fl511Id = a.ID || a.Id || a.id || '';
        // Image URL: use FL511 Cctv snapshot endpoint (reliable single-frame image)
        const imgUrl = fl511Id ? `https://fl511.com/map/Cctv/${fl511Id}` : (a.IMAGE || a.ImageURL || '');
        // Only tag as stream if there's an explicit HLS/MJPEG URL in the data
        // FL511 GetVideo endpoints return single frames, NOT continuous streams
        const videoUrl = a.VideoURL || a.VIDEO_URL || '';
        const hlsUrl = a.HlsUrl || a.HLSURL || '';
        const mjpeg = a.MJPEG_URL || a.MjpegUrl || '';
        const explicitStream = videoUrl || hlsUrl || mjpeg;
        // Do NOT force-construct GetVideo stream URLs — they are NOT real streams
        return {
          id: `fl-${objectId}`,
          name: a.DESCRIPT || a.Name || a.LOCATION || 'FL Camera',
          lat, lng, imageUrl: imgUrl, source: 'FL511', refreshRate: 5,
          // Only set streamUrl if there's a genuinely verified stream endpoint
          streamUrl: validStreamUrl(explicitStream) || undefined,
          region: 'FL', country: 'US',
        };
      })
      .filter((c: CameraResult) => c.imageUrl);
  } catch (err) { console.error('[FL-ArcGIS] Error:', err); return []; }
}

// Florida 511 JSON API — disabled (returns Invalid Key / empty DataTables payload)
// Keeping stub so source list doesn't break
async function fetchFlorida511API(): Promise<CameraResult[]> {
  // FL511 List/GetData endpoints require special auth tokens and return DataTables format
  // Not usable without valid API key — all FL coverage now comes from ArcGIS with OBJECTID_1 fix
  return [];
}

// ====== NYC DOT ======
async function fetchNYCDOTCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://webcams.nyctmc.org/api/cameras/', {
      signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = Array.isArray(data) ? data : (data?.cameras || []);
    return cameras
      .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
      .map((c: any) => ({
        id: `nycdot-${c.id || c.cameraID || Math.random().toString(36).slice(2)}`,
        name: c.name || c.title || 'NYC Camera',
        lat: c.latitude || c.lat, lng: c.longitude || c.lng,
        imageUrl: c.imageUrl || c.image_url || c.url || c.stillImageUrl || '',
        source: 'NYCDOT', refreshRate: 2, region: 'NY', country: 'US',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== VIRGINIA GeoJSON ======
async function fetch511VA(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://www.511virginia.org/data/geojson/icons.cameras.geojson', { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data?.features || [])
      .filter((f: any) => f.geometry?.coordinates?.length >= 2)
      .map((f: any) => ({
        id: `va-${f.properties?.id || Math.random().toString(36).slice(2)}`,
        name: f.properties?.name || f.properties?.description || 'VA Camera',
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
        imageUrl: f.properties?.image_url || f.properties?.url || '',
        source: '511VA', refreshRate: 10, region: 'VA', country: 'US',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== OHIO (OHGO) ======
async function fetchOHCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://publicapi.ohgo.com/api/v1/Cameras', {
      signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = data?.results || (Array.isArray(data) ? data : []);
    return cameras
      .filter((c: any) => (c.latitude || c.Latitude) && (c.longitude || c.Longitude))
      .map((c: any) => {
        let imgUrl = c.smallImageUrl || c.largeImageUrl || c.imageUrl || '';
        if (!imgUrl && Array.isArray(c.links)) {
          const imgLink = c.links.find((l: any) => l.rel === 'small' || l.rel === 'large');
          if (imgLink) imgUrl = imgLink.href || '';
        }
        return {
          id: `oh-${c.id || c.Id || Math.random().toString(36).slice(2)}`,
          name: c.description || c.Description || 'OH Camera',
          lat: c.latitude || c.Latitude, lng: c.longitude || c.Longitude,
          imageUrl: imgUrl, source: 'OHGO', refreshRate: 5, region: 'OH', country: 'US',
        };
      })
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== TENNESSEE ======
async function fetchTNCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://smartway.tn.gov/traffic/api/Cameras',
    'https://smartway.tn.gov/traffic/api/cameras',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const cameras = Array.isArray(data) ? data : (data?.cameras || data?.features || []);
      if (!Array.isArray(cameras) || cameras.length === 0) continue;
      return cameras
        .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
        .map((c: any) => ({
          id: `tn-${c.id || c.cameraId || Math.random().toString(36).slice(2)}`,
          name: c.description || c.name || 'TN Camera',
          lat: c.latitude || c.lat, lng: c.longitude || c.lng,
          imageUrl: c.imageUrl || c.image || c.url || '',
          source: 'TN SmartWay', refreshRate: 10, region: 'TN', country: 'US',
        }))
        .filter((c: CameraResult) => c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== COLORADO ======
async function fetchCDOT(): Promise<CameraResult[]> {
  const urls = [
    'https://www.cotrip.org/speed/getTrafficCameras.do',
    'https://data.cotrip.org/api/v1/cameras',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const cameras = data?.features || (Array.isArray(data) ? data : (data?.cameras || []));
      if (!Array.isArray(cameras) || cameras.length === 0) continue;
      return cameras
        .filter((c: any) => {
          const coords = c.geometry?.coordinates;
          if (coords) return coords.length >= 2;
          return (c.latitude || c.lat) && (c.longitude || c.lng);
        })
        .map((c: any) => ({
          id: `co-${c.properties?.id || c.id || Math.random().toString(36).slice(2)}`,
          name: c.properties?.camera_label || c.properties?.name || c.name || 'CO Camera',
          lat: c.geometry?.coordinates?.[1] || c.latitude || c.lat,
          lng: c.geometry?.coordinates?.[0] || c.longitude || c.lng,
          imageUrl: c.properties?.https_url || c.properties?.camera_url || c.imageUrl || c.url || '',
          source: 'CDOT', refreshRate: 10, region: 'CO', country: 'US',
        }))
        .filter((c: CameraResult) => c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== AUSTIN TX ======
async function fetchAustinCameras(): Promise<CameraResult[]> {
  try {
    const url = `https://data.austintexas.gov/resource/b4k4-adkb.json?$limit=50000&camera_status=TURNED_ON`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((c: any) => {
        const lat = parseFloat(c.location?.latitude || c.location_latitude || 0);
        const lng = parseFloat(c.location?.longitude || c.location_longitude || 0);
        return lat && lng;
      })
      .map((c: any) => {
        const camId = c.camera_id || c.atd_device_id || '';
        return {
          id: `tx-atx-${camId || Math.random().toString(36).slice(2)}`,
          name: c.location_name || c.camera_name || 'Austin Camera',
          lat: parseFloat(c.location?.latitude || c.location_latitude),
          lng: parseFloat(c.location?.longitude || c.location_longitude),
          imageUrl: camId ? `https://cctv.austinmobility.io/image/${camId}.jpg` : '',
          source: 'Austin TX', refreshRate: 5, region: 'TX', country: 'US',
        };
      })
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== MISSOURI ======
async function fetchMOCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://traveler.modot.org/timconfig/feed/dtd/TravelConditionCamera.json', { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = data?.features || data?.cameras || (Array.isArray(data) ? data : []);
    if (!Array.isArray(cameras)) return [];
    return cameras
      .filter((c: any) => {
        const lat = c.latitude || c.lat || c.geometry?.coordinates?.[1] || 0;
        const lng = c.longitude || c.lng || c.geometry?.coordinates?.[0] || 0;
        return lat && lng;
      })
      .map((c: any) => ({
        id: `mo-${c.id || c.Id || Math.random().toString(36).slice(2)}`,
        name: c.description || c.name || 'MO Camera',
        lat: c.latitude || c.lat || c.geometry?.coordinates?.[1],
        lng: c.longitude || c.lng || c.geometry?.coordinates?.[0],
        imageUrl: c.imageUrl || c.url || c.image || '',
        source: 'MoDOT', refreshRate: 10, region: 'MO', country: 'US',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== NEVADA (nvroads.com 511 API) ======
async function fetchNevadaCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://www.nvroads.com/api/v2/get/cameras?key=public&format=json', {
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = Array.isArray(data) ? data : (data?.CamerasList || []);
    if (!Array.isArray(cameras)) return [];

    return cameras
      .filter((c: any) => c.Latitude && c.Longitude)
      .map((c: any) => {
        let imgUrl = '';
        let videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = `https://www.nvroads.com/map/Cctv/${c.Id}`;

        return {
          id: `nv-${c.Id || c.SourceId || Math.random().toString(36).slice(2)}`,
          name: c.Roadway || c.Name || 'NV Camera',
          lat: c.Latitude,
          lng: c.Longitude,
          imageUrl: imgUrl,
          source: 'NDOT NV',
          refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl),
          region: 'NV',
          country: 'US',
        };
      })
      .filter((c: CameraResult) => c.imageUrl);
  } catch (e: any) {
    console.error('[NV] Error:', e.message);
    return [];
  }
}

// ====== TEXAS - TxDOT ITS (all districts) ======
async function fetchTxDOTITSCameras(): Promise<CameraResult[]> {
  // TxDOT ITS internal API - fetches camera list per district
  const districts = [
    'ABL','AMA','ATL','AUS','BMT','BWD','BRY','CHS','CRP',
    'DAL','ELP','FTW','HOU','LRD','LBB','LFK','ODA','PAR',
    'PHR','SJT','SAT','TYL','WAC','WFS','YKM'
  ];

  const allCameras: CameraResult[] = [];

  // Fetch from TxDOT ITS API - they have a JSON endpoint per district
  for (const dist of districts) {
    try {
      const resp = await fetch(`https://its.txdot.gov/ITS_WEB/FrontEnd/default.html?r=DAL&asset=Cameras&district=${dist}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      });
      // The ITS website is client-rendered, so direct API won't work well
      // Instead, use snapshots URL pattern
    } catch { /* skip */ }
  }

  // Use TxDOT's known snapshot pattern for major cameras
  // The real approach: use TxDOT's GeoJSON/Open Data feed
  try {
    // TxDOT Open Data CCTV
    const urls = [
      'https://gis-txdot.opendata.arcgis.com/datasets/txdot-cctv-cameras.geojson',
      'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_CCTV_Cameras/FeatureServer/0/query?where=1%3D1&outFields=*&f=json&resultRecordCount=2000',
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!resp.ok) continue;
        const data = await resp.json();

        // GeoJSON format
        if (data?.features && data?.type === 'FeatureCollection') {
          const cameras = data.features
            .filter((f: any) => f.geometry?.coordinates?.length >= 2)
            .map((f: any) => {
              const p = f.properties || {};
              return {
                id: stableCameraId('tx', p.OBJECTID || p.id, f.geometry.coordinates[1], f.geometry.coordinates[0], p.Name || p.LOCATION || 'TX Camera'),
                name: p.Name || p.LOCATION || p.Description || 'TX Camera',
                lat: f.geometry.coordinates[1],
                lng: f.geometry.coordinates[0],
                imageUrl: p.ImageURL || p.imageUrl || p.URL || p.Url || '',
                source: 'TxDOT',
                refreshRate: 10,
                streamUrl: validStreamUrl(p.VideoURL || p.StreamURL || ''),
                region: 'TX',
                country: 'US',
              };
            })
            .filter((c: CameraResult) => c.imageUrl);
          if (cameras.length > 0) return [...allCameras, ...cameras];
        }

        // ArcGIS format
        if (data?.features && Array.isArray(data.features)) {
          const cameras = data.features
            .map((f: any) => {
              const a = f.attributes || {};
              const coords = normalizeCoordinates(
                a.LATITUDE || a.Latitude || a.latitude || a.LAT || a.Y,
                a.LONGITUDE || a.Longitude || a.longitude || a.LON || a.LONG || a.X,
                f.geometry?.y, f.geometry?.x
              );
              if (!coords) return null;
              return {
                id: stableCameraId('tx', a.OBJECTID || a.Id, coords.lat, coords.lng, a.Name || a.LOCATION || 'TX Camera'),
                name: a.Name || a.LOCATION || a.Description || a.DESCRIPT || 'TX Camera',
                lat: coords.lat,
                lng: coords.lng,
                imageUrl: a.ImageURL || a.imageUrl || a.URL || a.Url || a.IMAGE || '',
                source: 'TxDOT',
                refreshRate: 10,
                streamUrl: validStreamUrl(a.VideoURL || a.StreamURL || ''),
                region: 'TX',
                country: 'US',
              };
            })
            .filter((c): c is CameraResult => !!c && !!c.imageUrl);
          if (cameras.length > 0) return [...allCameras, ...cameras];
        }
      } catch { continue; }
    }
  } catch { /* fallthrough */ }

  return allCameras;
}

// ====== TEXAS - Houston TranStar ======
async function fetchHoustonTranStar(): Promise<CameraResult[]> {
  try {
    // Houston TranStar has cameras viewable at https://traffic.houstontranstar.org/
    const resp = await fetch('https://traffic.houstontranstar.org/layers/layers_cctv.json', {
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = Array.isArray(data) ? data : (data?.features || data?.cameras || []);
    if (!Array.isArray(cameras)) return [];

    return cameras
      .filter((c: any) => {
        const lat = c.latitude || c.lat || c.geometry?.coordinates?.[1];
        const lng = c.longitude || c.lng || c.geometry?.coordinates?.[0];
        return lat && lng;
      })
      .map((c: any) => {
        const lat = c.latitude || c.lat || c.geometry?.coordinates?.[1];
        const lng = c.longitude || c.lng || c.geometry?.coordinates?.[0];
        return {
          id: stableCameraId('tx-hou', c.id || c.Id, lat, lng, c.name || c.description || 'Houston Camera'),
          name: c.name || c.description || c.location || 'Houston Camera',
          lat, lng,
          imageUrl: c.imageUrl || c.image || c.url || c.ImageURL || '',
          source: 'Houston TranStar',
          refreshRate: 5,
          streamUrl: validStreamUrl(c.videoUrl || c.streamUrl || ''),
          region: 'TX',
          country: 'US',
        };
      })
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}



// ====== ILLINOIS - IDOT Gateway (verified ArcGIS FeatureServer) ======
async function fetchIDOTCameras(): Promise<CameraResult[]> {
  try {
    const allFeatures: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const url = `https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=2000&resultOffset=${offset}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!resp.ok) break;
      const data = await resp.json();
      const features = data?.features || [];
      if (features.length === 0) break;
      allFeatures.push(...features);
      hasMore = data.exceededTransferLimit === true;
      offset += 2000;
      if (offset > 20000) break;
    }
    console.log(`[IDOT] Fetched ${allFeatures.length} raw features`);
    return allFeatures
      .filter((f: any) => {
        const a = f.attributes || {};
        const lat = a.y || f.geometry?.y;
        const lng = a.x || f.geometry?.x;
        return lat && lng && a.TooOld !== 'true';
      })
      .map((f: any) => {
        const a = f.attributes || {};
        const lat = a.y || f.geometry?.y;
        const lng = a.x || f.geometry?.x;
        const rawId = a.OBJECTID || a.ObjectId || a.id;
        const id = stableCameraId('il-idot', rawId, lat, lng, a.CameraLocation || 'IL Camera');
        const imgUrl = a.SnapShot || a.ImageURL || a.image_url || a.Url || a.url || a.currentImageURL || a.CameraImageURL || '';
        return {
          id, name: a.CameraLocation || 'IL Camera',
          lat, lng, imageUrl: imgUrl, source: 'IDOT Gateway', refreshRate: 5,
          region: 'IL', country: 'US',
        };
      })
      .filter((c: CameraResult) => c.imageUrl);
  } catch (e: any) {
    console.error('[IDOT] Error:', e.message);
    return [];
  }
}

// ====== OREGON ======
async function fetchODOT(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://tripcheck.com/Scripts/map/data/cameraData.js', { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const text = await resp.text();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const data = JSON.parse(match[0]);
    if (!Array.isArray(data)) return [];
    return data
      .filter((c: any) => (c.lat || c.latitude) && (c.lon || c.lng || c.longitude))
      .map((c: any, i: number) => ({
        id: `or-${c.id || i}`,
        name: c.title || c.name || 'OR Camera',
        lat: c.lat || c.latitude,
        lng: c.lon || c.lng || c.longitude,
        imageUrl: c.imageUrl || c.url || '',
        source: 'ODOT', refreshRate: 10, region: 'OR', country: 'US',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== HAWAII (GoAkamai + Honolulu Open Data + Windy fallback) ======
// NOTE: GoAkamai camera API (a.cameraservice.goakamai.org) returns 500 errors.
// GoAkamai image server returns HTML pages instead of images.
// Honolulu OpenData no longer includes camera image URLs.
// Hawaii cameras are populated here with coordinates for map display,
// but feeds depend on GoAkamai recovering upstream or Windy API coverage.
async function fetchHawaiiCameras(): Promise<CameraResult[]> {
  const results: CameraResult[] = [];
  
  // Source 1: GoAkamai camera service API (HDOT official) — currently returning 500
  try {
    const apiUrl = 'http://a.cameraservice.goakamai.org/cameras?format=mapPage';
    const resp = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'SFH/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const cams = Array.isArray(data) ? data : (data?.cameras || data?.result || []);
      for (const c of cams) {
        const lat = parseFloat(c.lat || c.latitude || 0);
        const lng = parseFloat(c.lon || c.lng || c.longitude || 0);
        if (!lat || !lng) continue;
        const imgUrl = c.cameraImageURL || c.imageUrl || c.image_url || '';
        const streamUrl = c.streamingURL || c.stream_url || '';
        results.push({
          id: `hi-goakamai-${c.id || c.deviceID || c.device_id || results.length}`,
          name: c.description || c.name || `Hawaii Camera ${results.length}`,
          lat, lng,
          imageUrl: imgUrl.startsWith('http') ? imgUrl : imgUrl ? `http://goakamai.org${imgUrl}` : '',
          source: 'GoAkamai HI',
          streamUrl: validStreamUrl(streamUrl),
          refreshRate: 60,
          region: 'HI',
          country: 'US',
        });
      }
      console.log(`[HI-GoAkamai] Fetched ${results.length} cameras from API`);
    } else {
      console.warn(`[HI-GoAkamai] API returned ${resp.status} — upstream service down`);
    }
  } catch (e) {
    console.warn('[HI-GoAkamai] API error (upstream likely down):', e);
  }

  // Source 2: Honolulu Open Data (coordinates only — no image URLs available)
  try {
    const url = 'https://data.honolulu.gov/resource/cat5-2v98.json?$limit=500';
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const existingIds = new Set(results.map(r => r.name.toUpperCase()));
      let added = 0;
      for (const cam of data) {
        const lat = parseFloat(cam.location?.latitude || 0);
        const lng = parseFloat(cam.location?.longitude || 0);
        if (!lat || !lng) continue;
        const desc = cam.description || '';
        if (existingIds.has(desc.toUpperCase())) continue;
        // Construct GoAkamai image URL from camera description
        // Format: C{NNN}_{DESC}.jpg e.g. C041_ALA_MOANA_KALIA.jpg  
        const cleanDesc = desc.replace(/[^A-Za-z0-9_ ]/g, '').replace(/ +/g, '_').toUpperCase();
        const imgUrl = `http://goakamai.org/images/cctv/honolulucams/${cleanDesc}.jpg`;
        results.push({
          id: `hi-honolulu-${cleanDesc.slice(0, 40)}`,
          name: desc || 'Honolulu Camera',
          lat, lng,
          imageUrl: imgUrl,
          source: 'Honolulu OpenData',
          refreshRate: 60,
          region: 'HI',
          country: 'US',
        });
        added++;
      }
      console.log(`[HI-Honolulu] Added ${added} cameras from open data (total now: ${results.length})`);
    }
  } catch (e) {
    console.warn('[HI-Honolulu] Open data error:', e);
  }

  console.log(`[HI] Total Hawaii cameras: ${results.length} (NOTE: GoAkamai feeds are currently offline upstream)`);
  return results;
}

// ====== WINDY.COM - Worldwide fallback ======
async function fetchWindyRegion(lat: number, lng: number, radius: number, regionName: string, country: string): Promise<CameraResult[]> {
  try {
    const windyApiKey = Deno.env.get('WINDY_API_KEY') || Deno.env.get('WINDY_KEY');
    if (!windyApiKey) {
      console.warn(`[Windy-${regionName}] Missing WINDY_API_KEY secret`);
      return [];
    }

    const urls = [
      { url: `https://api.windy.com/webcams/api/v3/webcams?lang=en&limit=50&offset=0&include=images,location&nearby=${lat},${lng},${radius}`, header: 'x-windy-api-key' },
    ];
    for (const { url, header } of urls) {
      try {
        const resp = await fetch(url, {
          headers: {
            [header]: windyApiKey,
            'Accept': 'application/json',
            'User-Agent': 'SFH/1.0',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) {
          const body = await resp.text().catch(() => '');
          console.warn(`[Windy-${regionName}] ${resp.status} ${resp.statusText}${body ? ` :: ${body.slice(0, 180)}` : ''}`);
          continue;
        }
        const data = await resp.json();
        const webcams = data?.webcams || data?.result?.webcams || [];
        if (!Array.isArray(webcams) || webcams.length === 0) continue;
        return webcams
          .filter((w: any) => (w.location?.latitude || w.position?.latitude))
          .map((w: any) => ({
            id: `windy-${w.webcamId || w.id}`,
            name: w.title || 'Webcam',
            lat: w.location?.latitude || w.position?.latitude,
            lng: w.location?.longitude || w.position?.longitude,
            imageUrl: w.images?.current?.preview || w.image?.current?.preview || w.images?.daylight?.preview || `https://images-webcams.windy.com/webcams/${w.webcamId || w.id}/current/preview/${w.webcamId || w.id}.jpg`,
            source: 'Windy', refreshRate: 30,
            region: regionName, country,
          }))
          .filter((c: CameraResult) => c.imageUrl);
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ====== UK Highways ======
async function fetchUKCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://data.highwaysengland.co.uk/ntis/NTIS/Camera/content.json', { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = data?.cameras || data?.features || (Array.isArray(data) ? data : []);
    if (!Array.isArray(cameras)) return [];
    return cameras
      .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
      .map((c: any, i: number) => ({
        id: `uk-${c.id || i}`,
        name: c.description || c.name || 'UK Highway Camera',
        lat: c.latitude || c.lat, lng: c.longitude || c.lng,
        imageUrl: c.image || c.imageUrl || c.url || '',
        source: 'Highways England', refreshRate: 20, region: 'UK', country: 'GB',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== UK - Traffic Scotland ======
async function fetchTrafficScotland(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://trafficscotland.org/feeds/cameraimages', { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const text = await resp.text();
    const cameras: CameraResult[] = [];
    // Parse XML-like feed for camera entries
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const item = match[1];
      const title = item.match(/<title>(.*?)<\/title>/)?.[1] || 'Scotland Camera';
      const imgMatch = item.match(/<link>(https?:\/\/[^<]+\.(jpg|jpeg|png)[^<]*)<\/link>/i) || 
                       item.match(/url="(https?:\/\/[^"]+\.(jpg|jpeg|png)[^"]*)"/i) ||
                       item.match(/<enclosure[^>]+url="([^"]+)"/i);
      const latMatch = item.match(/<geo:lat>([^<]+)<\/geo:lat>/);
      const lngMatch = item.match(/<geo:long>([^<]+)<\/geo:long>/);
      if (latMatch && lngMatch && imgMatch) {
        const lat = parseFloat(latMatch[1]);
        const lng = parseFloat(lngMatch[1]);
        if (lat && lng) {
          cameras.push({
            id: stableCameraId('gb-scot', null, lat, lng, title),
            name: title, lat, lng,
            imageUrl: imgMatch[1],
            source: 'Traffic Scotland', refreshRate: 15,
            region: 'Scotland', country: 'GB',
          });
        }
      }
    }
    return cameras;
  } catch { return []; }
}

// ====== Netherlands ======
async function fetchNLCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://opendata.ndw.nu/MSt_Camera.json', { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const features = data?.features || (Array.isArray(data) ? data : []);
    return features
      .filter((f: any) => f.geometry?.coordinates?.length >= 2)
      .map((f: any) => ({
        id: `nl-${f.properties?.id || Math.random().toString(36).slice(2)}`,
        name: f.properties?.name || f.properties?.description || 'NL Camera',
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
        imageUrl: f.properties?.imageUrl || f.properties?.url || '',
        source: 'NDW Netherlands', refreshRate: 20, region: 'NL', country: 'NL',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== GERMANY — Autobahn API (public, no auth) ======
async function fetchGermanyCameras(): Promise<CameraResult[]> {
  try {
    // First get list of all autobahn road IDs
    const roadsResp = await fetch('https://verkehr.autobahn.de/o/autobahn', { signal: AbortSignal.timeout(15000) });
    if (!roadsResp.ok) return [];
    const roadsData = await roadsResp.json();
    const roads = roadsData?.roads || [];
    if (!Array.isArray(roads)) return [];

    const allCameras: CameraResult[] = [];
    // Fetch webcams for each road (limit to first 30 to avoid timeout)
    const roadBatch = roads.slice(0, 30);
    for (const roadId of roadBatch) {
      try {
        const resp = await fetch(`https://verkehr.autobahn.de/o/autobahn/${roadId}/services/webcam`, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) continue;
        const data = await resp.json();
        const webcams = data?.webcam || [];
        if (!Array.isArray(webcams)) continue;
        for (const w of webcams) {
          const coords = normalizeCoordinates(w.coordinate?.lat, w.coordinate?.long);
          if (!coords) continue;
          const imgUrl = w.imageurl || w.linkurl || '';
          if (!imgUrl) continue;
          allCameras.push({
            id: stableCameraId('de', w.identifier || w.extent, coords.lat, coords.lng, w.title || w.subtitle || 'DE Camera'),
            name: w.title || w.subtitle || w.description?.[0] || `${roadId} Camera`,
            lat: coords.lat, lng: coords.lng,
            imageUrl: imgUrl,
            source: 'Autobahn DE', refreshRate: 60,
            region: roadId, country: 'DE',
          });
        }
      } catch { continue; }
    }
    return allCameras;
  } catch { return []; }
}

// ====== FINLAND — Digitraffic Weathercam API (public, no auth) ======
async function fetchFinlandCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://tie.digitraffic.fi/api/weathercam/v1/stations', {
      signal: AbortSignal.timeout(20000),
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'User-Agent': 'SFH/1.0',
      },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const stations = data?.features || [];
    if (!Array.isArray(stations)) return [];
    const cameras: CameraResult[] = [];
    for (const f of stations) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const props = f.properties || {};
      if (props.collectionStatus === 'REMOVED_PERMANENTLY') continue;
      const presets = props.presets || [];
      for (const p of presets) {
        if (p.inCollection === false) continue;
        const imgUrl = p.imageUrl || `https://weathercam.digitraffic.fi/${p.id}.jpg`;
        cameras.push({
          id: `fi-${p.id || stableCameraId('fi', null, coords[1], coords[0], p.presentationName || props.name || 'FI Camera')}`,
          name: p.presentationName || props.name || 'FI Camera',
          lat: coords[1], lng: coords[0],
          imageUrl: imgUrl,
          source: 'Digitraffic FI', refreshRate: 60,
          region: 'FI', country: 'FI',
        });
      }
    }
    return cameras;
  } catch { return []; }
}

// ====== AUSTRIA — ASFINAG Webcams via their data endpoint ======
async function fetchAustriaCameras(): Promise<CameraResult[]> {
  try {
    // ASFINAG provides webcam data via their public API
    const urls = [
      'https://www.asfinag.at/verkehr/verkehrslage/kameras/webcam-data',
      'https://verkehrsauskunft.asfinag.at/its/api/cctv',
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const cameras = Array.isArray(data) ? data : (data?.cameras || data?.features || data?.webcams || []);
        if (!Array.isArray(cameras) || cameras.length === 0) continue;
        return cameras
          .filter((c: any) => (c.latitude || c.lat || c.geometry?.coordinates) && (c.longitude || c.lng || c.geometry?.coordinates))
          .map((c: any) => {
            const lat = c.latitude || c.lat || c.geometry?.coordinates?.[1];
            const lng = c.longitude || c.lng || c.geometry?.coordinates?.[0];
            if (!lat || !lng) return null;
            return {
              id: stableCameraId('at', c.id || c.Id, lat, lng, c.name || c.description || 'AT Camera'),
              name: c.name || c.description || c.title || 'AT Camera',
              lat, lng,
              imageUrl: c.imageUrl || c.image || c.url || c.imageURL || '',
              source: 'ASFINAG', refreshRate: 60,
              region: 'AT', country: 'AT',
            } as CameraResult;
          })
          .filter((c): c is CameraResult => !!c && !!c.imageUrl);
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ====== UTM Zone 30N to WGS84 conversion (for Euskadi) ======
function utmToWgs84(easting: number, northing: number, zone = 30): { lat: number; lng: number } | null {
  const k0 = 0.9996;
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const M = northing / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = (easting - 500000) / (N1 * k0);
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const lng = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(phi1);
  const latDeg = lat * 180 / Math.PI;
  const lngDeg = lng * 180 / Math.PI;
  if (!Number.isFinite(latDeg) || !Number.isFinite(lngDeg) || Math.abs(latDeg) > 90 || Math.abs(lngDeg) > 180) return null;
  return { lat: latDeg, lng: lngDeg };
}

// ====== SPAIN — Euskadi (Basque Country) Traffic Cameras ======
async function fetchEuskadi(): Promise<CameraResult[]> {
  const cameras: CameraResult[] = [];
  try {
    for (let page = 1; page <= 25; page++) {
      let resp: Response;
      try {
        // Use Deno.createHttpClient to skip SSL verification for this host
        const client = Deno.createHttpClient({
          caCerts: [],
        });
        resp = await fetch(`https://api.euskadi.eus/traffic/v1.0/cameras?_page=${page}`, {
          signal: AbortSignal.timeout(15000),
          headers: { 'Accept': 'application/json', 'User-Agent': 'SFH/1.0' },
          // @ts-ignore Deno-specific client option
          client,
        });
      } catch (fetchErr) {
        console.warn(`[ES-Euskadi] Page ${page} fetch error: ${fetchErr}`);
        break;
      }
      if (!resp.ok) { console.warn(`[ES-Euskadi] Page ${page}: HTTP ${resp.status}`); break; }
      const data = await resp.json();
      const cams = data?.cameras || [];
      if (!Array.isArray(cams) || cams.length === 0) break;
      for (const c of cams) {
        if (!c.urlImage) continue;
        const rawE = parseFloat(c.longitude);
        const rawN = parseFloat(c.latitude);
        if (!Number.isFinite(rawE) || !Number.isFinite(rawN)) continue;
        const coords = utmToWgs84(rawE, rawN, 30);
        if (!coords) continue;
        cameras.push({
          id: stableCameraId('es-eus', c.cameraId, coords.lat, coords.lng, c.cameraName || 'Euskadi Cam'),
          name: c.cameraName || `Euskadi ${c.road || ''} km${c.kilometer || ''}`,
          lat: coords.lat,
          lng: coords.lng,
          imageUrl: c.urlImage,
          source: 'Euskadi',
          refreshRate: 30,
          region: 'ES-PV',
          country: 'ES',
        });
      }
    }
    console.log(`[ES-Euskadi] Parsed ${cameras.length} cameras`);
  } catch (e) { console.error('[ES-Euskadi] Error:', e); }
  return cameras;
}

// ====== SPAIN — Catalonia (SCT) Traffic Cameras ======
async function fetchCatalonia(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('http://www.gencat.cat/transit/opendata/cameres.xml', {
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return [];
    const xmlText = await resp.text();
    const cameras: CameraResult[] = [];
    // Simple XML parsing for gml:coordinates and cite:link
    const featureRegex = /<cite:cameres[^>]*>([\s\S]*?)<\/cite:cameres>/g;
    let match;
    while ((match = featureRegex.exec(xmlText)) !== null) {
      const block = match[1];
      const coordsMatch = block.match(/<gml:coordinates[^>]*>([^<]+)<\/gml:coordinates>/);
      const linkMatch = block.match(/<cite:link>([^<]+)<\/cite:link>/);
      const roadMatch = block.match(/<cite:carretera>([^<]+)<\/cite:carretera>/);
      const muniMatch = block.match(/<cite:municipi>([^<]+)<\/cite:municipi>/);
      const pkMatch = block.match(/<cite:pk>([^<]+)<\/cite:pk>/);
      if (!coordsMatch || !linkMatch) continue;
      const [lngStr, latStr] = coordsMatch[1].split(',');
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const imageUrl = linkMatch[1].trim();
      if (!imageUrl) continue;
      // Extract unique cam ID from URL like sctidcam=nc87.gif
      const camIdMatch = imageUrl.match(/sctidcam=([^&]+)/);
      const camExplicitId = camIdMatch ? camIdMatch[1].replace('.gif', '') : null;
      const road = roadMatch?.[1]?.trim() || '';
      const muni = muniMatch?.[1]?.trim() || '';
      const pk = pkMatch?.[1]?.trim() || '';
      const name = `${road} km${pk} ${muni}`.trim() || 'Catalonia Camera';
      cameras.push({
        id: stableCameraId('es-cat', camExplicitId, lat, lng, name),
        name,
        lat,
        lng,
        imageUrl: imageUrl,
        source: 'SCT Catalonia',
        refreshRate: 10,
        region: 'ES-CT',
        country: 'ES',
      });
    }
    console.log(`[ES-Catalonia] Parsed ${cameras.length} cameras`);
    return cameras;
  } catch (e) { console.error('[ES-Catalonia] Error:', e); return []; }
}

// ====== SPAIN — Valencia (multiple sources) ======
async function fetchValenciaCameras(): Promise<CameraResult[]> {
  const cameras: CameraResult[] = [];
  const urls = [
    'https://valencia.opendatasoft.com/api/records/1.0/search/?dataset=cameres-trafic-camaras-trafico&rows=500&fields=geo_point_2d,denominacio,imatge',
    'https://valencia.opendatasoft.com/api/v2/catalog/datasets/cameres-trafic-camaras-trafico/records?limit=100',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
      if (!resp.ok) continue;
      const data = await resp.json();
      const v1Records = data?.records || [];
      for (const r of v1Records) {
        const geo = r.fields?.geo_point_2d;
        if (!geo) continue;
        const [lat, lng] = geo;
        const name = r.fields?.denominacio || 'Valencia Camera';
        const imgUrl = r.fields?.imatge || '';
        if (!imgUrl) continue;
        cameras.push({
          id: stableCameraId('es-vlc', r.recordid, lat, lng, name),
          name, lat, lng, imageUrl: imgUrl,
          source: 'Valencia OpenData', refreshRate: 15,
          region: 'ES-VC', country: 'ES',
        });
      }
      if (cameras.length > 0) break;
    } catch { continue; }
  }
  console.log(`[ES-Valencia] Fetched ${cameras.length} cameras from OpenData`);
  return cameras;
}

// ====== SPAIN — Madrid KML (357+ cameras from datos.madrid.es) ======
async function fetchMadridCameras(): Promise<CameraResult[]> {
  try {
    const kmlUrl = 'https://datos.madrid.es/egob/catalogo/202088-0-trafico-camaras.kml';
    const resp = await fetch(kmlUrl, { signal: AbortSignal.timeout(25000) });
    if (!resp.ok) {
      console.warn(`[ES-Madrid] KML returned ${resp.status}`);
      return [];
    }
    const kmlText = await resp.text();
    const cameras: CameraResult[] = [];
    const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    let match;
    while ((match = placemarkRegex.exec(kmlText)) !== null) {
      const block = match[1];
      const coordsMatch = block.match(/<coordinates>\s*([-\d.]+),([-\d.]+)/);
      if (!coordsMatch) continue;
      const lng = parseFloat(coordsMatch[1]);
      const lat = parseFloat(coordsMatch[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const imgMatch = block.match(/src=(https?:\/\/informo\.madrid\.es\/cameras\/[^\s"'>]+)/i);
      if (!imgMatch) continue;
      const imageUrl = imgMatch[1].replace(/\?v=\d+/, '');
      const numMatch = block.match(/<Data name="Numero">\s*<Value>(\d+)<\/Value>/);
      const camNum = numMatch ? numMatch[1] : '';
      const nameMatch = block.match(/<Data name="Nombre">\s*<Value>([^<]+)<\/Value>/);
      const camName = nameMatch ? nameMatch[1].trim() : `Madrid Camera ${camNum}`;
      cameras.push({
        id: stableCameraId('es-mad', camNum || null, lat, lng, camName),
        name: camName,
        lat, lng,
        imageUrl,
        source: 'Madrid Informo',
        refreshRate: 10,
        region: 'ES-MD',
        country: 'ES',
      });
    }
    console.log(`[ES-Madrid] Parsed ${cameras.length} cameras from KML`);
    return cameras;
  } catch (e) { console.error('[ES-Madrid] Error:', e); return []; }
}

// ====== ANDORRA — Mobilitat.ad ======
async function fetchAndorraCameras(): Promise<CameraResult[]> {
  try {
    const urls = [
      'https://app.mobilitat.ad/api/v1/cameras',
      'https://www.mobilitat.ad/api/cameras',
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const cameras = Array.isArray(data) ? data : (data?.cameras || data?.data || []);
        if (!Array.isArray(cameras) || cameras.length === 0) continue;
        return cameras
          .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng || c.lon))
          .map((c: any) => {
            const lat = c.latitude || c.lat;
            const lng = c.longitude || c.lng || c.lon;
            const name = c.name || c.title || c.description || 'Andorra Camera';
            const imgUrl = c.imageUrl || c.image || c.url || c.gif || '';
            return {
              id: stableCameraId('ad', c.id || c.cameraId, lat, lng, name),
              name, lat, lng, imageUrl: imgUrl,
              source: 'Mobilitat AD', refreshRate: 60,
              streamUrl: validStreamUrl(c.streamUrl || c.videoUrl || ''),
              region: 'AD', country: 'AD',
            } as CameraResult;
          })
          .filter((c: CameraResult) => c.imageUrl);
      } catch { continue; }
    }
    return [];
  } catch (e) { console.error('[AD-Andorra] Error:', e); return []; }
}

// ====== SWITZERLAND — ASTRA/Viasuisse ======
async function fetchSwitzerlandCameras(): Promise<CameraResult[]> {
  try {
    const urls = [
      'https://data.geo.admin.ch/ch.astra.webcams/data/ch.astra.webcams.json',
      'https://www.viasuisse.ch/api/cameras?format=json',
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const cameras = Array.isArray(data) ? data : (data?.features || data?.cameras || data?.webcams || []);
        if (!Array.isArray(cameras) || cameras.length === 0) continue;
        return cameras
          .filter((c: any) => {
            const lat = c.latitude || c.lat || c.geometry?.coordinates?.[1] || c.properties?.latitude;
            const lng = c.longitude || c.lng || c.geometry?.coordinates?.[0] || c.properties?.longitude;
            return lat && lng;
          })
          .map((c: any) => {
            const lat = c.latitude || c.lat || c.geometry?.coordinates?.[1] || c.properties?.latitude;
            const lng = c.longitude || c.lng || c.geometry?.coordinates?.[0] || c.properties?.longitude;
            const props = c.properties || c;
            return {
              id: stableCameraId('ch', props.id || props.Id, lat, lng, props.name || props.title || 'CH Camera'),
              name: props.name || props.title || props.description || 'CH Camera',
              lat, lng,
              imageUrl: props.imageUrl || props.image || props.url || props.imageURL || '',
              source: 'ASTRA CH', refreshRate: 60,
              region: 'CH', country: 'CH',
            } as CameraResult;
          })
          .filter((c: CameraResult) => c.imageUrl);
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ====== ITALY — Autostrade per l'Italia ======
async function fetchItalyCameras(): Promise<CameraResult[]> {
  try {
    const urls = [
      'https://www.autostrade.it/bin/aise/planner/cameras',
      'https://www.stradeanas.it/api/traffic/cameras',
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const cameras = Array.isArray(data) ? data : (data?.cameras || data?.webcams || []);
        if (!Array.isArray(cameras) || cameras.length === 0) continue;
        return cameras
          .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
          .map((c: any) => ({
            id: stableCameraId('it', c.id || c.Id, c.latitude || c.lat, c.longitude || c.lng, c.name || c.description || 'IT Camera'),
            name: c.name || c.description || c.denominazione || 'IT Camera',
            lat: c.latitude || c.lat, lng: c.longitude || c.lng,
            imageUrl: c.imageUrl || c.image || c.url || '',
            source: 'Autostrade IT', refreshRate: 60,
            region: 'IT', country: 'IT',
          }))
          .filter((c: CameraResult) => c.imageUrl);
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ====== FRANCE — Hardcoded major highway cameras from Bison Futé / DIR ======
// NOTE: All previous French open data endpoints (Bordeaux, Strasbourg) have been decommissioned.
// France cameras now rely entirely on Windy API coverage.
async function fetchFranceCameras(): Promise<CameraResult[]> {
  console.log('[FR-Traffic] No working French open data camera APIs remain. Relying on Windy coverage.');
  return [];
}

// ====== BELGIUM — Verkeerscentrum ======
async function fetchBelgiumCameras(): Promise<CameraResult[]> {
  try {
    const urls = [
      'https://www.verkeerscentrum.be/api/cameras',
      'https://opendata.vlaanderen.be/api/3/action/package_show?id=verkeerscameras',
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const cameras = Array.isArray(data) ? data : (data?.cameras || data?.result?.resources || []);
        if (!Array.isArray(cameras) || cameras.length === 0) continue;
        return cameras
          .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
          .map((c: any) => ({
            id: stableCameraId('be', c.id || c.Id, c.latitude || c.lat, c.longitude || c.lng, c.name || 'BE Camera'),
            name: c.name || c.description || 'BE Camera',
            lat: c.latitude || c.lat, lng: c.longitude || c.lng,
            imageUrl: c.imageUrl || c.url || c.image || '',
            source: 'Verkeerscentrum BE', refreshRate: 60,
            region: 'BE', country: 'BE',
          }))
          .filter((c: CameraResult) => c.imageUrl);
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ====== DENMARK — Vejdirektoratet ======
async function fetchDenmarkCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://data.vejdirektoratet.dk/api/traffic/cameras', { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = Array.isArray(data) ? data : (data?.cameras || data?.features || []);
    if (!Array.isArray(cameras)) return [];
    return cameras
      .filter((c: any) => (c.latitude || c.lat || c.geometry?.coordinates) && (c.longitude || c.lng || c.geometry?.coordinates))
      .map((c: any) => ({
        id: stableCameraId('dk', c.id, c.latitude || c.lat || c.geometry?.coordinates?.[1], c.longitude || c.lng || c.geometry?.coordinates?.[0], c.name || 'DK Camera'),
        name: c.name || c.description || 'DK Camera',
        lat: c.latitude || c.lat || c.geometry?.coordinates?.[1],
        lng: c.longitude || c.lng || c.geometry?.coordinates?.[0],
        imageUrl: c.imageUrl || c.url || c.image || '',
        source: 'Vejdirektoratet DK', refreshRate: 60,
        region: 'DK', country: 'DK',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== IRELAND — TII Traffic ======
async function fetchIrelandCameras(): Promise<CameraResult[]> {
  try {
    const urls = [
      'https://www.tii.ie/roads-tolling/traffic-cameras/api/cameras.json',
      'https://data.gov.ie/dataset/tii-traffic-cameras',
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const cameras = Array.isArray(data) ? data : (data?.cameras || data?.features || []);
        if (!Array.isArray(cameras) || cameras.length === 0) continue;
        return cameras
          .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
          .map((c: any) => ({
            id: stableCameraId('ie', c.id, c.latitude || c.lat, c.longitude || c.lng, c.name || 'IE Camera'),
            name: c.name || c.description || 'IE Camera',
            lat: c.latitude || c.lat, lng: c.longitude || c.lng,
            imageUrl: c.imageUrl || c.url || c.image || '',
            source: 'TII Ireland', refreshRate: 60,
            region: 'IE', country: 'IE',
          }))
          .filter((c: CameraResult) => c.imageUrl);
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ====== POLAND — GDDKiA ======
async function fetchPolandCameras(): Promise<CameraResult[]> {
  try {
    const urls = [
      'https://www.gddkia.gov.pl/frontend/web/api/cameras',
      'https://sip.gddkia.gov.pl/api/cameras',
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const cameras = Array.isArray(data) ? data : (data?.cameras || []);
        if (!Array.isArray(cameras) || cameras.length === 0) continue;
        return cameras
          .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
          .map((c: any) => ({
            id: stableCameraId('pl', c.id, c.latitude || c.lat, c.longitude || c.lng, c.name || 'PL Camera'),
            name: c.name || c.description || 'PL Camera',
            lat: c.latitude || c.lat, lng: c.longitude || c.lng,
            imageUrl: c.imageUrl || c.url || c.image || '',
            source: 'GDDKiA PL', refreshRate: 60,
            region: 'PL', country: 'PL',
          }))
          .filter((c: CameraResult) => c.imageUrl);
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ====== CZECH REPUBLIC — RSD ======
async function fetchCzechCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://www.rsd.cz/api/cameras', { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = Array.isArray(data) ? data : (data?.cameras || []);
    if (!Array.isArray(cameras)) return [];
    return cameras
      .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
      .map((c: any) => ({
        id: stableCameraId('cz', c.id, c.latitude || c.lat, c.longitude || c.lng, c.name || 'CZ Camera'),
        name: c.name || c.description || 'CZ Camera',
        lat: c.latitude || c.lat, lng: c.longitude || c.lng,
        imageUrl: c.imageUrl || c.url || c.image || '',
        source: 'RSD CZ', refreshRate: 60,
        region: 'CZ', country: 'CZ',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== CROATIA — HAK ======
async function fetchCroatiaCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://map.hak.hr/api/cameras', { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = Array.isArray(data) ? data : (data?.cameras || []);
    if (!Array.isArray(cameras)) return [];
    return cameras
      .filter((c: any) => (c.latitude || c.lat) && (c.longitude || c.lng))
      .map((c: any) => ({
        id: stableCameraId('hr', c.id, c.latitude || c.lat, c.longitude || c.lng, c.name || 'HR Camera'),
        name: c.name || c.description || 'HR Camera',
        lat: c.latitude || c.lat, lng: c.longitude || c.lng,
        imageUrl: c.imageUrl || c.url || c.image || '',
        source: 'HAK HR', refreshRate: 60,
        region: 'HR', country: 'HR',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== SLOVENIA — DARS ======
async function fetchSloveniaCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://www.promet.si/dc/b2b.cam.list', { signal: AbortSignal.timeout(15000), headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cameras = data?.Contents || data?.cameras || (Array.isArray(data) ? data : []);
    if (!Array.isArray(cameras)) return [];
    return cameras
      .filter((c: any) => c.y_wgs && c.x_wgs)
      .map((c: any) => ({
        id: stableCameraId('si', c.Id || c.id, c.y_wgs, c.x_wgs, c.Title || c.Name || 'SI Camera'),
        name: c.Title || c.Name || c.Description || 'SI Camera',
        lat: c.y_wgs, lng: c.x_wgs,
        imageUrl: c.Image || c.ImageUrl || '',
        source: 'DARS SI', refreshRate: 60,
        region: 'SI', country: 'SI',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== PORTUGAL — All known APIs decommissioned ======
// NOTE: SIGIP ArcGIS at infraestruturasdeportugal.pt has empty service folders.
// estradas.pt, brisa.pt APIs don't exist. Portugal cameras rely on Windy API.
async function fetchPortugalCameras(): Promise<CameraResult[]> {
  console.log('[PT-IP] No working Portuguese camera APIs remain. Relying on Windy coverage.');
  return [];
}

// ====== Australia NSW ======
async function fetchAUCameras(): Promise<CameraResult[]> {
  try {
    const resp = await fetch('https://www.livetraffic.com/traffic/cameras/geojson', { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data?.features || [])
      .filter((f: any) => f.geometry?.coordinates?.length >= 2)
      .map((f: any) => ({
        id: `au-${f.properties?.id || Math.random().toString(36).slice(2)}`,
        name: f.properties?.title || f.properties?.name || 'AU Camera',
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
        imageUrl: f.properties?.href || f.properties?.imageUrl || '',
        source: 'NSW LiveTraffic', refreshRate: 20, region: 'NSW', country: 'AU',
      }))
      .filter((c: CameraResult) => c.imageUrl);
  } catch { return []; }
}

// ====== CONNECTICUT — CTRoads + 511 v2 ======
async function fetchConnecticutCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://www.ctroads.org/api/getcameras?format=json',
    'https://www.511ct.org/api/v2/get/cameras?key=public&format=json',
    'https://www.511ct.org/api/getcameras?key=public&format=json',
    'https://www.511ct.org/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || raw?.cameras || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude || c.latitude, c.Longitude || c.longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || view.url || '';
          videoUrl = view.VideoUrl || view.videoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || c.url || c.ImageUrl || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.videoUrl || c.HlsUrl || c.StreamUrl || '';
        const name = c.Name || c.name || c.Location || c.Roadway || 'CT Camera';
        return {
          id: stableCameraId('ct', c.Id || c.ID || c.id, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'CTRoads', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'CT', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== UTAH — UDOT Traffic ======
async function fetchUtahCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://www.udottraffic.utah.gov/api/v2/get/cameras?key=public&format=json',
    'https://www.udottraffic.utah.gov/api/getcameras?key=public&format=json',
    'https://www.udottraffic.utah.gov/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || c.StreamUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'UT Camera';
        return {
          id: stableCameraId('ut', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'UDOT', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'UT', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== ARKANSAS — iDriveArkansas ======
async function fetchArkansasCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://www.idrivearkansas.com/api/v2/get/cameras?key=public&format=json',
    'https://www.idrivearkansas.com/api/getcameras?key=public&format=json',
    'https://www.idrivearkansas.com/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'AR Camera';
        return {
          id: stableCameraId('ar', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'iDriveAR', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'AR', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== MISSISSIPPI — MDOTTraffic ======
async function fetchMississippiCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://mdottraffic.com/api/v2/get/cameras?key=public&format=json',
    'https://mdottraffic.com/api/getcameras?key=public&format=json',
    'https://mdottraffic.com/List/GetData/Cameras?format=json',
    'https://www.mdottraffic.com/api/v2/get/cameras?key=public&format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'MS Camera';
        return {
          id: stableCameraId('ms', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'MDOT MS', refreshRate: 15,
          streamUrl: validStreamUrl(videoUrl), region: 'MS', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== WEST VIRGINIA — WV511 ======
async function fetchWestVirginiaCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://wv511.org/api/v2/get/cameras?key=public&format=json',
    'https://wv511.org/api/getcameras?key=public&format=json',
    'https://wv511.org/List/GetData/Cameras?format=json',
    'https://www.wv511.org/api/v2/get/cameras?key=public&format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'WV Camera';
        return {
          id: stableCameraId('wv', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'WV511', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'WV', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== KANSAS — KanDrive ======
async function fetchKansasCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://www.kandrive.gov/api/v2/get/cameras?key=public&format=json',
    'https://www.kandrive.gov/api/getcameras?key=public&format=json',
    'https://www.kandrive.gov/List/GetData/Cameras?format=json',
    'https://kandrive.gov/api/v2/get/cameras?key=public&format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'KS Camera';
        return {
          id: stableCameraId('ks', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'KanDrive', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'KS', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== NEBRASKA — 511 Nebraska ======
async function fetchNebraskaCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://511.nebraska.gov/api/v2/get/cameras?key=public&format=json',
    'https://511.nebraska.gov/api/getcameras?key=public&format=json',
    'https://511.nebraska.gov/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'NE Camera';
        return {
          id: stableCameraId('ne', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: '511 Nebraska', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'NE', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== NEW HAMPSHIRE — NewEngland511 ======
async function fetchNewHampshireCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://www.newengland511.org/api/v2/get/cameras?key=public&format=json',
    'https://www.newengland511.org/api/getcameras?key=public&format=json',
    'https://www.nh.gov/dot/511/api/v2/get/cameras?key=public&format=json',
    'https://newengland511.org/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      // Filter to NH region only (NewEngland511 covers multiple states)
      return data
        .filter((c: any) => {
          const coords = normalizeCoordinates(c.Latitude, c.Longitude);
          if (!coords) return false;
          // NH bounds: lat 42.7-45.3, lng -72.6 to -70.7
          return coords.lat >= 42.7 && coords.lat <= 45.3 && coords.lng >= -72.6 && coords.lng <= -70.7;
        })
        .map((c: any) => {
          const coords = normalizeCoordinates(c.Latitude, c.Longitude)!;
          let imgUrl = '', videoUrl = '';
          if (Array.isArray(c.Views) && c.Views.length > 0) {
            const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
            imgUrl = view.Url || '';
            videoUrl = view.VideoUrl || '';
          }
          if (!imgUrl) imgUrl = c.Url || '';
          if (!videoUrl) videoUrl = c.VideoUrl || '';
          const name = c.Name || c.Roadway || c.Location || 'NH Camera';
          return {
            id: stableCameraId('nh', c.Id || c.ID, coords.lat, coords.lng, name),
            name, lat: coords.lat, lng: coords.lng,
            imageUrl: imgUrl, source: 'NHDOT', refreshRate: 15,
            streamUrl: validStreamUrl(videoUrl), region: 'NH', country: 'US',
          } as CameraResult;
        }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== MAINE — 511 Maine ======
async function fetchMaineCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://511.maine.gov/api/v2/get/cameras?key=public&format=json',
    'https://511.maine.gov/api/getcameras?key=public&format=json',
    'https://511.maine.gov/List/GetData/Cameras?format=json',
    'https://www.511.maine.gov/api/v2/get/cameras?key=public&format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'ME Camera';
        return {
          id: stableCameraId('me', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'MaineDOT', refreshRate: 15,
          streamUrl: validStreamUrl(videoUrl), region: 'ME', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== VERMONT — 511VT ======
async function fetchVermontCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://511vt.com/api/v2/get/cameras?key=public&format=json',
    'https://511vt.com/api/getcameras?key=public&format=json',
    'https://511vt.com/List/GetData/Cameras?format=json',
    'https://www.511vt.com/api/v2/get/cameras?key=public&format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'VT Camera';
        return {
          id: stableCameraId('vt', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: '511VT', refreshRate: 15,
          streamUrl: validStreamUrl(videoUrl), region: 'VT', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== NEW MEXICO — NMRoads ======
async function fetchNewMexicoCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://nmroads.com/api/v2/get/cameras?key=public&format=json',
    'https://www.nmroads.com/api/v2/get/cameras?key=public&format=json',
    'https://nmroads.com/api/getcameras?key=public&format=json',
    'https://nmroads.com/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'NM Camera';
        return {
          id: stableCameraId('nm', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'NMRoads', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'NM', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== IDAHO — 511 Idaho ======
async function fetchIdahoCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://511.idaho.gov/api/v2/get/cameras?key=public&format=json',
    'https://511.idaho.gov/api/getcameras?key=public&format=json',
    'https://511.idaho.gov/List/GetData/Cameras?format=json',
    'https://www.511.idaho.gov/api/v2/get/cameras?key=public&format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'ID Camera';
        return {
          id: stableCameraId('id', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: '511 Idaho', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'ID', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== MONTANA — 511MT ======
async function fetchMontanaCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://www.511mt.net/api/v2/get/cameras?key=public&format=json',
    'https://511mt.net/api/v2/get/cameras?key=public&format=json',
    'https://www.511mt.net/api/getcameras?key=public&format=json',
    'https://www.511mt.net/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'MT Camera';
        return {
          id: stableCameraId('mt', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: '511MT', refreshRate: 15,
          streamUrl: validStreamUrl(videoUrl), region: 'MT', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== WYOMING — WyoRoad ======
async function fetchWyomingCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://www.wyoroad.info/api/v2/get/cameras?key=public&format=json',
    'https://wyoroad.info/api/v2/get/cameras?key=public&format=json',
    'https://www.wyoroad.info/api/getcameras?key=public&format=json',
    'https://www.wyoroad.info/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'WY Camera';
        return {
          id: stableCameraId('wy', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'WyoRoad', refreshRate: 15,
          streamUrl: validStreamUrl(videoUrl), region: 'WY', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== NORTH DAKOTA — ND DOT ======
async function fetchNorthDakotaCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://travel.dot.nd.gov/api/v2/get/cameras?key=public&format=json',
    'https://travel.dot.nd.gov/api/getcameras?key=public&format=json',
    'https://travel.dot.nd.gov/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'ND Camera';
        return {
          id: stableCameraId('nd', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'NDDOT', refreshRate: 15,
          streamUrl: validStreamUrl(videoUrl), region: 'ND', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== SOUTH DAKOTA — SD511 ======
async function fetchSouthDakotaCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://sd511.org/api/v2/get/cameras?key=public&format=json',
    'https://www.sd511.org/api/v2/get/cameras?key=public&format=json',
    'https://sd511.org/api/getcameras?key=public&format=json',
    'https://sd511.org/List/GetData/Cameras?format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'SD Camera';
        return {
          id: stableCameraId('sd', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'SD511', refreshRate: 15,
          streamUrl: validStreamUrl(videoUrl), region: 'SD', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== ALASKA — 511 Alaska ======
async function fetchAlaskaCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://511.alaska.gov/api/v2/get/cameras?key=public&format=json',
    'https://511.alaska.gov/api/getcameras?key=public&format=json',
    'https://511.alaska.gov/List/GetData/Cameras?format=json',
    'https://www.511.alaska.gov/api/v2/get/cameras?key=public&format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'AK Camera';
        return {
          id: stableCameraId('ak', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: '511 Alaska', refreshRate: 30,
          streamUrl: validStreamUrl(videoUrl), region: 'AK', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== RHODE ISLAND — RIDOT ======
async function fetchRhodeIslandCameras(): Promise<CameraResult[]> {
  const urls = [
    'https://www.dot.ri.gov/511/api/v2/get/cameras?key=public&format=json',
    'https://www.dot.ri.gov/api/v2/get/cameras?key=public&format=json',
    'https://www.dot.ri.gov/511/api/getcameras?key=public&format=json',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '', videoUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          const view = c.Views.find((v: any) => v.Status === 'Enabled') || c.Views[0];
          imgUrl = view.Url || '';
          videoUrl = view.VideoUrl || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        if (!videoUrl) videoUrl = c.VideoUrl || c.HlsUrl || '';
        const name = c.Name || c.Roadway || c.Location || 'RI Camera';
        return {
          id: stableCameraId('ri', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'RIDOT', refreshRate: 10,
          streamUrl: validStreamUrl(videoUrl), region: 'RI', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== PUERTO RICO — DTOP ArcGIS ======
async function fetchPuertoRicoCameras(): Promise<CameraResult[]> {
  // Try ArcGIS FeatureServer endpoints for PR DTOP
  const arcgisUrls = [
    'https://services.arcgis.com/0MSEUqKaxRlEPj5g/arcgis/rest/services/DTOP_Traffic_Cameras/FeatureServer/0',
    'https://services1.arcgis.com/0MSEUqKaxRlEPj5g/arcgis/rest/services/DTOP_Cameras/FeatureServer/0',
  ];
  for (const fsUrl of arcgisUrls) {
    try {
      const cameras = await fetchArcGISCameras('PR', fsUrl, {}, 'DTOP PR', 15, 'US');
      if (cameras.length > 0) return cameras;
    } catch { continue; }
  }
  // Fallback: try 511-style API
  const fallbackUrls = [
    'https://www.dtop.gov.pr/api/v2/get/cameras?key=public&format=json',
    'https://pr511.com/api/v2/get/cameras?key=public&format=json',
  ];
  for (const url of fallbackUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude, c.Longitude);
        if (!coords) return null;
        let imgUrl = '';
        if (Array.isArray(c.Views) && c.Views.length > 0) {
          imgUrl = c.Views[0].Url || '';
        }
        if (!imgUrl) imgUrl = c.Url || '';
        const name = c.Name || c.Location || 'PR Camera';
        return {
          id: stableCameraId('pr', c.Id || c.ID, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'DTOP PR', refreshRate: 15,
          region: 'PR', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== US VIRGIN ISLANDS — VITRAN ======
async function fetchUSVICameras(): Promise<CameraResult[]> {
  // Try ArcGIS and direct feed endpoints
  const arcgisUrls = [
    'https://services.arcgis.com/0MSEUqKaxRlEPj5g/arcgis/rest/services/USVI_Traffic_Cameras/FeatureServer/0',
  ];
  for (const fsUrl of arcgisUrls) {
    try {
      const cameras = await fetchArcGISCameras('VI', fsUrl, {}, 'VITRAN', 30, 'US');
      if (cameras.length > 0) return cameras;
    } catch { continue; }
  }
  // Fallback: try 511-style
  const fallbackUrls = [
    'https://www.vitransonline.com/api/v2/get/cameras?key=public&format=json',
    'https://vitransonline.com/api/cameras?format=json',
  ];
  for (const url of fallbackUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw : (raw?.CamerasList || []);
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((c: any) => {
        const coords = normalizeCoordinates(c.Latitude || c.latitude, c.Longitude || c.longitude);
        if (!coords) return null;
        const imgUrl = c.Url || c.url || c.ImageUrl || '';
        const name = c.Name || c.name || c.Location || 'USVI Camera';
        return {
          id: stableCameraId('vi', c.Id || c.id, coords.lat, coords.lng, name),
          name, lat: coords.lat, lng: coords.lng,
          imageUrl: imgUrl, source: 'VITRAN', refreshRate: 30,
          region: 'VI', country: 'US',
        } as CameraResult;
      }).filter((c): c is CameraResult => !!c && !!c.imageUrl);
    } catch { continue; }
  }
  return [];
}

// ====== GUAM — Guam DOT ======
async function fetchGuamCameras(): Promise<CameraResult[]> {
  // Try ArcGIS and direct API endpoints
  const arcgisUrls = [
    'https://services.arcgis.com/FPJlJZYRsD8OhCWA/arcgis/rest/services/Guam_Traffic_Cameras/FeatureServer/0',
    'https://services.arcgis.com/FPJlJZYRsD8OhCWA/arcgis/rest/services/DPW_Cameras/FeatureServer/0',
  ];
  for (const fsUrl of arcgisUrls) {
    try {
      const cameras = await fetchArcGISCameras('GU', fsUrl, {}, 'Guam DPW', 30, 'US');
      if (cameras.length > 0) return cameras;
    } catch { continue; }
  }
  // Windy fallback handled via Windy sources
  return [];
}

// ====== AMERICAN SAMOA — AS DOT ======
async function fetchAmericanSamoaCameras(): Promise<CameraResult[]> {
  const arcgisUrls = [
    'https://services.arcgis.com/FPJlJZYRsD8OhCWA/arcgis/rest/services/AmericanSamoa_Cameras/FeatureServer/0',
  ];
  for (const fsUrl of arcgisUrls) {
    try {
      const cameras = await fetchArcGISCameras('AS', fsUrl, {}, 'AS DOT', 60, 'US');
      if (cameras.length > 0) return cameras;
    } catch { continue; }
  }
  return [];
}

// ====== NORTHERN MARIANA ISLANDS — CNMI ======
async function fetchCNMICameras(): Promise<CameraResult[]> {
  const arcgisUrls = [
    'https://services.arcgis.com/FPJlJZYRsD8OhCWA/arcgis/rest/services/CNMI_Cameras/FeatureServer/0',
  ];
  for (const fsUrl of arcgisUrls) {
    try {
      const cameras = await fetchArcGISCameras('MP', fsUrl, {}, 'CNMI DPW', 60, 'US');
      if (cameras.length > 0) return cameras;
    } catch { continue; }
  }
  return [];
}

// ====== ALL SOURCES ======
interface SourceDef {
  name: string;
  fn: () => Promise<CameraResult[]>;
}

const allSources: SourceDef[] = [
  // === Dedicated state fetchers ===
  { name: 'CA-Caltrans', fn: fetchCaltransCameras },
  { name: 'FL-ArcGIS', fn: fetchFLDOT },
  { name: 'FL-511-API', fn: fetchFlorida511API },
  { name: 'NYC-DOT', fn: fetchNYCDOTCameras },
  { name: 'VA-GeoJSON', fn: fetch511VA },
  { name: 'OH-OHGO', fn: fetchOHCameras },
  { name: 'TN-SmartWay', fn: fetchTNCameras },
  { name: 'CO-CDOT', fn: fetchCDOT },
  { name: 'TX-Austin', fn: fetchAustinCameras },
  { name: 'MO-MoDOT', fn: fetchMOCameras },
  { name: 'OR-TripCheck', fn: fetchODOT },
  { name: 'IL-IDOT', fn: fetchIDOTCameras },
  // New dedicated fetchers
  { name: 'NV-NDOT', fn: fetchNevadaCameras },
  { name: 'TX-TxDOT-ITS', fn: fetchTxDOTITSCameras },
  { name: 'TX-Houston', fn: fetchHoustonTranStar },
  { name: 'HI-GoAkamai', fn: fetchHawaiiCameras },
  // 10 new dedicated state fetchers (CT, UT, AR, MS, WV, KS, NE, NH, ME, VT)
  { name: 'CT-CTRoads', fn: fetchConnecticutCameras },
  { name: 'UT-UDOT', fn: fetchUtahCameras },
  { name: 'AR-iDrive', fn: fetchArkansasCameras },
  { name: 'MS-MDOT', fn: fetchMississippiCameras },
  { name: 'WV-WV511', fn: fetchWestVirginiaCameras },
  { name: 'KS-KanDrive', fn: fetchKansasCameras },
  { name: 'NE-511NE', fn: fetchNebraskaCameras },
  { name: 'NH-NewEngland511', fn: fetchNewHampshireCameras },
  { name: 'ME-MaineDOT', fn: fetchMaineCameras },
  { name: 'VT-511VT', fn: fetchVermontCameras },
  // 10 final state/territory fetchers (NM, ID, MT, WY, ND, SD, AK, RI, PR, USVI)
  { name: 'NM-NMRoads', fn: fetchNewMexicoCameras },
  { name: 'ID-511Idaho', fn: fetchIdahoCameras },
  { name: 'MT-511MT', fn: fetchMontanaCameras },
  { name: 'WY-WyoRoad', fn: fetchWyomingCameras },
  { name: 'ND-NDDOT', fn: fetchNorthDakotaCameras },
  { name: 'SD-SD511', fn: fetchSouthDakotaCameras },
  { name: 'AK-511Alaska', fn: fetchAlaskaCameras },
  { name: 'RI-RIDOT', fn: fetchRhodeIslandCameras },
  { name: 'PR-DTOP', fn: fetchPuertoRicoCameras },
  { name: 'VI-VITRAN', fn: fetchUSVICameras },
  // Additional US territory fetchers
  { name: 'GU-Guam', fn: fetchGuamCameras },
  { name: 'AS-AmSamoa', fn: fetchAmericanSamoaCameras },
  { name: 'MP-CNMI', fn: fetchCNMICameras },

  // === ArcGIS FeatureServer sources (verified URLs) ===
  { name: 'WA-ArcGIS', fn: () => fetchArcGISCameras('WA', 'https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/FeatureServer/0', {}, 'WSDOT', 5) },
  { name: 'DE-DelDOT', fn: () => fetchArcGISCameras('DE', 'https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/DelDOT_Traffic_Cameras/FeatureServer/0', {}, 'DelDOT', 10) },
  { name: 'MD-ArcGIS', fn: () => fetchArcGISCameras('MD', 'https://mdgeodata.md.gov/imap/rest/services/Transportation/MD_TrafficCameras/FeatureServer/0', { lat: 'lat', lng: 'long', name: 'location', imageUrl: 'url', id: 'OBJECTID' }, 'MDSHA', 10) },
  { name: 'NC-ArcGIS', fn: () => fetchArcGISCameras('NC', 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/NCDOT_TIMSCameras/FeatureServer/0', { name: 'LOCATION', imageUrl: 'URL' }, 'NCDOT', 10) },
  { name: 'GA-ArcGIS', fn: () => fetchArcGISCameras('GA', 'https://services1.arcgis.com/2iUE8l8JKrP2tygQ/arcgis/rest/services/GDOTCameras/FeatureServer/0', {}, 'GDOT', 10) },
  { name: 'PA-ArcGIS', fn: () => fetchArcGISCameras('PA', 'https://gis.penndot.gov/arcgis/rest/services/Roadway/RealTimeTrafficCams/MapServer/0', {}, 'PennDOT', 10) },
  { name: 'NJ-ArcGIS', fn: () => fetchArcGISCameras('NJ', 'https://services.arcgis.com/HggSsUrAWCDQFxSp/arcgis/rest/services/NJDOT_Cameras/FeatureServer/0', {}, 'NJDOT', 10) },
  { name: 'LA-ArcGIS', fn: () => fetchArcGISCameras('LA', 'https://services1.arcgis.com/fXHQyq63u0UsTeSM/ArcGIS/rest/services/DOTD_Traffic_Cameras/FeatureServer/0', {}, 'LADOTD', 10) },
  { name: 'IN-ArcGIS', fn: () => fetchArcGISCameras('IN', 'https://services7.arcgis.com/JaJjFmVzJmUJ6KzX/arcgis/rest/services/INDOT_CCTV_Cameras/FeatureServer/0', {}, 'INDOT', 10) },
  { name: 'MI-ArcGIS', fn: () => fetchArcGISCameras('MI', 'https://services1.arcgis.com/j5X0zJJcFB1gGkx8/arcgis/rest/services/MDOT_CCTV/FeatureServer/0', {}, 'MDOT MI', 10) },
  { name: 'DC-ArcGIS', fn: () => fetchArcGISCameras('DC', 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/98', {}, 'DC DDOT', 10) },
  { name: 'AL-ArcGIS', fn: () => fetchArcGISCameras('AL', 'https://services.arcgis.com/LZzGHbOOMif0k3HS/arcgis/rest/services/ALDOT_Traffic_Cameras/FeatureServer/0', {}, 'ALDOT', 10) },
  { name: 'OK-ArcGIS', fn: () => fetchArcGISCameras('OK', 'https://services6.arcgis.com/RBsVb3eCTpuGkGyE/arcgis/rest/services/ODOT_Cameras/FeatureServer/0', {}, 'ODOT OK', 10) },
  { name: 'MN-ArcGIS', fn: () => fetchArcGISCameras('MN', 'https://services.arcgis.com/BXHl6RnIlNlSJfP6/arcgis/rest/services/MnDOT_CCTV_Camera_Feeds/FeatureServer/0', {}, 'MnDOT', 10) },
  { name: 'WI-ArcGIS', fn: () => fetchArcGISCameras('WI', 'https://services.arcgis.com/lQ0VYDiNPnJSVNax/arcgis/rest/services/WisDOT_CCTV_Cameras/FeatureServer/0', {}, 'WisDOT', 10) },
  { name: 'AZ-ArcGIS', fn: () => fetchArcGISCameras('AZ', 'https://services1.arcgis.com/dkO5OYmEX6oDALWS/arcgis/rest/services/ADOT_Traffic_Cameras/FeatureServer/0', {}, 'ADOT', 10) },
  { name: 'SC-ArcGIS', fn: () => fetchArcGISCameras('SC', 'https://services.arcgis.com/KuXY32AGWGA7MZwg/arcgis/rest/services/SCDOT_Traffic_Cameras/FeatureServer/0', {}, 'SCDOT', 10) },
  { name: 'KY-ArcGIS', fn: () => fetchArcGISCameras('KY', 'https://services.arcgis.com/QY1BcLgYOmEIyBFu/arcgis/rest/services/KYTC_Traffic_Cameras/FeatureServer/0', {}, 'KYTC', 10) },
  { name: 'IA-ArcGIS', fn: () => fetchArcGISCameras('IA', 'https://services.arcgis.com/8lRhdTsQyJpSRgHF/arcgis/rest/services/Iowa_DOT_CCTV/FeatureServer/0', {}, 'Iowa DOT', 10) },
  { name: 'MA-MassDOT', fn: () => fetchArcGISCameras('MA', 'https://services.arcgis.com/hGdaPuKDCrkS8GZI/arcgis/rest/services/MassDOT_CCTV_Cameras/FeatureServer/0', {}, 'MassDOT', 10) },
  // Additional ArcGIS sources for wider coverage
  { name: 'TX-Dallas', fn: () => fetchArcGISCameras('TX', 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Dallas_CCTV/FeatureServer/0', {}, 'TxDOT DFW', 10) },
  { name: 'TX-SanAntonio', fn: () => fetchArcGISCameras('TX', 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_San_Antonio_CCTV/FeatureServer/0', {}, 'TxDOT SA', 10) },
  { name: 'TX-Houston-ArcGIS', fn: () => fetchArcGISCameras('TX', 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/Houston_TranStar_Cameras/FeatureServer/0', {}, 'Houston TranStar', 5) },
  { name: 'MI-SEMCOG', fn: () => fetchArcGISCameras('MI', 'https://services1.arcgis.com/j5X0zJJcFB1gGkx8/arcgis/rest/services/SEMCOG_CCTV/FeatureServer/0', {}, 'SEMCOG', 10) },
  { name: 'MN-Metro', fn: () => fetchArcGISCameras('MN', 'https://services.arcgis.com/BXHl6RnIlNlSJfP6/arcgis/rest/services/MnDOT_Metro_CCTV/FeatureServer/0', {}, 'MnDOT Metro', 5) },
  // ArcGIS for recently-added states
  { name: 'CT-ArcGIS', fn: () => fetchArcGISCameras('CT', 'https://gisportal.dot.ct.gov/arcgis/rest/services/Traffic/TrafficCameras/FeatureServer/0', {}, 'CTDOT ArcGIS', 10) },
  { name: 'UT-ArcGIS', fn: () => fetchArcGISCameras('UT', 'https://services.arcgis.com/pA2nEVnB6tqnVbOe/arcgis/rest/services/UDOT_Traffic_Cameras/FeatureServer/0', {}, 'UDOT ArcGIS', 10) },
  { name: 'NM-ArcGIS', fn: () => fetchArcGISCameras('NM', 'https://services.arcgis.com/hOpd4HreNqPYmgY1/arcgis/rest/services/NMDOT_Traffic_Cameras/FeatureServer/0', {}, 'NMDOT ArcGIS', 10) },
  { name: 'ID-ArcGIS', fn: () => fetchArcGISCameras('ID', 'https://services.arcgis.com/FLM8UAFg4MRnoKrI/arcgis/rest/services/ITD_Traffic_Cameras/FeatureServer/0', {}, 'ITD ArcGIS', 10) },
  { name: 'MT-ArcGIS', fn: () => fetchArcGISCameras('MT', 'https://services.arcgis.com/qnjIKU1dkMOq6WSx/arcgis/rest/services/MDT_Traffic_Cameras/FeatureServer/0', {}, 'MDT ArcGIS', 15) },
  { name: 'WY-ArcGIS', fn: () => fetchArcGISCameras('WY', 'https://services.arcgis.com/NzCDhaXq2VWJ5Pv0/arcgis/rest/services/WYDOT_Cameras/FeatureServer/0', {}, 'WYDOT ArcGIS', 15) },
  { name: 'ND-ArcGIS', fn: () => fetchArcGISCameras('ND', 'https://services.arcgis.com/R3Bh5olBAPYdJWqa/arcgis/rest/services/NDDOT_Cameras/FeatureServer/0', {}, 'NDDOT ArcGIS', 15) },
  { name: 'SD-ArcGIS', fn: () => fetchArcGISCameras('SD', 'https://services.arcgis.com/JnGYrVMnOmm5zFLm/arcgis/rest/services/SDDOT_Cameras/FeatureServer/0', {}, 'SDDOT ArcGIS', 15) },
  { name: 'AK-ArcGIS', fn: () => fetchArcGISCameras('AK', 'https://services.arcgis.com/r4A0V7UzH9fcLVvv/arcgis/rest/services/AKDOT_Cameras/FeatureServer/0', {}, 'AKDOT ArcGIS', 30) },
  { name: 'RI-ArcGIS', fn: () => fetchArcGISCameras('RI', 'https://services.arcgis.com/S8zZg9pg23JUEexQ/arcgis/rest/services/RIDOT_Traffic_Cameras/FeatureServer/0', {}, 'RIDOT ArcGIS', 10) },
  { name: 'AR-ArcGIS', fn: () => fetchArcGISCameras('AR', 'https://services.arcgis.com/PwY9ZuZRDiI5nXUB/arcgis/rest/services/ArDOT_Cameras/FeatureServer/0', {}, 'ArDOT ArcGIS', 10) },
  { name: 'MS-ArcGIS', fn: () => fetchArcGISCameras('MS', 'https://services.arcgis.com/LG9Yn2oFqZi5PnO5/arcgis/rest/services/MDOT_Traffic_Cameras/FeatureServer/0', {}, 'MSDOT ArcGIS', 10) },
  { name: 'WV-ArcGIS', fn: () => fetchArcGISCameras('WV', 'https://services.arcgis.com/kpe5MwFGvZu8lCq9/arcgis/rest/services/WVDOT_Cameras/FeatureServer/0', {}, 'WVDOT ArcGIS', 10) },
  { name: 'KS-ArcGIS', fn: () => fetchArcGISCameras('KS', 'https://services.arcgis.com/Xn2K7WaEBPRcMfje/arcgis/rest/services/KDOT_Cameras/FeatureServer/0', {}, 'KDOT ArcGIS', 10) },
  { name: 'NE-ArcGIS', fn: () => fetchArcGISCameras('NE', 'https://services.arcgis.com/B4UG3FqzNFIqaop5/arcgis/rest/services/NDOR_Cameras/FeatureServer/0', {}, 'NDOR ArcGIS', 10) },
  { name: 'NH-ArcGIS', fn: () => fetchArcGISCameras('NH', 'https://services.arcgis.com/28bIiERKPTrL9Bhg/arcgis/rest/services/NHDOT_Cameras/FeatureServer/0', {}, 'NHDOT ArcGIS', 15) },
  { name: 'ME-ArcGIS', fn: () => fetchArcGISCameras('ME', 'https://services.arcgis.com/lsGSbqmhKgTSfpPe/arcgis/rest/services/MaineDOT_Cameras/FeatureServer/0', {}, 'MaineDOT ArcGIS', 15) },
  { name: 'VT-ArcGIS', fn: () => fetchArcGISCameras('VT', 'https://services.arcgis.com/EFEzjMOoqR6lHCYo/arcgis/rest/services/VTrans_Cameras/FeatureServer/0', {}, 'VTrans ArcGIS', 15) },
  // Hawaii ArcGIS sources
  { name: 'HI-ArcGIS', fn: () => fetchArcGISCameras('HI', 'https://services.arcgis.com/tNJoB1tz0Hn0Qlz6/arcgis/rest/services/HDOT_Traffic_Cameras/FeatureServer/0', {}, 'HDOT ArcGIS', 10) },
  { name: 'HI-Maui-ArcGIS', fn: () => fetchArcGISCameras('HI', 'https://services.arcgis.com/tNJoB1tz0Hn0Qlz6/arcgis/rest/services/Maui_Traffic_Cameras/FeatureServer/0', {}, 'Maui DOT', 15) },
  // Generic ArcGIS for Traffic_Cameras
  { name: 'Generic-TrafficCams', fn: () => fetchArcGISCameras('US', 'https://services.arcgis.com/8O9UlSTnqjKptoda/arcgis/rest/services/Traffic_Cameras/FeatureServer/0', {}, 'Traffic Cameras', 10) },

  // === 511 state sources ===
  { name: 'NY-511', fn: () => fetch511Cameras('NY', 'https://511ny.org', 3) },
  { name: 'NJ-511', fn: () => fetch511Cameras('NJ', 'https://511nj.org', 5) },
  { name: 'PA-511', fn: () => fetch511Cameras('PA', 'https://511pa.com', 5) },
  { name: 'MA-511', fn: () => fetch511Cameras('MA', 'https://mass511.com', 10) },
  // All states with dedicated fetchers above — only keeping non-duplicate 511 sources
  { name: 'GA-511', fn: () => fetch511Cameras('GA', 'https://511ga.org', 10) },
  { name: 'SC-511', fn: () => fetch511Cameras('SC', 'https://www.511sc.org', 10) },
  { name: 'KY-511', fn: () => fetch511Cameras('KY', 'https://511.ky.gov', 10) },
  { name: 'LA-511', fn: () => fetch511Cameras('LA', 'https://www.511la.org', 10) },
  { name: 'AZ-511', fn: () => fetch511Cameras('AZ', 'https://az511.gov', 10) },
  { name: 'HI-511', fn: () => fetch511Cameras('HI', 'https://goakamai.org', 15) },
  { name: 'IA-511', fn: () => fetch511Cameras('IA', 'https://www.511ia.org', 10) },
  { name: 'MN-511', fn: () => fetch511Cameras('MN', 'https://511mn.org', 10) },
  { name: 'WI-511', fn: () => fetch511Cameras('WI', 'https://511wi.gov', 10) },
  { name: 'DE-511', fn: () => fetch511Cameras('DE', 'https://www.deldot.gov', 10) },
  { name: 'NV-511', fn: () => fetch511Cameras('NV', 'https://www.nvroads.com', 10) },

  // === International — Dedicated fetchers ===
  { name: 'UK-Highways', fn: fetchUKCameras },
  { name: 'UK-Scotland', fn: fetchTrafficScotland },
  { name: 'NL-NDW', fn: fetchNLCameras },
  { name: 'AU-NSW', fn: fetchAUCameras },
  // European dedicated fetchers
  { name: 'DE-Autobahn', fn: fetchGermanyCameras },
  { name: 'FI-Digitraffic', fn: fetchFinlandCameras },
  { name: 'AT-ASFINAG', fn: fetchAustriaCameras },
  { name: 'ES-Valencia', fn: fetchValenciaCameras },
  { name: 'ES-Madrid', fn: fetchMadridCameras },
  { name: 'ES-Euskadi', fn: fetchEuskadi },
  { name: 'ES-Catalonia', fn: fetchCatalonia },
  { name: 'AD-Andorra', fn: fetchAndorraCameras },
  { name: 'CH-ASTRA', fn: fetchSwitzerlandCameras },
  { name: 'IT-Autostrade', fn: fetchItalyCameras },
  { name: 'FR-Traffic', fn: fetchFranceCameras },
  { name: 'BE-Verkeerscentrum', fn: fetchBelgiumCameras },
  { name: 'DK-Vejdirektoratet', fn: fetchDenmarkCameras },
  { name: 'IE-TII', fn: fetchIrelandCameras },
  { name: 'PL-GDDKiA', fn: fetchPolandCameras },
  { name: 'CZ-RSD', fn: fetchCzechCameras },
  { name: 'HR-HAK', fn: fetchCroatiaCameras },
  { name: 'SI-DARS', fn: fetchSloveniaCameras },
  { name: 'PT-IP', fn: fetchPortugalCameras },


  // === Windy worldwide regions — US cities ===
  { name: 'Windy-SanFrancisco', fn: () => fetchWindyRegion(37.77, -122.42, 80, 'CA', 'US') },
  { name: 'Windy-LA', fn: () => fetchWindyRegion(34.05, -118.24, 120, 'CA', 'US') },
  { name: 'Windy-SanDiego', fn: () => fetchWindyRegion(32.72, -117.16, 80, 'CA', 'US') },
  { name: 'Windy-Miami', fn: () => fetchWindyRegion(25.76, -80.19, 80, 'FL', 'US') },
  { name: 'Windy-Orlando', fn: () => fetchWindyRegion(28.54, -81.38, 80, 'FL', 'US') },
  { name: 'Windy-Tampa', fn: () => fetchWindyRegion(27.95, -82.46, 80, 'FL', 'US') },
  { name: 'Windy-Chicago', fn: () => fetchWindyRegion(41.88, -87.63, 100, 'IL', 'US') },
  { name: 'Windy-Houston', fn: () => fetchWindyRegion(29.76, -95.37, 100, 'TX', 'US') },
  { name: 'Windy-Dallas', fn: () => fetchWindyRegion(32.78, -96.8, 100, 'TX', 'US') },
  { name: 'Windy-SanAntonio', fn: () => fetchWindyRegion(29.42, -98.49, 80, 'TX', 'US') },
  { name: 'Windy-Austin', fn: () => fetchWindyRegion(30.27, -97.74, 60, 'TX', 'US') },
  { name: 'Windy-Denver', fn: () => fetchWindyRegion(39.74, -104.99, 100, 'CO', 'US') },
  { name: 'Windy-Nashville', fn: () => fetchWindyRegion(36.16, -86.78, 80, 'TN', 'US') },
  { name: 'Windy-Seattle', fn: () => fetchWindyRegion(47.61, -122.33, 80, 'WA', 'US') },
  { name: 'Windy-Portland', fn: () => fetchWindyRegion(45.52, -122.68, 80, 'OR', 'US') },
  { name: 'Windy-Phoenix', fn: () => fetchWindyRegion(33.45, -112.07, 100, 'AZ', 'US') },
  { name: 'Windy-Atlanta', fn: () => fetchWindyRegion(33.75, -84.39, 80, 'GA', 'US') },
  { name: 'Windy-LasVegas', fn: () => fetchWindyRegion(36.17, -115.14, 60, 'NV', 'US') },
  { name: 'Windy-NYC', fn: () => fetchWindyRegion(40.71, -74.01, 80, 'NY', 'US') },
  { name: 'Windy-Boston', fn: () => fetchWindyRegion(42.36, -71.06, 80, 'MA', 'US') },
  { name: 'Windy-Philadelphia', fn: () => fetchWindyRegion(39.95, -75.17, 80, 'PA', 'US') },
  { name: 'Windy-Detroit', fn: () => fetchWindyRegion(42.33, -83.05, 80, 'MI', 'US') },
  { name: 'Windy-Minneapolis', fn: () => fetchWindyRegion(44.98, -93.27, 80, 'MN', 'US') },
  { name: 'Windy-StLouis', fn: () => fetchWindyRegion(38.63, -90.20, 80, 'MO', 'US') },
  { name: 'Windy-KansasCity', fn: () => fetchWindyRegion(39.10, -94.58, 80, 'MO', 'US') },
  { name: 'Windy-Baltimore', fn: () => fetchWindyRegion(39.29, -76.61, 60, 'MD', 'US') },
  { name: 'Windy-DC', fn: () => fetchWindyRegion(38.91, -77.04, 60, 'DC', 'US') },
  { name: 'Windy-Charlotte', fn: () => fetchWindyRegion(35.23, -80.84, 60, 'NC', 'US') },
  { name: 'Windy-Columbus', fn: () => fetchWindyRegion(39.96, -82.99, 60, 'OH', 'US') },
  { name: 'Windy-Indianapolis', fn: () => fetchWindyRegion(39.77, -86.16, 80, 'IN', 'US') },
  { name: 'Windy-Louisville', fn: () => fetchWindyRegion(38.25, -85.76, 60, 'KY', 'US') },
  { name: 'Windy-Memphis', fn: () => fetchWindyRegion(35.15, -90.05, 60, 'TN', 'US') },
  { name: 'Windy-NewOrleans', fn: () => fetchWindyRegion(29.95, -90.07, 80, 'LA', 'US') },
  { name: 'Windy-SaltLakeCity', fn: () => fetchWindyRegion(40.76, -111.89, 80, 'UT', 'US') },
  { name: 'Windy-Albuquerque', fn: () => fetchWindyRegion(35.08, -106.65, 80, 'NM', 'US') },
  { name: 'Windy-Tucson', fn: () => fetchWindyRegion(32.22, -110.97, 60, 'AZ', 'US') },
  { name: 'Windy-Birmingham', fn: () => fetchWindyRegion(33.52, -86.80, 60, 'AL', 'US') },
  { name: 'Windy-OklahomaCity', fn: () => fetchWindyRegion(35.47, -97.52, 80, 'OK', 'US') },
  { name: 'Windy-Milwaukee', fn: () => fetchWindyRegion(43.04, -87.91, 60, 'WI', 'US') },
  { name: 'Windy-Richmond', fn: () => fetchWindyRegion(37.54, -77.44, 60, 'VA', 'US') },
  { name: 'Windy-Anchorage', fn: () => fetchWindyRegion(61.22, -149.89, 200, 'AK', 'US') },
  { name: 'Windy-ElPaso', fn: () => fetchWindyRegion(31.76, -106.44, 80, 'TX', 'US') },
  { name: 'Windy-Reno', fn: () => fetchWindyRegion(39.53, -119.81, 80, 'NV', 'US') },
  { name: 'Windy-Boise', fn: () => fetchWindyRegion(43.62, -116.21, 80, 'ID', 'US') },
  // Cities in recently-added states
  { name: 'Windy-Hartford', fn: () => fetchWindyRegion(41.76, -72.68, 60, 'CT', 'US') },
  { name: 'Windy-NewHaven', fn: () => fetchWindyRegion(41.31, -72.92, 50, 'CT', 'US') },
  { name: 'Windy-LittleRock', fn: () => fetchWindyRegion(34.75, -92.29, 80, 'AR', 'US') },
  { name: 'Windy-Jackson', fn: () => fetchWindyRegion(32.30, -90.18, 60, 'MS', 'US') },
  { name: 'Windy-Charleston-WV', fn: () => fetchWindyRegion(38.35, -81.63, 60, 'WV', 'US') },
  { name: 'Windy-Wichita', fn: () => fetchWindyRegion(37.69, -97.34, 80, 'KS', 'US') },
  { name: 'Windy-Topeka', fn: () => fetchWindyRegion(39.05, -95.68, 60, 'KS', 'US') },
  { name: 'Windy-Omaha', fn: () => fetchWindyRegion(41.26, -95.94, 80, 'NE', 'US') },
  { name: 'Windy-Lincoln', fn: () => fetchWindyRegion(40.81, -96.70, 60, 'NE', 'US') },
  { name: 'Windy-Manchester-NH', fn: () => fetchWindyRegion(42.99, -71.46, 50, 'NH', 'US') },
  { name: 'Windy-Portland-ME', fn: () => fetchWindyRegion(43.66, -70.26, 50, 'ME', 'US') },
  { name: 'Windy-Burlington-VT', fn: () => fetchWindyRegion(44.48, -73.21, 50, 'VT', 'US') },
  { name: 'Windy-Providence', fn: () => fetchWindyRegion(41.82, -71.41, 50, 'RI', 'US') },
  { name: 'Windy-SantaFe', fn: () => fetchWindyRegion(35.69, -105.94, 60, 'NM', 'US') },
  { name: 'Windy-Billings', fn: () => fetchWindyRegion(45.78, -108.50, 80, 'MT', 'US') },
  { name: 'Windy-Missoula', fn: () => fetchWindyRegion(46.87, -114.00, 60, 'MT', 'US') },
  { name: 'Windy-Cheyenne', fn: () => fetchWindyRegion(41.14, -104.82, 60, 'WY', 'US') },
  { name: 'Windy-Casper', fn: () => fetchWindyRegion(42.87, -106.31, 60, 'WY', 'US') },
  { name: 'Windy-Fargo', fn: () => fetchWindyRegion(46.88, -96.79, 60, 'ND', 'US') },
  { name: 'Windy-Bismarck', fn: () => fetchWindyRegion(46.81, -100.78, 60, 'ND', 'US') },
  { name: 'Windy-SiouxFalls', fn: () => fetchWindyRegion(43.55, -96.73, 60, 'SD', 'US') },
  { name: 'Windy-RapidCity', fn: () => fetchWindyRegion(44.08, -103.23, 60, 'SD', 'US') },
  { name: 'Windy-Fairbanks', fn: () => fetchWindyRegion(64.84, -147.72, 100, 'AK', 'US') },
  { name: 'Windy-Juneau', fn: () => fetchWindyRegion(58.30, -134.42, 80, 'AK', 'US') },
  // Hawaii islands
  { name: 'Windy-Maui', fn: () => fetchWindyRegion(20.80, -156.32, 80, 'HI', 'US') },
  { name: 'Windy-BigIsland', fn: () => fetchWindyRegion(19.72, -155.09, 120, 'HI', 'US') },
  { name: 'Windy-Kauai', fn: () => fetchWindyRegion(22.07, -159.52, 60, 'HI', 'US') },
  { name: 'Windy-Honolulu', fn: () => fetchWindyRegion(21.31, -157.86, 80, 'HI', 'US') },
  // US Territories
  { name: 'Windy-SanJuan', fn: () => fetchWindyRegion(18.47, -66.11, 100, 'PR', 'US') },
  { name: 'Windy-Ponce', fn: () => fetchWindyRegion(18.01, -66.61, 60, 'PR', 'US') },
  { name: 'Windy-Mayaguez', fn: () => fetchWindyRegion(18.20, -67.14, 60, 'PR', 'US') },
  { name: 'Windy-StThomas', fn: () => fetchWindyRegion(18.34, -64.93, 30, 'VI', 'US') },
  { name: 'Windy-StCroix', fn: () => fetchWindyRegion(17.73, -64.73, 30, 'VI', 'US') },
  { name: 'Windy-Guam', fn: () => fetchWindyRegion(13.44, 144.79, 50, 'GU', 'US') },
  { name: 'Windy-Saipan', fn: () => fetchWindyRegion(15.19, 145.75, 30, 'MP', 'US') },
  { name: 'Windy-PagoPago', fn: () => fetchWindyRegion(-14.28, -170.70, 30, 'AS', 'US') },
  // Broad regional sweeps
  { name: 'Windy-US-Southeast', fn: () => fetchWindyRegion(32.0, -84.0, 500, 'Southeast', 'US') },
  { name: 'Windy-US-Northeast', fn: () => fetchWindyRegion(41.0, -74.0, 500, 'Northeast', 'US') },
  { name: 'Windy-US-Midwest', fn: () => fetchWindyRegion(41.0, -90.0, 500, 'Midwest', 'US') },
  { name: 'Windy-US-West', fn: () => fetchWindyRegion(37.0, -119.0, 500, 'West', 'US') },
  { name: 'Windy-US-SouthCentral', fn: () => fetchWindyRegion(33.0, -97.0, 500, 'SouthCentral', 'US') },
  { name: 'Windy-US-Mountain', fn: () => fetchWindyRegion(40.0, -106.0, 500, 'Mountain', 'US') },
  // International sweeps
  { name: 'Windy-Tokyo', fn: () => fetchWindyRegion(35.68, 139.69, 150, 'Tokyo', 'JP') },
  { name: 'Windy-London', fn: () => fetchWindyRegion(51.5, -0.12, 120, 'London', 'GB') },
  { name: 'Windy-Paris', fn: () => fetchWindyRegion(48.86, 2.35, 120, 'Paris', 'FR') },
  { name: 'Windy-Berlin', fn: () => fetchWindyRegion(52.52, 13.4, 120, 'Berlin', 'DE') },
  { name: 'Windy-Toronto', fn: () => fetchWindyRegion(43.65, -79.38, 100, 'Toronto', 'CA') },
  { name: 'Windy-Sydney', fn: () => fetchWindyRegion(-33.87, 151.21, 100, 'Sydney', 'AU') },
  { name: 'Windy-Dubai', fn: () => fetchWindyRegion(25.20, 55.27, 80, 'Dubai', 'AE') },
  { name: 'Windy-Seoul', fn: () => fetchWindyRegion(37.57, 126.98, 100, 'Seoul', 'KR') },
  { name: 'Windy-Singapore', fn: () => fetchWindyRegion(1.35, 103.82, 50, 'Singapore', 'SG') },
  { name: 'Windy-MexicoCity', fn: () => fetchWindyRegion(19.43, -99.13, 120, 'MexicoCity', 'MX') },
  { name: 'Windy-SaoPaulo', fn: () => fetchWindyRegion(-23.55, -46.63, 120, 'SaoPaulo', 'BR') },

  // === Windy European coverage — Every EU/EEA country ===
  // Western Europe
  { name: 'Windy-Munich', fn: () => fetchWindyRegion(48.14, 11.58, 100, 'Munich', 'DE') },
  { name: 'Windy-Hamburg', fn: () => fetchWindyRegion(53.55, 9.99, 100, 'Hamburg', 'DE') },
  { name: 'Windy-Frankfurt', fn: () => fetchWindyRegion(50.11, 8.68, 100, 'Frankfurt', 'DE') },
  { name: 'Windy-Cologne', fn: () => fetchWindyRegion(50.94, 6.96, 80, 'Cologne', 'DE') },
  { name: 'Windy-Stuttgart', fn: () => fetchWindyRegion(48.78, 9.18, 80, 'Stuttgart', 'DE') },
  { name: 'Windy-Dusseldorf', fn: () => fetchWindyRegion(51.23, 6.78, 80, 'Dusseldorf', 'DE') },
  { name: 'Windy-Lyon', fn: () => fetchWindyRegion(45.76, 4.84, 100, 'Lyon', 'FR') },
  { name: 'Windy-Marseille', fn: () => fetchWindyRegion(43.30, 5.37, 100, 'Marseille', 'FR') },
  { name: 'Windy-Toulouse', fn: () => fetchWindyRegion(43.60, 1.44, 80, 'Toulouse', 'FR') },
  { name: 'Windy-Nice', fn: () => fetchWindyRegion(43.71, 7.26, 60, 'Nice', 'FR') },
  { name: 'Windy-Bordeaux', fn: () => fetchWindyRegion(44.84, -0.58, 80, 'Bordeaux', 'FR') },
  { name: 'Windy-Lille', fn: () => fetchWindyRegion(50.63, 3.06, 60, 'Lille', 'FR') },
  { name: 'Windy-Amsterdam', fn: () => fetchWindyRegion(52.37, 4.90, 80, 'Amsterdam', 'NL') },
  { name: 'Windy-Rotterdam', fn: () => fetchWindyRegion(51.92, 4.48, 60, 'Rotterdam', 'NL') },
  { name: 'Windy-Brussels', fn: () => fetchWindyRegion(50.85, 4.35, 80, 'Brussels', 'BE') },
  { name: 'Windy-Antwerp', fn: () => fetchWindyRegion(51.22, 4.40, 60, 'Antwerp', 'BE') },
  { name: 'Windy-Luxembourg', fn: () => fetchWindyRegion(49.61, 6.13, 50, 'Luxembourg', 'LU') },
  // Iberian Peninsula
  { name: 'Windy-Madrid', fn: () => fetchWindyRegion(40.42, -3.70, 120, 'Madrid', 'ES') },
  { name: 'Windy-Barcelona', fn: () => fetchWindyRegion(41.39, 2.17, 100, 'Barcelona', 'ES') },
  { name: 'Windy-Valencia', fn: () => fetchWindyRegion(39.47, -0.38, 80, 'Valencia', 'ES') },
  { name: 'Windy-Seville', fn: () => fetchWindyRegion(37.39, -5.98, 80, 'Seville', 'ES') },
  { name: 'Windy-Bilbao', fn: () => fetchWindyRegion(43.26, -2.93, 60, 'Bilbao', 'ES') },
  { name: 'Windy-Malaga', fn: () => fetchWindyRegion(36.72, -4.42, 60, 'Malaga', 'ES') },
  { name: 'Windy-Zaragoza', fn: () => fetchWindyRegion(41.65, -0.88, 80, 'Zaragoza', 'ES') },
  { name: 'Windy-Alicante', fn: () => fetchWindyRegion(38.35, -0.48, 60, 'Alicante', 'ES') },
  { name: 'Windy-Castellon', fn: () => fetchWindyRegion(39.99, -0.03, 60, 'Castellon', 'ES') },
  { name: 'Windy-Granada', fn: () => fetchWindyRegion(37.18, -3.60, 60, 'Granada', 'ES') },
  { name: 'Windy-Cordoba', fn: () => fetchWindyRegion(37.88, -4.78, 60, 'Cordoba', 'ES') },
  { name: 'Windy-Murcia', fn: () => fetchWindyRegion(37.98, -1.13, 60, 'Murcia', 'ES') },
  { name: 'Windy-Valladolid', fn: () => fetchWindyRegion(41.65, -4.72, 60, 'Valladolid', 'ES') },
  { name: 'Windy-Vigo', fn: () => fetchWindyRegion(42.24, -8.72, 60, 'Vigo', 'ES') },
  { name: 'Windy-ACoruna', fn: () => fetchWindyRegion(43.37, -8.40, 60, 'ACoruna', 'ES') },
  { name: 'Windy-Gijon', fn: () => fetchWindyRegion(43.54, -5.66, 60, 'Gijon', 'ES') },
  { name: 'Windy-Santander', fn: () => fetchWindyRegion(43.46, -3.80, 60, 'Santander', 'ES') },
  { name: 'Windy-Pamplona', fn: () => fetchWindyRegion(42.81, -1.64, 60, 'Pamplona', 'ES') },
  { name: 'Windy-Palma', fn: () => fetchWindyRegion(39.57, 2.65, 60, 'Palma', 'ES') },
  { name: 'Windy-LasPalmas', fn: () => fetchWindyRegion(28.10, -15.41, 80, 'LasPalmas', 'ES') },
  { name: 'Windy-Tenerife', fn: () => fetchWindyRegion(28.47, -16.25, 60, 'Tenerife', 'ES') },
  { name: 'Windy-Cadiz', fn: () => fetchWindyRegion(36.53, -6.29, 60, 'Cadiz', 'ES') },
  { name: 'Windy-SanSebastian', fn: () => fetchWindyRegion(43.32, -1.98, 50, 'SanSebastian', 'ES') },
  { name: 'Windy-Salamanca', fn: () => fetchWindyRegion(40.97, -5.66, 50, 'Salamanca', 'ES') },
  { name: 'Windy-Burgos', fn: () => fetchWindyRegion(42.34, -3.70, 50, 'Burgos', 'ES') },
  { name: 'Windy-Leon', fn: () => fetchWindyRegion(42.60, -5.57, 50, 'Leon', 'ES') },
  { name: 'Windy-Badajoz', fn: () => fetchWindyRegion(38.88, -6.97, 60, 'Badajoz', 'ES') },
  { name: 'Windy-Almeria', fn: () => fetchWindyRegion(36.83, -2.46, 50, 'Almeria', 'ES') },
  { name: 'Windy-Andorra', fn: () => fetchWindyRegion(42.51, 1.52, 30, 'Andorra', 'AD') },
  // Portugal expanded
  { name: 'Windy-Lisbon', fn: () => fetchWindyRegion(38.72, -9.14, 100, 'Lisbon', 'PT') },
  { name: 'Windy-Porto', fn: () => fetchWindyRegion(41.15, -8.61, 80, 'Porto', 'PT') },
  { name: 'Windy-Algarve', fn: () => fetchWindyRegion(37.02, -7.93, 100, 'Algarve', 'PT') },
  { name: 'Windy-Coimbra', fn: () => fetchWindyRegion(40.21, -8.43, 60, 'Coimbra', 'PT') },
  { name: 'Windy-Braga', fn: () => fetchWindyRegion(41.55, -8.43, 50, 'Braga', 'PT') },
  // France expanded
  { name: 'Windy-Nantes', fn: () => fetchWindyRegion(47.22, -1.55, 80, 'Nantes', 'FR') },
  { name: 'Windy-Strasbourg', fn: () => fetchWindyRegion(48.57, 7.75, 80, 'Strasbourg', 'FR') },
  { name: 'Windy-Montpellier', fn: () => fetchWindyRegion(43.61, 3.88, 60, 'Montpellier', 'FR') },
  { name: 'Windy-Rennes', fn: () => fetchWindyRegion(48.11, -1.68, 60, 'Rennes', 'FR') },
  { name: 'Windy-Grenoble', fn: () => fetchWindyRegion(45.19, 5.72, 60, 'Grenoble', 'FR') },
  { name: 'Windy-Dijon', fn: () => fetchWindyRegion(47.32, 5.04, 60, 'Dijon', 'FR') },
  { name: 'Windy-ClermontFerrand', fn: () => fetchWindyRegion(45.78, 3.08, 60, 'ClermontFerrand', 'FR') },
  { name: 'Windy-Rouen', fn: () => fetchWindyRegion(49.44, 1.10, 60, 'Rouen', 'FR') },
  // Italy
  { name: 'Windy-Rome', fn: () => fetchWindyRegion(41.90, 12.50, 120, 'Rome', 'IT') },
  { name: 'Windy-Milan', fn: () => fetchWindyRegion(45.46, 9.19, 100, 'Milan', 'IT') },
  { name: 'Windy-Naples', fn: () => fetchWindyRegion(40.85, 14.27, 80, 'Naples', 'IT') },
  { name: 'Windy-Turin', fn: () => fetchWindyRegion(45.07, 7.69, 80, 'Turin', 'IT') },
  { name: 'Windy-Florence', fn: () => fetchWindyRegion(43.77, 11.25, 60, 'Florence', 'IT') },
  { name: 'Windy-Venice', fn: () => fetchWindyRegion(45.44, 12.32, 60, 'Venice', 'IT') },
  { name: 'Windy-Bologna', fn: () => fetchWindyRegion(44.49, 11.34, 60, 'Bologna', 'IT') },
  // Scandinavia & Nordics
  { name: 'Windy-Stockholm', fn: () => fetchWindyRegion(59.33, 18.07, 100, 'Stockholm', 'SE') },
  { name: 'Windy-Gothenburg', fn: () => fetchWindyRegion(57.71, 11.97, 80, 'Gothenburg', 'SE') },
  { name: 'Windy-Malmo', fn: () => fetchWindyRegion(55.60, 13.00, 60, 'Malmo', 'SE') },
  { name: 'Windy-Oslo', fn: () => fetchWindyRegion(59.91, 10.75, 100, 'Oslo', 'NO') },
  { name: 'Windy-Bergen', fn: () => fetchWindyRegion(60.39, 5.32, 80, 'Bergen', 'NO') },
  { name: 'Windy-Trondheim', fn: () => fetchWindyRegion(63.43, 10.40, 60, 'Trondheim', 'NO') },
  { name: 'Windy-Copenhagen', fn: () => fetchWindyRegion(55.68, 12.57, 80, 'Copenhagen', 'DK') },
  { name: 'Windy-Helsinki', fn: () => fetchWindyRegion(60.17, 24.94, 80, 'Helsinki', 'FI') },
  { name: 'Windy-Tampere', fn: () => fetchWindyRegion(61.50, 23.79, 60, 'Tampere', 'FI') },
  { name: 'Windy-Reykjavik', fn: () => fetchWindyRegion(64.15, -21.94, 80, 'Reykjavik', 'IS') },
  // Central Europe
  { name: 'Windy-Vienna', fn: () => fetchWindyRegion(48.21, 16.37, 100, 'Vienna', 'AT') },
  { name: 'Windy-Salzburg', fn: () => fetchWindyRegion(47.80, 13.04, 60, 'Salzburg', 'AT') },
  { name: 'Windy-Innsbruck', fn: () => fetchWindyRegion(47.26, 11.39, 60, 'Innsbruck', 'AT') },
  { name: 'Windy-Zurich', fn: () => fetchWindyRegion(47.38, 8.54, 80, 'Zurich', 'CH') },
  { name: 'Windy-Geneva', fn: () => fetchWindyRegion(46.20, 6.14, 60, 'Geneva', 'CH') },
  { name: 'Windy-Bern', fn: () => fetchWindyRegion(46.95, 7.45, 60, 'Bern', 'CH') },
  { name: 'Windy-Prague', fn: () => fetchWindyRegion(50.08, 14.44, 100, 'Prague', 'CZ') },
  { name: 'Windy-Brno', fn: () => fetchWindyRegion(49.20, 16.61, 60, 'Brno', 'CZ') },
  { name: 'Windy-Warsaw', fn: () => fetchWindyRegion(52.23, 21.01, 100, 'Warsaw', 'PL') },
  { name: 'Windy-Krakow', fn: () => fetchWindyRegion(50.06, 19.94, 80, 'Krakow', 'PL') },
  { name: 'Windy-Wroclaw', fn: () => fetchWindyRegion(51.11, 17.04, 60, 'Wroclaw', 'PL') },
  { name: 'Windy-Gdansk', fn: () => fetchWindyRegion(54.35, 18.65, 60, 'Gdansk', 'PL') },
  { name: 'Windy-Bratislava', fn: () => fetchWindyRegion(48.15, 17.11, 60, 'Bratislava', 'SK') },
  { name: 'Windy-Budapest', fn: () => fetchWindyRegion(47.50, 19.04, 100, 'Budapest', 'HU') },
  // Southeast Europe
  { name: 'Windy-Ljubljana', fn: () => fetchWindyRegion(46.06, 14.51, 60, 'Ljubljana', 'SI') },
  { name: 'Windy-Zagreb', fn: () => fetchWindyRegion(45.81, 15.98, 80, 'Zagreb', 'HR') },
  { name: 'Windy-Split', fn: () => fetchWindyRegion(43.51, 16.44, 60, 'Split', 'HR') },
  { name: 'Windy-Belgrade', fn: () => fetchWindyRegion(44.79, 20.47, 80, 'Belgrade', 'RS') },
  { name: 'Windy-Bucharest', fn: () => fetchWindyRegion(44.43, 26.10, 100, 'Bucharest', 'RO') },
  { name: 'Windy-Sofia', fn: () => fetchWindyRegion(42.70, 23.32, 80, 'Sofia', 'BG') },
  { name: 'Windy-Athens', fn: () => fetchWindyRegion(37.98, 23.73, 100, 'Athens', 'GR') },
  { name: 'Windy-Thessaloniki', fn: () => fetchWindyRegion(40.64, 22.94, 60, 'Thessaloniki', 'GR') },
  { name: 'Windy-Istanbul', fn: () => fetchWindyRegion(41.01, 28.98, 120, 'Istanbul', 'TR') },
  { name: 'Windy-Ankara', fn: () => fetchWindyRegion(39.93, 32.87, 80, 'Ankara', 'TR') },
  // Baltic States
  { name: 'Windy-Tallinn', fn: () => fetchWindyRegion(59.44, 24.75, 60, 'Tallinn', 'EE') },
  { name: 'Windy-Riga', fn: () => fetchWindyRegion(56.95, 24.11, 60, 'Riga', 'LV') },
  { name: 'Windy-Vilnius', fn: () => fetchWindyRegion(54.69, 25.28, 60, 'Vilnius', 'LT') },
  // UK & Ireland expanded
  { name: 'Windy-Manchester', fn: () => fetchWindyRegion(53.48, -2.24, 80, 'Manchester', 'GB') },
  { name: 'Windy-Birmingham-UK', fn: () => fetchWindyRegion(52.49, -1.89, 80, 'Birmingham', 'GB') },
  { name: 'Windy-Edinburgh', fn: () => fetchWindyRegion(55.95, -3.19, 60, 'Edinburgh', 'GB') },
  { name: 'Windy-Glasgow', fn: () => fetchWindyRegion(55.86, -4.25, 60, 'Glasgow', 'GB') },
  { name: 'Windy-Leeds', fn: () => fetchWindyRegion(53.80, -1.55, 60, 'Leeds', 'GB') },
  { name: 'Windy-Cardiff', fn: () => fetchWindyRegion(51.48, -3.18, 60, 'Cardiff', 'GB') },
  { name: 'Windy-Dublin', fn: () => fetchWindyRegion(53.35, -6.26, 80, 'Dublin', 'IE') },
  { name: 'Windy-Cork', fn: () => fetchWindyRegion(51.90, -8.47, 60, 'Cork', 'IE') },
  // Mediterranean islands
  { name: 'Windy-Nicosia', fn: () => fetchWindyRegion(35.17, 33.36, 50, 'Nicosia', 'CY') },
  { name: 'Windy-Malta', fn: () => fetchWindyRegion(35.90, 14.51, 30, 'Malta', 'MT') },
  // Broad European sweeps
  { name: 'Windy-EU-Central', fn: () => fetchWindyRegion(48.5, 10.0, 500, 'CentralEU', 'EU') },
  { name: 'Windy-EU-South', fn: () => fetchWindyRegion(42.0, 14.0, 500, 'SouthEU', 'EU') },
  { name: 'Windy-EU-North', fn: () => fetchWindyRegion(58.0, 15.0, 500, 'NorthEU', 'EU') },
  { name: 'Windy-EU-East', fn: () => fetchWindyRegion(48.0, 22.0, 500, 'EastEU', 'EU') },
  { name: 'Windy-EU-Iberia', fn: () => fetchWindyRegion(40.0, -3.5, 400, 'Iberia', 'EU') },
  { name: 'Windy-EU-Balkans', fn: () => fetchWindyRegion(43.0, 20.0, 400, 'Balkans', 'EU') },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sourceName = body?.source;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const sourcesToSync = sourceName
      ? allSources.filter(s => s.name === sourceName)
      : allSources;

    const BATCH_SIZE = 8;
    const results: { name: string; count: number; error?: string; durationMs: number }[] = [];

    for (let i = 0; i < sourcesToSync.length; i += BATCH_SIZE) {
      const batch = sourcesToSync.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (src) => {
          const start = Date.now();
          try {
            let cameras = await src.fn();
            // Deduplicate by id to prevent "cannot affect row a second time" errors
            const seenIds = new Set<string>();
            cameras = cameras.filter(c => {
              if (seenIds.has(c.id)) return false;
              seenIds.add(c.id);
              return true;
            });
            const durationMs = Date.now() - start;
            console.log(`[${src.name}] ${cameras.length} cameras in ${durationMs}ms`);

            if (cameras.length > 0) {
              // For FL-ArcGIS: delete old fl- rows first (replace mode) to clear stale collapsed IDs
              if (src.name === 'FL-ArcGIS') {
                const { error: delErr } = await supabase
                  .from('camera_catalog')
                  .delete()
                  .eq('source', 'FL511');
                if (delErr) console.warn(`[${src.name}] Cleanup warning: ${delErr.message}`);
                else console.log(`[${src.name}] Cleared old FL511 rows for clean re-insert`);
              }

              let upsertErrors = 0;
              for (let j = 0; j < cameras.length; j += 500) {
                const chunk = cameras.slice(j, j + 500).map(c => ({
                  id: c.id,
                  name: c.name,
                  lat: c.lat,
                  lng: c.lng,
                  image_url: c.imageUrl,
                  source: c.source,
                  stream_url: c.streamUrl || null,
                  refresh_rate: c.refreshRate || 10,
                  region: c.region || null,
                  country: c.country || 'US',
                  last_seen_at: new Date().toISOString(),
                  feed_status: 'unknown',
                }));
                const { error: upsertErr } = await supabase.from('camera_catalog').upsert(chunk, { onConflict: 'id' });
                if (upsertErr) {
                  console.error(`[${src.name}] Upsert error (batch ${j}): ${upsertErr.message}`);
                  upsertErrors++;
                }
              }
              if (upsertErrors > 0) {
                throw new Error(`${upsertErrors} upsert batch(es) failed`);
              }
            }

            await supabase.from('camera_sync_status').upsert({
              source_name: src.name,
              last_sync_at: new Date().toISOString(),
              last_success_at: cameras.length > 0 ? new Date().toISOString() : undefined,
              last_error: cameras.length === 0 ? 'No cameras returned' : null,
              camera_count: cameras.length,
              sync_duration_ms: durationMs,
            }, { onConflict: 'source_name' });

            return { name: src.name, count: cameras.length, durationMs };
          } catch (err: any) {
            const durationMs = Date.now() - start;
            console.error(`[${src.name}] ERROR: ${err.message}`);
            await supabase.from('camera_sync_status').upsert({
              source_name: src.name,
              last_sync_at: new Date().toISOString(),
              last_error: err.message,
              camera_count: 0,
              sync_duration_ms: durationMs,
            }, { onConflict: 'source_name' });
            return { name: src.name, count: 0, error: err.message, durationMs };
          }
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
        else results.push({ name: 'unknown', count: 0, error: String(r.reason), durationMs: 0 });
      }
    }

    const totalCameras = results.reduce((s, r) => s + r.count, 0);
    console.log(`Sync complete: ${totalCameras} cameras from ${results.length} sources`);

    return new Response(
      JSON.stringify({ success: true, totalCameras, sources: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Sync error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
