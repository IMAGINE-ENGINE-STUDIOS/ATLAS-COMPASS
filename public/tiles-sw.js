/* Atlas tile cache — session smoother for 3D tiles + imagery.
 * Important: the network response is never blocked by CacheStorage writes.
 * Stale tiles are served instantly, fresh tiles stream directly to Cesium, and
 * cache maintenance is batched so rapid camera movement cannot freeze loading.
 */
const CACHE = "atlas-tiles-v2";
const MAX_ENTRIES = 1800;
const TRIM_EVERY_PUTS = 25;
const MAX_CACHEABLE_BYTES = 32 * 1024 * 1024;

const TILE_HOST_RE = /(assets\.ion\.cesium\.com|assets\.cesium\.com|api\.cesium\.com|tile\.googleapis\.com|tile\.openstreetmap\.org|data\.osmbuildings\.org)/i;
const TILE_PATH_RE = /\/functions\/v1\/google-3d-tiles\//i;
const TILE_EXT_RE = /\.(glb|b3dm|i3dm|pnts|cmpt|terrain|json|jpg|jpeg|png|webp|ktx2|bin)(\?|$)/i;

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
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const toDelete = keys.length - MAX_ENTRIES;
  for (let i = 0; i < toDelete; i += 1) {
    await cache.delete(keys[i]);
  }
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
    const cache = await caches.open(CACHE);
    await cache.put(req, res.clone());
    await scheduleTrim(cache);
  } catch {}
  finally { activeCacheWrites = Math.max(0, activeCacheWrites - 1); }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (!shouldCache(req.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreVary: true });
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
      return new Response("", { status: 504, statusText: "tile offline" });
    }
  })());
});