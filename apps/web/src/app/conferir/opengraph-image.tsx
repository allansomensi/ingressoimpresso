import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { texts } from "@/texts/pt-BR";

export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = texts.verifyPage.metaTitle;

export default function Image() {
  return shareImage({ eyebrow: texts.verifyPage.eyebrow, title: texts.verifyPage.headline, templates: [] });
}
