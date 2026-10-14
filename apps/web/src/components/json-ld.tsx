// Dados estruturados (schema.org) das páginas públicas (ADRs 0062 e 0081). Todas as páginas
// apontam para os mesmos nós da home pelo @id (organização, site e aplicativo), e cada uma
// acrescenta o que é dela: trilha, perguntas, imagem, artigo.
// Um bloco de dados (application/ld+json) não é executado: a CSP não pede nonce (ADR 0048).

import type { PricingDto } from "@ingressoimpresso/api-types";

import { LEGAL_ENTITY } from "@/content/legal";
import type { EventSeoPage } from "@/content/seo-event-pages";
import { guideWordCount, type SeoGuide } from "@/content/seo-guides";
import { templateImagePath, templateSeoById, EVENT_TEMPLATES, type TemplateSeoPage } from "@/content/seo-templates";
import { richTextPlain } from "@/lib/rich-text";
import { SITE_URL as SITE } from "@/lib/site";
import { meta as metaTexts } from "@/texts/pt-BR/meta";

const ORGANIZATION = `${SITE}/#organization`;
const WEBSITE = `${SITE}/#website`;
const APP = `${SITE}/#app`;
const LOGO = `${SITE}/#logo`;
/** The landing's share image (app/opengraph-image.png), the default picture of the site. */
const SITE_IMAGE = `${SITE}/opengraph-image.png`;

type Faq = readonly { question: string; answer: string }[];
type Crumb = { name: string; url: string };

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

function breadcrumb(url: string, crumbs: readonly Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: [{ name: "Início", url: SITE }, ...crumbs].map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

function faqPage(url: string, faq: Faq) {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    inLanguage: "pt-BR",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: richTextPlain(item.answer) },
    })),
  };
}

function webPage(url: string, name: string, description: string, extra: Record<string, unknown> = {}) {
  return {
    "@type": "WebPage",
    "@id": url,
    url,
    name,
    description,
    inLanguage: "pt-BR",
    isPartOf: { "@id": WEBSITE },
    about: { "@id": APP },
    publisher: { "@id": ORGANIZATION },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    ...extra,
  };
}

const organization = {
  "@type": "Organization",
  "@id": ORGANIZATION,
  name: metaTexts.title,
  url: SITE,
  description: metaTexts.description,
  email: LEGAL_ENTITY.email,
  logo: {
    "@type": "ImageObject",
    "@id": LOGO,
    url: `${SITE}/icons/icon-512.png`,
    contentUrl: `${SITE}/icons/icon-512.png`,
    width: 512,
    height: 512,
    caption: metaTexts.title,
  },
  image: { "@id": LOGO },
  areaServed: { "@type": "Country", name: "Brasil" },
  knowsLanguage: "pt-BR",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: LEGAL_ENTITY.email,
    availableLanguage: "Portuguese",
    areaServed: "BR",
  },
  sameAs: ["https://www.instagram.com/ingressoimpresso"],
};

const website = {
  "@type": "WebSite",
  "@id": WEBSITE,
  url: SITE,
  name: metaTexts.title,
  description: metaTexts.description,
  inLanguage: "pt-BR",
  publisher: { "@id": ORGANIZATION },
};

