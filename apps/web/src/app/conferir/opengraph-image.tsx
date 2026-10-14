import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { verifyPage as verifyPageTexts } from "@/texts/pt-BR/verify-page";

export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = verifyPageTexts.metaTitle;

export default function Image() {
  return shareImage({ eyebrow: verifyPageTexts.eyebrow, title: verifyPageTexts.headline, templates: [] });
}
