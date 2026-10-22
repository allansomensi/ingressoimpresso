import type { Metadata } from "next";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StatusPage } from "@/components/status/status-page";
import { pageMetadata, withBrand } from "@/lib/seo";
import { status as statusTexts } from "@/texts/pt-BR/status";

export const metadata: Metadata = pageMetadata({
  title: withBrand(statusTexts.title),
  description: statusTexts.metaDescription,
  path: "/status",
});

export default function Status() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="conteudo" className="flex-1 bg-glow">
        <StatusPage />
      </main>
      <SiteFooter />
    </div>
  );
}
