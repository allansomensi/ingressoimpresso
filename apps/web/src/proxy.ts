import { type NextRequest, NextResponse } from "next/server";

/**
 * Content Security Policy with a per-request nonce (ADR 0048). The session token lives in
 * localStorage (ADR 0016), so the CSP is its main defence against an injected script: only
 * scripts carrying this request's nonce run, plus whatever they load themselves
 * (`'strict-dynamic'`: Google Identity Services, Turnstile and Vercel Analytics are created by
 * our code with `document.createElement`). Next.js reads the nonce from the request's CSP header
 * and puts it on every script it writes; the root layout reads `x-nonce` for the theme script.
 *
 * `connect-src` limits where scripts can send data (no exfiltration to other hosts); images only
 * from ourselves. WebAssembly (ticket-core and zxing at the door) needs 'wasm-unsafe-eval'; plain
 * eval stays blocked. The host sources keep browsers without CSP3 working; CSP3 browsers ignore
 * them once 'strict-dynamic' is present.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
// "Entrar com Google" (ADR 0029): its script, its stylesheet and the button's iframe.
const GOOGLE_IDENTITY = "https://accounts.google.com/gsi/";
// The anti-bot check of login codes (ADR 0044): Cloudflare Turnstile's script and its iframe.
const TURNSTILE = "https://challenges.cloudflare.com";

function policy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' ${GOOGLE_IDENTITY}client ${TURNSTILE}`,
    `style-src 'self' 'unsafe-inline' ${GOOGLE_IDENTITY}style`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${API_URL} ${GOOGLE_IDENTITY}`,
    `frame-src ${GOOGLE_IDENTITY} ${TURNSTILE}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  // Development uses eval for fast refresh: no CSP there (the same as before ADR 0048).
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = policy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Pages only: build files, images, fonts, the service workers and the other static files
  // have no scripts of their own and keep the cache the CDN gives them.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|icons/|brand/|fonts/|.*\\.(?:png|jpg|jpeg|svg|ico|js|json|txt|xml|webmanifest|woff2|map)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
