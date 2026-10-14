import { SHARE_CONTENT_TYPE, SHARE_SIZE, shareImage } from "@/lib/share-image";
import { pricingPage as pricingPageTexts } from "@/texts/pt-BR/pricing-page";

export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = pricingPageTexts.metaTitle;

export default function Image() {
  return shareImage({ eyebrow: pricingPageTexts.eyebrow, title: pricingPageTexts.headline, templates: [] });
}
