import type { Metadata } from "next";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { SupportPage } from "@/components/support/support-page";
import { texts } from "@/texts/pt-BR";

export const metadata: Metadata = {
  title: texts.helpCenter.title,
  description: texts.helpCenter.metaDescription,
  alternates: { canonical: "/suporte" },
};

export default function Support() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <SupportPage />
      </main>
      <SiteFooter />
    </div>
  );
}
