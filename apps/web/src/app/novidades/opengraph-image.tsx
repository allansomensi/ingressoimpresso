import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { changelog as changelogTexts } from "@/texts/pt-BR/changelog";

// Every public page has its own share image: a page that sets `openGraph` loses the root one.
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = changelogTexts.metaTitle;

export default function Image() {
  return shareImage({ eyebrow: changelogTexts.title, title: changelogTexts.metaTitle, templates: [] });
}
