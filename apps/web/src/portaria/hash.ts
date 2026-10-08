/**
 * The access token travels in the URL fragment (`/portaria#acesso=<token>`, ADR 0007): it never
 * reaches a server log or a Referer. Read through `useSyncExternalStore`, removed after use.
 */
const listeners = new Set<() => void>();

export function subscribeHash(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("hashchange", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("hashchange", listener);
  };
}

/** The access token in the fragment, or `""`. */
export function accessTokenFromHash(): string {
  const match = /(?:^#|&)acesso=([A-Za-z0-9_-]{16,128})/.exec(window.location.hash);
  return match?.[1] ?? "";
}

export function noAccessToken(): string {
  return "";
}

/** Drops the token from the address bar and history. */
export function clearHash(): void {
  window.history.replaceState(null, "", window.location.pathname);
  for (const listener of listeners) {
    listener();
  }
}
