/* Atlas tile cache — session smoother for 3D tiles + imagery.
 * Important: the network response is never blocked by CacheStorage writes.
 * Stale tiles are served instantly, fresh tiles stream directly to Cesium, and
 * cache maintenance is batched so rapid camera movement cannot freeze loading.
 */
// v6 — larger persistent tile cache on the user's disk so revisits and
// higher-LOD walks are instant. CacheStorage is durable across reloads and
// tabs; Chrome will only evict under global storage pressure.
const CACHE = "atlas-tiles-v7";
const MAX_ENTRIES = 8000;
const TRIM_EVERY_PUTS = 100;
const MAX_CACHEABLE_BYTES = 96 * 1024 * 1024;

const TILE_HOST_RE = /(assets\.ion\.cesium\.com|assets\.cesium\.com|api\.cesium\.com|tile\.googleapis\.com|tile\.openstreetmap\.org|data\.osmbuildings\.org|trek\.nasa\.gov)/i;
const TILE_PATH_RE = /\/functions\/v1\/google-3d-tiles\//i;
const TILE_EXT_RE = /\.(glb|b3dm|i3dm|pnts|cmpt|terrain|json|jpg|jpeg|png|webp|ktx2|bin)(\?|$)/i;
// Tileset manifest / root docs: these carry session tokens & child-tile URLs
// that MUST be fresh. Serving a stale one from cache causes 404 cascades on
// every child tile until the background revalidation completes.
const MANIFEST_RE = /\.json(\?|$)/i;

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function shouldCache(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (TILE_HOST_RE.test(u.hostname)) return true;
    if (TILE_PATH_RE.test(u.pathname)) return true;
    if (TILE_EXT_RE.test(u.pathname)) return true;
    return false;
  } catch { return false; }
}

function isCacheableResponse(res) {
  if (!res || !res.ok) return false;
  if (!(res.type === "basic" || res.type === "cors" || res.type === "default")) return false;
  const len = Number(res.headers.get("content-length") || "0");
  return !len || len <= MAX_CACHEABLE_BYTES;
}

let putsSinceLastTrim = 0;
let trimPromise = null;
let activeCacheWrites = 0;
let cachePromise = null;

function getCache() {
  if (!cachePromise) cachePromise = caches.open(CACHE);
  return cachePromise;
}
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const toDelete = keys.length - MAX_ENTRIES;
  // Parallelize deletes — a serial loop at 1800 entries could stall the SW
  // event loop for hundreds of ms and starve concurrent tile fetches.
  await Promise.all(keys.slice(0, toDelete).map((k) => cache.delete(k)));
}

function scheduleTrim(cache) {
  putsSinceLastTrim += 1;
  if (putsSinceLastTrim < TRIM_EVERY_PUTS || trimPromise) return trimPromise || Promise.resolve();
  putsSinceLastTrim = 0;
  trimPromise = trim(cache).catch(() => {}).finally(() => { trimPromise = null; });
  return trimPromise;
}

async function cacheInBackground(req, res) {
  if (!isCacheableResponse(res)) return;
  if (activeCacheWrites >= 4) return;
  activeCacheWrites += 1;
  try {
    const cache = await getCache();
    await cache.put(req, res.clone());
    await scheduleTrim(cache);
  } catch {}
  finally { activeCacheWrites = Math.max(0, activeCacheWrites - 1); }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (!shouldCache(req.url)) return;

  const isManifest = MANIFEST_RE.test(new URL(req.url).pathname);

  event.respondWith((async () => {
    const cache = await getCache();
    // For manifests: skip the cache entirely on the read path. Manifests are
    // small (a few KB) and always network-first so Cesium can never receive a
    // stale session token or a stale child-tile URL. The response is still
    // cached in the background as an offline fallback (see below).
    const cached = isManifest ? null : await cache.match(req, { ignoreVary: true });
    const networkPromise = fetch(req).then((res) => {
      // Do not await/cache inside the response path: Cesium must receive the
      // network stream immediately, otherwise tile loading appears stalled.
      cacheInBackground(req, res.clone()).catch(() => {});
      return res;
    });

    if (cached) {
      event.waitUntil(networkPromise.catch(() => null));
      return cached;
    }

    try {
      return await networkPromise;
    } catch {
      // Only manifests reach here after network failure — fall back to any
      // stale cached copy as a last resort so the app doesn't crash offline.
      if (isManifest) {
        const stale = await cache.match(req, { ignoreVary: true });
        if (stale) return stale;
      }
      return new Response("", { status: 504, statusText: "tile offline" });
    }
  })());
});