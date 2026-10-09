/**
 * Installable app (ADR 0021): the service worker of the panel and the install prompt.
 *
 * The door has its own worker and manifest under `/portaria` (ADR 0018); this one never touches
 * `/portaria` (the worker ignores its requests and is not registered from door pages).
 */
import { useSyncExternalStore } from "react";

const SW_URL = "/sw.js";

/** The deferred `beforeinstallprompt` event (Chromium only; not in TypeScript's DOM lib). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

// Listen as early as possible: the event may fire before any component mounts.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Registers the panel's service worker (production builds only). */
export async function registerAppWorker(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
    return;
  }
  if (window.location.pathname.startsWith("/portaria")) {
    return;
  }
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
  } catch {
    // Private mode or blocked storage: the site works without it.
  }
}

/** Running as an installed app. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

/** iPhone/iPad Safari, where installing is a manual "Add to Home Screen". */
function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type InstallState = "unavailable" | "prompt" | "ios" | "installed";

function snapshot(): InstallState {
  if (installed || isStandalone()) {
    return "installed";
  }
  if (deferred !== null) {
    return "prompt";
  }
  return isIos() ? "ios" : "unavailable";
}

/** How this browser can install the app right now. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => "unavailable");
}

/** Shows the browser's install prompt (state `prompt`). Returns whether it was accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (event === null) {
    return false;
  }
  deferred = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === "accepted";
}
