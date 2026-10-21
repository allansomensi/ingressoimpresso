/**
 * Ready-made certificates (ADR 0114): fronts in both orientations and backs that fit either. Each
 * is built from a palette and what the organizer already chose (the certificate's name, who signs
 * and their scanned signatures), so trying a template never loses those. `test/certificate-design.test.ts`
 * checks every template in every palette against the design rules.
 */

import type {
  CertificateElement,
  CertificateFrame,
  CertificatePage,
  CertificateSignature,
  CertificateText,
  FontChoice,
  PageOrientation,
} from "@ingressoimpresso/api-types";

import { pageSize } from "@/lib/certificate-design";

/** Two colours: the main one and the one of the details (gold, by default). */
export interface CertificatePalette {
  id: string;
  name: string;
  accent: string;
  detail: string;
}

export const CERTIFICATE_PALETTES: readonly CertificatePalette[] = [
  { id: "navy", name: "Azul-marinho", accent: "#1f3a5f", detail: "#b8892b" },
  { id: "green", name: "Verde", accent: "#1d5c45", detail: "#b8892b" },
  { id: "wine", name: "Vinho", accent: "#7a1f2b", detail: "#c9a24a" },
  { id: "petrol", name: "Petróleo", accent: "#0f5f6e", detail: "#d08c2c" },
  { id: "purple", name: "Roxo", accent: "#5b3df5", detail: "#f2b134" },
  { id: "graphite", name: "Grafite", accent: "#2b2d36", detail: "#9a7b3c" },
  { id: "orange", name: "Laranja", accent: "#c2410c", detail: "#1f3a5f" },
  { id: "pink", name: "Rosa", accent: "#be185d", detail: "#d99a1e" },
];

/** A signature kept across templates. */
export interface KeptSigner {
  name: string;
  role: string;
  image: number | null;
}

export interface TemplateInput {
  title: string;
  palette: CertificatePalette;
  signers: readonly KeptSigner[];
}

export interface FrontTemplate {
  id: string;
  name: string;
  description: string;
  orientation: PageOrientation;
  build: (input: TemplateInput) => CertificatePage;
}

export interface BackTemplate {
  id: string;
  name: string;
  description: string;
  build: (input: TemplateInput, orientation: PageOrientation) => CertificatePage;
}

const INK = "#1b1a24";
const MUTED = "#5b5a6b";
const BODY = "Certificamos que {nome} participou de {evento}, realizado em {dias}.";

function text(
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  font: FontChoice,
  sizePt: number,
  color: string,
  extra: Partial<CertificateText> = {},
): CertificateElement {
  return {
    kind: "text",
    text: value,
    xMm: x,
    yMm: y,
    widthMm: width,
    heightMm: height,
    font,
    sizePt,
    color,
    align: "center",
    valign: "middle",
    bold: false,
    italic: false,
    uppercase: false,
    letterSpacing: 0,
    lineHeight: 1.4,
    boldName: true,
    ...extra,
  };
}

function logo(x: number, y: number, width: number, height: number): CertificateElement {
  return { kind: "image", source: { from: "organization" }, xMm: x, yMm: y, widthMm: width, heightMm: height };
}

function qr(x: number, y: number, size = 22): CertificateElement {
  return { kind: "qr", xMm: x, yMm: y, sizeMm: size };
}

function frame(style: CertificateFrame["style"], color: string, accent: string, marginMm: number, thicknessMm: number): CertificateFrame {
  return { style, color, accent, marginMm, thicknessMm };
}

/**
 * The signatures of a template: the kept ones (at most two), or one blank line to sign by hand,
 * spread over `[left, right]` at `y`.
 */
