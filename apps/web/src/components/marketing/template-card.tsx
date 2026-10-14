import Image from "next/image";
import Link from "next/link";

import { templateImagePath, type TemplateSeoPage } from "@/content/seo-templates";
import { templateById } from "@/lib/templates/catalog";
import { templateImageSize } from "@/lib/templates/images";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";
import { templates as templatesTexts } from "@/texts/pt-BR/templates";

const t = templateGalleryTexts;

/** A template in a grid: its picture, name and what it is for, linking to its page. */
export function TemplateCard({ page, headingLevel = "h2" }: { page: TemplateSeoPage; headingLevel?: "h2" | "h3" }) {
  const item = templatesTexts.items[page.id];
  const palettes = templateById(page.id)?.palettes.length ?? 1;
  const size = templateImageSize(page.id);
  const Heading = headingLevel;
  return (
    <Link
      href={`/modelos/${page.slug}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xs transition hover:border-brand/40 hover:shadow-md active:bg-surface-2"
    >
      <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl bg-surface-2 p-4">
        <Image
          src={templateImagePath(page)}
          width={size.width}
          height={size.height}
          alt={t.imageAlt(page.h1)}
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw"
          className="h-auto max-h-full w-auto max-w-full rounded-[3px] object-contain shadow-md ring-1 ring-black/10 transition group-hover:-translate-y-0.5"
        />
      </div>
      <div className="flex flex-col gap-1 px-1 pb-1">
        <Heading className="text-base font-semibold text-fg">{item.name}</Heading>
        <p className="text-sm leading-relaxed text-fg-muted">{item.description}</p>
        <p className="pt-1 text-xs text-fg-subtle">{t.colors(palettes)}</p>
      </div>
    </Link>
  );
}
