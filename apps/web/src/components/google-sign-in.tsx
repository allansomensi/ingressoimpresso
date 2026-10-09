"use client";

import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui";
import { useTheme } from "@/lib/theme";

/** The part of Google Identity Services (GIS) this page uses. */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        ux_mode?: "popup" | "redirect";
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        itp_support?: boolean;
        use_fedcm_for_button?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type?: "standard" | "icon";
          theme?: "outline" | "filled_blue" | "filled_black";
          size?: "large" | "medium" | "small";
          text?: "signin_with" | "signup_with" | "continue_with" | "signin";
          shape?: "rectangular" | "pill" | "circle" | "square";
          logo_alignment?: "left" | "center";
          width?: number;
          locale?: string;
        },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<GoogleIdentity> | null = null;

/** Loads Google's script once per page (only the sign-in page asks for it). */
function loadGoogle(): Promise<GoogleIdentity> {
  if (window.google !== undefined) {
    return Promise.resolve(window.google);
  }
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.google === undefined) {
        reject(new Error("google identity unavailable"));
      } else {
        resolve(window.google);
      }
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("google identity blocked"));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * "Entrar com Google" (ADR 0029): Google's own button, in a popup. The ID token it returns goes to
 * `onCredential`; the API verifies it.
 */
export function GoogleSignIn({
  clientId,
  onCredential,
  onUnavailable,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const unavailable = useRef(onUnavailable);
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callback.current = onCredential;
    unavailable.current = onUnavailable;
  });

  useEffect(() => {
    let cancelled = false;
    loadGoogle()
      .then((google) => {
        const parent = container.current;
        if (cancelled || parent === null) {
          return;
        }
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: "popup",
          auto_select: false,
          itp_support: true,
          use_fedcm_for_button: true,
          callback: (response) => {
            if (response.credential !== undefined) {
              callback.current(response.credential);
            }
          },
        });
        parent.replaceChildren();
        google.accounts.id.renderButton(parent, {
          type: "standard",
          theme: theme === "dark" ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "center",
          width: Math.min(400, Math.max(240, Math.round(parent.getBoundingClientRect().width))),
          locale: "pt-BR",
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          unavailable.current();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, theme]);

  return (
    <div className="relative min-h-11 w-full">
      {!ready && <Skeleton className="absolute inset-0 h-11 rounded-full" />}
      <div ref={container} className="flex w-full justify-center [color-scheme:normal]" />
    </div>
  );
}
