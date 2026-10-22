import type { Metadata } from "next";

import { SellerPage } from "@/components/seller/seller-page";
import { privatePageMetadata } from "@/lib/seo";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR/seller-page";

// A seller's private link (ADR 0053): the token is in the fragment, so the page is never indexed.
export const metadata: Metadata = privatePageMetadata({ title: sellerPageTexts.metaTitle, description: sellerPageTexts.metaDescription });

export default function SellerLinkPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <SellerPage />
    </main>
  );
}
