import { Activity, ArrowUpRight, BookOpen, Bug, ChevronDown, CircleHelp, Mail, Megaphone, ReceiptText, ShieldAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { buttonClass } from "@/components/ui";
import { LEGAL_ENTITY } from "@/content/legal";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";
import { helpCenter as helpCenterTexts } from "@/texts/pt-BR/help-center";

import { CopyEmail } from "./copy-email";

const t = helpCenterTexts;
const REPOSITORY_ISSUES = "https://github.com/allansomensi/ingressoimpresso/issues/new/choose";

const SHORTCUTS: readonly { key: keyof typeof t.shortcuts; href: string; icon: LucideIcon }[] = [
  { key: "faq", href: "/#duvidas", icon: CircleHelp },
  { key: "status", href: "/status", icon: Activity },
  { key: "news", href: "/novidades", icon: Megaphone },
  { key: "refund", href: "/reembolso", icon: ReceiptText },
];

/**
 * Where "Suporte" leads, from the panel and the site: the quick answers first, then how to write
 * to us with what we need to help, and a word on scams. It replaces a bare `mailto:`, which does
 * nothing on a computer without a mail app.
 */
export function SupportPage() {
  const mailto = `mailto:${LEGAL_ENTITY.email}?subject=${encodeURIComponent(t.mailSubject)}`;
  return (
    <>
      <section className="relative overflow-hidden bg-glow">
        <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-50" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 pt-14 pb-12 sm:px-6 lg:pt-20 lg:pb-16">
          <Breadcrumb items={[{ label: eventPagesTexts.home, href: "/" }, { label: t.title }]} />
          <span className="text-sm font-semibold tracking-wide text-brand uppercase">{t.eyebrow}</span>
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{t.headline}</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-pretty text-fg-muted">{t.lead}</p>
        </div>
      </section>

      <section aria-labelledby="atalhos" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-14 sm:px-6">
        <h2 id="atalhos" className="sr-only">
          {t.shortcutsTitle}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SHORTCUTS.map(({ key, href, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className="group flex h-full flex-col gap-3 rounded-3xl border border-border bg-surface p-5 shadow-xs transition hover:border-border-strong hover:shadow-sm active:bg-surface-2"
              >
                <span className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <ArrowUpRight aria-hidden className="size-4 text-fg-subtle transition group-hover:text-fg" />
                </span>
                <span className="text-base font-semibold text-fg">{t.shortcuts[key].title}</span>
                <span className="text-sm leading-relaxed text-fg-muted">{t.shortcuts[key].body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:py-20">
          <div className="flex flex-col gap-5">
            <h2 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              <BookOpen aria-hidden className="size-6 text-brand" />
              {t.topicsTitle}
            </h2>
            <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-bg">
              {t.topics.map((topic) => (
                <details key={topic.question} className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 py-4 text-[15px] font-medium text-fg transition hover:bg-surface-2/60 active:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">{topic.question}</span>
                    <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-subtle transition group-open:rotate-180" />
                  </summary>
                  <p className="px-5 pb-5 text-[15px] leading-relaxed text-fg-muted">{topic.answer}</p>
                </details>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-5 rounded-3xl border border-border bg-bg p-6 shadow-xs">
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-fg">
                  <Mail aria-hidden className="size-5 text-brand" />
                  {t.contactTitle}
                </h2>
                <p className="text-[15px] leading-relaxed text-fg-muted">{t.contactBody}</p>
              </div>
              <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 font-medium break-all text-fg select-all">{LEGAL_ENTITY.email}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <a href={mailto} className={buttonClass({ className: "flex-1" })}>
                  <Mail />
                  {t.writeEmail}
                </a>
                <CopyEmail email={LEGAL_ENTITY.email} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-fg">{t.checklistTitle}</h3>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-fg-muted marker:text-fg-subtle">
                  {t.checklist.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div role="note" className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3.5 text-sm text-warning-fg">
              <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p className="leading-relaxed">
                <span className="font-semibold">{t.safetyTitle}.</span> {t.safetyBody}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-14 sm:px-6">
        <h2 className="text-lg font-semibold text-fg">{t.developersTitle}</h2>
        <p className="max-w-2xl text-[15px] leading-relaxed text-fg-muted">{t.developersBody}</p>
        <a href={REPOSITORY_ISSUES} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost", size: "sm" })}>
          <Bug />
          {t.developersLink}
        </a>
      </section>
    </>
  );
}
