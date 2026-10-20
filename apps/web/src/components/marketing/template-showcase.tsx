"use client";

import { TemplateSample } from "@/components/marketing/template-sample";
import { useNearScreen } from "@/components/ui/near-screen";
import { templateById, type TemplateId, type TicketTemplate } from "@/lib/templates/catalog";
import { landing as landingTexts } from "@/texts/pt-BR/landing";

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
const SAMPLES = SHOWCASE.map(templateById).filter((template) => template !== undefined);

function Sample({ template, index, placeholder }: { template: TicketTemplate; index: number; placeholder: boolean }) {
  return (
    <TemplateSample
      id={template.id}
      palette={index}
      index={index}
      placeholder={placeholder}
      height="var(--sample-height)"
      className="shrink-0 rounded-[3px] shadow-lg ring-1 ring-black/10 [--sample-height:8rem] sm:[--sample-height:10rem]"
    />
  );
}

function Row({
  templates,
  reverse,
  offset,
  placeholder,
}: {
  templates: readonly TicketTemplate[];
  reverse?: boolean;
  offset: number;
  placeholder: boolean;
}) {
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] motion-reduce:overflow-x-auto">
      <div className={`flex w-max animate-marquee gap-6 pr-6 hover:[animation-play-state:paused] ${reverse === true ? "[animation-direction:reverse]" : ""}`}>
        {/* Twice, so the loop is seamless. */}
        {[0, 1].map((copy) =>
          templates.map((template, index) => (
            <div key={`${String(copy)}-${template.id}`} aria-hidden={copy === 1 ? true : undefined}>
              <Sample template={template} index={index + offset} placeholder={placeholder} />
            </div>
          )),
        )}
      </div>
    </div>
  );
}

/**
 * Two rows of templates sliding by, filled with sample events. They are drawn only near the
 * screen: 48 samples and their typefaces would otherwise slow down the top of the landing page.
 */
export function TemplateShowcase() {
  const half = Math.ceil(SAMPLES.length / 2);
  const { attach, near } = useNearScreen();
  return (
    <div ref={attach} className="flex flex-col gap-6 py-2" role="img" aria-label={t.templatesTitle}>
      <Row templates={SAMPLES.slice(0, half)} offset={0} placeholder={!near} />
      <Row templates={SAMPLES.slice(half)} reverse offset={1} placeholder={!near} />
    </div>
  );
}
