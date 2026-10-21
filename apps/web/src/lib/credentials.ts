/**
 * Credentials of the staff, the press and the artists (ADR 0111), on the door phones and in the
 * panel. Their numbers are above every ticket's (`CREDENTIAL_BASE`, the server's too).
 */

import type { DoorCredentialDto } from "@ingressoimpresso/api-types";

/** Credential numbers start above this one; tickets stop at 9,999,999. */
export const CREDENTIAL_BASE = 2_000_000_000;

/** Colours of the role's band: dark enough for white text on the badge. */
export const CREDENTIAL_COLORS = ["#1d4ed8", "#7c3aed", "#be123c", "#0f766e", "#c2410c", "#334155"] as const;

/** Whether a number read is a credential's. */
export function isCredentialNumber(number: number): boolean {
  return number > CREDENTIAL_BASE;
}

/** The printed code of a credential ("C-0007"). */
export function credentialCode(number: number): string {
  return `C-${String(number - CREDENTIAL_BASE).padStart(4, "0")}`;
}

/** What the door does with a credential at its place (the entrance, or a checkpoint). */
export type CredentialVerdict =
  | { kind: "admit"; credential: DoorCredentialDto }
  | { kind: "revoked"; credential: DoorCredentialDto }
  | { kind: "no_access"; credential: DoorCredentialDto }
  | { kind: "unknown" };

/**
 * The door's decision for a credential (ADR 0111): any day, at the entrance when it opens it, at a
 * checkpoint when it is one of its areas; revoked or unknown, never.
 */
export function credentialVerdict(
  credentials: readonly DoorCredentialDto[],
  number: number,
  checkpointId: string | null,
): CredentialVerdict {
  const credential = credentials.find((item) => item.number === number);
  if (credential === undefined) {
    return { kind: "unknown" };
  }
  if (credential.revoked) {
    return { kind: "revoked", credential };
  }
  const open = checkpointId === null ? credential.entrance : credential.checkpointIds.includes(checkpointId);
  return open ? { kind: "admit", credential } : { kind: "no_access", credential };
}
