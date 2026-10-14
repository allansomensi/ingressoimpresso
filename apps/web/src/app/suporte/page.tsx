import type { Metadata } from "next";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { SupportPage } from "@/components/support/support-page";
import { helpCenter as helpCenterTexts } from "@/texts/pt-BR/help-center";

export const metadata: Metadata = {
  title: helpCenterTexts.title,
  description: helpCenterTexts.metaDescription,
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
