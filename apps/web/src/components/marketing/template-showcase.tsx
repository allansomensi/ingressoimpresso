import Image from "next/image";
import Link from "next/link";

import { templateImagePath, templateSeoById, type TemplateSeoPage } from "@/content/seo-templates";
import type { TemplateId } from "@/lib/templates/catalog";
import { templateImageSize } from "@/lib/templates/images";
import { landing as landingTexts } from "@/texts/pt-BR/landing";
import { templates as templatesTexts } from "@/texts/pt-BR/templates";

const t = landingTexts;

/** A varied selection of the catalog for the landing page: every kind of event, tickets and fichas. */
const SHOWCASE: readonly TemplateId[] = [
  "show",
  "arraia",
  "fifteen",
  "rock",
  "graduation",
  "festival",
  "wedding",
  "tokenBeer",
  "theater",
  "luau",
  "sports",
  "gala",
  "raffle",
  "electronic",
  "church",
  "birthday",
  "circus",
  "sertanejo",
  "carnival",
  "admitOne",
  "newYear",
  "comic",
  "kraft",
  "token",
];

type Shown = { page: TemplateSeoPage; width: number; height: number };

// Worked out once on the server: the browser gets only <img> tags, never the catalog's code.
const SAMPLES: readonly Shown[] = SHOWCASE.flatMap((id) => {
  const page = templateSeoById(id);
  return page === undefined ? [] : [{ page, ...templateImageSize(id) }];
});

/** Height of a sample on the strip, in CSS pixels (8rem on phones, 10rem from `sm`). */
const SAMPLE_HEIGHT = 160;

function Sample({ shown, hidden }: { shown: Shown; hidden: boolean }) {
  const { page, width, height } = shown;
  // The width the picture takes at the strip's height, for `sizes` (the browser picks the file).
  const shownWidth = Math.ceil((SAMPLE_HEIGHT * width) / height);
  return (
    <Link
      href={`/modelos/${page.slug}`}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden ? true : undefined}
      className="block shrink-0 rounded-[3px] shadow-lg ring-1 ring-black/10 transition hover:-translate-y-0.5 active:translate-y-0"
    >
      <Image
        src={templateImagePath(page)}
        width={width}
        height={height}
        alt={hidden ? "" : templatesTexts.items[page.id].name}
        sizes={`${String(shownWidth)}px`}
        className="h-32 w-auto rounded-[3px] sm:h-40"
      />
    </Link>
  );
}

function Row({ samples, reverse }: { samples: readonly Shown[]; reverse?: boolean }) {
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] motion-reduce:overflow-x-auto">
      <div className={`flex w-max animate-marquee gap-6 pr-6 hover:[animation-play-state:paused] ${reverse === true ? "[animation-direction:reverse]" : ""}`}>
        {/* Twice, so the loop is seamless; the copy is invisible to screen readers and the keyboard. */}
        {[0, 1].map((copy) =>
          samples.map((shown) => <Sample key={`${String(copy)}-${shown.page.id}`} shown={shown} hidden={copy === 1} />),
        )}
      </div>
    </div>
  );
}

/**
 * Two rows of templates sliding by. Each one is its ready picture (public/modelos, ADR 0062),
 * loaded lazily and sized for the strip: no live ticket, typeface or template code on the phone.
 */
export function TemplateShowcase() {
  const half = Math.ceil(SAMPLES.length / 2);
  return (
    <nav aria-label={t.templatesTitle} className="flex flex-col gap-6 py-2">
      <Row samples={SAMPLES.slice(0, half)} />
      <Row samples={SAMPLES.slice(half)} reverse />
    </nav>
  );
}
