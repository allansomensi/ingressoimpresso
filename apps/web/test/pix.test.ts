import { describe, expect, it } from "vitest";

import { brCode, crc16, isValidBrCode, numberPrice, pixReference, pixText, pixTxid } from "@/lib/pix";

describe("BR Code (ADR 0085)", () => {
  it("reproduces the static example of the Banco Central's manual byte for byte", () => {
    expect(
      brCode({
        key: "123e4567-e12b-12d1-a456-426655440000",
        name: "Fulano de Tal",
        city: "BRASILIA",
        amountCents: null,
        reference: "***",
      }),
    ).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
  });

  it("computes CRC16-CCITT-FALSE", () => {
    // The check value of the CRC-16/CCITT-FALSE catalogue entry.
    expect(crc16("123456789")).toBe("29B1");
  });

  it("carries the amount, the identifier and a description that fits", () => {
    const code = brCode({
      key: "+5511999998888",
      name: "Associação de Pais e Mestres",
      city: "São José dos Campos",
      amountCents: 2050,
      reference: "ING0042EA3F9",
      description: "Ingresso 0042",
    });
    expect(isValidBrCode(code)).toBe(true);
    expect(code).toContain("0014br.gov.bcb.pix0114+5511999998888");
    expect(code).toContain("0213Ingresso 0042");
    expect(code).toContain("540520.50");
    // Accents dropped and cut to 25 and 15 characters.
    expect(code).toContain("5925Associacao de Pais e Mes");
    expect(code).toContain("6015Sao Jose dos Ca");
    expect(code).toContain("62160512ING0042EA3F9");
  });

  it("leaves the amount to the payer when there is none", () => {
    const code = brCode({ key: "contato@escola.org.br", name: "Escola", city: "Recife", amountCents: 0, reference: "" });
    expect(isValidBrCode(code)).toBe(true);
    expect(code).not.toContain("5404");
    expect(code).toContain("0503***");
  });

  it("drops the description when the key leaves no room", () => {
    // 77 characters: the longest e-mail key Pix accepts.
    const key = `${"a".repeat(62)}@exemplo.com.br`;
    expect(key).toHaveLength(77);
    const code = brCode({ key, name: "Banda", city: "Curitiba", amountCents: 1000, reference: "X", description: "Ingresso 0001" });
    expect(isValidBrCode(code)).toBe(true);
    expect(code).not.toContain("Ingresso");
  });

  it("detects a changed character", () => {
    const code = brCode({ key: "12345678909", name: "Banda", city: "Curitiba", amountCents: 1500, reference: "ING0001E0000" });
    expect(isValidBrCode(code)).toBe(true);
    expect(isValidBrCode(code.replace("15.00", "16.00"))).toBe(false);
  });
});

describe("Pix texts and identifiers", () => {
  it("keeps names in plain ASCII", () => {
    expect(pixText("  Grêmio   Estudantil — 3º ano!  ", 25)).toBe("Gremio Estudantil 3 ano");
    expect(pixText("Show - 2ª sessão", 25)).toBe("Show - 2 sessao");
    expect(pixText("Ação", 2)).toBe("Ac");
  });

  it("builds the identifier from the number and the event", () => {
    expect(pixReference("a3f9c2d1-0000-4000-8000-000000000000", 42)).toBe("ING0042EA3F9");
    expect(pixReference("a3f9c2d1-0000-4000-8000-000000000000", 1234567, 6)).toBe("ING1234567EA3F9");
    expect(pixTxid("ING-0042 EA3F9")).toBe("ING0042EA3F9");
    expect(pixTxid("x".repeat(40))).toHaveLength(25);
  });
});

describe("price of a number", () => {
  const categories = [
    { name: "Meia", color: "#2563eb", priceCents: 1000, ranges: [{ first: 1, last: 50 }] },
    { name: "Cortesia", color: "#16a34a", priceCents: 0, ranges: [{ first: 51, last: 60 }] },
  ];

  it("uses the category's price, else the event's", () => {
    expect(numberPrice(categories, 2000, 7)).toBe(1000);
    expect(numberPrice(categories, 2000, 55)).toBe(0);
    expect(numberPrice(categories, 2000, 61)).toBe(2000);
    expect(numberPrice([], null, 1)).toBeNull();
  });
});