/** `0.05`: a price in centavos as schema.org wants it. */
function price(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** The price table as an offer: the API's when the page has it, else the launch table (ADR 0024). */
function offers(pricing: PricingDto | null) {
  const units = pricing?.tiers.map((tier) => tier.unitCents) ?? [];
  const low = units.length > 0 ? Math.min(...units) : 5;
  const high = units.length > 0 ? Math.max(...units) : 15;
  const free = pricing?.freeTickets ?? 30;
  return {
    "@type": "AggregateOffer",
    priceCurrency: "BRL",
    lowPrice: price(low),
    highPrice: price(high),
    offerCount: Math.max(units.length, 1),
    url: `${SITE}/precos`,
    availability: "https://schema.org/InStock",
    areaServed: "BR",
    description: `${String(free)} ingressos grátis por conta nova. Depois, pagamento por lote, de R$ ${price(high).replace(".", ",")} a R$ ${price(low).replace(".", ",")} por ingresso, sem mensalidade e sem porcentagem da venda.`,
  };
}

function application(pricing: PricingDto | null) {
  return {
    "@type": "SoftwareApplication",
    "@id": APP,
    name: metaTexts.title,
    url: SITE,
    image: SITE_IMAGE,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Venda e controle de ingressos",
    operatingSystem: "Web, Android, iOS",
    inLanguage: "pt-BR",
    description: metaTexts.description,
    publisher: { "@id": ORGANIZATION },
    offers: offers(pricing),
    featureList: [
      "QR code com assinatura digital contra cópia",
      "Check-in offline em qualquer celular",
      "PDF A4 com marcas de corte e PDF com sangria para gráfica",
      "Ingresso no celular pelo WhatsApp",
      "Faixas de numeração e acerto por vendedor",
      "Categorias, mesas e lugares",
      "Lista de nomes e contagem ao vivo na portaria",
      "Relatórios e prestação de contas em PDF e planilha",
      "16 modelos prontos e editor visual",
    ],
  };
}

/** The landing: who we are, the site, the product with its prices, and the questions. */
export function homeJsonLd({ title, description, faq, pricing }: { title: string; description: string; faq: Faq; pricing: PricingDto | null }) {
  // The canonical address of the home, as Next.js writes it: no trailing slash.
  const url = SITE;
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      website,
      application(pricing),
      // The home has no trail above it.
      webPage(url, title, description, { primaryImageOfPage: SITE_IMAGE, mainEntity: { "@id": APP }, breadcrumb: undefined }),
      faqPage(url, faq),
    ],
  };
}

/** The pricing page: the product's offer, from the table in force, and the questions about it. */
export function pricingJsonLd({ title, description, name, faq, pricing }: { title: string; description: string; name: string; faq: Faq; pricing: PricingDto | null }) {
  const url = `${SITE}/precos`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      application(pricing),
      webPage(url, title, description, { mainEntity: { "@id": APP } }),
      breadcrumb(url, [{ name, url }]),
      faqPage(url, faq),
    ],
  };
}

export function eventPageJsonLd(page: EventSeoPage) {
  const url = `${SITE}/ingresso-para/${page.slug}`;
  const first = (EVENT_TEMPLATES[page.slug] ?? []).map(templateSeoById).find((template) => template !== undefined);
  return {
    "@context": "https://schema.org",
    "@graph": [
      webPage(url, page.title, page.description, first === undefined ? {} : { primaryImageOfPage: `${SITE}${templateImagePath(first)}` }),
      breadcrumb(url, [
        { name: "Tipos de evento", url: `${SITE}/ingresso-para` },
        { name: page.label, url },
      ]),
      faqPage(
        url,
        page.faq.map((item) => ({ question: item.pergunta, answer: item.resposta })),
      ),
    ],
  };
}

/** The hub of the kinds of event (/ingresso-para): one page per kind. */
export function eventHubJsonLd(pages: readonly EventSeoPage[], name: string, description: string) {
  const url = `${SITE}/ingresso-para`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name,
        description,
        inLanguage: "pt-BR",
        isPartOf: { "@id": WEBSITE },
        about: { "@id": APP },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: pages.map((page, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${SITE}/ingresso-para/${page.slug}`,
            name: page.h1,
          })),
        },
      },
      breadcrumb(url, [{ name: "Tipos de evento", url }]),
    ],
  };
}

/** The template gallery (/modelos): the list of templates, each with its page and picture. */
export function templateGalleryJsonLd(pages: readonly TemplateSeoPage[], name: string, description: string) {
  const url = `${SITE}/modelos`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name,
        description,
        inLanguage: "pt-BR",
        isPartOf: { "@id": WEBSITE },
        about: { "@id": APP },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: pages.map((page, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${SITE}/modelos/${page.slug}`,
            name: page.h1,
            image: `${SITE}${templateImagePath(page)}`,
          })),
        },
      },
      breadcrumb(url, [{ name: "Modelos", url }]),
    ],
  };
}

