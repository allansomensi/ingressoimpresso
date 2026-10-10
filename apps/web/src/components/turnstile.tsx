"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

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
      execution?: "render" | "execute";
      size?: "normal" | "flexible" | "compact";
      "refresh-expired"?: "auto" | "manual" | "never";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string | undefined;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
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

/** Asks Cloudflare for a one-time token; rejects when the check cannot run. */
export interface TurnstileHandle {
  token: () => Promise<string>;
}

/**
 * The anti-bot check before a login code is e-mailed (ADR 0044): Cloudflare Turnstile. The
 * challenge runs only when `token()` is called, at the moment the code is asked for, so every
 * token Cloudflare issues is the one the API verifies. Invisible unless Cloudflare wants a click.
 */
export function Turnstile({
  siteKey,
  ref,
  onUnavailable,
}: {
  siteKey: string;
  ref: Ref<TurnstileHandle>;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const unavailable = useRef(onUnavailable);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const waiting = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | null>(null);
  const used = useRef(false);
  // Calls of `token()` made while Cloudflare's script is still loading.
  const readyWaiters = useRef<(() => void)[]>([]);
  const { theme } = useTheme();

  useEffect(() => {
    unavailable.current = onUnavailable;
  });

  useEffect(() => {
    let cancelled = false;
    const settle = (token: string | null) => {
      const pending = waiting.current;
      waiting.current = null;
      if (token === null) {
        pending?.reject(new Error("turnstile failed"));
      } else {
        pending?.resolve(token);
      }
    };
    loadTurnstile()
      .then((turnstile) => {
        const parent = container.current;
        if (cancelled || parent === null) {
          return;
        }
        const id = turnstile.render(parent, {
          sitekey: siteKey,
          action: "login-code",
          theme,
          language: "pt-br",
          appearance: "interaction-only",
          execution: "execute",
          size: "flexible",
          "refresh-expired": "never",
          callback: (token) => {
            settle(token);
          },
          "expired-callback": () => {
            settle(null);
          },
          "error-callback": () => {
            settle(null);
          },
        });
        if (id !== undefined) {
          widget.current = { api: turnstile, id };
          used.current = false;
          const waiters = readyWaiters.current;
          readyWaiters.current = [];
          for (const wake of waiters) {
            wake();
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          unavailable.current();
        }
      });
    return () => {
      cancelled = true;
      if (widget.current !== null) {
        widget.current.api.remove(widget.current.id);
        widget.current = null;
      }
      waiting.current?.reject(new Error("turnstile removed"));
      waiting.current = null;
    };
  }, [siteKey, theme]);

  useImperativeHandle(
    ref,
    () => ({
      token: async () => {
        if (widget.current === null) {
          // The script is still loading: wait a little for it.
          await new Promise<void>((wake, giveUp) => {
            readyWaiters.current.push(wake);
            window.setTimeout(() => {
              giveUp(new Error("turnstile not ready"));
            }, 10_000);
          });
        }
        return new Promise<string>((resolve, reject) => {
          const current = widget.current;
          if (current === null) {
            reject(new Error("turnstile not ready"));
            return;
          }
          waiting.current?.reject(new Error("turnstile superseded"));
          waiting.current = { resolve, reject };
          // A token works once: start over after the first.
          if (used.current) {
            current.api.reset(current.id);
          }
          used.current = true;
          current.api.execute(current.id);
        });
      },
    }),
    [],
  );

  // Empty (and taking no room) unless Cloudflare asks for a click.
  return <div ref={container} className="empty:hidden" />;
}
