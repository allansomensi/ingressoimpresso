import type { Metadata } from "next";

import { SellerPage } from "@/components/seller/seller-page";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR";

// A seller's private link (ADR 0053): the token is in the fragment, so the page is never indexed.
export const metadata: Metadata = {
  title: sellerPageTexts.metaTitle,
  description: sellerPageTexts.metaDescription,
  robots: { index: false, follow: false },
};

export default function SellerLinkPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <SellerPage />
    </main>
  );
}
