import { eventSeoPage, eventSeoPages } from "@/content/seo-event-pages";
import { EVENT_TEMPLATES, templateSeoById } from "@/content/seo-templates";
import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { texts } from "@/texts/pt-BR";

// Built with the site (fonts and pictures are read from disk), one per page.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = texts.meta.shareImageAlt;

export function generateStaticParams() {
  return eventSeoPages.map((page) => ({ slug: page.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const page = eventSeoPage(slug);
  const templates = (EVENT_TEMPLATES[slug] ?? []).map(templateSeoById).filter((template) => template !== undefined);
  return shareImage({
    eyebrow: page === undefined ? texts.meta.tagline : texts.eventPages.eyebrow(page.label),
    title: page?.h1 ?? texts.meta.title,
    templates,
  });
}
