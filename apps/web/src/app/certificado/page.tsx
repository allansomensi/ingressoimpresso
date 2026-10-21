import type { Metadata } from "next";

import { CertificatePage } from "@/components/certificate/certificate-page";
import { certificate as certificateTexts } from "@/texts/pt-BR/certificate";

// A private link (the token is in the fragment): never indexed.
export const metadata: Metadata = {
  title: { absolute: certificateTexts.metaTitle },
  description: certificateTexts.metaDescription,
  robots: { index: false, follow: false },
};

export default function CertificateRoute() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
      <CertificatePage />
    </main>
  );
}
