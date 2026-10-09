/**
 * Colour theme (ADR 0021): light, dark or the system setting, kept in localStorage.
 *
 * The theme is applied as `data-theme` on <html>. `THEME_SCRIPT` runs in <head> before the first
 * paint, so a saved dark theme never flashes light; React reads and changes it through `useTheme`.
 */
import { useSyncExternalStore } from "react";

import { THEME_COLORS, THEME_KEY as KEY, THEME_QUERY as QUERY, type Theme, type ThemePreference } from "./theme-script";

export type { Theme, ThemePreference } from "./theme-script";

const listeners = new Set<() => void>();
/** Used when localStorage is unavailable (private mode): the choice lasts for this page. */
let memoryPreference: ThemePreference = "system";

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return memoryPreference;
  }
}

function resolve(preference: ThemePreference): Theme {
  // The door is always dark: it is used at night, at the entrance (ADR 0018).
  if (window.location.pathname.startsWith("/portaria")) {
    return "dark";
  }
  if (preference === "system") {
    return window.matchMedia(QUERY).matches ? "dark" : "light";
  }
  return preference;
}

function apply(): void {
  const theme = resolve(readPreference());
  const root = document.documentElement;
  root.dataset["theme"] = theme;
  // The browser chrome (address bar, installed app title bar) follows the chosen theme.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLORS[theme];
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(QUERY);
  const onSystemChange = () => {
    if (readPreference() === "system") {
      apply();
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      apply();
    }
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Changes the theme preference (and applies it everywhere, other tabs included). */
export function setTheme(preference: ThemePreference): void {
  memoryPreference = preference;
  try {
    if (preference === "system") {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, preference);
    }
  } catch {
    // Storage unavailable: `memoryPreference` keeps the choice for this page.
  }
  apply();
}

function snapshot(): string {
  const preference = readPreference();
  return `${preference}:${resolve(preference)}`;
}

/** The saved preference and the theme actually shown. Before hydration: system/light. */
export function useTheme(): { preference: ThemePreference; theme: Theme } {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [preference, theme] = value.split(":") as [ThemePreference, Theme];
  return { preference, theme };
}
