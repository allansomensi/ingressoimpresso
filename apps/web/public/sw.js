// Service worker of the site and panel (ADR 0021): makes the app installable and gives it an
// offline page. The door (/portaria) has its own worker with a narrower scope (ADR 0018); this one
// never answers its requests. The API lives on another origin and is never cached.
//
// Build files under /_next/static/ are content hashed: cache first. Icons, brand files and the
// ticket typefaces (/fonts/): cache, refreshed in the background. Pages always come from the network (an old copy could point at
// build files that no longer exist after a deploy); without network, the offline page.
//
// The digital ticket (/ingresso, ADR 0030) and the seller's page (/vendedor, ADR 0074) are the
// exceptions: the holder opens the ticket at the door and the seller marks sales on the street,
// often without signal. Their pages and build files are kept from the first online visit on
// (refreshed on every online visit), and the data is in the page's localStorage (the link's
// token stays in the fragment, which never reaches a request). The install precaches only the
// offline page, the icon and the logo: the worker is registered from the panel and from those
// pages, never from the landing, and a kept page is stored when it is opened.

const CACHE = "app-v5";
const OFFLINE = "/offline";
const TICKET = "/ingresso";
const SELLER = "/vendedor";
/** Pages that open without network, from their last copy (stored on their first online visit). */
const KEPT = [TICKET, SELLER];
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/brand/logo-mark.svg"];
const PAGE_TIMEOUT_MS = 8000;
const MAX_ENTRIES = 250;
const TRIM_INTERVAL_MS = 60_000;

/** Build files the given pages need (styles, fonts, scripts), read from their cached HTML. */
async function pageAssets(cache, paths) {
  const assets = new Set();
  for (const path of paths) {
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
  await cache.addAll([...(await pageAssets(cache, [OFFLINE]))]);
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

let lastTrimAt = 0;

/**
 * Keeps the cache bounded: every deploy brings new build files; the oldest ones go first. Runs at
 * most once a minute: listing the cache on every miss would cost more than the miss itself.
 */
async function trim(cache) {
  const now = Date.now();
  if (now - lastTrimAt < TRIM_INTERVAL_MS) {
    return;
  }
  lastTrimAt = now;
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  if (extra <= 0) {
    return;
  }
  const keep = await pageAssets(cache, [OFFLINE, ...KEPT]);
  const removable = keys.filter((request) => {
    const path = new URL(request.url).pathname;
    return !PRECACHE.includes(path) && !KEPT.includes(path) && !keep.has(path);
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

/** Stores a kept page and the build files it points at (after the page was answered). */
async function keepPage(path, response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  await cache.put(path, response);
  await Promise.all(
    (html.match(/\/_next\/static\/[^"'\s)]+/g) ?? []).map((asset) => cacheFirst(new Request(asset)).catch(() => undefined)),
  );
}

async function page(request, event) {
  const path = new URL(request.url).pathname;
  const kept = KEPT.includes(path) ? path : null;
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    if (kept !== null && response.ok) {
      event.waitUntil(keepPage(kept, response.clone()).catch(() => undefined));
    }
    return response;
  } catch {
    if (kept !== null) {
      const cached = await caches.match(kept);
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
