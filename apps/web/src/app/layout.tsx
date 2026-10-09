import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { texts } from "@/texts/pt-BR";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0910" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
