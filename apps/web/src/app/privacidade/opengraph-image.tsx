import { LEGAL_DOCUMENTS } from "@/content/legal";
import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { footer as footerTexts } from "@/texts/pt-BR/footer";

// Every public page has its own share image: a page that sets `openGraph` loses the root one.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = LEGAL_DOCUMENTS.privacidade.title;

export default function Image() {
  return shareImage({ eyebrow: footerTexts.legal, title: LEGAL_DOCUMENTS.privacidade.title, templates: [] });
}
