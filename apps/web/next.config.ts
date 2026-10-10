import type { NextConfig } from "next";

import packageJson from "./package.json" with { type: "json" };

// The product version (ADR 0049) and the commit, baked into the bundle: the footer, the account
// menu and /status show them. The site is built in GitHub Actions (deploy-web.yml), where
// GITHUB_SHA is the commit being deployed.
const commit = (process.env["GITHUB_SHA"] ?? process.env["VERCEL_GIT_COMMIT_SHA"] ?? "").slice(0, 7);

// The Content Security Policy is set per request in src/proxy.ts (a nonce per page, ADR 0048);
// the headers below are the static ones.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_APP_COMMIT: commit,
  },
  transpilePackages: ["@ingressoimpresso/api-types", "@ingressoimpresso/ticket-core-wasm"],
  headers() {
    const security = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ];
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
