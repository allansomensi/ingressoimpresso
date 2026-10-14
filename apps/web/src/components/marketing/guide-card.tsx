import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";

import { guideReadingMinutes, type SeoGuide } from "@/content/seo-guides";
import { guides as guidesTexts } from "@/texts/pt-BR/guides";

const t = guidesTexts;

/** A guide in a grid: its title, what it answers and how long it takes, linking to it. */
export function GuideCard({ guide, headingLevel = "h2" }: { guide: SeoGuide; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <Link
      href={`/guias/${guide.slug}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-xs transition hover:border-brand/40 hover:shadow-md active:bg-surface-2 sm:p-6"
    >
      <span className="flex items-center gap-2 text-xs font-medium text-fg-subtle">
        <BookOpen className="size-4 text-brand" aria-hidden />
        {t.readingTime(guideReadingMinutes(guide))}
      </span>
      <Heading className="text-lg leading-snug font-semibold tracking-tight text-fg">{guide.h1}</Heading>
      <p className="flex-1 text-[15px] leading-relaxed text-fg-muted">{guide.description}</p>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-soft-fg">
        {t.read}
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
