import type { Known, Overrides } from "@/lib/event-kind";

/**
 * What every page that draws a ticket needs (`components/ticket/ticket-view.tsx`, the rules in
 * `lib/design-rules.ts`, the templates in `lib/templates`): a small section of its own, because
 * the landing and the public pages draw tickets without carrying the editor's texts.
 */
export const ticketCanvas = {
  defaultStubFields: ["Nome", "Telefone"],
  /** The elements of the drawn ticket, for screen readers and the readout while dragging. */
  labels: {
    resize: "Redimensionar",
    readoutPosition: (x: string, y: string) => `X ${x} · Y ${y} mm`,
    readoutSize: (width: string, height: string) => `${width} × ${height} mm`,
    hiddenText: "Campo vazio: não é impresso",
    textElement: (value: string) => `Texto: ${value}`,
    numberElement: "Número do ingresso",
    qrElement: "QR code",
    sponsorsElement: "Patrocinadores",
  },
  sponsorsEmpty: "Logos aqui",
  issues: {
    bodySize: (width: readonly [number, number], height: readonly [number, number]) =>
      `O ingresso precisa ter de ${String(width[0])} a ${String(width[1])} mm de largura e de ${String(height[0])} a ${String(height[1])} mm de altura.`,
    a4: "Com o canhoto, o ingresso não cabe numa folha A4.",
    color: "Use uma cor no formato #rrggbb.",
    numberOutside: "O número precisa ficar inteiro dentro do ingresso.",
    numberSize: (range: readonly [number, number]) => `O tamanho do número vai de ${String(range[0])} a ${String(range[1])} pt.`,
    digits: (max: number) => `O número pode ter de 1 a ${String(max)} dígitos.`,
    prefix: (max: number) => `O prefixo tem no máximo ${String(max)} caracteres.`,
    qrSmall: (min: number) => `O QR code precisa ter pelo menos ${String(min)} mm para ser lido rápido.`,
    qrOutside: "O QR code precisa ficar inteiro dentro do ingresso.",
    stubWidth: (range: readonly [number, number]) => `O canhoto vai de ${String(range[0])} a ${String(range[1])} mm de largura.`,
    stubFields: (fields: number, chars: number) => `O canhoto aceita até ${String(fields)} campos de até ${String(chars)} caracteres.`,
    stubTooShort: (height: number) =>
      `Com esses campos no canhoto, o ingresso precisa ter pelo menos ${height.toLocaleString("pt-BR")} mm de altura.`,
    tooManyTexts: (max: number) => `O ingresso aceita até ${String(max)} textos.`,
    bandSize: (range: readonly [number, number]) => `A faixa da categoria vai de ${String(range[0])} a ${String(range[1])} mm.`,
    bandOverQr: "A faixa da categoria não pode cobrir o QR code: mude a borda da faixa ou mova o QR.",
    sponsorsOutside: "A faixa de patrocinadores precisa ficar inteira dentro do ingresso.",
    sponsors: (min: readonly [number, number], chars: number) =>
      `A faixa de patrocinadores precisa ter pelo menos ${String(min[0])} × ${String(min[1])} mm, texto de até ${String(chars)} caracteres e ficar fora do QR code.`,
    textTooLong: (index: number, max: number) => `O texto ${String(index)} passa de ${String(max)} caracteres.`,
    textOutside: (index: number) => `O texto ${String(index)} precisa ficar inteiro dentro do ingresso.`,
    textStyle: (index: number) => `O texto ${String(index)} tem tamanho, linhas ou espaçamento fora do permitido.`,
  },
  // Consumption tokens (ADR 0086): the editor's rules speak of a ficha.
  tokens: {
    issues: {
      bodySize: (width: readonly [number, number], height: readonly [number, number]) =>
        `A ficha precisa ter de ${String(width[0])} a ${String(width[1])} mm de largura e de ${String(height[0])} a ${String(height[1])} mm de altura.`,
      a4: "Com o canhoto, a ficha não cabe numa folha A4.",
      numberOutside: "O número precisa ficar inteiro dentro da ficha.",
      qrOutside: "O QR code precisa ficar inteiro dentro da ficha.",
      stubTooShort: (height: number) => `Com esses campos no canhoto, a ficha precisa ter pelo menos ${height.toLocaleString("pt-BR")} mm de altura.`,
      tooManyTexts: (max: number) => `A ficha aceita até ${String(max)} textos.`,
      bandSize: (range: readonly [number, number]) => `A faixa do produto vai de ${String(range[0])} a ${String(range[1])} mm.`,
      bandOverQr: "A faixa do produto não pode cobrir o QR code: mude a borda da faixa ou mova o QR.",
      sponsorsOutside: "A faixa de patrocinadores precisa ficar inteira dentro da ficha.",
      textOutside: (index: number) => `O texto ${String(index)} precisa ficar inteiro dentro da ficha.`,
    },
  },
} as const;

/** Fails to compile when a consumption-token text has no ticket text or other parameters. */
type Checked<T extends Overrides<typeof ticketCanvas> & Known<T, typeof ticketCanvas>> = T;
export type TicketCanvasTokenTexts = Checked<typeof ticketCanvas.tokens>;
