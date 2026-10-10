/** The test environment (ADR 0046), set by `NEXT_PUBLIC_ENVIRONMENT=staging` at build time. */
export const IS_STAGING = process.env.NEXT_PUBLIC_ENVIRONMENT === "staging";

/** Public address of the site (canonical URLs, sitemap, Open Graph). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ingressoimpresso.com.br").replace(/\/$/, "");
