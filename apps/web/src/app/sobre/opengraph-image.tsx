import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { about as aboutTexts } from "@/texts/pt-BR/about";

// Every public page has its own share image: a page that sets `openGraph` loses the root one.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = aboutTexts.metaTitle;

export default function Image() {
  return shareImage({ eyebrow: aboutTexts.eyebrow, title: aboutTexts.headline, templates: [] });
}
