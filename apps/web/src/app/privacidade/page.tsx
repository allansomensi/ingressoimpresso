import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_DOCUMENTS } from "@/content/legal";

const document = LEGAL_DOCUMENTS.privacidade;

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/privacidade" },
};

export default function Page() {
  return <LegalPage document={document} />;
}
