import type { CertificateDesign } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { certificateIssues, elementBox, pageSize, reorient, usedImages, withoutImage } from "@/lib/certificate-design";
import { BACK_TEMPLATES, CERTIFICATE_PALETTES, FRONT_TEMPLATES, keptSigners } from "@/lib/certificate-templates";

const signers = [
  { name: "Maria Lima", role: "Diretora", image: 0 },
  { name: "João Reis", role: "", image: null },
];

function design(templateIndex = 0): CertificateDesign {
  const template = FRONT_TEMPLATES[templateIndex];
  if (template === undefined) {
    throw new Error("no template");
  }
  const palette = CERTIFICATE_PALETTES[0];
  if (palette === undefined) {
    throw new Error("no palette");
  }
  return {
    version: 1,
    orientation: template.orientation,
    title: "Certificado de participação",
    front: template.build({ title: "Certificado de participação", palette, signers }),
    back: null,
    brand: true,
    brandStyle: "line",
    brandPosition: null,
  };
}

// The rules of `CertificateDesign::validate` (crates/render/src/certificate_design.rs).
describe("certificate design (ADR 0114)", () => {
  it("accepts every template in every palette, with any signers", () => {
    for (const template of FRONT_TEMPLATES) {
      for (const palette of CERTIFICATE_PALETTES) {
        for (const kept of [[], signers.slice(0, 1), signers]) {
          const front = template.build({ title: "Certificado", palette, signers: kept });
          const built: CertificateDesign = { version: 1, orientation: template.orientation, title: "Certificado", front, back: null, brand: true, brandStyle: "mark", brandPosition: null };
          expect(certificateIssues(built, 1), `${template.id} ${palette.id}`).toEqual([]);
        }
      }
    }
  });

  it("accepts every back on both orientations", () => {
    for (const template of BACK_TEMPLATES) {
      for (const orientation of ["landscape", "portrait"] as const) {
        const front = FRONT_TEMPLATES.find((item) => item.orientation === orientation);
        const palette = CERTIFICATE_PALETTES[3];
        if (front === undefined || palette === undefined) {
          throw new Error("missing");
        }
        const input = { title: "Certificado", palette, signers: [] };
        const built: CertificateDesign = {
          version: 1,
          orientation,
          title: "Certificado",
          front: front.build(input),
          back: template.build(input, orientation),
          brand: false,
          brandStyle: "line",
    brandPosition: null,
        };
        expect(certificateIssues(built, 0), `${template.id} ${orientation}`).toEqual([]);
      }
    }
  });

  it("finds what the server refuses", () => {
    const broken = design();
    broken.title = "";
    broken.front.elements = broken.front.elements.filter((element) => element.kind !== "qr");
    broken.front.elements.push({ kind: "image", source: { from: "upload", index: 3 }, xMm: 290, yMm: 10, widthMm: 20, heightMm: 10 });
    broken.back = { backgroundColor: "white", backgroundImage: null, frame: null, elements: [{ kind: "qr", xMm: 10, yMm: 10, sizeMm: 10 }] };
    const issues = certificateIssues(broken, 1);
    const pushed = broken.front.elements.length - 1;
    expect(issues.some((issue) => issue.side === null && issue.message.includes("nome do certificado"))).toBe(true);
    expect(issues.filter((issue) => issue.side === "front" && issue.index === pushed).length).toBe(2);
    expect(issues.some((issue) => issue.side === "back" && issue.index === null)).toBe(true);
    expect(issues.some((issue) => issue.side === "back" && issue.index === 0)).toBe(true);
    // The QR of the back counts: the certificate still has one.
    expect(issues.some((issue) => issue.message.includes("precisa de um QR"))).toBe(false);
    broken.back = null;
    expect(certificateIssues(broken, 4).some((issue) => issue.message.includes("precisa de um QR"))).toBe(true);
  });

  it("turns the pages and keeps everything inside", () => {
    for (const index of FRONT_TEMPLATES.keys()) {
      const original = design(index);
      const other = original.orientation === "landscape" ? "portrait" : "landscape";
      const turned = reorient(original, other);
      const size = pageSize(other);
      expect(turned.orientation).toBe(other);
      for (const element of turned.front.elements) {
        const box = elementBox(element);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1e-6);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1e-6);
      }
      expect(certificateIssues(turned, 1).filter((issue) => !issue.message.includes("assinatura"))).toEqual([]);
    }
  });

  it("drops an image and renumbers the others", () => {
    const base = design();
    base.front.backgroundImage = 2;
    base.front.elements.push({ kind: "image", source: { from: "upload", index: 1 }, xMm: 10, yMm: 10, widthMm: 20, heightMm: 10 });
    expect(usedImages(base)).toEqual([0, 1, 2]);
    const without = withoutImage(base, 1);
    expect(usedImages(without)).toEqual([0, 1]);
    expect(without.front.backgroundImage).toBe(1);
    expect(without.front.elements.some((element) => element.kind === "image" && element.source.from === "upload")).toBe(false);
    expect(keptSigners(withoutImage(base, 0).front.elements)[0]?.image).toBeNull();
  });
});
