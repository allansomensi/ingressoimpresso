import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  FileText,
  LayoutTemplate,
  MousePointerClick,
  MessageCircle,
  Printer,
  Send,
  ShieldCheck,
  Smartphone,
  Ticket,
  Users,
  WifiOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";

import { DigitalTicketMock, PhoneMock, TicketMock } from "@/components/marketing/mockups";
import { PricingSection } from "@/components/marketing/pricing";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TemplateShowcase } from "@/components/marketing/template-showcase";
import { ButtonLink } from "@/components/ui";
import { texts } from "@/texts/pt-BR";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const t = texts.landing;
const FEATURE_ICONS: readonly LucideIcon[] = [
  ShieldCheck,
  Printer,
  WifiOff,
  Send,
  Users,
  XCircle,
  BarChart3,
  LayoutTemplate,
  MousePointerClick,
];
const STEP_ICONS: readonly LucideIcon[] = [FileText, Ticket, Printer, Smartphone];

function SectionHeading({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
      {eyebrow !== undefined && (
        <span className="text-sm font-semibold tracking-wide text-brand uppercase">{eyebrow}</span>
      )}
      <h2 className="text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">{title}</h2>
      {lead !== undefined && <p className="text-lg leading-relaxed text-pretty text-fg-muted">{lead}</p>}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24 lg:pb-28">
            <div className="flex flex-col items-start gap-6 animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-soft-fg">
                <span className="size-1.5 rounded-full bg-brand" />
                {t.eyebrow}
              </span>
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl lg:text-6xl">
                {t.headline}
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-pretty text-fg-muted sm:text-xl">{t.lead}</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                  {t.primaryCta}
                </ButtonLink>
                <ButtonLink href="#como-funciona" size="lg" variant="secondary">
                  {t.secondaryCta}
                </ButtonLink>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-2">
                {t.trust.map((item) => (
                  <li key={item} className="flex items-center gap-1.5 text-sm text-fg-muted">
                    <Check className="size-4 text-success" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto h-[360px] w-full max-w-[460px] sm:h-[440px]">
              <div className="absolute inset-0 origin-top scale-[0.78] sm:scale-100">
                <div className="absolute top-6 left-0 -rotate-6 animate-rise sm:left-2">
                  <TicketMock />
                </div>
                <div className="absolute right-0 bottom-0 rotate-3 animate-rise [animation-delay:150ms] sm:right-2">
                  <PhoneMock />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Audience */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-10 sm:px-6">
            <p className="text-sm font-medium text-fg-subtle">{t.audienceTitle}</p>
            <ul className="flex flex-wrap justify-center gap-2.5">
              {t.audience.map((item) => (
                <li key={item} className="rounded-full border border-border bg-bg px-4 py-1.5 text-sm font-medium text-fg-muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" className="scroll-mt-16">
          <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading eyebrow={t.stepsTitle} title={t.stepsLead} />
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {t.steps.map((step, index) => {
                const Icon = STEP_ICONS[index] ?? FileText;
                return (
                  <li key={step.title} className="relative flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-solid text-brand-fg shadow-sm shadow-brand/30">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="font-mono text-sm font-semibold text-fg-subtle">0{index + 1}</span>
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight text-fg">{step.title}</h3>
                    <p className="text-[15px] leading-relaxed text-fg-muted">{step.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Templates */}
        <section id="modelos" className="scroll-mt-16 overflow-hidden border-y border-border bg-bg">
          <div className="flex flex-col gap-12 py-20 lg:py-28">
            <div className="px-4 sm:px-6">
              <SectionHeading eyebrow={texts.nav.templates} title={t.templatesTitle} lead={t.templatesLead} />
            </div>
            <TemplateShowcase />
            <div className="flex justify-center px-4">
              <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                {t.templatesCta}
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="recursos" className="scroll-mt-16 bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading title={t.featuresTitle} lead={t.featuresLead} />
            <ul className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {t.features.map((feature, index) => {
                const Icon = FEATURE_ICONS[index] ?? ShieldCheck;
                return (
                  <li key={feature.title} className="flex flex-col gap-3 bg-surface p-7 transition hover:bg-bg">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="text-base font-semibold text-fg">{feature.title}</h3>
                    <p className="text-[15px] leading-relaxed text-fg-muted">{feature.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Digital tickets */}
        <section id="no-celular" className="scroll-mt-16 border-t border-border bg-bg">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <div className="order-2 flex justify-center lg:order-1">
              <div className="relative">
                <div aria-hidden className="absolute -inset-10 rounded-full bg-brand/15 blur-3xl" />
                <DigitalTicketMock className="relative -rotate-2" />
                <span className="absolute -right-6 bottom-16 flex items-center gap-2 rounded-2xl bg-[#1f9d55] px-3.5 py-2 text-sm font-semibold text-white shadow-lg animate-pop [animation-delay:300ms]">
                  <MessageCircle className="size-4" aria-hidden />
                  WhatsApp
                </span>
              </div>
            </div>
            <div className="order-1 flex flex-col gap-6 lg:order-2">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
                <Smartphone className="size-6" aria-hidden />
              </span>
              <h2 className="text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">{t.digitalTitle}</h2>
              <p className="text-lg leading-relaxed text-pretty text-fg-muted">{t.digitalBody}</p>
              <ul className="flex flex-col gap-3">
                {t.digitalPoints.map((point) => (
                  <li key={point} className="flex items-center gap-3 text-[15px] text-fg">
                    <Check className="size-5 shrink-0 text-success" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Offline door */}
        <section className="relative overflow-hidden bg-[#0e0d14] text-white dark:border-y dark:border-border dark:bg-surface">
          <div aria-hidden className="absolute -top-40 -right-40 size-[36rem] rounded-full bg-[#5b3df5]/40 blur-3xl" />
          <div aria-hidden className="absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-[#16a34a]/20 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <div className="flex flex-col gap-6">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <WifiOff className="size-6" aria-hidden />
              </span>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t.offlineTitle}</h2>
              <p className="text-lg leading-relaxed text-white/70">{t.offlineBody}</p>
              <ul className="flex flex-col gap-3">
                {t.offlinePoints.map((point) => (
                  <li key={point} className="flex items-center gap-3 text-[15px] text-white/90">
                    <Check className="size-5 text-[#4ade80]" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-center lg:justify-end">
              <PhoneMock className="rotate-2" />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="precos" className="scroll-mt-16">
          <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading eyebrow={texts.nav.pricing} title={t.pricingTitle} lead={t.pricingLead} />
            <PricingSection />
          </div>
        </section>

        {/* FAQ */}
        <section id="duvidas" className="scroll-mt-16 border-t border-border bg-surface">
          <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading title={t.faqTitle} />
            <div className="flex flex-col gap-3">
              {t.faq.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-border bg-bg px-5 open:bg-surface open:shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium text-fg [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown className="size-5 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="pb-5 text-[15px] leading-relaxed text-fg-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 py-20 sm:px-6">
          <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 overflow-hidden rounded-[2rem] bg-brand-solid px-6 py-16 text-center text-white shadow-lg shadow-brand/30">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(255,255,255,0.25),transparent)]" />
            <h2 className="relative max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t.finalTitle}</h2>
            <p className="relative max-w-xl text-lg text-white/80">{t.finalBody}</p>
            <ButtonLink href="/entrar" size="lg" variant="inverse" icon={<ArrowRight />} className="relative flex-row-reverse">
              {t.primaryCta}
            </ButtonLink>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
