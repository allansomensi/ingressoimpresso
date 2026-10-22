import { seoGuide, seoGuides } from "@/content/seo-guides";
import { templateSeoById } from "@/content/seo-templates";
import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { guides as guidesTexts } from "@/texts/pt-BR/guides";

// Built with the site (fonts and pictures are read from disk), one per guide.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = guidesTexts.shareImageAlt;

export function generateStaticParams() {
  return seoGuides.map((guide) => ({ slug: guide.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const guide = seoGuide((await params).slug);
  const templates = (guide?.templates ?? []).map(templateSeoById).filter((template) => template !== undefined);
  return shareImage({
    eyebrow: guidesTexts.articleEyebrow,
    title: guide?.h1 ?? guidesTexts.headline,
    templates,
  });
}
