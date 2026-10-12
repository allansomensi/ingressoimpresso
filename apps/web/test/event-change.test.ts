import type { EventChangeDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { NO_CHANGE, changeKind, displayPhone, sellerMessage, spokenDate } from "@/lib/event-change";

const postponed: EventChangeDto = {
  ...NO_CHANGE,
  postponedFromStartsAt: "2026-11-20T22:00:00-03:00",
  postponedAt: "2026-11-01T12:00:00Z",
  postponeReason: "Previsão de chuva",
};

describe("event changes", () => {
  it("tells canceled, postponed and moved apart", () => {
    expect(changeKind(NO_CHANGE, "2026-11-20T22:00:00-03:00")).toBeNull();
    expect(changeKind(undefined, "2026-11-20T22:00:00-03:00")).toBeNull();
    expect(changeKind(postponed, "2026-11-28T21:00:00-03:00")).toBe("postponed");
    expect(changeKind(postponed, "2026-11-13T21:00:00-03:00")).toBe("moved");
    expect(changeKind({ ...postponed, canceledAt: "2026-11-02T12:00:00Z" }, "2026-11-28T21:00:00-03:00")).toBe("canceled");
  });

  it("says dates the way people do, in the event's time", () => {
    expect(spokenDate("2026-11-28T21:00:00-03:00")).toBe("sábado, 28 de novembro, às 21h");
    expect(spokenDate("2026-11-28T21:30:00-03:00")).toBe("sábado, 28 de novembro, às 21h30");
  });

  it("formats WhatsApp numbers", () => {
    expect(displayPhone("5511999998888")).toBe("(11) 99999-8888");
    expect(displayPhone("551133334444")).toBe("(11) 3333-4444");
    expect(displayPhone("351912345678")).toBe("+351912345678");
  });

  it("writes the message for the sellers", () => {
    expect(
      sellerMessage({
        eventName: "Show",
        startsAt: "2026-11-28T21:00:00-03:00",
        venue: "Bar do Zé",
        address: "Rua das Flores, 123",
        change: postponed,
        organization: { name: "Banda", whatsapp: "5511999998888" },
      }),
    ).toBe(
      [
        "Aviso: o evento Show foi adiado. Nova data: sábado, 28 de novembro, às 21h.",
        "Local: Bar do Zé, Rua das Flores, 123.",
        "Motivo: Previsão de chuva.",
        "Os ingressos continuam valendo para a nova data. Guarde o seu.",
        "",
        "Dúvidas: fale com Banda pelo WhatsApp (11) 99999-8888.",
      ].join("\n"),
    );
    expect(
      sellerMessage({
        eventName: "Show",
        startsAt: "2026-11-20T22:00:00-03:00",
        venue: null,
        address: null,
        change: { ...NO_CHANGE, canceledAt: "2026-11-02T12:00:00Z", cancelReason: "Problema no local" },
        organization: null,
      }),
    ).toBe(
      [
        "Aviso: o evento Show, que seria em sexta-feira, 20 de novembro, às 22h, foi cancelado.",
        "Motivo: Problema no local.",
        "Guarde o seu ingresso: a organização vai avisar como fica.",
      ].join("\n"),
    );
    expect(
      sellerMessage({
        eventName: "Show",
        startsAt: "2026-11-13T21:00:00-03:00",
        venue: null,
        address: null,
        change: { ...postponed, postponeReason: null },
        organization: { name: "Banda", whatsapp: null },
      }),
    ).toBe(["Aviso: o evento Show mudou de data. Nova data: sexta-feira, 13 de novembro, às 21h.", "Os ingressos continuam valendo para a nova data. Guarde o seu."].join("\n"));
  });
});
