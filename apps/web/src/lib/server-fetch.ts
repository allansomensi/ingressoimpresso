import { API_URL } from "@/lib/api";

/**
 * A public resource of the API read on the server, for a page whose words should be in the HTML
 * search engines and readers without JavaScript get (the price table, the news, the status).
 * `null` when the API is slow or down: the page renders and the browser loads it, as before.
 * Cached by the Next.js data cache for `revalidate` seconds.
 */
export async function fetchPublic<T>(path: string, { revalidate, timeoutMs = 2_500 }: { revalidate: number; timeoutMs?: number }): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, { next: { revalidate }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
