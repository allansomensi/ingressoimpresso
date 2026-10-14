import { llmsText } from "@/content/llms";

// Built with the site: the content files are the only input.
export const dynamic = "force-static";

/** /llms.txt (ADR 0081): the product in plain words, for assistants that read the site. */
export function GET(): Response {
  return new Response(llmsText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // For assistants that read it directly, not for search results.
      "X-Robots-Tag": "noindex",
    },
  });
}