function signatures(
  input: TemplateInput,
  left: number,
  right: number,
  y: number,
  style: Pick<CertificateSignature, "font" | "sizePt" | "color" | "lineColor">,
  width = 70,
  single: "center" | "right" = "center",
): CertificateElement[] {
  const kept = input.signers.slice(0, 2);
  const people = kept.length === 0 ? [{ name: "", role: "", image: null }] : kept;
  const span = right - left;
  return people.map((person, index): CertificateElement => {
    const alone = single === "center" ? left + (span - width) / 2 : right - width;
    const x = people.length === 1 ? alone : index === 0 ? left : right - width;
    return { kind: "signature", xMm: Math.round(x * 10) / 10, yMm: y, widthMm: width, heightMm: 30, name: person.name, role: person.role, image: person.image, ...style };
  });
}

function page(backgroundColor: string, elements: CertificateElement[], certificateFrame: CertificateFrame | null = null): CertificatePage {
  return { backgroundColor, backgroundImage: null, frame: certificateFrame, elements };
}

export const FRONT_TEMPLATES: readonly FrontTemplate[] = [
  {
    id: "classic",
    name: "Clássico",
    description: "Moldura com losangos, título em capitulares e texto serifado.",
    orientation: "landscape",
    build: (input) => {
      const { accent, detail } = input.palette;
      return page(
        "#fffdf8",
        [
          logo(128.5, 22, 40, 16),
          text(input.title, 40, 42, 217, 18, "roman", 34, accent, { bold: true }),
          { kind: "line", xMm: 118.5, yMm: 63, widthMm: 60, heightMm: 4, style: "ornament", color: detail, thicknessMm: 0.4 },
          text(BODY, 40, 74, 217, 52, "classic", 18, INK),
          text("Carga horária: {carga}", 40, 128, 217, 7, "classic", 13, MUTED),
          text("{local}, {data}", 40, 136, 217, 7, "classic", 13, MUTED, { italic: true }),
          ...signatures(input, 40, 236, 150, { font: "classic", sizePt: 12, color: INK, lineColor: INK }),
          qr(252, 158),
          text("{codigo}", 236, 181, 38, 4, "sans", 8, MUTED),
        ],
        frame("classic", accent, detail, 9, 1.6),
      );
    },
  },
  {
    id: "elegant",
    name: "Elegante",
    description: "Título e nome em letra cursiva, linha dupla e selo com o código.",
    orientation: "landscape",
    build: (input) => {
      const { accent, detail } = input.palette;
      return page(
        "#fdfbf6",
        [
          logo(128.5, 20, 40, 14),
          text(input.title, 40, 36, 217, 24, "script", 44, accent),
          text("Certificamos que", 40, 64, 217, 8, "classic", 15, MUTED, { italic: true }),
          text("{nome}", 40, 72, 217, 24, "script", 46, INK),
          { kind: "line", xMm: 88.5, yMm: 97, widthMm: 120, heightMm: 2, style: "solid", color: detail, thicknessMm: 0.3 },
          text("participou de {evento}, realizado em {dias}.", 45, 102, 207, 20, "classic", 16, INK),
          text("Carga horária: {carga}", 40, 124, 217, 7, "classic", 13, MUTED),
          { kind: "seal", xMm: 24, yMm: 150, sizeMm: 34, color: detail, textColor: "#ffffff", text: "Certificado", center: "{codigo}" },
          ...signatures(input, 70, 240, 152, { font: "classic", sizePt: 12, color: INK, lineColor: detail }),
          qr(252, 160),
        ],
        frame("double", accent, detail, 8, 1.2),
      );
    },
  },
  {
    id: "modern",
    name: "Moderno",
    description: "Faixa lateral, tudo alinhado à esquerda e letras retas.",
    orientation: "landscape",
    build: (input) => {
      const { accent, detail } = input.palette;
      const left = { align: "left" } as const;
      return page(
        "#ffffff",
        [
          logo(30, 20, 44, 16),
          text("Certificado", 30, 46, 200, 7, "sans", 11, detail, { ...left, bold: true, uppercase: true, letterSpacing: 0.3 }),
          text(input.title, 30, 54, 230, 20, "display", 46, INK, left),
          text(BODY, 30, 82, 220, 36, "sans", 16, INK, { ...left, lineHeight: 1.5 }),
          text("Carga horária: {carga}", 30, 120, 220, 7, "sans", 12, MUTED, left),
          ...signatures(input, 30, 180, 152, { font: "sans", sizePt: 11, color: INK, lineColor: accent }, 64),
          qr(244, 152, 24),
          text("{codigo}", 236, 177, 40, 4, "mono", 8, MUTED),
        ],
        frame("side", accent, detail, 14, 2.5),
      );
    },
  },
  {
    id: "minimal",
    name: "Minimalista",
    description: "Muito espaço em branco, sem moldura, só o essencial.",
    orientation: "landscape",
    build: (input) => {
      const { accent } = input.palette;
      return page("#ffffff", [
        logo(133.5, 22, 30, 12),
        text(input.title, 40, 42, 217, 12, "classic", 26, INK, { uppercase: true, letterSpacing: 0.25 }),
        { kind: "line", xMm: 133.5, yMm: 58, widthMm: 30, heightMm: 2, style: "solid", color: accent, thicknessMm: 0.4 },
        text("Certificamos que", 40, 68, 217, 6, "sans", 10, MUTED, { uppercase: true, letterSpacing: 0.3 }),
        text("{nome}", 40, 76, 217, 22, "classic", 40, INK),
        text("participou de {evento}, realizado em {dias}.", 50, 102, 197, 16, "classic", 15, MUTED, { italic: true }),
        text("Carga horária: {carga}", 40, 120, 217, 6, "sans", 10, MUTED, { uppercase: true, letterSpacing: 0.2 }),
        ...signatures(input, 60, 237, 152, { font: "classic", sizePt: 11, color: INK, lineColor: "#c9c9d1" }),
        qr(259, 170, 20),
        text("{codigo}", 196, 183, 60, 4, "sans", 7, MUTED, { align: "right" }),
      ]);
    },
  },
  {
    id: "geometric",
    name: "Geométrico",
    description: "Triângulos nos cantos e título forte, para eventos jovens.",
    orientation: "landscape",
    build: (input) => {
      const { accent, detail } = input.palette;
      return page(
        "#ffffff",
        [
          logo(128.5, 18, 40, 14),
          text(input.title, 70, 38, 157, 20, "condensed", 40, accent, { uppercase: true }),
          text(BODY, 50, 70, 197, 40, "sans", 17, INK, { lineHeight: 1.5 }),
          text("Carga horária: {carga}", 50, 112, 197, 7, "sans", 12, MUTED),
          ...signatures(input, 60, 200, 140, { font: "sans", sizePt: 11, color: INK, lineColor: INK }),
          qr(20, 160),
          text("{codigo}", 14, 183, 34, 4, "mono", 8, MUTED),
        ],
        frame("geometric", accent, detail, 0, 4),
      );
    },
  },
  {
    id: "banner",
    name: "Faixa",
    description: "Cabeçalho de cor com o título em branco.",
    orientation: "landscape",
    build: (input) => {
      const { accent, detail } = input.palette;
      return page(
        "#ffffff",
        [
          { kind: "shape", xMm: 10, yMm: 10, widthMm: 277, heightMm: 40, color: accent, opacity: 1, radiusMm: 0 },
          text(input.title, 30, 20, 237, 20, "roman", 30, "#ffffff", { bold: true }),
          logo(128.5, 56, 40, 14),
          text(BODY, 40, 76, 217, 40, "classic", 18, INK),
          text("Carga horária: {carga}", 40, 118, 217, 7, "classic", 13, MUTED),
          ...signatures(input, 40, 236, 150, { font: "classic", sizePt: 12, color: INK, lineColor: detail }),
          qr(252, 156),
          text("{codigo}", 236, 179, 38, 4, "sans", 8, MUTED),
        ],
        frame("band", accent, detail, 10, 0.6),
      );
    },
  },
  {
    id: "school",
    name: "Escolar",
    description: "Letra divertida e cantoneiras coloridas, para crianças e escolas.",
    orientation: "landscape",
    build: (input) => {
      const { accent, detail } = input.palette;
      return page(
        "#fffaf0",
        [
          logo(24, 22, 40, 16),
          text(input.title, 40, 28, 217, 24, "casual", 38, accent),
          text("Este certificado é concedido a", 40, 60, 217, 8, "sans", 14, MUTED),
          text("{nome}", 40, 70, 217, 24, "casual", 36, INK),
          text("por participar de {evento}, em {dias}.", 45, 98, 207, 18, "sans", 16, INK),
          { kind: "seal", xMm: 24, yMm: 140, sizeMm: 36, color: detail, textColor: "#ffffff", text: "Parabéns", center: "" },
          ...signatures(input, 80, 236, 148, { font: "sans", sizePt: 11, color: INK, lineColor: accent }),
          qr(252, 160),
        ],
        frame("corners", accent, detail, 10, 2),
      );
    },
  },
  {
    id: "diploma",
    name: "Diploma",
    description: "Moldura larga, nome em cursiva e selo entre as assinaturas.",
    orientation: "landscape",
    build: (input) => {
      const { accent, detail } = input.palette;
      return page(
        "#fbf7ee",
        [
          text(input.title, 52, 30, 193, 20, "roman", 38, accent, { bold: true }),
          text("Certificamos que", 40, 58, 217, 8, "classic", 16, MUTED, { italic: true }),
          text("{nome}", 40, 66, 217, 26, "script", 48, INK),
          { kind: "line", xMm: 113.5, yMm: 93, widthMm: 70, heightMm: 4, style: "ornament", color: detail, thicknessMm: 0.4 },
          text("participou de {evento}, realizado em {dias}.", 45, 100, 207, 18, "classic", 16, INK),
          text("Carga horária: {carga}", 40, 119, 217, 7, "classic", 13, MUTED),
          { kind: "seal", xMm: 128.5, yMm: 140, sizeMm: 40, color: detail, textColor: "#ffffff", text: "{organizacao}", center: "{codigo}" },
          ...signatures(input, 28, 269, 148, { font: "classic", sizePt: 12, color: INK, lineColor: INK }, 70, "right"),
          qr(254, 18),
          logo(18, 20, 32, 14),
        ],
        frame("classic", accent, detail, 7, 2.5),
      );
    },
  },
  {
    id: "academic",
    name: "Acadêmico",
    description: "A4 em pé, para cursos e formações, com texto justificado.",
    orientation: "portrait",
    build: (input) => {
      const { accent, detail } = input.palette;
      return page(
        "#fffdf8",
        [
          logo(85, 24, 40, 20),
          text("{organizacao}", 25, 48, 160, 8, "roman", 13, MUTED, { uppercase: true }),
          text(input.title, 25, 62, 160, 28, "roman", 30, accent, { bold: true }),
          { kind: "line", xMm: 75, yMm: 94, widthMm: 60, heightMm: 4, style: "ornament", color: detail, thicknessMm: 0.4 },
          text(BODY, 30, 106, 150, 66, "classic", 17, INK, { align: "justify", lineHeight: 1.6 }),
          text("Carga horária: {carga}", 30, 178, 150, 7, "classic", 13, MUTED),
          text("{local}, {data}", 30, 186, 150, 7, "classic", 13, MUTED, { italic: true }),
          ...signatures(input, 25, 185, 212, { font: "classic", sizePt: 12, color: INK, lineColor: INK }, 68),
          { kind: "seal", xMm: 26, yMm: 250, sizeMm: 30, color: detail, textColor: "#ffffff", text: "Certificado", center: "{codigo}" },
          qr(160, 252, 24),
        ],
        frame("double", accent, detail, 10, 1.4),
      );
    },
  },
  {
    id: "congress",
    name: "Congresso",
    description: "A4 em pé com cabeçalho do evento, para palestras e congressos.",
    orientation: "portrait",
    build: (input) => {
      const { accent, detail } = input.palette;
      return page("#ffffff", [
        { kind: "shape", xMm: 0, yMm: 0, widthMm: 210, heightMm: 74, color: accent, opacity: 1, radiusMm: 0 },
        { kind: "shape", xMm: 0, yMm: 74, widthMm: 210, heightMm: 3, color: detail, opacity: 1, radiusMm: 0 },
        text(input.title, 20, 20, 170, 8, "sans", 11, "#ffffff", { bold: true, uppercase: true, letterSpacing: 0.3 }),
        text("{evento}", 20, 31, 170, 24, "display", 40, "#ffffff"),
        text("{dias}", 20, 57, 170, 7, "sans", 13, "#ffffff"),
        text("Certificamos que", 20, 96, 170, 7, "sans", 13, MUTED),
        text("{nome}", 20, 106, 170, 20, "classic", 34, INK, { bold: true }),
        text("participou deste evento, realizado em {local}.", 25, 130, 160, 16, "sans", 14, INK),
        text("Carga horária: {carga}", 20, 150, 170, 7, "sans", 12, MUTED),
        ...signatures(input, 20, 190, 196, { font: "sans", sizePt: 11, color: INK, lineColor: accent }, 70),
        logo(20, 250, 56, 24),
        qr(166, 246, 24),
        text("{codigo}", 140, 272, 50, 4, "mono", 8, MUTED, { align: "right" }),
      ]);
    },
  },
];

