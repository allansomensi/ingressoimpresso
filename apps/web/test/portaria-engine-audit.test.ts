/**
 * Audit of format v1 (docs/auditorias/qr-v1.md), finding A-02: the rescan window of the door.
 *
 * The engine re-shows the previous result when the same QR text is read again within 5 s of
 * the last time the camera saw it (ADR 0018), so a person who keeps the ticket in view does not
 * trigger a second scan. But the same text within 5 s may also be a copy in the hands of the
 * next person in line: after the green "PODE ENTRAR" left by itself, the copy brings the green
 * screen back (with a small badge and no sound) and no scan is recorded. The §5.3 table says a
 * copy read on the same phone is blocked; this is the exception.
 *
 * The test states the behaviour the audit asks for (the copy is not shown green) and fails
 * today. It runs only with `AUDIT_POC=1 pnpm --filter @ingressoimpresso/web test`; drop the
 * guard when the fix lands, so it becomes the regression test.
 */
import type { DoorManifest } from "@ingressoimpresso/api-types";
import type { DecisionDto } from "@ingressoimpresso/ticket-core-wasm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decisions = new Map<string, DecisionDto>();
const recorded: string[] = [];

vi.mock("@ingressoimpresso/ticket-core-wasm", () => ({
  loadTicketCore: () => Promise.resolve(),
  DoorCore: class {
    replaceVoids(): void {}
    recordEntries(): number {
      return 0;
    }
    evaluate(text: string): DecisionDto {
      return decisions.get(text) ?? { kind: "invalid", reason: "malformed" };
    }
    checkIn(text: string): DecisionDto {
      const decision = this.evaluate(text);
      if (decision.kind === "admit") {
        // Like the real core: the entry is recorded in the same step, so the next check-in of
        // the same number says "already entered".
        decisions.set(text, {
          kind: "already_entered",
          number: decision.number,
          firstEntry: { atUnixMs: Date.now(), deviceName: "Porta 1" },
        });
      }
      return decision;
    }
    get entryCount(): number {
      return 0;
    }
    free(): void {}
  },
}));

const manifest = {
  event: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Show",
    venue: null,
    startsAt: "2030-01-01T20:00:00-03:00",
    endsAt: "2030-01-02T02:00:00-03:00",
    numberDigits: 4,
    ticketPriceCents: null,
    canceledAt: null,
    inSeries: false,
  },
  verifier: { eventId: "11111111-1111-4111-8111-111111111111", eventTag: 1, keys: [] },
  voids: [],
  sellers: [],
  categories: [],
  seats: [],
  cursor: "0",
  syncedAt: 0,
  offsetMs: 0,
  allowedCategoryIds: [],
  doors: [],
  sessions: [],
  guests: [],
  guestsVersion: "",
} satisfies Partial<DoorManifest> & Record<string, unknown>;

vi.mock("@/portaria/storage", () => ({
  loadDevice: () => Promise.resolve({ deviceId: "d1", deviceName: "Porta 1", secret: "s", event: manifest.event }),
  loadManifest: () => Promise.resolve(manifest),
  saveManifest: () => Promise.resolve(),
  allArrivals: () => Promise.resolve([]),
  ownAdmittedNumbers: () => Promise.resolve([]),
  allEntries: () => Promise.resolve([]),
  allScans: () => Promise.resolve([]),
  addEntries: () => Promise.resolve([]),
  mergeArrivals: () => Promise.resolve(false),
  readFlag: () => Promise.resolve(false),
  writeFlag: () => Promise.resolve(),
  pendingCount: () => Promise.resolve(0),
  pendingArrivalCount: () => Promise.resolve(0),
  pendingScans: () => Promise.resolve([]),
  pendingArrivals: () => Promise.resolve([]),
  markSynced: () => Promise.resolve(),
  markArrivalsSynced: () => Promise.resolve(),
  recordScan: (scan: { id: string }) => {
    recorded.push(scan.id);
    return Promise.resolve();
  },
  saveVerdict: () => Promise.resolve(),
  toUpload: (scan: unknown) => scan,
  toArrivalUpload: (arrival: unknown) => arrival,
}));

vi.mock("@/portaria/client", () => ({
  DoorApiError: class extends Error {
    readonly revoked = false;
  },
  // Offline: no sync succeeds, so no online confirmation is attempted.
  fetchManifest: () => Promise.reject(new Error("offline")),
  registerDevice: () => Promise.reject(new Error("offline")),
  reportRehearsal: () => Promise.resolve(),
  uploadArrivals: () => Promise.reject(new Error("offline")),
  uploadScans: () => Promise.reject(new Error("offline")),
}));

vi.mock("@/portaria/assets", () => ({ CORE_WASM_URL: "ticket_core_bg.wasm" }));

const { DoorEngine } = await import("@/portaria/engine");

const TICKET = "C60/K53X9000100JM6R$FJTU/C2*ZN/XJ-.V+GA1Z5:NV93C6BLY-H6Z6W4367JODRQU9YE60/V6:F02BD*6VZ9WAH1MUXISEOS%+8G5P$PB8*L";

describe("rescan window (ADR 0018) against a copy on the same phone", () => {
  let engine: InstanceType<typeof DoorEngine>;

  beforeEach(async () => {
    decisions.clear();
    recorded.length = 0;
    decisions.set(TICKET, { kind: "admit", number: 1 });
    engine = new DoorEngine();
    await engine.start();
    expect(engine.getSnapshot().phase).toBe("ready");
  });

  afterEach(() => {
    engine.stop();
  });

  it("admits the original and records its scan", async () => {
    await engine.scan([TICKET]);
    expect(engine.getSnapshot().result).toMatchObject({ tone: "ok", title: "PODE ENTRAR", number: "Nº 0001" });
    expect(recorded).toHaveLength(1);
  });

  it.skipIf(process.env["AUDIT_POC"] !== "1")(
    "A-02: a copy read within 5 s of the original, after the green screen left, is not green again",
    async () => {
      await engine.scan([TICKET]);
      // The green result goes back to the camera by itself after 2 s (RESULT_AUTO_MS).
      engine.dismissResult(false);
      expect(engine.getSnapshot().result).toBeNull();
      // The next person in line shows a screenshot of the same QR, 2–5 s later.
      await engine.scan([TICKET]);
      const result = engine.getSnapshot().result;
      expect(result).not.toBeNull();
      // Today: tone "ok", title "PODE ENTRAR", repeat: true, and no second scan recorded.
      expect(result?.tone).not.toBe("ok");
      expect(recorded).toHaveLength(2);
    },
  );
});
