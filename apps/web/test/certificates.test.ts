import { describe, expect, it } from "vitest";

import { fillCertificate } from "@/lib/certificates";

// The same examples as `fills_the_fields_with_the_name_apart` in crates/render/src/certificate.rs.
describe("fillCertificate (ADRs 0113, 0114)", () => {
  const fields = {
    name: " Ana Souza ",
    event: "Semana de Ciências",
    days: ["2026-11-21T19:00", "2026-11-22T19:00"],
    venue: "Escola Estadual",
    organization: null,
    workload: "8 horas",
    code: "CERT-0007",
  };

  it("fills the fields with the name apart", () => {
    expect(fillCertificate("Certificamos que {nome} participou de {evento} ({dias}, {local}), {carga}{organizacao}. {codigo} {outro}", fields)).toEqual([
      { text: "Certificamos que ", strong: false },
      { text: "Ana Souza", strong: true },
      { text: " participou de Semana de Ciências (21 e 22 de novembro de 2026, Escola Estadual), 8 horas. CERT-0007 {outro}", strong: false },
    ]);
    expect(fillCertificate("em {data}", { ...fields, days: ["2026-11-21T19:00"] })).toEqual([{ text: "em 21 de novembro de 2026", strong: false }]);
  });

  it("leaves out a text whose fields are all empty", () => {
    const empty = { ...fields, workload: null, venue: null };
    expect(fillCertificate("Carga horária: {carga}", empty)).toEqual([]);
    expect(fillCertificate("{local} · {evento}", empty)).toEqual([{ text: " · Semana de Ciências", strong: false }]);
    expect(fillCertificate("Sem campos", empty)).toEqual([{ text: "Sem campos", strong: false }]);
  });
});
