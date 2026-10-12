import type { GuestDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { filterGuests, guestTotals, parseGuestLines } from "@/lib/guest-list";

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
