/**
 * Door API client: the phone authenticates with its own secret (ADR 0007), never with an
 * organizer session. Every call has a deadline: the door never hangs on the network.
 */
import type {
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

export function fetchManifest(secret: string, since: string | null): Promise<DoorManifest> {
  const query = since === null ? "" : `?since=${encodeURIComponent(since)}`;
  return call<DoorManifest>(`/api/door/manifest${query}`, { secret });
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
