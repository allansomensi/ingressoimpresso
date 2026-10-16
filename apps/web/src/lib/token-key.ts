/**
 * The storage key of a private link (a seller's page, a digital ticket): a hash of its token,
 * never the token itself. What the browser keeps for the page to open offline is then of no use
 * to open the link somewhere else (invariants 7 and 11: the token lives in the fragment and in
 * request bodies only).
 */
export async function tokenKey(token: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    // No SubtleCrypto (plain http outside localhost): FNV-1a, still not the token.
    let hash = 0x811c9dc5;
    for (const char of token) {
      hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
    }
    return `fnv${hash.toString(16)}`;
  }
}
