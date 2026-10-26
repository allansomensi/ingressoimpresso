import type { StubImage, StubStyle, TicketDesign } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import {
  AUTO_BAND_MM,
  MAX_PHOTOS,
  defaultSponsorStrip,
  designIssues,
  effectiveBand,
  fitsA4,
  inkFor,
  newPhoto,
  photoRadius,
  photoToAspect,
  photosInside,
  stubMinHeight,
} from "@/lib/design-rules";

// The default design of crates/render/src/design.rs (`default_v1`).
const base: TicketDesign = {
  version: 1,
  widthMm: 150,
  heightMm: 55,
  backgroundColor: "#ffffff",
  number: { xMm: 6, yMm: 4, widthMm: 60, heightMm: 12, font: "display", sizePt: 24, color: "#111111", align: "left", prefix: "Nº ", digits: 4 },
  qr: { xMm: 117, yMm: 14.5, sizeMm: 28 },
  stub: { side: "left", widthMm: 40, fields: ["Nome", "Telefone"], image: null },
  texts: [],
  band: null,
  sponsors: null,
  photos: [],
};

const photo = { xMm: 70, yMm: 10, widthMm: 30, heightMm: 40, fit: "cover", shape: "rounded" } as const;

describe("design rules (mirror of design.rs)", () => {
  it("makes room for the stub's picture (the_stub_picture_takes_its_height)", () => {
    const image: StubImage = { position: "top", heightMm: 20, fit: "cover" };
    const stub: StubStyle = { side: "left", widthMm: 40, fields: ["Nome", "Telefone"], image };
    const withPicture = { ...base, stub };
    expect(stubMinHeight(withPicture)).toBe(51.9);
    expect(designIssues(withPicture)).toEqual([]);
    expect(designIssues({ ...withPicture, heightMm: 50, qr: { ...base.qr, yMm: 10 } }).map((issue) => issue.message)).toEqual([
      "Com esses campos no canhoto, o ingresso precisa ter pelo menos 51,9 mm de altura.",
    ]);
    expect(designIssues({ ...base, stub: { ...stub, image: { ...image, heightMm: 4 } } }).map((issue) => issue.target.kind)).toEqual(["stub"]);
  });

  it("keeps photos inside and counts them (photos_stay_inside_and_are_counted)", () => {
    expect(designIssues({ ...base, photos: [photo] })).toEqual([]);
    // Over the QR is fine: the QR is printed on top of the photos.
    expect(designIssues({ ...base, photos: [{ ...photo, xMm: 110 }] })).toEqual([]);
    expect(designIssues({ ...base, photos: [{ ...photo, xMm: 130 }] }).map((issue) => issue.target)).toEqual([{ kind: "photo", index: 0 }]);
    expect(designIssues({ ...base, photos: Array.from({ length: MAX_PHOTOS + 1 }, () => photo) }).map((issue) => issue.target.kind)).toEqual(["body"]);
    expect(designIssues({ ...base, photos: [{ ...photo, widthMm: 2 }] })).toHaveLength(1);
  });

  it("rounds a photo's corners from its shorter side (photo_corners_follow_the_shorter_side)", () => {
    expect(photoRadius(photo)).toBeCloseTo(4.5);
    expect(photoRadius({ ...photo, shape: "round" })).toBe(15);
    expect(photoRadius({ ...photo, shape: "square" })).toBe(0);
  });

  it("places a new photo centred, with the picture's shape, inside the ticket", () => {
    const portrait = newPhoto(base, 0.75);
    expect(portrait.heightMm).toBe(33);
    expect(portrait.widthMm).toBe(25);
    expect(designIssues({ ...base, photos: [portrait] })).toEqual([]);
    const wide = newPhoto(base, 10);
    expect(wide.widthMm).toBe(90);
    expect(wide.heightMm).toBe(9);
    expect(designIssues({ ...base, photos: [wide] })).toEqual([]);
  });

  it("gives a photo back its picture's shape inside the same box", () => {
    expect(photoToAspect(photo, 1)).toMatchObject({ xMm: 70, yMm: 15, widthMm: 30, heightMm: 30 });
    expect(photoToAspect(photo, 0.5)).toMatchObject({ xMm: 75, yMm: 10, widthMm: 20, heightMm: 40 });
  });

  it("keeps photos inside a smaller ticket", () => {
    const small = { ...base, widthMm: 63, heightMm: 38 };
    const [moved] = photosInside([{ ...photo, xMm: 100, heightMm: 50 }], small);
    expect(moved).toBeDefined();
    expect(designIssues({ ...small, stub: null, qr: { xMm: 37, yMm: 7, sizeMm: 22 }, number: { ...base.number, widthMm: 20, xMm: 2 }, photos: moved === undefined ? [] : [moved] })).toEqual([]);
  });

  it("keeps the band clear of the QR (the_band_keeps_the_qr_clear)", () => {
    expect(effectiveBand(base)).toEqual({ edge: "bottom", sizeMm: AUTO_BAND_MM });
    const low = { ...base, qr: { ...base.qr, yMm: 27 } };
    expect(effectiveBand(low)?.edge).toBe("top");
    expect(designIssues({ ...low, band: { edge: "right", sizeMm: 8 } }).map((issue) => issue.target.kind)).toEqual(["qr"]);
    expect(designIssues({ ...low, band: { edge: "left", sizeMm: 30 } })).toHaveLength(1);
    expect(designIssues({ ...low, band: { edge: "left", sizeMm: 6 } })).toEqual([]);
  });

  it("keeps the sponsors clear of the QR (sponsors_keep_the_qr_clear)", () => {
    const strip = { xMm: 6, yMm: 40, widthMm: 100, heightMm: 10, label: "Patrocínio", labelColor: "#555555", panel: false };
    const withStrip = { ...base, sponsors: strip };
    expect(designIssues(withStrip)).toEqual([]);
    expect(effectiveBand(withStrip)?.edge).toBe("top");
    expect(designIssues({ ...base, sponsors: { ...strip, widthMm: 130 } }).map((issue) => issue.target.kind)).toEqual(["sponsors"]);
    expect(designIssues({ ...base, sponsors: { ...strip, heightMm: 4, labelColor: "cinza" } })).toHaveLength(2);
  });

  it("places a default sponsor strip clear of the QR", () => {
    const strip = defaultSponsorStrip(base, "Patrocínio");
    expect(designIssues({ ...base, sponsors: strip })).toEqual([]);
  });

  it("writes on the band in black or white", () => {
    expect(inkFor("#e11d48")).toBe("#ffffff");
    expect(inkFor("#facc15")).toBe("#111111");
    // Mid-tones: white would fall under 3:1 on them.
    expect(inkFor("#f97316")).toBe("#111111");
    expect(inkFor("#10b981")).toBe("#111111");
    expect(inkFor("#1f1d2b")).toBe("#ffffff");
  });

  it("accepts the default design", () => {
    expect(designIssues(base)).toEqual([]);
  });

  it("flags a small or misplaced QR", () => {
    const issues = designIssues({ ...base, qr: { xMm: 140, yMm: 14.5, sizeMm: 20 } });
    expect(issues.map((issue) => issue.target.kind)).toEqual(["qr", "qr"]);
  });

  it("needs height for the stub's fields", () => {
    // Two fields need 15.1 + 2 × 7.6 = 30.3 mm.
    expect(stubMinHeight(base)).toBe(30.3);
    const issues = designIssues({ ...base, heightMm: 30, qr: { ...base.qr, yMm: 1 } });
    expect(issues.map((issue) => issue.target.kind)).toEqual(["stub"]);
  });

  it("checks text blocks", () => {
    const block = {
      text: "{evento}",
      xMm: 100,
      yMm: 20,
      widthMm: 100,
      heightMm: 12,
      font: "serif" as const,
      sizePt: 500,
      color: "red",
      align: "left" as const,
      lines: 0,
      bold: false,
      uppercase: false,
      letterSpacing: 0,
    };
    const issues = designIssues({ ...base, texts: [block] });
    expect(issues).toHaveLength(3);
    expect(issues.every((issue) => issue.target.kind === "text")).toBe(true);
  });

  it("knows what fits on A4", () => {
    expect(fitsA4(190, 55)).toBe(true);
    expect(fitsA4(60, 120)).toBe(true);
    expect(fitsA4(300, 200)).toBe(false);
  });
});
