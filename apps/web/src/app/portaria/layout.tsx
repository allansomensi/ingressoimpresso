import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

export const metadata: Metadata = {
  title: portariaTexts.title,
  manifest: "/portaria.webmanifest",
  icons: { icon: "/portaria-icon-192.png", apple: "/portaria-apple-icon.png" },
  appleWebApp: { capable: true, title: portariaTexts.title, statusBarStyle: "black" },
  // The access token is in the fragment; nothing here should be indexed or leak a referrer.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0c0c10",
  colorScheme: "dark",
};

export default function PortariaLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
