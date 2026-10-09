import { describe, expect, it } from "vitest";

import { csvCell, whatsappUrl } from "@/lib/share";

describe("whatsappUrl", () => {
  it("adds Brazil's code to local numbers", () => {
    expect(whatsappUrl("oi", "(11) 98888-7777")).toBe("https://wa.me/5511988887777?text=oi");
    expect(whatsappUrl("oi", "11 3333-4444")).toBe("https://wa.me/551133334444?text=oi");
  });

  it("keeps international numbers and opens the picker without one", () => {
    expect(whatsappUrl("oi", "+351 912 345 678")).toBe("https://wa.me/351912345678?text=oi");
    expect(whatsappUrl("Olá & tchau")).toBe("https://wa.me/?text=Ol%C3%A1%20%26%20tchau");
    expect(whatsappUrl("oi", "123")).toBe("https://wa.me/?text=oi");
  });
});

describe("csvCell", () => {
  it("quotes separators and keeps numbers as they are", () => {
    expect(csvCell("Banda, a")).toBe('"Banda, a"');
    expect(csvCell('Ele disse "oi"')).toBe('"Ele disse ""oi"""');
    expect(csvCell(-12)).toBe("-12");
    expect(csvCell("-12,50")).toBe('"-12,50"');
  });

  it("keeps text that looks like a formula as text", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+55 11")).toBe("'+55 11");
    expect(csvCell("@soma")).toBe("'@soma");
    expect(csvCell("Maria")).toBe("Maria");
  });
});
