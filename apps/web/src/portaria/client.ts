/**
 * Door API client: the phone authenticates with its own secret (ADR 0007), never with an
 * organizer session. Every call has a deadline: the door never hangs on the network.
 */
import type {
  DoorGuestUpload,
  DoorGuestsBody,
  DoorGuestsResponse,
  DoorManifest,
  DoorRegisterBody,
  DoorRegistration,
  DoorScanUpload,
  DoorScansBody,
  DoorScansResponse,
} from "@ingressoimpresso/api-types";

import { API_URL } from "@/lib/api";

/** Default deadline of sync calls. */
const SYNC_TIMEOUT_MS = 15_000;

export class DoorApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "DoorApiError";
    this.status = status;
    this.code = code;
  }

  /** The phone or its link was revoked, or the event is over. */
  get revoked(): boolean {
    return this.status === 401;
  }

  /** No answer in time, or no network at all. */
  get offline(): boolean {
    return this.status === 0;
  }
}

function errorCode(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error: unknown = body.error;
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
      return error.code;
    }
  }
  return "generic";
}

async function call<T>(
  path: string,
  options: { secret?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const headers = new Headers();
  if (options.secret !== undefined) {
    headers.set("Authorization", `Bearer ${options.secret}`);
  }
  const init: RequestInit = {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs ?? SYNC_TIMEOUT_MS),
  };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new DoorApiError(0, "network");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  if (!response.ok) {
    let code = "generic";
    try {
      code = errorCode(await response.json());
    } catch {
      // Not JSON: keep the generic code.
    }
    throw new DoorApiError(response.status, code);
  }
  try {
    // Same Rust structs generate these types: this is the trust boundary.
    return (await response.json()) as T;
  } catch {
    throw new DoorApiError(0, "network");
  }
}

export function registerDevice(accessToken: string, deviceName: string): Promise<DoorRegistration> {
  const body: DoorRegisterBody = { accessToken, deviceName };
  return call<DoorRegistration>("/api/door/register", { body });
}

/**
 * The manifest since `since`. `pending` tells the panel what this phone still has to send
 * (ADR 0071); `guests` is the version of the guest list held here, so it comes only when it
 * changed (ADR 0070).
 */
export function fetchManifest(
  secret: string,
  since: string | null,
  extra: { pending: number; guests: string },
): Promise<DoorManifest> {
  const query = new URLSearchParams();
  if (since !== null) {
    query.set("since", since);
  }
  query.set("pending", String(extra.pending));
  query.set("guests", extra.guests);
  return call<DoorManifest>(`/api/door/manifest?${query.toString()}`, { secret });
}

export function uploadArrivals(secret: string, arrivals: DoorGuestUpload[]): Promise<DoorGuestsResponse> {
  const body: DoorGuestsBody = { arrivals };
  return call<DoorGuestsResponse>("/api/door/guests", { secret, body });
}

/** Tells the panel this phone finished a rehearsal (ADR 0067). */
export function reportRehearsal(secret: string): Promise<void> {
  return call<undefined>("/api/door/rehearsal", { secret, body: {} });
}

export function uploadScans(
  secret: string,
  scans: DoorScanUpload[],
  confirm: boolean,
  timeoutMs?: number,
): Promise<DoorScansResponse> {
  const body: DoorScansBody = { scans, confirm };
  return call<DoorScansResponse>("/api/door/scans", { secret, body, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
}
