"use client";

import { useEffect, useRef, useState } from "react";

import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

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

// `hl` sets the language of Google's button and popup; the button's own `locale` option is ignored.
const SCRIPT_SRC = "https://accounts.google.com/gsi/client?hl=pt-BR";
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

/** Google's "G", in its brand colours (required next to "Continuar com o Google"). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-[18px]">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continuar com o Google" (ADR 0029). The button people see is ours, in the site's theme; Google's
 * own button, which only comes in Google's colours, sits invisibly on top of it and takes the click
 * (Google Identity Services has no way to start its popup from a custom button). The ID token it
 * returns goes to `onCredential`; the API verifies it.
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
  const overlay = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const unavailable = useRef(onUnavailable);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callback.current = onCredential;
    unavailable.current = onUnavailable;
  });

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    loadGoogle()
      .then((google) => {
        const area = overlay.current;
        const parent = container.current;
        if (cancelled || area === null || parent === null) {
          return;
        }
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: "popup",
          auto_select: false,
          itp_support: true,
          // The popup flow: FedCM's browser dialog may refuse a click on a see-through button.
          use_fedcm_for_button: false,
          callback: (response) => {
            if (response.credential !== undefined) {
              callback.current(response.credential);
            }
          },
        });
        // Google's button is at most 400 px wide and 40 px tall: stretch it over ours.
        const fit = () => {
          const button = parent.firstElementChild;
          if (button === null) {
            return;
          }
          parent.style.transform = "";
          const target = area.getBoundingClientRect();
          const rendered = button.getBoundingClientRect();
          if (rendered.width > 0 && rendered.height > 0) {
            parent.style.transform = `scale(${String(target.width / rendered.width)}, ${String(target.height / rendered.height)})`;
          }
        };
        const render = () => {
          parent.replaceChildren();
          google.accounts.id.renderButton(parent, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            width: Math.min(400, Math.max(200, Math.round(area.getBoundingClientRect().width))),
          });
          // The button's iframe takes a moment to size itself.
          window.setTimeout(fit, 300);
          window.setTimeout(fit, 1500);
        };
        render();
        observer = new ResizeObserver(fit);
        observer.observe(area);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          unavailable.current();
        }
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [clientId]);

  return (
    <div className="group relative w-full">
      <div
        aria-hidden
        className={cn(
          buttonClass({ variant: "secondary", size: "lg" }),
          "pointer-events-none w-full gap-2.5 group-hover:bg-surface-2",
          "group-focus-within:outline-2 group-focus-within:outline-offset-2 group-focus-within:outline-brand",
          !ready && "opacity-60",
        )}
      >
        <GoogleLogo />
        {texts.login.google}
      </div>
      <div ref={overlay} className="absolute inset-0 overflow-hidden rounded-xl opacity-0 [color-scheme:normal]">
        <div ref={container} className="origin-top-left" />
      </div>
    </div>
  );
}
