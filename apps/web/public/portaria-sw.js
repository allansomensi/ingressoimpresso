// Door service worker (ADRs 0006, 0009; invariant 8): keeps the door app available offline.
//
// Scope `/portaria`. Only same-origin GET requests are handled; the API lives on another origin
// and is never cached. Build files under /_next/static/ are content hashed, so they are served
// cache first; the door page is network first with a short timeout and the cache as fallback.
// The page sends the list of resources it loaded ("cache" message) so the next open works offline.

const CACHE = "portaria-v1";
const PAGE = "/portaria";
const PAGE_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(PAGE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        // Only our own old versions: "app-*" belongs to the site's worker (/sw.js).
        if (key !== CACHE && key.startsWith("portaria-")) {
          await caches.delete(key);
        }
      }
      await self.clients.claim();
    })(),
  );
});

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

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    if (response.ok) {
      await cache.put(PAGE, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(PAGE);
    if (cached !== undefined) {
      return cached;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate" && (url.pathname === PAGE || url.pathname.startsWith(`${PAGE}/`))) {
    event.respondWith(networkFirst(request));
  } else {
    // Icons, manifest: network, or the copy kept by a "cache" message.
    event.respondWith(fetch(request).catch(async (error) => (await caches.match(request)) ?? Promise.reject(error)));
  }
});

// { type: "cache", urls: string[] } → { missing: number }: stores every resource of the page.
self.addEventListener("message", (event) => {
  const data = event.data;
  const port = event.ports[0];
  if (data === null || typeof data !== "object" || data.type !== "cache" || !Array.isArray(data.urls) || !port) {
    return;
  }
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let missing = 0;
      for (const raw of data.urls) {
        if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
          continue;
        }
        const parsed = new URL(raw, self.location.origin);
        if (parsed.origin !== self.location.origin) {
          continue;
        }
        const url = parsed.pathname + parsed.search;
        const key = url === PAGE || url.startsWith(`${PAGE}?`) || url.startsWith(`${PAGE}/`) ? PAGE : url;
        if ((await cache.match(key)) !== undefined) {
          continue;
        }
        try {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok) {
            await cache.put(key, response);
          } else {
            missing += 1;
          }
        } catch {
          missing += 1;
        }
      }
      port.postMessage({ missing });
    })(),
  );
});
