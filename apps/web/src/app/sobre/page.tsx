import type { Metadata } from "next";

import { AboutPage } from "@/components/about/about-page";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { about as aboutTexts } from "@/texts/pt-BR";

export const metadata: Metadata = {
  title: aboutTexts.title,
  description: aboutTexts.metaDescription,
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
