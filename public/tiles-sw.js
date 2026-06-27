/* Atlas tile cache — caches 3D tile + imagery responses so revisits are instant.
 * Cache-first with background revalidation. Trims to MAX_ENTRIES (LRU-ish). */
const CACHE = "atlas-tiles-v1";
const MAX_ENTRIES = 1500;

const TILE_HOST_RE = /(assets\.ion\.cesium\.com|assets\.cesium\.com|api\.cesium\.com|tile\.googleapis\.com|tile\.openstreetmap\.org|data\.osmbuildings\.org)/i;
const TILE_PATH_RE = /\/functions\/v1\/google-3d-tiles\//i;
const TILE_EXT_RE = /\.(glb|b3dm|i3dm|pnts|cmpt|terrain|json|jpg|jpeg|png|webp|ktx2|bin)(\?|$)/i;

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
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

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const toDelete = keys.length - MAX_ENTRIES;
  for (let i = 0; i < toDelete; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (!shouldCache(req.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreVary: true });
    const network = fetch(req).then(async (res) => {
      if (res && res.ok && (res.type === "basic" || res.type === "cors" || res.type === "default")) {
        try {
          await cache.put(req, res.clone());
          trim(cache);
        } catch {}
      }
      return res;
    }).catch(() => null);

    if (cached) {
      // Refresh in background, serve cached immediately.
      event.waitUntil(network);
      return cached;
    }
    const res = await network;
    return res || new Response("", { status: 504, statusText: "tile offline" });
  })());
});
