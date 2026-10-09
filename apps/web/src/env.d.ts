// Public build-time variables. Declared so they can be read with dot access, the only form
// Next.js inlines into the client bundle.
declare namespace NodeJS {
  interface ProcessEnv {
    /** Base URL of the API, e.g. https://api.seudominio.com.br (no trailing slash). */
    readonly NEXT_PUBLIC_API_URL?: string;
    /** Public address of the site (canonical URLs, sitemap); defaults to https://ingressoimpresso.com.br. */
    readonly NEXT_PUBLIC_SITE_URL?: string;
  }
}
