import type { DoorCredentialDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { CREDENTIAL_BASE, credentialCode, credentialVerdict, isCredentialNumber } from "@/lib/credentials";
import { credentialView, type DoorContext } from "@/portaria/logic";
import { recentSummary } from "@/portaria/recent";

const BACKSTAGE = "44444444-4444-4444-8444-444444444444";
const press: DoorCredentialDto = {
  number: CREDENTIAL_BASE + 1,
  name: "Bia Lima",
  role: "Imprensa",
  organization: "Rádio Cidade",
  color: "#1d4ed8",
  entrance: true,
  checkpointIds: [],
  areas: "Entrada",
  revoked: false,
};
const artist: DoorCredentialDto = { ...press, number: CREDENTIAL_BASE + 2, name: "Caio", role: "Artista", entrance: false, checkpointIds: [BACKSTAGE], areas: "Camarim" };
const context: DoorContext = { digits: 4, sellers: [], categories: [], seats: [] };

describe("credentials (ADR 0111)", () => {
  it("tells a credential's number from a ticket's", () => {
    expect(isCredentialNumber(9_999_999)).toBe(false);
    expect(isCredentialNumber(CREDENTIAL_BASE + 1)).toBe(true);
    expect(credentialCode(CREDENTIAL_BASE + 7)).toBe("C-0007");
  });

  it("lets a credential through only where it opens", () => {
    const list = [press, artist, { ...press, number: CREDENTIAL_BASE + 3, revoked: true }];
    expect(credentialVerdict(list, press.number, null).kind).toBe("admit");
    expect(credentialVerdict(list, press.number, BACKSTAGE).kind).toBe("no_access");
    expect(credentialVerdict(list, artist.number, null).kind).toBe("no_access");
    expect(credentialVerdict(list, artist.number, BACKSTAGE).kind).toBe("admit");
    expect(credentialVerdict(list, CREDENTIAL_BASE + 3, null).kind).toBe("revoked");
    expect(credentialVerdict(list, CREDENTIAL_BASE + 9, null).kind).toBe("unknown");
  });

  it("shows who it is, in the role's colour", () => {
    const view = credentialView({ kind: "admit", credential: press }, press.number, context);
    expect(view.tone).toBe("ok");
    expect(view.title).toBe("CREDENCIAL · IMPRENSA");
    expect(view.number).toBe("C-0001");
    expect(view.detail).toBe("Bia Lima · Rádio Cidade");
    expect(view.category).toEqual({ name: "Imprensa", color: "#1d4ed8" });
    const refused = credentialView({ kind: "no_access", credential: artist }, artist.number, context);
    expect(refused.tone).toBe("bad");
    expect(refused.detail).toContain("Camarim");
  });

  it("never counts a credential as audience nor a refusal", () => {
    const scan = (outcome: "credential_admitted" | "rejected_credential" | "admitted") => ({
      id: outcome,
      number: 1,
      outcome,
      scannedAtMs: 0,
      synced: 1 as const,
    });
    expect(recentSummary([scan("credential_admitted"), scan("rejected_credential"), scan("admitted")])).toEqual({
      admitted: 1,
      exits: 0,
      refused: 1,
      pending: 0,
    });
  });
});
