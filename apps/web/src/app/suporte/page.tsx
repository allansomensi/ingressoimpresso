import type { Metadata } from "next";

import { JsonLd, supportJsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { SupportPage } from "@/components/support/support-page";
import { pageMetadata } from "@/lib/seo";
import { helpCenter as helpCenterTexts } from "@/texts/pt-BR/help-center";

export const metadata: Metadata = pageMetadata({
  title: helpCenterTexts.metaTitle,
  description: helpCenterTexts.metaDescription,
  path: "/suporte",
});

export default function Support() {
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd
        data={supportJsonLd({
          title: helpCenterTexts.metaTitle,
          description: helpCenterTexts.metaDescription,
          name: helpCenterTexts.title,
          faq: helpCenterTexts.topics,
        })}
      />
      <SiteHeader />
      <main className="flex-1">
        <SupportPage />
      </main>
      <SiteFooter />
    </div>
  );
}
