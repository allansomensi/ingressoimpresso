import { ArrowRight, Check, CircleCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd, eventPageJsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { FaqList } from "@/components/marketing/faq-list";
import { FinalCta } from "@/components/marketing/final-cta";
import { GuideCard } from "@/components/marketing/guide-card";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { PhoneMock, TicketMock } from "@/components/marketing/mockups";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TemplateCard } from "@/components/marketing/template-card";
import { ButtonLink } from "@/components/ui";
import { eventSeoPage, eventSeoPages } from "@/content/seo-event-pages";
import { guidesForEvent } from "@/content/seo-guides";
import { EVENT_TEMPLATES, templateSeoById } from "@/content/seo-templates";
import { pageMetadata } from "@/lib/seo";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";
import { guides as guidesTexts } from "@/texts/pt-BR/guides";
import { landing as landingTexts } from "@/texts/pt-BR/landing";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";

const t = eventPagesTexts;

type Props = { params: Promise<{ slug: string }> };

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
  // The titles are written to fit search results: no " · Ingresso Impresso" suffix. The share
  // image is ./opengraph-image.tsx.
  return pageMetadata({ title: page.title, description: page.description, path: `/ingresso-para/${page.slug}` });
}

/** A landing page for one kind of event (festa junina, formatura…), with the landing's look. */
export default async function EventTypePage({ params }: Props) {
  const page = eventSeoPage((await params).slug);
  if (page === undefined) {
    notFound();
  }
  const templates = (EVENT_TEMPLATES[page.slug] ?? []).map(templateSeoById).filter((template) => template !== undefined);
  const others = eventSeoPages.filter((other) => other.slug !== page.slug);
  const guides = guidesForEvent(page.slug);
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={eventPageJsonLd(page)} />
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16 lg:pb-28">
            <div className="flex flex-col items-start gap-6">
              <Breadcrumb items={[{ label: t.home, href: "/" }, { label: t.hubBreadcrumb, href: "/ingresso-para" }, { label: page.label }]} />
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
                <ButtonLink href="/precos" size="lg" variant="secondary">
                  {t.secondaryCta}
                </ButtonLink>
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 sm:flex sm:flex-wrap sm:gap-x-5">
                {landingTexts.trust.map((item) => (
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

        {/* How it works for this kind of event */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 lg:py-24">
            <SectionHeading title={t.stepsTitle(page.label)} lead={t.stepsLead} />
            <ol className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {page.passos.map((step, index) => (
                <li key={step.titulo} className="flex gap-4 rounded-3xl border border-border bg-bg p-5 sm:flex-col sm:p-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-solid font-mono text-sm font-semibold text-brand-fg">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h3 className="text-base font-semibold text-fg">{step.titulo}</h3>
                    <p className="text-[15px] leading-relaxed text-fg-muted">{step.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section id="duvidas" className="border-t border-border bg-bg">
          <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading title={landingTexts.faqTitle} />
            <FaqList items={page.faq.map((item) => ({ question: item.pergunta, answer: item.resposta }))} />
          </div>
        </section>

        {/* Templates for this kind of event */}
        {templates.length > 0 && (
          <section className="border-t border-border bg-surface">
            <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 lg:py-24">
              <SectionHeading title={t.templatesTitle(page.label)} lead={t.templatesLead} />
              <ul className="grid gap-4 sm:grid-cols-3">
                {templates.map((template) => (
                  <li key={template.id}>
                    <TemplateCard page={template} headingLevel="h3" />
                  </li>
                ))}
              </ul>
              <div className="flex justify-center">
                <ButtonLink href="/modelos" variant="secondary">
                  {templateGalleryTexts.all}
                </ButtonLink>
              </div>
            </div>
          </section>
        )}

        {/* Guides for organizing this kind of event */}
        {guides.length > 0 && (
          <section className="border-t border-border bg-bg">
            <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 lg:py-24">
              <SectionHeading title={guidesTexts.forEventTitle} />
              <ul className="grid gap-4 sm:grid-cols-3">
                {guides.slice(0, 3).map((guide) => (
                  <li key={guide.slug}>
                    <GuideCard guide={guide} headingLevel="h3" />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <FinalCta title={page.cta} />

        {/* The other kinds of event */}
        <nav aria-labelledby="outros-eventos" className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-4 py-12 sm:px-6">
            <h2 id="outros-eventos" className="text-sm font-semibold text-fg-subtle">
              {t.otherEvents}
            </h2>
            <ul className="flex flex-wrap justify-center gap-2.5">
              {others.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/ingresso-para/${other.slug}`}
                    className="inline-flex min-h-10 items-center rounded-full border border-border bg-bg px-4 text-sm font-medium text-fg-muted transition hover:border-brand/40 hover:text-fg active:bg-surface-2"
                  >
                    {other.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </main>

      <SiteFooter />
      <MobileCta />
    </div>
  );
}
