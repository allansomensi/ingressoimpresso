/**
 * Theme constants shared by the root layout (server) and `theme.ts` (browser), ADR 0021.
 * No React here: the layout renders `THEME_SCRIPT` into <head>.
 */
export type ThemePreference = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_KEY = "ingressoimpresso.theme";
export const THEME_QUERY = "(prefers-color-scheme: dark)";
/** Browser chrome colour of each theme (same as `--bg`). */
export const THEME_COLORS: Record<Theme, string> = { light: "#f7f7f9", dark: "#0a0910" };

/** Inline script for <head>: applies the saved theme before anything is painted (the door is always dark). */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=location.pathname.indexOf("/portaria")===0||p==="dark"||(p!=="light"&&matchMedia(${JSON.stringify(THEME_QUERY)}).matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