export const BACK_TEMPLATES: readonly BackTemplate[] = [
  {
    id: "programme",
    name: "Conteúdo programático",
    description: "Os temas do curso ou da programação, com o QR de conferência.",
    build: (input, orientation) => {
      const { width: W, height: H } = pageSize(orientation);
      const { accent, detail } = input.palette;
      return page(
        "#ffffff",
        [
          text("Conteúdo programático", 24, 22, W - 48, 12, "roman", 22, accent, { bold: true, align: "left" }),
          { kind: "line", xMm: 24, yMm: 36, widthMm: 50, heightMm: 2, style: "solid", color: detail, thicknessMm: 0.5 },
          text(
            "1. Abertura e boas-vindas\n2. Tema principal\n3. Atividade prática\n4. Encerramento",
            24,
            44,
            W - 48,
            H - 92,
            "classic",
            15,
            INK,
            { align: "left", valign: "top", lineHeight: 1.6 },
          ),
          text("Confira a autenticidade apontando a câmera do celular para o QR.", 24, H - 38, W - 86, 8, "sans", 10, MUTED, { align: "left" }),
          text("Certificado {codigo}", 24, H - 30, W - 86, 6, "mono", 9, MUTED, { align: "left" }),
          qr(W - 50, H - 50, 26),
        ],
        frame("simple", accent, detail, 10, 0.5),
      );
    },
  },
  {
    id: "record",
    name: "Registro",
    description: "Os dados do certificado linha por linha e um QR grande.",
    build: (input, orientation) => {
      const { width: W } = pageSize(orientation);
      const { accent, detail } = input.palette;
      const lines = ["Certificado {codigo}", "Emitido por {organizacao}", "Evento: {evento}", "Data: {dias}", "Local: {local}", "Carga horária: {carga}"];
      const column = W - 48 - 56;
      return page(
        "#ffffff",
        [
          text("Registro do certificado", 24, 24, W - 48, 12, "classic", 22, accent, { bold: true, align: "left" }),
          ...lines.map((line, index) => text(line, 24, 48 + index * 11, column, 8, "classic", 14, INK, { align: "left" })),
          qr(W - 70, 48, 44),
          text("Aponte a câmera para o QR: a página confirma o nome, o evento e a validade.", W - 76, 96, 56, 16, "sans", 9, MUTED, { lineHeight: 1.3 }),
        ],
        frame("double", accent, detail, 10, 0.8),
      );
    },
  },
  {
    id: "blank",
    name: "Em branco",
    description: "Só a moldura: monte o verso do seu jeito.",
    build: (input) => page("#ffffff", [], frame("simple", input.palette.accent, input.palette.detail, 10, 0.5)),
  },
];

/** The signatures of a page, to keep them when a template replaces it. */
export function keptSigners(elements: readonly CertificateElement[]): KeptSigner[] {
  return elements.flatMap((element) => (element.kind === "signature" ? [{ name: element.name, role: element.role, image: element.image ?? null }] : []));
}
