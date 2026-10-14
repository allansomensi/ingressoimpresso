import type { Metadata, Viewport } from "next";

import { TicketPass } from "@/components/ticket/ticket-pass";
import { ticket as ticketTexts } from "@/texts/pt-BR/ticket";

// The link carries the ticket in its fragment: never indexed, never cached by search engines.
export const metadata: Metadata = {
  title: ticketTexts.metaTitle,
  description: ticketTexts.metaDescription,
  robots: { index: false, follow: false },
  openGraph: { title: ticketTexts.metaTitle, description: ticketTexts.metaDescription },
};

export const viewport: Viewport = { themeColor: [{ color: "#0a0910" }] };

export default function TicketPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <TicketPass />
    </main>
  );
}
