/**
 * Typed client of the Rust API (ADR 0016: Bearer token, CORS, no cookies).
 *
 * Every request and response type comes from `@ingressoimpresso/api-types`, generated from the
 * Rust DTOs, so a contract change breaks the build instead of the user.
 */
import { texts } from "@/texts/pt-BR";

const TOKEN_KEY = "ingressoimpresso.session";

/** Base URL of the API, e.g. `https://api.seudominio.com.br`. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** Portuguese message for the user. */
  get userMessage(): string {
    const messages: Readonly<Record<string, string>> = texts.errors;
    return messages[this.code] ?? texts.errors.generic;
  }
}

// The token is an external store (localStorage), read by React through useSyncExternalStore.
const listeners = new Set<() => void>();
let memoryToken: string | null = null;

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    // Storage unavailable (private mode): the session lasts only for this page.
    return memoryToken;
  }
}

export function writeToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token === null) {
      window.localStorage.removeItem(TOKEN_KEY);
    } else {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    // See readToken.
  }
  for (const listener of listeners) {
    listener();
  }
}

/** Subscribes to token changes (this tab and other tabs). */
export function subscribeToken(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function isErrorBody(value: unknown): value is { error: { code: string } } {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error: unknown = value.error;
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string";
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "network");
  }
  if (!response.ok) {
    let code = "generic";
    try {
      const body: unknown = await response.json();
      if (isErrorBody(body)) {
        code = body.error.code;
      }
    } catch {
      // Not JSON (proxy error page): keep the generic code.
    }
    if (response.status === 401) {
      writeToken(null);
    }
    throw new ApiError(response.status, code);
  }
  return response;
}

/** JSON request. `T` is the generated response type of the endpoint. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: options.method ?? "GET" };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }
  const response = await send(path, init);
  if (response.status === 204) {
    return undefined as T;
  }
  // The API is ours and typed from the same Rust structs; this is the trust boundary.
  return (await response.json()) as T;
}

/** Binary upload (art). */
export async function upload<T>(path: string, file: Blob): Promise<T> {
  const response = await send(path, { method: "POST", body: file, headers: { "Content-Type": file.type } });
  return (await response.json()) as T;
}

/** Binary response (preview PNG, art) as an object URL; revoke it when replaced. GET without a body. */
export async function fetchBlobUrl(path: string, body?: unknown): Promise<string> {
  const response = await send(
    path,
    body === undefined
      ? { method: "GET" }
      : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
  );
  return URL.createObjectURL(await response.blob());
}
