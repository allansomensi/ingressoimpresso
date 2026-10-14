import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { helpCenter as helpCenterTexts } from "@/texts/pt-BR/help-center";

// Every public page has its own share image: a page that sets `openGraph` loses the root one.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = helpCenterTexts.metaTitle;

export default function Image() {
  return shareImage({ eyebrow: helpCenterTexts.eyebrow, title: helpCenterTexts.headline, templates: [] });
}
