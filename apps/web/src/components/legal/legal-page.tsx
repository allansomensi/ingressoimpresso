import { FileText, Mail, Scale, ShieldCheck, Undo2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PrintButton } from "@/components/legal/print-button";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { LEGAL_DOCUMENTS, LEGAL_ENTITY, type LegalBlock, type LegalDocument, type LegalSlug } from "@/content/legal";
import { texts } from "@/texts/pt-BR";

const t = texts.legal;

const ICONS: Record<LegalSlug, LucideIcon> = { termos: Scale, privacidade: ShieldCheck, reembolso: Undo2 };

/** Names of the documents, linked wherever another document mentions them. */
const LINKS: readonly { name: string; slug: LegalSlug }[] = (Object.keys(LEGAL_DOCUMENTS) as LegalSlug[]).map((slug) => ({
  name: LEGAL_DOCUMENTS[slug].title,
  slug,
}));
const NAME_PATTERN = new RegExp(`(${LINKS.map((link) => link.name).join("|")}|${LEGAL_ENTITY.email.replace(/\./g, "\\.")})`, "g");

/** A paragraph with the other documents' names and the contact e-mail turned into links. */
function linked(text: string, current: LegalSlug): ReactNode[] {
  return text.split(NAME_PATTERN).map((part, index) => {
    const link = LINKS.find((item) => item.name === part);
    if (link !== undefined && link.slug !== current) {
      return (
        <Link key={index} href={`/${link.slug}`} className="font-medium text-brand underline-offset-2 hover:underline">
          {part}
        </Link>
      );
    }
    if (part === LEGAL_ENTITY.email) {
      return (
        <a key={index} href={`mailto:${part}`} className="font-medium text-brand underline-offset-2 hover:underline">
          {part}
        </a>
      );
    }
    return part;
  });
}

function Block({ block, slug }: { block: LegalBlock; slug: LegalSlug }) {
  if (block.type === "p") {
    return <p>{linked(block.text, slug)}</p>;
  }
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-fg-subtle">
      {block.items.map((item) => (
        <li key={item}>{linked(item, slug)}</li>
      ))}
    </ul>
  );
}

/** `9 de outubro de 2026` from `2026-10-09`. */
function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** A legal document: summary, table of contents, sections and the other documents. */
export function LegalPage({ document }: { document: LegalDocument }) {
  const Icon = ICONS[document.slug];
  const others = (Object.keys(LEGAL_DOCUMENTS) as LegalSlug[]).filter((slug) => slug !== document.slug);
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-border bg-glow">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-12 pb-10 sm:px-6 lg:pt-16">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
              <Icon className="size-6" aria-hidden />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">{document.title}</h1>
            <p className="max-w-2xl text-lg leading-relaxed text-pretty text-fg-muted">{document.description}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-subtle">
              <span>{t.updatedAt(longDate(document.updatedAt))}</span>
              <PrintButton label={t.print} />
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[15rem_1fr] lg:py-16">
          <nav aria-label={t.contents} className="hidden lg:block print:hidden">
            <div className="sticky top-24 flex flex-col gap-3">
              <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.contents}</p>
              <ol className="flex flex-col gap-1 border-l border-border">
                {document.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="-ml-px block border-l border-transparent py-1 pl-4 text-sm leading-snug text-fg-muted transition hover:border-brand hover:text-fg"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <article className="flex min-w-0 flex-col gap-10">
            <aside className="rounded-2xl border border-brand/20 bg-brand-soft/60 p-5 sm:p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-soft-fg">
                <FileText className="size-4" aria-hidden />
                {t.summaryTitle}
              </p>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed text-fg marker:text-brand">
                {document.summary.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-fg-muted">{t.summaryHint}</p>
            </aside>

            {document.sections.map((section) => (
              <section key={section.id} id={section.id} className="flex scroll-mt-24 flex-col gap-4">
                <h2 className="text-xl font-semibold tracking-tight text-fg">{section.title}</h2>
                <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-fg-muted">
                  {section.blocks.map((block, index) => (
                    <Block key={index} block={block} slug={document.slug} />
                  ))}
                </div>
              </section>
            ))}

            <div className="grid gap-4 border-t border-border pt-10 sm:grid-cols-2 print:hidden">
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
                <p className="font-semibold text-fg">{t.questions}</p>
                <p className="text-sm leading-relaxed text-fg-muted">{t.questionsBody}</p>
                <a href={`mailto:${LEGAL_ENTITY.email}`} className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-brand">
                  <Mail className="size-4" aria-hidden />
                  {LEGAL_ENTITY.email}
                </a>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
                <p className="font-semibold text-fg">{t.otherDocuments}</p>
                {others.map((slug) => {
                  const OtherIcon = ICONS[slug];
                  return (
                    <Link key={slug} href={`/${slug}`} className="flex items-center gap-2 text-sm font-medium text-fg-muted transition hover:text-fg">
                      <OtherIcon className="size-4 text-fg-subtle" aria-hidden />
                      {LEGAL_DOCUMENTS[slug].title}
                    </Link>
                  );
                })}
              </div>
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
