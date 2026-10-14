import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { SiteAnalytics } from "@/components/site-analytics";
import { EnvironmentBadge } from "@/components/environment-badge";
import { IS_STAGING, SITE_URL } from "@/lib/site";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme-script";
import { landing as landingTexts } from "@/texts/pt-BR/landing";
import { meta as metaTexts } from "@/texts/pt-BR/meta";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${metaTexts.title} · ${metaTexts.tagline}`, template: `%s · ${metaTexts.title}` },
  description: metaTexts.description,
  applicationName: metaTexts.title,
  appleWebApp: { capable: true, title: metaTexts.title, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: metaTexts.title,
    title: landingTexts.headline,
    description: metaTexts.description,
  },
  twitter: { card: "summary_large_image", title: landingTexts.headline, description: metaTexts.description },
  category: "business",
  // The staging site (ADR 0046) never shows up in search results. In production, results may show
  // large images (the templates) and full snippets; private pages set their own `noindex`.
  robots: IS_STAGING
    ? { index: false, follow: false }
    : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  ...siteVerification(),
};

/**
 * Ownership tags for Google Search Console and Bing Webmaster Tools, when the site is verified by
 * a meta tag instead of DNS (docs/deploy.md). Read at build time, like every NEXT_PUBLIC_ variable.
 */
function siteVerification(): Pick<Metadata, "verification"> {
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ?? "";
  const bing = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim() ?? "";
  if (IS_STAGING || (google === "" && bing === "")) {
    return {};
  }
  return {
    verification: {
      ...(google === "" ? {} : { google }),
      ...(bing === "" ? {} : { other: { "msvalidate.01": bing } }),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The request's CSP nonce (src/proxy.ts, ADR 0048). Reading the headers renders every page per
  // request, which the nonce needs anyway: a prerendered page could not carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // `data-theme` is set before hydration by THEME_SCRIPT, so React must not complain about it.
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
        <SiteAnalytics />
        <EnvironmentBadge />
      </body>
    </html>
  );
}
