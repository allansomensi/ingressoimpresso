import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DoorCore, loadTicketCore, loadTicketCoreSync } from "../src/index";
import type { VectorsFile } from "../src/generated/VectorsFile";

const vectors = JSON.parse(
  readFileSync(new URL("../../../testdata/vectors/ticket-v1.json", import.meta.url), "utf8"),
) as VectorsFile;
const wasm = readFileSync(new URL("../pkg/ticket_core_bg.wasm", import.meta.url));

// Vitest isolates test files, so this file starts with the module not loaded.
describe("loadTicketCore", () => {
  it("instantiates the module once under concurrent calls", async () => {
    const primary = vectors.events.find((event) => event.name === "primary");
    const issued = vectors.issued.find((vector) => vector.event === "primary" && vector.number === 1);
    if (primary === undefined || issued === undefined) {
      throw new Error("primary vectors missing");
    }

    const first = loadTicketCore(wasm);
    const second = loadTicketCore(wasm);
    expect(second).toBe(first);
    expect(() => {
      loadTicketCoreSync(wasm);
    }).toThrow(/already loading/);

    await first;
    const door = new DoorCore(primary.door);
    try {
      door.replaceVoids([{ first: 1, last: 1, reason: "lost" }]);
      await loadTicketCore(wasm);
      loadTicketCoreSync(wasm);
      // State survives later load calls: the instance was not swapped.
      expect(door.evaluate(issued.qrText)).toEqual({ kind: "voided", number: 1, reason: "lost" });
    } finally {
      door.free();
    }
  });
});
