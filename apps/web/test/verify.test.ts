import { describe, expect, it } from "vitest";

import { classifyPasted, isAuthentic, pastedQr, pickScanned, verdictTone } from "@/lib/verify";

describe("classifyPasted", () => {
  it("tells QR texts from links", () => {
    expect(classifyPasted("   ")).toBe("empty");
    expect(classifyPasted(" 6BFOXN*TS0BI$ZD.P9UOL97O4-2HH77HRM3HSZ%5$PE ")).toBe("qr");
    expect(classifyPasted("https://ingressoimpresso.com.br/ingresso#abc")).toBe("ticket-link");
    expect(classifyPasted("http://localhost:3000/ingresso/#abc")).toBe("ticket-link");
    expect(classifyPasted("https://ingressoimpresso.com.br/ingresso-para/festa-junina")).toBe("link");
    expect(classifyPasted("www.exemplo.com")).toBe("link");
  });
});

describe("pickScanned", () => {
  it("takes the first readable text, spaces kept (base45 has them)", () => {
    expect(pickScanned(["", "  ", " ABC "])).toBe(" ABC ");
    expect(pickScanned(["X".repeat(600), "OK"])).toBe("OK");
    expect(pickScanned([])).toBeNull();
  });
});

describe("pastedQr", () => {
  it("drops line breaks only", () => {
    expect(pastedQr(" I90 YQ9\nPR0007\r\n")).toBe(" I90 YQ9PR0007");
  });
});

describe("verdicts", () => {
  it("have a tone and say whether the QR was ours", () => {
    expect(verdictTone("valid")).toBe("success");
    expect(verdictTone("event_postponed")).toBe("warning");
    expect(verdictTone("private")).toBe("neutral");
    for (const verdict of ["event_over", "event_canceled", "ticket_canceled", "not_ours"] as const) {
      expect(verdictTone(verdict)).toBe("danger");
    }
    expect(isAuthentic("ticket_canceled")).toBe(true);
    expect(isAuthentic("event_over")).toBe(true);
    expect(isAuthentic("private")).toBe(false);
    expect(isAuthentic("not_ours")).toBe(false);
  });
});
