import type { Metadata } from "next";

import { AboutPage } from "@/components/about/about-page";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { texts } from "@/texts/pt-BR";

export const metadata: Metadata = {
  title: texts.about.title,
  description: texts.about.metaDescription,
  alternates: { canonical: "/sobre" },
};

export default function About() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <AboutPage />
      </main>
      <SiteFooter />
    </div>
  );
}
