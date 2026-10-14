import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { guides as guidesTexts } from "@/texts/pt-BR/guides";

export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = guidesTexts.metaTitle;

export default function Image() {
  return shareImage({ eyebrow: guidesTexts.eyebrow, title: guidesTexts.headline, templates: [] });
}
