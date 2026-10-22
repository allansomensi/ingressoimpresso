import type { Known, Overrides } from "@/lib/event-kind";

// The event's public page (ADR 0095): /e/<slug>.
export const publicEvent = {
  metaTitle: (event: string, shortDate: string) => `${event} · ${shortDate}`,
  metaDescription: (event: string, date: string, place: string | null, organizer: string) =>
    `${event}: ${date}${place === null ? "" : `, ${place}`}. Ingressos com ${organizer}. Veja preços e onde comprar.`,
  by: (organizer: string) => `Organizado por ${organizer}`,
  soldOut: "Esgotado",
  soldOutBody: "Os ingressos deste evento acabaram. Fale com a organização para saber de uma lista de espera.",
  pricesTitle: "Ingressos",
  price: "Ingresso",
  from: (price: string) => `a partir de ${price}`,
  free: "Grátis",
  noPrice: "Preço com a organização",
  categorySoldOut: "Esgotado",
  buyTitle: "Onde comprar",
  buyLead: "Fale direto com quem vende. O pagamento é combinado com essa pessoa.",
  buyButton: (name: string) => `Comprar com ${name}`,
  buyMessage: (name: string, event: string) => `Olá, ${name}! Quero ingresso para ${event}.`,
  contactTitle: "Fale com a organização",
  contactMessage: (event: string) => `Olá! Quero saber dos ingressos para ${event}.`,
  whenTitle: "Quando",
  daysTitle: "Dias do evento",
  day: (position: number) => `Dia ${String(position)}`,
  calendar: "Adicionar à agenda",
  calendarFile: "evento",
  calendarSaved: "Abra o arquivo baixado para salvar na agenda.",
  whereTitle: "Onde",
  map: "Ver no mapa",
  mapTitle: (place: string) => `Mapa de ${place}`,
  mapHint: "O mapa é do Google e só carrega quando você toca.",
  directions: "Como chegar",
  aboutTitle: "Sobre o evento",
  verifyTitle: "Comprou de alguém?",
  verifyBody: "Confira se o QR code do ingresso é verdadeiro antes de pagar.",
  verifyLink: "Conferir ingresso",
  share: "Compartilhar",
  shareText: (event: string) => `${event}: veja data, local e onde comprar o ingresso.`,
  copied: "Link copiado.",
  copyFailed: "Não foi possível copiar. Selecione o endereço e copie à mão.",
  productTitle: "Ingressos impressos e numerados, com QR que não dá para copiar",
  productBody:
    "Este evento usa o Ingresso Impresso: imprima em casa ou na gráfica, venda com quem você confia e confira na porta pelo celular, mesmo sem internet.",
  productCta: "Criar o meu evento",
  productNote: "Os primeiros ingressos são grátis.",
  notFoundTitle: "Página do evento não encontrada",
  shareImageAlt: "Página do evento, com data, local e onde comprar, no Ingresso Impresso",
  notFound: "O endereço pode estar errado, ou a organização tirou a página do ar.",
  tokens: {
    soldOutBody: "As fichas deste evento acabaram. Fale com a organização.",
    pricesTitle: "Fichas",
    price: "Ficha",
    buyMessage: (name: string, event: string) => `Olá, ${name}! Quero fichas para ${event}.`,
    contactMessage: (event: string) => `Olá! Quero saber das fichas para ${event}.`,
    metaDescription: (event: string, date: string, place: string | null, organizer: string) =>
      `${event}: ${date}${place === null ? "" : `, ${place}`}. Fichas com ${organizer}. Veja preços e onde comprar.`,
    shareText: (event: string) => `${event}: veja data, local e onde comprar as fichas.`,
    verifyBody: "Confira se o QR code da ficha é verdadeiro antes de pagar.",
    verifyLink: "Conferir ficha",
  },
} as const;

/** Fails to compile when a consumption-token text has no ticket text or other parameters. */
type Checked<T extends Overrides<typeof publicEvent> & Known<T, typeof publicEvent>> = T;
export type PublicEventTokenTexts = Checked<typeof publicEvent.tokens>;
