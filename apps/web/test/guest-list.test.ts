import type { GuestDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { filterGuests, guestTotals, parseGuestImport, parseGuestLines, readSheetFile, splitDelimited } from "@/lib/guest-list";

describe("pasting a guest list", () => {
  it("reads one name per line, with +N companions and list bullets", () => {
    expect(parseGuestLines("Maria Souza\n\n  João Lima +2 \n- Banda Os Tais (+4)\n1. Ana\n• Bia + 1\r\nCaio+3")).toEqual({
      guests: [
        { name: "Maria Souza", companions: 0 },
        { name: "João Lima", companions: 2 },
        { name: "Banda Os Tais", companions: 4 },
        { name: "Ana", companions: 0 },
        { name: "Bia", companions: 1 },
        { name: "Caio", companions: 3 },
      ],
      errors: [],
    });
  });

  it("reports the lines that break a limit", () => {
    expect(parseGuestLines(`Ok\n${"x".repeat(81)}\nGrupo +21\n+2`)).toEqual({ guests: [{ name: "Ok", companions: 0 }], errors: [2, 3, 4] });
  });
});

describe("importing a guest sheet", () => {
  const categories = [
    { id: "c1", name: "Família" },
    { id: "c2", name: "Imprensa" },
  ];

  it("keeps a plain pasted list as names per line (commas are part of a name)", () => {
    const parsed = parseGuestImport("Silva, Maria\nJoão +1");
    expect(parsed.table).toBe(false);
    expect(parsed.guests).toEqual([
      { name: "Silva, Maria", companions: 0, note: null, categoryId: null },
      { name: "João", companions: 1, note: null, categoryId: null },
    ]);
  });

  it("reads a semicolon CSV by its header, in any column order, matching categories by name", () => {
    const csv = "Categoria;Observação;Nome;Acompanhantes\nfamilia;Mesa 3;Ana Dias;2\nVIP;;Bruno;\n;;;\n;\"Disse \"\"oi\"\"\";Carla;x";
    const parsed = parseGuestImport(csv, categories, true);
    expect(parsed.table).toBe(true);
    expect(parsed.guests).toEqual([
      { name: "Ana Dias", companions: 2, note: "Mesa 3", categoryId: "c1" },
      { name: "Bruno", companions: 0, note: null, categoryId: null },
    ]);
    expect(parsed.errors).toEqual([5]);
    expect(parsed.unknownCategories).toEqual(["VIP"]);
  });

  it("reads cells pasted from a spreadsheet without a header as name, companions and note", () => {
    const parsed = parseGuestImport("Ana\t2\tCamarim\nBruno +3\t\t\nCaio\tImprensa", categories);
    expect(parsed.guests).toEqual([
      { name: "Ana", companions: 2, note: "Camarim", categoryId: null },
      { name: "Bruno", companions: 3, note: null, categoryId: null },
      { name: "Caio", companions: 0, note: "Imprensa", categoryId: null },
    ]);
  });

  it("reads commas only in a file", () => {
    expect(parseGuestImport("Nome,Acompanhantes\nAna,1", [], true).guests).toEqual([{ name: "Ana", companions: 1, note: null, categoryId: null }]);
  });

  it("splits quoted cells with delimiters and line breaks", () => {
    expect(splitDelimited('a;"b;c"\r\n"d\ne";f', ";")).toEqual([
      ["a", "b;c"],
      ["d\ne", "f"],
    ]);
  });

  it("decodes UTF-8 and falls back to Windows-1252", async () => {
    expect(await readSheetFile(new Blob(["\uFEFFJoão"]))).toBe("João");
    expect(await readSheetFile(new Blob([new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f])]))).toBe("João");
  });
});

describe("guest list filters", () => {
  const guest = (id: string, name: string, arrived: boolean, companions = 0): GuestDto => ({
    id,
    name,
    companions,
    note: id === "c" ? "Imprensa" : null,
    categoryId: null,
    arrival: arrived ? { at: "2026-11-21T00:03:00Z", deviceName: "Porta 1", people: companions + 1 } : null,
    createdAt: "2026-11-01T00:00:00Z",
  });
  const list = [guest("a", "Ângela Dias", true, 2), guest("b", "Bruno", false, 1), guest("c", "Carla", false)];

  it("searches names and notes and filters by arrival", () => {
    expect(filterGuests(list, "angela", "all").map((item) => item.id)).toEqual(["a"]);
    expect(filterGuests(list, "imprensa", "all").map((item) => item.id)).toEqual(["c"]);
    expect(filterGuests(list, "", "arrived").map((item) => item.id)).toEqual(["a"]);
    expect(filterGuests(list, "", "missing").map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("counts names and people", () => {
    expect(guestTotals(list)).toEqual({ names: 3, people: 6, arrivedNames: 1, arrivedPeople: 3 });
  });
});
