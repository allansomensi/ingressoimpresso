import type { StatusDto } from "@ingressoimpresso/api-types";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StatusPage } from "@/components/status/status-page";
import { pageMetadata, withBrand } from "@/lib/seo";
import { fetchPublic } from "@/lib/server-fetch";
import { status as statusTexts } from "@/texts/pt-BR/status";

export const metadata: Metadata = pageMetadata({
  title: withBrand(statusTexts.title),
  description: statusTexts.metaDescription,
  path: "/status",
});

/** The current state comes in the HTML; the browser then refreshes it every minute. */
export default async function Status() {
  const initial = await fetchPublic<StatusDto>("/api/status", { revalidate: 30 });
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="conteudo" className="flex-1 bg-glow">
        <StatusPage initial={initial} />
      </main>
      <SiteFooter />
    </div>
  );
}
