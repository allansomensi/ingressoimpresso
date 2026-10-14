import { templateSeoById } from "@/content/seo-templates";
import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { meta as metaTexts } from "@/texts/pt-BR/meta";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";

export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = metaTexts.shareImageAlt;

export default function Image() {
  return shareImage({
    eyebrow: templateGalleryTexts.eyebrow,
    title: templateGalleryTexts.title,
    templates: (["arraia", "show", "theater"] as const).map(templateSeoById).filter((page) => page !== undefined),
  });
}
