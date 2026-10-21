import { describe, expect, it } from "vitest";

import { fillCertificate } from "@/lib/certificates";

// The same examples as `fills_the_fields_with_the_name_apart` in crates/render/src/certificate.rs.
describe("fillCertificate (ADR 0113)", () => {
  const fields = {
    name: " Ana Souza ",
    event: "Semana de Ciências",
    days: ["2026-11-21T19:00", "2026-11-22T19:00"],
    venue: "Escola Estadual",
    organization: null,
    workload: "8 horas",
  };

  it("fills the fields with the name apart", () => {
    expect(fillCertificate("Certificamos que {nome} participou de {evento} ({dias}, {local}), {carga}{organizacao}. {outro}", fields)).toEqual([
      { text: "Certificamos que ", strong: false },
      { text: "Ana Souza", strong: true },
      { text: " participou de Semana de Ciências (21 e 22 de novembro de 2026, Escola Estadual), 8 horas. {outro}", strong: false },
    ]);
    expect(fillCertificate("em {data}", { ...fields, days: ["2026-11-21T19:00"] })).toEqual([{ text: "em 21 de novembro de 2026", strong: false }]);
  });
});
