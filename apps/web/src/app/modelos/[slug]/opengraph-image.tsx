import { templateSeoBySlug, templateSeoPages } from "@/content/seo-templates";
import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { texts } from "@/texts/pt-BR";

// Built with the site (fonts and pictures are read from disk), one per template.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = texts.meta.shareImageAlt;

export function generateStaticParams() {
  return templateSeoPages.map((page) => ({ slug: page.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = templateSeoBySlug((await params).slug);
  return shareImage({
    eyebrow: texts.templateGallery.templateEyebrow,
    title: page?.h1 ?? texts.templateGallery.title,
    templates: page === undefined ? [] : [page],
  });
}
