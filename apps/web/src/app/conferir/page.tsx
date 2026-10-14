import { BadgeCheck, CheckCircle2, Fingerprint, ScanSearch, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { JsonLd, verifyPageJsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { FaqList } from "@/components/marketing/faq-list";
import { FinalCta } from "@/components/marketing/final-cta";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TicketChecker } from "@/components/verify/ticket-checker";
import { eventPages as eventPagesTexts, meta as metaTexts, verifyPage as verifyPageTexts } from "@/texts/pt-BR";

const t = verifyPageTexts;
const HOW_ICONS: readonly LucideIcon[] = [Fingerprint, ScanSearch, BadgeCheck];

export const metadata: Metadata = {
  // Written to fit search results: no " · Ingresso Impresso" suffix.
  title: { absolute: t.metaTitle },
  description: t.metaDescription,
  alternates: { canonical: "/conferir" },
  // The share image is ./opengraph-image.tsx.
  openGraph: { type: "website", locale: "pt_BR", siteName: metaTexts.title, url: "/conferir", title: t.metaTitle, description: t.metaDescription },
  twitter: { card: "summary_large_image", title: t.metaTitle, description: t.metaDescription },
};

/**
 * Check a ticket before buying it (ADR 0075): the checker first (camera, photo or pasted text),
 * then what the check means and what it does not say, written for search too.
 */
export default function VerifyPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={verifyPageJsonLd({ title: t.metaTitle, description: t.metaDescription, name: t.breadcrumb, faq: t.faq })} />
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-start gap-8 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1fr_minmax(0,30rem)] lg:gap-14 lg:pt-14 lg:pb-24">
            <div className="flex flex-col items-start gap-5 animate-rise lg:pt-6">
              <Breadcrumb items={[{ label: eventPagesTexts.home, href: "/" }, { label: t.breadcrumb }]} />
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{t.headline}</h1>
              <p className="max-w-xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">{t.lead}</p>
              <ul className="hidden flex-col gap-2.5 pt-2 lg:flex">
                {t.how.map((step) => (
                  <li key={step.title} className="flex items-start gap-2.5 text-[15px] text-fg-muted">
                    <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                    {step.title}
                  </li>
                ))}
              </ul>
            </div>
            <div className="animate-rise [animation-delay:80ms]">
              <TicketChecker />
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading title={t.howTitle} />
            <ol className="grid gap-4 md:grid-cols-3">
              {t.how.map((step, index) => {
                const Icon = HOW_ICONS[index] ?? ShieldCheck;
                return (
                  <li key={step.title} className="flex flex-col gap-3 rounded-3xl border border-border bg-bg p-6">
                    <span className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <span className="text-sm font-semibold text-fg-subtle tabular">{String(index + 1).padStart(2, "0")}</span>
                    </span>
                    <h3 className="text-base font-semibold text-fg">{step.title}</h3>
                    <p className="text-[15px] leading-relaxed text-fg-muted">{step.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-2 lg:py-20">
          <div className="flex flex-col gap-4 rounded-3xl border border-warning/30 bg-warning-soft p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-fg">{t.copyTitle}</h2>
            <p className="text-[15px] leading-relaxed text-fg-muted">{t.copyBody}</p>
            <h3 className="pt-2 text-base font-semibold text-fg">{t.limitsTitle}</h3>
            <ul className="flex flex-col gap-2.5">
              {t.limits.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-fg-muted">
                  <XCircle aria-hidden className="mt-1 size-4 shrink-0 text-warning-fg" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-xs sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-fg">{t.tipsTitle}</h2>
            <ul className="flex flex-col gap-2.5">
              {t.tips.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-fg-muted">
                  <CheckCircle2 aria-hidden className="mt-1 size-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading title={t.faqTitle} />
            <FaqList items={t.faq} />
          </div>
        </section>

        <FinalCta title={t.organizerTitle} body={t.organizerBody} />
      </main>
      <SiteFooter />
    </div>
  );
}
