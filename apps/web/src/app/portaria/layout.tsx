import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { texts } from "@/texts/pt-BR";

export const metadata: Metadata = {
  title: `${texts.portaria.title} · ${texts.meta.title}`,
  manifest: "/portaria.webmanifest",
  icons: { icon: "/portaria-icon-192.png", apple: "/portaria-apple-icon.png" },
  appleWebApp: { capable: true, title: texts.portaria.title, statusBarStyle: "black" },
  // The access token is in the fragment; nothing here should be indexed or leak a referrer.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0a12",
  colorScheme: "dark",
};

export default function PortariaLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
