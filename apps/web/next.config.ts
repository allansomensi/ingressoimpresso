import type { NextConfig } from "next";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

// ADR 0016: the session token lives in localStorage, so the CSP is its main defence. `connect-src`
// limits where scripts can send data (no exfiltration to other hosts), images only from ourselves.
// Next.js still needs inline bootstrap scripts; a nonce-based policy is planned (phase 8).
const contentSecurityPolicy = [
  "default-src 'self'",
  // WebAssembly (ticket-core and zxing at the door) needs 'wasm-unsafe-eval'; plain eval stays blocked.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${apiUrl}`,
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@ingressoimpresso/api-types", "@ingressoimpresso/ticket-core-wasm"],
  headers() {
    const security = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      security.push({ key: "Content-Security-Policy", value: contentSecurityPolicy });
    }
    // Service workers must never be served stale, or an update would wait for the HTTP cache.
    const worker = [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }];
    return Promise.resolve([
      { source: "/:path*", headers: security },
      { source: "/sw.js", headers: worker },
      { source: "/portaria-sw.js", headers: worker },
    ]);
  },
};

export default nextConfig;
