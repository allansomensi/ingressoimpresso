import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { DoorCore, formatVersion, loadTicketCoreSync } from "../src/index";
import type { VectorEvent } from "../src/generated/VectorEvent";
import type { VectorsFile } from "../src/generated/VectorsFile";

const vectorsUrl = new URL("../../../testdata/vectors/ticket-v1.json", import.meta.url);
// The vectors file is generated from the same Rust types as `VectorsFile`.
const vectors = JSON.parse(readFileSync(vectorsUrl, "utf8")) as VectorsFile;

function event(name: string): VectorEvent {
  const found = vectors.events.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`unknown vector event ${name}`);
  }
  return found;
}

beforeAll(() => {
  loadTicketCoreSync(readFileSync(new URL("../pkg/ticket_core_bg.wasm", import.meta.url)));
});

describe("shared vectors (testdata/vectors/ticket-v1.json)", () => {
  it("targets the format version of this build", () => {
    expect(vectors.format).toBe("ingressoimpresso-ticket-vectors");
    expect(vectors.ticketFormatVersion).toBe(formatVersion());
  });

  it("covers every decision path", () => {
    const kinds = new Set(vectors.cases.map((testCase) => testCase.expected.kind));
    expect([...kinds].sort()).toEqual(["admit", "already_entered", "invalid", "other_event", "voided"]);
  });

  it.each(vectors.cases.map((testCase) => [testCase.name, testCase] as const))(
    "case %s",
    (_name, testCase) => {
      const door = new DoorCore(event(testCase.doorEvent).door);
      try {
        door.replaceVoids(testCase.voids);
        door.recordEntries(testCase.entries);
        expect(door.evaluate(testCase.qrText)).toEqual(testCase.expected);
      } finally {
        door.free();
      }
    },
  );

  it("admits every issued ticket unless its key is revoked", () => {
    for (const issued of vectors.issued) {
      const vectorEvent = event(issued.event);
      const key = vectorEvent.door.keys.find((candidate) => candidate.keyId === issued.keyId);
      const door = new DoorCore(vectorEvent.door);
      try {
        const expected =
          key?.status === "revoked"
            ? { kind: "invalid", reason: "revoked_key" }
            : { kind: "admit", number: issued.number };
        expect(door.evaluate(issued.qrText)).toEqual(expected);
      } finally {
        door.free();
      }
    }
  });
});

describe("DoorCore.checkIn", () => {
  const primary = (): DoorCore => new DoorCore(event("primary").door);
  const ticket = (number: number): string => {
    const issued = vectors.issued.find((candidate) => candidate.event === "primary" && candidate.number === number);
    if (issued === undefined) {
      throw new Error(`no issued vector for #${String(number)}`);
    }
    return issued.qrText;
  };

  it("admits once, then reports the first entry", () => {
    const door = primary();
    try {
      expect(door.checkIn(ticket(42), 1_000, "Porta 1")).toEqual({ kind: "admit", number: 42 });
      expect(door.checkIn(ticket(42), 2_000, "Porta 2")).toEqual({
        kind: "already_entered",
        number: 42,
        firstEntry: { atUnixMs: 1_000, deviceName: "Porta 1" },
      });
      expect(door.entryCount).toBe(1);
    } finally {
      door.free();
    }
  });

  it("never records voided tickets, and admits them once the void is undone", () => {
    const door = primary();
    try {
      door.replaceVoids([{ first: 1, last: 10, reason: "unsold" }]);
      expect(door.checkIn(ticket(2), 1_000, "Porta 1")).toEqual({ kind: "voided", number: 2, reason: "unsold" });
      expect(door.entryCount).toBe(0);
      door.replaceVoids([]);
      expect(door.checkIn(ticket(2), 2_000, "Porta 1")).toEqual({ kind: "admit", number: 2 });
      expect(door.entryCount).toBe(1);
    } finally {
      door.free();
    }
  });

  it("keeps the first entry when a later scan carries an earlier clock", () => {
    const door = primary();
    try {
      expect(door.checkIn(ticket(42), 5_000, "Porta 1").kind).toBe("admit");
      const firstEntry = { atUnixMs: 5_000, deviceName: "Porta 1" };
      expect(door.checkIn(ticket(42), 1_000, "Porta 2")).toEqual({ kind: "already_entered", number: 42, firstEntry });
      expect(door.evaluate(ticket(42))).toEqual({ kind: "already_entered", number: 42, firstEntry });
      expect(door.entryCount).toBe(1);
    } finally {
      door.free();
    }
  });

  it("does not record rejected scans", () => {
    const door = primary();
    try {
      expect(door.checkIn("NOT A TICKET", 1_000, "Porta 1").kind).toBe("invalid");
      expect(door.entryCount).toBe(0);
    } finally {
      door.free();
    }
  });

  it("lets an earlier synced entry win over a local one", () => {
    const door = primary();
    try {
      door.checkIn(ticket(42), 5_000, "Porta 1");
      expect(door.recordEntries([{ number: 42, atUnixMs: 4_000, deviceName: "Porta 2" }])).toBe(1);
      expect(door.evaluate(ticket(42))).toEqual({
        kind: "already_entered",
        number: 42,
        firstEntry: { atUnixMs: 4_000, deviceName: "Porta 2" },
      });
    } finally {
      door.free();
    }
  });

  it.each([Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 2, Number.POSITIVE_INFINITY])(
    "rejects unsafe timestamp %s",
    (atUnixMs) => {
      const door = primary();
      try {
        expect(() => door.checkIn(ticket(1), atUnixMs, "Porta 1")).toThrow();
        expect(door.entryCount).toBe(0);
      } finally {
        door.free();
      }
    },
  );
});

describe("DoorCore input validation", () => {
  const primaryDoor = event("primary").door;

  it("rejects a malformed public key", () => {
    const [firstKey] = primaryDoor.keys;
    if (firstKey === undefined) {
      throw new Error("primary event has no keys");
    }
    expect(() => new DoorCore({ ...primaryDoor, keys: [{ ...firstKey, publicKey: "00" }] })).toThrow();
  });

  it("rejects duplicate key ids", () => {
    const [firstKey] = primaryDoor.keys;
    if (firstKey === undefined) {
      throw new Error("primary event has no keys");
    }
    expect(() => new DoorCore({ ...primaryDoor, keys: [firstKey, firstKey] })).toThrow();
  });

  it("rejects an invalid event id", () => {
    expect(() => new DoorCore({ ...primaryDoor, eventId: "not-a-uuid" })).toThrow();
  });

  it("keeps previous voids when a replacement is invalid", () => {
    const door = new DoorCore(primaryDoor);
    try {
      door.replaceVoids([{ first: 1, last: 1, reason: "lost" }]);
      expect(() => {
        door.replaceVoids([{ first: 3, last: 2, reason: "lost" }]);
      }).toThrow();
      const issued = vectors.issued.find((candidate) => candidate.event === "primary" && candidate.number === 1);
      expect(issued).toBeDefined();
      expect(door.evaluate(issued?.qrText ?? "")).toEqual({ kind: "voided", number: 1, reason: "lost" });
    } finally {
      door.free();
    }
  });
});
