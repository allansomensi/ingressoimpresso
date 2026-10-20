import { describe, expect, it } from "vitest";

import {
  MIN_RESULT_MS,
  RESULT_AUTO_MS,
  REHEARSAL_AUTO_MS,
  canReplaceResult,
  dismissPolicy,
  viewOf,
  type DoorContext,
  type ResultView,
} from "@/portaria/logic";
import { endSummary, recentScanOf, recentScans, recentSummary } from "@/portaria/recent";
import type { StoredEntry, StoredScan } from "@/portaria/storage";

const context: DoorContext = {
  digits: 4,
  sellers: [{ seller: "João", first: 1, last: 50 }],
  categories: [{ name: "VIP", color: "#7c3aed", first: 40, last: 45 }],
  seats: [{ number: 42, label: "Mesa 5 · Lugar 3" }],
  sessions: [{ eventTag: 77, startsAt: "2026-11-12T23:00:00Z" }],
};

const admit = viewOf({ kind: "admit", number: 7 }, context);

describe("result dismissal", () => {
  it("lets only a plain green entry leave by itself", () => {
    expect(dismissPolicy(admit)).toEqual({ auto: true, ms: RESULT_AUTO_MS });
    expect(dismissPolicy({ ...admit, repeat: true })).toEqual({ auto: true, ms: RESULT_AUTO_MS });
    expect(dismissPolicy({ ...admit, rehearsal: true })).toEqual({ auto: true, ms: REHEARSAL_AUTO_MS });
  });

  it("keeps anything to read or act on until tapped", () => {
    const used = viewOf({ kind: "already_entered", number: 7, firstEntry: { atUnixMs: 0, deviceName: "Porta 1" } }, context);
    const views: ResultView[] = [
      used,
      viewOf({ kind: "voided", number: 7, reason: "lost" }, context),
      viewOf({ kind: "invalid", reason: "bad_signature" }, context),
      viewOf({ kind: "other_event", eventTag: 3 }, context),
      { ...admit, tone: "warn", action: { label: "Deixar entrar mesmo assim", hint: "" } },
      { ...admit, instruction: { label: "Faça antes de liberar", text: "Pulseira laranja" } },
      { ...admit, check: true },
      { ...admit, charge: "Bilheteria · cobrar R$ 20,00" },
      { ...admit, charge: "Bilheteria · cortesia" },
    ];
    for (const view of views) {
      expect(dismissPolicy(view)).toEqual({ auto: false });
    }
    // No charge on a ticket outside the box office.
    expect(dismissPolicy({ ...admit, charge: null }).auto).toBe(true);
  });

  it("lets another ticket replace only a green screen seen for a moment", () => {
    expect(canReplaceResult(admit, MIN_RESULT_MS - 1)).toBe(false);
    expect(canReplaceResult(admit, MIN_RESULT_MS)).toBe(true);
    const used = viewOf({ kind: "already_entered", number: 7, firstEntry: { atUnixMs: 0, deviceName: "Porta 1" } }, context);
    expect(canReplaceResult(used, 60_000)).toBe(false);
  });
});

const at = (minutes: number) => Date.UTC(2026, 10, 12, 23, minutes);
const scan = (patch: Partial<StoredScan> & Pick<StoredScan, "id" | "outcome">): StoredScan => ({
  number: 42,
  scannedAtMs: at(0),
  synced: 1,
  ...patch,
});
const entry = (scanId: string, minutes: number, deviceName: string, number = 42): StoredEntry => ({
  scanId,
  number,
  atUnixMs: at(minutes),
  deviceName,
});

