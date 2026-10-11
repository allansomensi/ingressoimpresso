import { templateSeoById } from "@/content/seo-templates";
import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { texts } from "@/texts/pt-BR";

export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = texts.meta.shareImageAlt;

export default function Image() {
  return shareImage({
    eyebrow: texts.templateGallery.eyebrow,
    title: texts.templateGallery.title,
    templates: (["arraia", "show", "theater"] as const).map(templateSeoById).filter((page) => page !== undefined),
  });
}
