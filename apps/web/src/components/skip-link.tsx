import { common as commonTexts } from "@/texts/pt-BR/common";

/**
 * The first thing in the tab order of a page: a link to `<main id="conteudo">`, visible only while
 * focused (WCAG 2.4.1). The panel's shell has its own; the public header and the login page use
 * this one.
 */
export function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="sr-only z-50 rounded-lg bg-brand-solid px-3 py-2 text-sm font-semibold text-brand-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {commonTexts.skipToContent}
    </a>
  );
}
