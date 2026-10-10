"use client";

import { useEffect, useRef } from "react";

import { useTheme } from "@/lib/theme";

/** The part of Cloudflare Turnstile's API this page uses. */
interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: "light" | "dark" | "auto";
      language?: string;
      appearance?: "always" | "execute" | "interaction-only";
      size?: "normal" | "flexible" | "compact";
      "refresh-expired"?: "auto" | "manual" | "never";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string | undefined;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page (only the sign-in page asks for it). */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile !== undefined) {
    return Promise.resolve(window.turnstile);
  }
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile === undefined) {
        reject(new Error("turnstile unavailable"));
      } else {
        resolve(window.turnstile);
      }
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile blocked"));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * The anti-bot check before a login code is e-mailed (ADR 0044): Cloudflare Turnstile, invisible
 * unless Cloudflare wants a click. Each token works once, so the parent changes `round` after
 * every request to get a new one; `onToken(null)` means there is no valid token right now.
 */
export function Turnstile({
  siteKey,
  round,
  onToken,
  onUnavailable,
}: {
  siteKey: string;
  round: number;
  onToken: (token: string | null) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const token = useRef(onToken);
  const unavailable = useRef(onUnavailable);
  const { theme } = useTheme();

  useEffect(() => {
    token.current = onToken;
    unavailable.current = onUnavailable;
  });

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;
    let api: TurnstileApi | undefined;
    token.current(null);
    loadTurnstile()
      .then((turnstile) => {
        const parent = container.current;
        if (cancelled || parent === null) {
          return;
        }
        api = turnstile;
        widgetId = turnstile.render(parent, {
          sitekey: siteKey,
          action: "login-code",
          theme,
          language: "pt-br",
          appearance: "interaction-only",
          size: "flexible",
          "refresh-expired": "auto",
          callback: (value) => {
            token.current(value);
          },
          "expired-callback": () => {
            token.current(null);
          },
          "error-callback": () => {
            token.current(null);
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          unavailable.current();
        }
      });
    return () => {
      cancelled = true;
      if (api !== undefined && widgetId !== undefined) {
        api.remove(widgetId);
      }
    };
  }, [siteKey, theme, round]);

  // Empty (and taking no room) unless Cloudflare asks for a click.
  return <div ref={container} className="empty:hidden" />;
}
