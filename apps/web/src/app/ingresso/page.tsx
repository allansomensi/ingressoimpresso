import type { Metadata, Viewport } from "next";

import { TicketPass } from "@/components/ticket/ticket-pass";
import { privatePageMetadata } from "@/lib/seo";
import { THEME_COLORS } from "@/lib/theme-script";
import { ticket as ticketTexts } from "@/texts/pt-BR/ticket";

// The link carries the ticket in its fragment: never indexed, never cached by search engines.
export const metadata: Metadata = privatePageMetadata({ title: ticketTexts.metaTitle, description: ticketTexts.metaDescription });

// The browser bar follows the theme, as everywhere (the page is light or dark like the site).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function TicketPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <TicketPass />
    </main>
  );
}
