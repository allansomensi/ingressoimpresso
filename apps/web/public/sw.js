// Service worker of the site and panel (ADR 0021): makes the app installable and gives it an
// offline page. The door (/portaria) has its own worker with a narrower scope (ADR 0018); this one
// never answers its requests. The API lives on another origin and is never cached.
//
// Build files under /_next/static/ are content hashed: cache first. Icons, brand files and the
// ticket typefaces (/fonts/): cache, refreshed in the background. Pages always come from the network (an old copy could point at
// build files that no longer exist after a deploy); without network, the offline page.
//
// The digital ticket (/ingresso, ADR 0030) is the exception: the holder opens it at the door, often
// without signal. Its page and build files are kept (refreshed on every online visit), and the
// ticket itself is in the page's localStorage.

const CACHE = "app-v3";
const OFFLINE = "/offline";
const TICKET = "/ingresso";
const PRECACHE = [OFFLINE, TICKET, "/icons/icon-192.png", "/brand/logo-mark.svg"];
const PAGE_TIMEOUT_MS = 8000;
const MAX_ENTRIES = 250;

/** Build files the offline and ticket pages need (styles, fonts, scripts), read from their HTML. */
async function offlineAssets(cache) {
  const assets = new Set();
  for (const path of [OFFLINE, TICKET]) {
    const page = await cache.match(path);
    const html = page === undefined ? "" : await page.text();
    for (const asset of html.match(/\/_next\/static\/[^"'\s)]+/g) ?? []) {
      assets.add(asset);
    }
  }
  return assets;
}

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(PRECACHE);
  await cache.addAll([...(await offlineAssets(cache))]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precache()
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

/** Keeps the cache bounded: every deploy brings new build files; the oldest ones go first. */
async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  if (extra <= 0) {
    return;
  }
  const keep = await offlineAssets(cache);
  const removable = keys.filter((request) => {
    const path = new URL(request.url).pathname;
    return !PRECACHE.includes(path) && !keep.has(path);
  });
  for (const request of removable.slice(0, extra)) {
    await cache.delete(request);
  }
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
    await trim(cache);
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

/** Stores the ticket page and the build files it points at (after the page was answered). */
async function keepTicket(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  await cache.put(TICKET, response);
  await Promise.all(
    (html.match(/\/_next\/static\/[^"'\s)]+/g) ?? []).map((asset) => cacheFirst(new Request(asset)).catch(() => undefined)),
  );
}

async function page(request, event) {
  const ticket = new URL(request.url).pathname === TICKET;
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    if (ticket && response.ok) {
      event.waitUntil(keepTicket(response.clone()).catch(() => undefined));
    }
    return response;
  } catch {
    if (ticket) {
      const cached = await caches.match(TICKET);
      if (cached !== undefined) {
        return cached;
      }
    }
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
    event.respondWith(page(request, event));
  } else if (["/icons/", "/brand/", "/fonts/"].some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
