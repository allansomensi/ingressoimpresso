// Public build-time variables. Declared so they can be read with dot access, the only form
// Next.js inlines into the client bundle.
declare namespace NodeJS {
  interface ProcessEnv {
    /** Base URL of the API, e.g. https://api.seudominio.com.br (no trailing slash). */
    readonly NEXT_PUBLIC_API_URL?: string;
    /** Public address of the site (canonical URLs, sitemap); defaults to https://ingressoimpresso.com.br. */
    readonly NEXT_PUBLIC_SITE_URL?: string;
    /** `staging` on the test environment (ADR 0046): a visible badge and no search indexing. */
    readonly NEXT_PUBLIC_ENVIRONMENT?: string;
    /** Product version (ADR 0049), from package.json; set by next.config.ts, not by hand. */
    readonly NEXT_PUBLIC_APP_VERSION?: string;
    /** Short commit of the build (GITHUB_SHA in CI); set by next.config.ts, not by hand. */
    readonly NEXT_PUBLIC_APP_COMMIT?: string;
  }
}
