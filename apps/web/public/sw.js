// Service worker of the site and panel (ADR 0021): makes the app installable and gives it an
// offline page. The door (/portaria) has its own worker with a narrower scope (ADR 0018); this one
// never answers its requests. The API lives on another origin and is never cached.
//
// Build files under /_next/static/ are content hashed: cache first. Icons and brand files: cache,
// refreshed in the background. Pages always come from the network (an old copy could point at
// build files that no longer exist after a deploy); without network, the offline page.

const CACHE = "app-v1";
const OFFLINE = "/offline";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/brand/logo-mark.svg"];
const PAGE_TIMEOUT_MS = 8000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        // Keep the door's cache: it belongs to the other worker.
        if (key !== CACHE && key.startsWith("app-")) {
          await caches.delete(key);
        }
      }
      await self.clients.claim();
    })(),
  );
});

function isDoor(url) {
  return url.pathname === "/portaria" || url.pathname.startsWith("/portaria/") || url.pathname.startsWith("/portaria-");
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached !== undefined) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await refresh) ?? Response.error();
}

async function page(request) {
  try {
    return await fetch(request, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
  } catch {
    return (await caches.match(OFFLINE)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isDoor(url)) {
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(page(request));
  } else if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
