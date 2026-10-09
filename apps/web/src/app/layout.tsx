import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteAnalytics } from "@/components/site-analytics";
import { SITE_URL } from "@/lib/site";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme-script";
import { texts } from "@/texts/pt-BR";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${texts.meta.title} · ${texts.meta.tagline}`, template: `%s · ${texts.meta.title}` },
  description: texts.meta.description,
  applicationName: texts.meta.title,
  appleWebApp: { capable: true, title: texts.meta.title, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: texts.meta.title,
    title: texts.landing.headline,
    description: texts.meta.description,
  },
  twitter: { card: "summary_large_image", title: texts.landing.headline, description: texts.meta.description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // `data-theme` is set before hydration by THEME_SCRIPT, so React must not complain about it.
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
        <SiteAnalytics />
      </body>
    </html>
  );
}
