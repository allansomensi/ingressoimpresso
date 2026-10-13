"use client";

import { TemplateSample } from "@/components/marketing/template-sample";
import { useNearScreen } from "@/components/ui/near-screen";
import { TEMPLATES, type TicketTemplate } from "@/lib/templates/catalog";
import { texts } from "@/texts/pt-BR";

const t = texts.landing;

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
 * screen: 32 samples and their typefaces would otherwise slow down the top of the landing page.
 */
export function TemplateShowcase() {
  const half = Math.ceil(TEMPLATES.length / 2);
  const { attach, near } = useNearScreen();
  return (
    <div ref={attach} className="flex flex-col gap-6 py-2" role="img" aria-label={t.templatesTitle}>
      <Row templates={TEMPLATES.slice(0, half)} offset={0} placeholder={!near} />
      <Row templates={TEMPLATES.slice(half)} reverse offset={1} placeholder={!near} />
    </div>
  );
}