/** A template's page: the page, its picture and where it sits in the site. */
export function templatePageJsonLd(page: TemplateSeoPage) {
  const url = `${SITE}/modelos/${page.slug}`;
  const image = `${SITE}${templateImagePath(page)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      webPage(url, page.title, page.description, { primaryImageOfPage: { "@id": `${url}#image` } }),
      {
        "@type": "ImageObject",
        "@id": `${url}#image`,
        contentUrl: image,
        url: image,
        caption: page.h1,
        description: page.description,
        inLanguage: "pt-BR",
        creator: { "@id": ORGANIZATION },
        creditText: metaTexts.title,
        copyrightNotice: `© ${metaTexts.title}`,
      },
      breadcrumb(url, [
        { name: "Modelos", url: `${SITE}/modelos` },
        { name: page.h1, url },
      ]),
    ],
  };
}

/** The guides (/guias): the list of articles. */
export function guideIndexJsonLd(guides: readonly SeoGuide[], name: string, description: string) {
  const url = `${SITE}/guias`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name,
        description,
        inLanguage: "pt-BR",
        isPartOf: { "@id": WEBSITE },
        publisher: { "@id": ORGANIZATION },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: guides.map((guide, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${SITE}/guias/${guide.slug}`,
            name: guide.h1,
          })),
        },
      },
      breadcrumb(url, [{ name: "Guias", url }]),
    ],
  };
}

/** One guide: an article by the organization, with its trail and questions. */
export function guideJsonLd(guide: SeoGuide) {
  const url = `${SITE}/guias/${guide.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      webPage(url, guide.title, guide.description, { mainEntity: { "@id": `${url}#article` } }),
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: guide.h1,
        description: guide.description,
        image: `${url}/opengraph-image`,
        datePublished: guide.publishedAt,
        dateModified: guide.updatedAt,
        author: { "@type": "Organization", "@id": ORGANIZATION, name: metaTexts.title, url: SITE },
        publisher: { "@id": ORGANIZATION },
        mainEntityOfPage: { "@id": url },
        isPartOf: { "@id": WEBSITE },
        inLanguage: "pt-BR",
        articleSection: "Guias",
        wordCount: guideWordCount(guide),
        about: { "@id": APP },
      },
      breadcrumb(url, [
        { name: "Guias", url: `${SITE}/guias` },
        { name: guide.label, url },
      ]),
      ...(guide.faq.length > 0 ? [faqPage(url, guide.faq)] : []),
    ],
  };
}

/** The public check of a ticket (/conferir, ADR 0075): the page, its trail and its questions. */
export function verifyPageJsonLd({ title, description, name, faq }: { title: string; description: string; name: string; faq: Faq }) {
  const url = `${SITE}/conferir`;
  return {
    "@context": "https://schema.org",
    "@graph": [webPage(url, title, description), breadcrumb(url, [{ name, url }]), faqPage(url, faq)],
  };
}

/** /sobre: the organization behind the product. */
export function aboutJsonLd({ title, description, name }: { title: string; description: string; name: string }) {
  const url = `${SITE}/sobre`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      { ...webPage(url, title, description, { mainEntity: { "@id": ORGANIZATION } }), "@type": "AboutPage" },
      breadcrumb(url, [{ name, url }]),
    ],
  };
}

/** /suporte: the help center and its quick answers. */
export function supportJsonLd({ title, description, name, faq }: { title: string; description: string; name: string; faq: Faq }) {
  const url = `${SITE}/suporte`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      { ...webPage(url, title, description), "@type": "ContactPage" },
      breadcrumb(url, [{ name, url }]),
      faqPage(url, faq),
    ],
  };
}
