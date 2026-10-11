// JSON-LD para a home (app/page.tsx) e para as páginas por tipo de evento.
// Uso na home: <JsonLd data={homeJsonLd} />
// Uso nas páginas de evento: <JsonLd data={eventPageJsonLd(page)} />
// Um bloco de dados (application/ld+json) não é executado: a CSP não pede nonce (ADR 0048).

import type { EventSeoPage } from "@/content/seo-event-pages";
import { SITE_URL as SITE } from "@/lib/site";

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "Ingresso Impresso",
      url: SITE,
      logo: `${SITE}/apple-icon.png`, // app/apple-icon.png, 180 × 180 px
      sameAs: ["https://www.instagram.com/ingressoimpresso"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "Ingresso Impresso",
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#app`,
      name: "Ingresso Impresso",
      url: SITE,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Venda e controle de ingressos",
      operatingSystem: "Web, Android, iOS",
      inLanguage: "pt-BR",
      description:
        "Ingressos impressos, numerados e com QR code à prova de cópia, com check-in na porta pelo celular, mesmo sem internet.",
      publisher: { "@id": `${SITE}/#organization` },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "BRL",
        lowPrice: "0.05",
        highPrice: "0.15",
        description:
          "30 ingressos grátis por conta nova. Depois, pagamento por lote, a partir de R$ 0,05 por ingresso, sem mensalidade.",
      },
      featureList: [
        "QR code com assinatura digital contra cópia",
        "Check-in offline em qualquer celular",
        "PDF A4 com marcas de corte e PDF com sangria para gráfica",
        "Ingresso no celular pelo WhatsApp",
        "Faixas de numeração por vendedor",
        "Cancelamento de faixas de números",
        "Relatórios com exportação para planilha",
        "16 modelos prontos e editor visual",
      ],
    },
  ],
};

export function eventPageJsonLd(page: EventSeoPage) {
  const url = `${SITE}/ingresso-para/${page.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: page.title,
        description: page.description,
        inLanguage: "pt-BR",
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#app` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: SITE },
          { "@type": "ListItem", position: 2, name: page.h1, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faq.map((f) => ({
          "@type": "Question",
          name: f.pergunta,
          acceptedAnswer: { "@type": "Answer", text: f.resposta },
        })),
      },
    ],
  };
}
