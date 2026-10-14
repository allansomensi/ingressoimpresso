import type { Metadata } from "next";

import { meta as metaTexts } from "@/texts/pt-BR/meta";

/** What a public page tells search engines and link previews about itself. */
export type PageSeo = {
  /** The `<title>`, used as is: written for search results (about 60 characters). */
  title: string;
  /** The meta description (70 to 160 characters). */
  description: string;
  /** The page's path (`/modelos`): its canonical address and `og:url`. */
  path: string;
  /** Title of link previews (WhatsApp, Facebook, X), when it should differ from the `<title>`. */
  shareTitle?: string;
  /** An article (the guides) carries its dates; anything else is a website page. */
  article?: { publishedAt: string; updatedAt: string };
};

/** `Sobre · Ingresso Impresso`: the brand after the page's own words. */
export function withBrand(title: string): string {
  return `${title} · ${metaTexts.title}`;
}

/**
 * The metadata of a public page: title, description, canonical address, Open Graph and X card,
 * all from the same words. Every public page goes through here: Next.js replaces (does not merge)
 * `openGraph` and `twitter` from the root layout, so a page that set only its title would share
 * the landing's title and description in every link preview.
 *
 * The share image is not set here: it comes from the page's own `opengraph-image` file. Every
 * public page has one (test/seo-content.test.ts): the root's image does not reach a page that sets
 * `openGraph`.
 */
export function pageMetadata(page: PageSeo): Metadata {
  const shareTitle = page.shareTitle ?? page.title;
  const common = { locale: "pt_BR", siteName: metaTexts.title, url: page.path, title: shareTitle, description: page.description };
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: page.path },
    openGraph:
      page.article === undefined
        ? { type: "website", ...common }
        : {
            type: "article",
            ...common,
            publishedTime: page.article.publishedAt,
            modifiedTime: page.article.updatedAt,
            authors: [metaTexts.title],
          },
    twitter: { card: "summary_large_image", title: shareTitle, description: page.description },
  };
}
