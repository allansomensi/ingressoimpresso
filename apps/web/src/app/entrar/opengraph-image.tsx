import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { landing as landingTexts } from "@/texts/pt-BR/landing";
import { login as loginTexts } from "@/texts/pt-BR/login";

// Every public page has its own share image: a page that sets `openGraph` loses the root one.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = loginTexts.metaTitle;

export default function Image() {
  return shareImage({ eyebrow: loginTexts.title, title: landingTexts.primaryCta, templates: [] });
}
