// Mishwar's service worker (offline-first-pwa skill). Hand-written, no build step.
//
//   pages (navigations)          network first, but never longer than PAGE_WAIT_MS when a
//                                copy is on the phone; the copy when there is no network;
//                                the same screen without its ?query when only that is kept;
//                                a short Arabic page only for a screen this phone never had
//   page data for in-app links   network first, then the exact copy; with neither, the
//   (RSC requests)               error makes Next.js load the page itself, from the cache
//   /_next/static/* (hashed)     cache first: the hash in the name means it never changes
//   /api/photos/<hash>           cache first, in the same cache the app fills (photos-v1)
//   map tiles                    cached as they are viewed, at most MAX_TILES of them
//   every other /api/*           never touched: the app keeps its own data in IndexedDB
//                                (lib/sync.ts, the outbox), so it shows the last-known data
//                                first and refreshes behind it (stale-while-revalidate)
//
// Every screen, not only the ones opened: the page sends "precache" with the screens of
// its role (and the requests, chats and routes in the phone's data). We fetch each one
// with its scripts and styles, so a tab never opened before still opens with no network.
// A screen already kept is fetched again only when the build or the account changed.
//
// Updates: a new sw.js installs, takes over at once (skipWaiting + clients.claim) and
// drops the caches of the old VERSION; the page reloads itself once (ServiceWorker.tsx).
// Bump VERSION when this file's caching rules change.
const VERSION = "v2";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const TILES = "tiles-v1";
const PHOTOS = "photos-v1";
const KEEP = [PAGES, STATIC, TILES, PHOTOS];
const OFFLINE_URL = "/offline";
// Guest-safe screens kept at install, before the page has said who is signed in.
const SHELL = [OFFLINE_URL, "/", "/search", "/login", "/manifest.webmanifest"];
// Which build and account the kept screens belong to (a fake URL inside PAGES).
const STAMP_URL = "/__mishwar-precache";
const PAGE_WAIT_MS = 4000;
const TILE_HOST = "tile.openstreetmap.org";
const MAX_TILES = 600;
// A transparent 1x1 PNG: what a tile that can't be loaded looks like. No broken images.
const EMPTY_TILE = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

// A new version keeps the same screens the old one had, before the old caches go: fetched
// again when there is a network, copied over from the old caches when there is not.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      const names = await caches.keys();
      const oldPages = names.filter((n) => n.startsWith("pages-") && n !== PAGES);
      const oldStatic = names.filter((n) => n.startsWith("static-") && n !== STATIC);
      let before = null;
      for (const name of oldPages) {
        const stamp = await (await caches.open(name)).match(STAMP_URL);
        if (stamp) before = await readStamp(stamp);
      }
      let complete = true;
      for (const url of new Set([...SHELL, ...(before?.urls ?? [])])) {
        try {
          await keepPage(cache, url);
        } catch {
          complete = false;
          break;
        }
      }
      if (complete && before) await cache.put(STAMP_URL, stampResponse(before.stamp, before.urls));
      if (!complete) {
        await copyMissing(oldPages, PAGES);
        await copyMissing(oldStatic, STATIC);
      }
    })()
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

async function copyMissing(from, to) {
  const target = await caches.open(to);
  for (const name of from) {
    const source = await caches.open(name);
    for (const key of await source.keys()) {
      if (await target.match(key)) continue;
      const response = await source.match(key);
      if (response) await target.put(key, response);
    }
  }
}

// The stamp: which build and account the kept screens are for, and which screens.
const stampResponse = (stamp, urls) => new Response(JSON.stringify({ stamp, urls }), { headers: { "content-type": "application/json" } });
const readStamp = (response) => response.json().catch(() => null);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

const isKeepable = (response) => response.ok && response.type === "basic" && !response.redirected;

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone()).catch(() => {});
  return response;
}

