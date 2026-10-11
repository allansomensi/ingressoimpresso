import type { TeamMemberDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { areaList, canDo, displayName, isOwner, listNames, normalizeAreas, parseAreas, personInitials, responsibleFor } from "@/lib/team";

function member(overrides: Partial<TeamMemberDto>): TeamMemberDto {
  return {
    id: "m",
    email: "ana@exemplo.com",
    name: null,
    areas: ["money"],
    joined: true,
    you: false,
    createdAt: "2026-10-11T12:00:00Z",
    ...overrides,
  };
}

describe("team access", () => {
  it("lets the organization do everything", () => {
    const own = { team: null };
    expect(isOwner(own)).toBe(true);
    expect(canDo(own, "art")).toBe(true);
    expect(canDo(own, "manage")).toBe(true);
  });

  it("lets a member change only their parts", () => {
    const money = { team: { areas: ["money" as const], organization: "Banda" } };
    expect(isOwner(money)).toBe(false);
    expect(canDo(money, "money")).toBe(true);
    expect(canDo(money, "delivery")).toBe(false);
    expect(canDo(money, "manage")).toBe(false);
  });

  it("lets coordination change every part", () => {
    const manage = { team: { areas: ["manage" as const], organization: "Banda" } };
    expect(isOwner(manage)).toBe(false);
    for (const area of ["money", "delivery", "art", "door", "manage"] as const) {
      expect(canDo(manage, area)).toBe(true);
    }
  });

  it("keeps the areas the way the API does", () => {
    expect(normalizeAreas(["door", "money"])).toEqual(["money", "door"]);
    expect(normalizeAreas(["art", "manage"])).toEqual(["manage"]);
    expect(normalizeAreas([])).toEqual([]);
  });

  it("finds who takes care of a part", () => {
    const team = [member({ id: "a", areas: ["money", "door"] }), member({ id: "b", areas: ["art"] })];
    expect(responsibleFor(team, "door").map((item) => item.id)).toEqual(["a"]);
    expect(responsibleFor(team, "delivery")).toEqual([]);
  });

  it("names people without a name by their e-mail", () => {
    expect(displayName({ name: "Ana Souza", email: "ana@x.com" })).toBe("Ana Souza");
    expect(displayName({ name: null, email: "bia.lima@x.com" })).toBe("bia.lima");
    expect(personInitials({ name: "Ana Souza", email: "ana@x.com" })).toBe("AS");
    expect(personInitials({ name: "ana maria de souza", email: "ana@x.com" })).toBe("AS");
    expect(personInitials({ name: null, email: "bia.lima@x.com" })).toBe("BL");
    expect(personInitials({ name: null, email: "caio@x.com" })).toBe("C");
  });

  it("names the parts in a sentence", () => {
    expect(areaList(["door", "money"])).toBe("Recebimentos e Portaria");
    expect(areaList(["art", "door", "money"])).toBe("Recebimentos, Arte do ingresso e Portaria");
    expect(areaList(["manage"])).toBe("Coordenação");
    expect(parseAreas(["door", "x", 3])).toEqual(["door"]);
    expect(parseAreas("door")).toEqual([]);
    expect(listNames(["Ana"])).toBe("Ana");
    expect(listNames(["Ana", "Bia", "Caio"])).toBe("Ana, Bia e Caio");
    expect(listNames([])).toBe("");
  });
});
