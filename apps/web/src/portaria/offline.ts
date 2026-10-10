/**
 * Offline readiness (ADR 0006 §5.2): the service worker that keeps the door app in cache, and
 * the checks of the readiness list.
 */
import { CORE_WASM_URL, ZXING_WASM_URL } from "./assets";

const SW_URL = "/portaria-sw.js";
const SW_SCOPE = "/portaria";

/**
 * Same-origin resources this page loaded (HTML, scripts, styles, fonts) plus the two WebAssembly
 * files: the QR reader's is only fetched when the camera starts, and a door that goes offline
 * before its first read still needs it (invariant 6).
 */
function pageResources(): string[] {
  const urls = new Set<string>([window.location.pathname]);
  for (const asset of [CORE_WASM_URL, ZXING_WASM_URL]) {
    // The bundler may emit the asset as a path rather than an absolute URL.
    const url = new URL(asset, window.location.href);
    if (url.origin === window.location.origin) {
      urls.add(url.pathname + url.search);
    }
  }
  for (const entry of performance.getEntriesByType("resource")) {
    const url = new URL(entry.name);
    // Platform endpoints (/_vercel/: analytics, insights) are not part of the app.
    if (url.origin === window.location.origin && !url.pathname.startsWith("/_vercel/")) {
      urls.add(url.pathname + url.search);
    }
  }
  return [...urls];
}

async function ask<T>(worker: ServiceWorker, message: unknown): Promise<T> {
  const channel = new MessageChannel();
  const answer = new Promise<T>((resolve) => {
    channel.port1.onmessage = (event: MessageEvent<T>) => {
      resolve(event.data);
    };
  });
  worker.postMessage(message, [channel.port2]);
  return answer;
}

/**
 * Registers the service worker (production builds only) and asks it to keep every resource of
 * this page, so the next open works without network. Returns whether all of them are cached.
 */
export async function keepOffline(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
    return false;
  }
  await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (worker === null) {
    return false;
  }
  const result = await ask<{ missing: number }>(worker, { type: "cache", urls: pageResources() });
  return result.missing === 0 && navigator.serviceWorker.controller !== null;
}

/** Asks the browser not to evict the door's data under storage pressure. */
export async function persistStorage(): Promise<boolean> {
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

/** Camera permission, when the browser can tell without asking. */
export async function cameraGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/** Keeps the screen on while the door is open (where supported). */
export async function keepScreenOn(): Promise<() => void> {
  try {
    const lock = await navigator.wakeLock.request("screen");
    return () => {
      void lock.release();
    };
  } catch {
    return () => undefined;
  }
}
