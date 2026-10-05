// Mishwar's service worker (offline-first-pwa skill). Hand-written, no build step.
//
//   pages and their data (RSC)   network first; the last copy when there is no network;
//                                a short Arabic page when this phone never opened them
//   /_next/static/* (hashed)     cache first: the hash in the name means it never changes
//   /api/photos/<hash>           cache first, in the same cache the app fills (photos-v1)
//   map tiles                    cached as they are viewed, at most MAX_TILES of them
//   every other /api/*           never touched, never cached: always the live server
//
// Bump VERSION to drop the old page and asset caches on the next visit.
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const TILES = "tiles-v1";
const PHOTOS = "photos-v1";
const KEEP = [PAGES, STATIC, TILES, PHOTOS];
const OFFLINE_URL = "/offline";
const TILE_HOST = "tile.openstreetmap.org";
const MAX_TILES = 600;
// A transparent 1x1 PNG: what a tile that can't be loaded looks like. No broken images.
const EMPTY_TILE = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function tile(request) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone()).catch(() => {});
      trimTiles(cache);
    }
    return response;
  } catch {
    return new Response(EMPTY_TILE, { headers: { "content-type": "image/png" } });
  }
}

// Keys come back oldest first: drop the oldest when the cache passes its limit.
let trimming = false;
async function trimTiles(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await cache.delete(key);
  } finally {
    trimming = false;
  }
}

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    // Only plain, complete answers are kept: never a redirect, never an error page.
    if (response.ok && response.type === "basic" && !response.redirected) {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (request.mode === "navigate") {
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === TILE_HOST) return event.respondWith(tile(request));
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(STATIC, request));
  if (url.pathname.startsWith("/api/photos/")) return event.respondWith(cacheFirst(PHOTOS, request));
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  event.respondWith(page(request));
});

self.addEventListener("message", (event) => {
  const message = event.data || {};
  // Logout or another account: the pages kept on the phone belonged to someone else.
  if (message.type === "purge-pages") {
    event.waitUntil(
      caches.open(PAGES).then(async (cache) => {
        for (const key of await cache.keys()) {
          if (new URL(key.url).pathname !== OFFLINE_URL) await cache.delete(key);
        }
      }),
    );
  }
  // The very first visit loaded before this worker was in control. The page sends what it
  // loaded, and we keep copies (from the browser's own cache), so a reload works offline.
  if (message.type === "warm" && Array.isArray(message.urls)) {
    event.waitUntil(
      (async () => {
        for (const raw of message.urls.slice(0, 200)) {
          try {
            const url = new URL(raw, self.location.origin);
            if (url.origin !== self.location.origin) continue;
            const isStatic = url.pathname.startsWith("/_next/static/");
            if (!isStatic && url.pathname.startsWith("/api/")) continue;
            const cache = await caches.open(isStatic ? STATIC : PAGES);
            if (await cache.match(url.href)) continue;
            const response = await fetch(url.href, { credentials: "same-origin" });
            if (response.ok && response.type === "basic" && !response.redirected) await cache.put(url.href, response);
          } catch {
            /* offline, or gone: nothing to keep */
          }
        }
      })(),
    );
  }
});