describe("recent scans of this phone", () => {
  it("shows an entry with its number, category, seat and seller", () => {
    const item = recentScanOf(scan({ id: "a", outcome: "admitted", synced: 0 }), [entry("a", 0, "Porta A")], context);
    expect(item).toMatchObject({
      tone: "ok",
      label: "Entrou",
      number: "Nº 0042",
      detail: null,
      category: { name: "VIP", color: "#7c3aed" },
      seat: "Mesa 5 · Lugar 3",
      seller: "João",
      synced: false,
    });
  });

  it("says when and where a ticket entered first", () => {
    const entries = [entry("x", 5, "Porta B"), entry("y", 2, "Porta C"), entry("z", 9, "Porta D")];
    const item = recentScanOf(scan({ id: "u", outcome: "rejected_used", scannedAtMs: at(8) }), entries, context);
    expect(item.tone).toBe("bad");
    expect(item.label).toBe("Já tinha entrado");
    expect(item.detail).toMatch(/^Primeira entrada às .+ por Porta C$/);
  });

  it("flags an entry another phone had made before (an offline copy)", () => {
    const entries = [entry("mine", 10, "Porta A"), entry("theirs", 4, "Porta B")];
    const item = recentScanOf(scan({ id: "mine", outcome: "admitted", scannedAtMs: at(10) }), entries, context);
    expect(item).toMatchObject({ tone: "ok", label: "Entrou" });
    expect(item.detail).toMatch(/^Cópia: .* por Porta B$/);
    // A later entry elsewhere is not this phone's copy.
    expect(recentScanOf(scan({ id: "theirs", outcome: "admitted", scannedAtMs: at(4) }), entries, context).detail).toBeNull();
  });

  it("shows what the online confirmation said instead of the local entry", () => {
    const item = recentScanOf(
      scan({ id: "c", outcome: "admitted", verdict: { kind: "already_entered", atUnixMs: at(1), deviceName: "Porta A" } }),
      [],
      context,
    );
    expect(item).toMatchObject({ tone: "bad", label: "Já tinha entrado" });
    expect(item.detail).toMatch(/por Porta A$/);
    expect(recentScanOf(scan({ id: "v", outcome: "admitted", verdict: { kind: "voided", reason: "lost" } }), [], context)).toMatchObject({
      tone: "bad",
      label: "Cancelado",
      detail: "perdido ou roubado",
    });
  });

  it("explains refusals, from the stored reason or the manifest", () => {
    expect(recentScanOf(scan({ id: "1", outcome: "rejected_void", reason: "unsold" }), [], context).detail).toBe("devolvido sem vender");
    const voids = [{ first: 40, last: 50, reason: "revoked" as const }];
    expect(recentScanOf(scan({ id: "2", outcome: "rejected_void" }), [], context, voids).detail).toBe("cancelado pelo organizador");
    expect(recentScanOf(scan({ id: "3", outcome: "rejected_invalid", number: null, reason: "bad_signature" }), [], context)).toMatchObject({
      tone: "bad",
      label: "Inválido",
      number: null,
      detail: "falsificado",
      category: null,
    });
    expect(recentScanOf(scan({ id: "4", outcome: "rejected_wrong_door" }), [], context)).toMatchObject({ tone: "warn", label: "Outra porta" });
    expect(recentScanOf(scan({ id: "5", outcome: "admitted", exception: true }), [], context).label).toBe("Entrou como exceção");
  });

  it("tells a ticket of another date from one of another event", () => {
    const other = recentScanOf(scan({ id: "o", outcome: "rejected_other_event", number: null, eventTag: 77 }), [], context);
    expect(other).toMatchObject({ tone: "warn", label: "Outra data" });
    expect(other.detail).toMatch(/^Sessão de /);
    const unknown = recentScanOf(scan({ id: "p", outcome: "rejected_other_event", number: null, eventTag: 5 }), [], context);
    expect(unknown).toMatchObject({ label: "Outro evento", detail: null });
  });

  it("lists the newest first, up to the limit", () => {
    const scans = [1, 5, 3, 4, 2].map((minutes) => scan({ id: String(minutes), outcome: "admitted", scannedAtMs: at(minutes) }));
    expect(recentScans(scans, [], context, [], 3).map((item) => item.id)).toEqual(["5", "4", "3"]);
  });

  it("counts what this phone let in, turned away and has yet to send", () => {
    expect(
      recentSummary([
        scan({ id: "1", outcome: "admitted" }),
        scan({ id: "2", outcome: "admitted", synced: 0 }),
        scan({ id: "3", outcome: "rejected_used", synced: 0 }),
        scan({ id: "4", outcome: "admitted", verdict: { kind: "voided", reason: "lost" } }),
      ]),
    ).toEqual({ admitted: 2, exits: 0, refused: 2, pending: 2 });
  });

  it("separates the copies stopped from the other refusals for the end of the event", () => {
    expect(
      endSummary([
        scan({ id: "1", outcome: "admitted" }),
        scan({ id: "2", outcome: "rejected_used", synced: 0 }),
        scan({ id: "3", outcome: "admitted", verdict: { kind: "already_entered", atUnixMs: 1, deviceName: "Porta 2" } }),
        scan({ id: "4", outcome: "rejected_invalid" }),
        scan({ id: "5", outcome: "exited" }),
      ]),
    ).toEqual({ admitted: 1, copies: 2, refused: 1, exits: 1, pending: 1 });
  });
});
