import { templateSeoById } from "@/content/seo-templates";
import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";

export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = eventPagesTexts.hubMetaTitle;

export default function Image() {
  return shareImage({
    eyebrow: eventPagesTexts.hubEyebrow,
    title: eventPagesTexts.hubTitle,
    templates: (["party", "arraia", "graduation"] as const).map(templateSeoById).filter((page) => page !== undefined),
  });
}
