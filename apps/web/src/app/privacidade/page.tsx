import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { pageMetadata, withBrand } from "@/lib/seo";

const document = LEGAL_DOCUMENTS.privacidade;

export const metadata: Metadata = pageMetadata({
  title: withBrand(document.title),
  description: document.description,
  path: "/privacidade",
});

export default function Page() {
  return <LegalPage document={document} />;
}
