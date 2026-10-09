import type { Metadata } from "next";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StatusPage } from "@/components/status/status-page";
import { texts } from "@/texts/pt-BR";

export const metadata: Metadata = {
  title: texts.status.title,
  description: texts.status.metaDescription,
  alternates: { canonical: "/status" },
};

export default function Status() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1 bg-glow">
        <StatusPage />
      </main>
      <SiteFooter />
    </div>
  );
}
