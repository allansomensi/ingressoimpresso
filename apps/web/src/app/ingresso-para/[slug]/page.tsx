import { ArrowRight, Check, CircleCheck, ChevronRight, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd, eventPageJsonLd } from "@/components/json-ld";
import { FaqList } from "@/components/marketing/faq-list";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { PhoneMock, TicketMock } from "@/components/marketing/mockups";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { ButtonLink } from "@/components/ui";
import { eventSeoPage, eventSeoPages } from "@/content/seo-event-pages";
import { texts } from "@/texts/pt-BR";

const t = texts.eventPages;

type Props = { params: Promise<{ slug: string }> };

/** The site's share image (app/opengraph-image.png). */
const SHARE_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: texts.meta.shareImageAlt };

// Only the pages in eventSeoPages exist; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return eventSeoPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = eventSeoPage((await params).slug);
  if (page === undefined) {
    return {};
  }
  const path = `/ingresso-para/${page.slug}`;
  return {
    // The titles are written to fit search results: no " · Ingresso Impresso" suffix.
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: path },
    // Setting openGraph and twitter replaces the layout's: the share image and card come along.
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: texts.meta.title,
      url: path,
      title: page.title,
      description: page.description,
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title: page.title, description: page.description, images: [SHARE_IMAGE] },
  };
}

/** A landing page for one kind of event (festa junina, formatura…), with the landing's look. */
export default async function EventTypePage({ params }: Props) {
  const page = eventSeoPage((await params).slug);
  if (page === undefined) {
    notFound();
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={eventPageJsonLd(page)} />
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16 lg:pb-28">
            <div className="flex flex-col items-start gap-6 animate-rise">
              <nav aria-label={t.breadcrumb}>
                <ol className="flex items-center gap-1.5 text-sm text-fg-subtle">
                  <li>
                    <Link href="/" className="relative transition touch-target hover:text-fg">
                      {t.home}
                    </Link>
                  </li>
                  <li aria-hidden>
                    <ChevronRight className="size-3.5" />
                  </li>
                  <li aria-current="page" className="text-fg-muted">
                    {page.label}
                  </li>
                </ol>
              </nav>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-soft-fg">
                <span className="size-1.5 rounded-full bg-brand" />
                {t.eyebrow(page.label)}
              </span>
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{page.h1}</h1>
              <p className="max-w-xl text-lg leading-relaxed text-pretty text-fg-muted sm:text-xl">{page.intro}</p>
              <div id="comecar" className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                  {page.cta}
                </ButtonLink>
                <ButtonLink href="/#precos" size="lg" variant="secondary">
                  {t.secondaryCta}
                </ButtonLink>
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 sm:flex sm:flex-wrap sm:gap-x-5">
                {texts.landing.trust.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-sm leading-snug text-fg-muted">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* The same illustrations as the landing: decorative for screen readers. */}
            <div aria-hidden className="relative mx-auto h-[340px] w-full max-w-[460px] max-lg:hidden sm:h-[440px]">
              <div className="absolute top-6 left-2 -rotate-6 animate-rise">
                <TicketMock />
              </div>
              <div className="absolute right-2 bottom-0 rotate-3 animate-rise [animation-delay:150ms]">
                <PhoneMock />
              </div>
            </div>
          </div>
        </section>

        {/* Pains */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-20 sm:px-6 lg:py-24">
            <SectionHeading title={t.painsTitle} lead={t.painsLead} />
            <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
              {page.dores.map((pain) => (
                <li key={pain} className="flex items-start gap-3 rounded-2xl border border-border bg-bg p-5">
                  <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                  <span className="text-[15px] leading-relaxed text-fg">{pain}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Benefits */}
        <section className="bg-bg">
          <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading title={t.benefitsTitle} lead={t.benefitsLead} />
            <ul className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {page.beneficios.map((benefit) => (
                <li key={benefit.titulo} className="flex gap-4 bg-surface p-5 sm:flex-col sm:gap-3 sm:p-7">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
                    <CircleCheck className="size-5" aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1 sm:gap-3">
                    <h3 className="text-base font-semibold text-fg">{benefit.titulo}</h3>
                    <p className="text-[15px] leading-relaxed text-fg-muted">{benefit.texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="duvidas" className="scroll-mt-16 border-t border-border bg-surface">
          <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading title={texts.landing.faqTitle} />
            <FaqList items={page.faq.map((item) => ({ question: item.pergunta, answer: item.resposta }))} />
          </div>
        </section>

        {/* Final CTA */}
        <section id="criar" className="px-4 py-20 sm:px-6">
          <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 overflow-hidden rounded-[2rem] bg-brand-solid px-6 py-16 text-center text-white shadow-lg shadow-brand/30">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(255,255,255,0.25),transparent)]" />
            <h2 className="relative max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{page.cta}</h2>
            <p className="relative max-w-xl text-lg text-white/80">{texts.landing.finalBody}</p>
            <ButtonLink href="/entrar" size="lg" variant="inverse" icon={<ArrowRight />} className="relative flex-row-reverse">
              {texts.landing.primaryCta}
            </ButtonLink>
          </div>
        </section>
      </main>

      <SiteFooter />
      <MobileCta />
    </div>
  );
}
