import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { meta as metaTexts } from "@/texts/pt-BR/meta";
import { status as statusTexts } from "@/texts/pt-BR/status";

// Every public page has its own share image: a page that sets `openGraph` loses the root one.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = statusTexts.title;

export default function Image() {
  return shareImage({ eyebrow: metaTexts.title, title: statusTexts.title, templates: [] });
}
