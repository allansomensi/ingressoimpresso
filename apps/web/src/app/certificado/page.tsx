import type { Metadata } from "next";

import { CertificatePage } from "@/components/certificate/certificate-page";
import { privatePageMetadata } from "@/lib/seo";
import { certificate as certificateTexts } from "@/texts/pt-BR/certificate";

// A private link (the token is in the fragment): never indexed, but shared, so it has a preview.
export const metadata: Metadata = privatePageMetadata({ title: certificateTexts.metaTitle, description: certificateTexts.metaDescription });

export default function CertificateRoute() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
      <CertificatePage />
    </main>
  );
}
