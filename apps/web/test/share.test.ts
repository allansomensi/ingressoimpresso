import { describe, expect, it } from "vitest";

import { whatsappUrl } from "@/lib/share";

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