// Every /_next/static/ file a page or a stylesheet names (scripts, styles, fonts).
const STATIC_REF = /\/_next\/static\/[^"'\s()\\<>]+/g;

async function keepStatic(text, depth = 0) {
  const cache = await caches.open(STATIC);
  for (const path of new Set(text.match(STATIC_REF) ?? [])) {
    if (await cache.match(path)) continue;
    try {
      const response = await fetch(path);
      if (!isKeepable(response)) continue;
      if (depth === 0 && path.endsWith(".css")) await keepStatic(await response.clone().text(), 1);
      await cache.put(path, response);
    } catch {
      return; // the network went: stop, the next precache carries on
    }
  }
}

// Fetches one screen as a full page and keeps it with everything it needs to run.
async function keepPage(cache, url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!isKeepable(response)) return false;
  const html = (response.headers.get("content-type") ?? "").includes("text/html") ? await response.clone().text() : "";
  await cache.put(url, response);
  if (html) await keepStatic(html);
  return true;
}

let precaching = Promise.resolve();
function precache(stamp, urls) {
  precaching = precaching.then(async () => {
    const cache = await caches.open(PAGES);
    const old = await cache.match(STAMP_URL).then((r) => (r ? readStamp(r) : null));
    const all = old?.stamp !== stamp; // a new build or another account: fetch every screen again
    const kept = [];
    let complete = true;
    for (const raw of urls.slice(0, 60)) {
      const url = new URL(raw, self.location.origin);
      if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) continue;
      const path = url.pathname + url.search;
      kept.push(path);
      if (!all && (await cache.match(path, { ignoreVary: true }))) continue;
      try {
        await keepPage(cache, path);
      } catch {
        complete = false; // no network: try again on the next visit
        break;
      }
    }
    if (complete) await cache.put(STAMP_URL, stampResponse(stamp, kept));
    for (const client of await self.clients.matchAll()) client.postMessage({ type: "precached", stamp, complete });
  });
  return precaching;
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

const wait = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

async function page(request) {
  const cache = await caches.open(PAGES);
  const navigate = request.mode === "navigate";
  const network = fetch(request).then(async (response) => {
    // Only plain, complete answers are kept: never a redirect, never an error page.
    if (isKeepable(response)) await cache.put(request, response.clone()).catch(() => {});
    return response;
  });
  // A page request never carries the RSC header, so its copy may ignore Vary; the
  // screen without its query (/trips for /trips?b=…) is the next best thing.
  const kept = async () => {
    if (!navigate) return cache.match(request);
    const url = new URL(request.url);
    return (await cache.match(request, { ignoreVary: true })) ?? (await cache.match(url.pathname, { ignoreVary: true }));
  };

  if (navigate) {
    // A weak network must not hold the screen hostage when a copy is on the phone.
    const first = await Promise.race([network.catch(() => null), wait(PAGE_WAIT_MS)]);
    if (first && first.status < 500) return first;
    const copy = await kept();
    if (copy) return copy;
    if (first) return first;
    try {
      return await network;
    } catch {
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }
  }
  try {
    return await network;
  } catch (error) {
    const copy = await kept();
    if (copy) return copy;
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
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js" || url.pathname === STAMP_URL) return;
  event.respondWith(page(request));
});

self.addEventListener("message", (event) => {
  const message = event.data || {};
  // Logout or another account: the pages kept on the phone belonged to someone else.
  // In line with precaching, so a precache already running can't refill it half-way.
  if (message.type === "purge-pages") {
    precaching = precaching.then(() =>
      caches.open(PAGES).then(async (cache) => {
        for (const key of await cache.keys()) {
          if (new URL(key.url).pathname !== OFFLINE_URL) await cache.delete(key);
        }
      }),
    );
    event.waitUntil(precaching);
  }
  // Every screen of this role, so each one opens with no network (see the top).
  if (message.type === "precache" && typeof message.stamp === "string" && Array.isArray(message.urls)) {
    event.waitUntil(precache(message.stamp, message.urls));
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
            if (isKeepable(response)) await cache.put(url.href, response);
          } catch {
            /* offline, or gone: nothing to keep */
          }
        }
      })(),
    );
  }
});
