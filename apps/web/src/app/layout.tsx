import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { texts } from "@/texts/pt-BR";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: texts.meta.title,
  description: texts.meta.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
