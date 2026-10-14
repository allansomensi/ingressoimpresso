/** `[label](/path)`: an internal link inside a content string (src/content/seo-guides.ts). */
export const RICH_TEXT_LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;

/** The internal links of a content string. */
export function richTextLinks(text: string): string[] {
  return [...text.matchAll(RICH_TEXT_LINK)].map((match) => match[2] ?? "");
}

/** A content string as plain text: each link becomes its label. */
export function richTextPlain(text: string): string {
  return text.replace(RICH_TEXT_LINK, "$1");
}
