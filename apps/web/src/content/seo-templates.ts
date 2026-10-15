// Conteúdo das páginas públicas de modelos (app/modelos), uma por modelo do catálogo
// (src/lib/templates/catalog.ts). A imagem de cada modelo fica em public/modelos/<slug>.jpg,
// gerada por `just template-images` (ADR 0062).

import type { TemplateId } from "@/lib/templates/catalog";

export type TemplateSeoPage = {
  id: TemplateId;
  slug: string;
  title: string; // <title>, até ~60 caracteres
  description: string; // meta description, até ~155 caracteres
  h1: string;
  intro: string;
};

/** Last change to the template pages (the sitemap's `lastmod`): update it with the content. */
export const TEMPLATE_PAGES_UPDATED_AT = "2026-10-15";

export const templateSeoPages: readonly TemplateSeoPage[] = [
  {
    id: "show",
    slug: "show-ao-vivo",
    title: "Modelo de ingresso para show pronto para imprimir",
    description:
      "Modelo de ingresso para show e banda com feixes de luz e letras fortes, número e QR code. Personalize e imprima em casa ou na gráfica.",
    h1: "Modelo de ingresso para show ao vivo",
    intro:
      "Feixes de luz, letras fortes e cores de palco para o show da sua banda. O nome, a data, o local e o preço entram sozinhos, e cada ingresso sai com o seu número e um QR que não dá para copiar.",
  },
  {
    id: "party",
    slug: "festa-e-balada",
    title: "Modelo de ingresso para festa e balada",
    description:
      "Modelo de ingresso para festa, balada e baile com gradiente vibrante e luzes desfocadas. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para festa e balada",
    intro:
      "Gradiente vibrante e luzes desfocadas para festas, baladas e bailes. Troque as cores, ajuste os textos e imprima quantos ingressos precisar, cada um com o seu número.",
  },
  {
    id: "arraia",
    slug: "festa-junina",
    title: "Modelo de ingresso de festa junina para imprimir",
    description:
      "Modelo de ingresso de festa junina com bandeirinhas e xadrez, numerado e com QR code. Personalize o arraiá e imprima em casa ou na gráfica.",
    h1: "Modelo de ingresso de festa junina",
    intro:
      "Bandeirinhas, xadrez e cores de arraiá para a festa da escola, da igreja ou da comunidade. O nome da festa, a data e o local entram sozinhos, e a portaria confere cada ingresso pelo celular.",
  },
  {
    id: "graduation",
    slug: "formatura",
    title: "Modelo de convite de formatura com QR code",
    description:
      "Modelo de convite e ingresso de formatura em azul e dourado, com moldura art déco, número e QR code. Personalize e imprima para a turma.",
    h1: "Modelo de convite de formatura",
    intro:
      "Convite vertical em azul e dourado, com moldura art déco, para o baile e a colação. Cada convite leva um número e um QR próprio, e a comissão sabe quem já entrou.",
  },
  {
    id: "church",
    slug: "igreja-e-congresso",
    title: "Modelo de ingresso para igreja, culto e congresso",
    description:
      "Modelo de ingresso para culto, congresso, retiro e encontro da igreja, com luz suave e tipografia clássica. Numerado e com QR code.",
    h1: "Modelo de ingresso para igreja e congresso",
    intro:
      "Luz suave e tipografia clássica para cultos especiais, congressos, retiros e encontros. Os líderes vendem cada um a sua faixa de números, e a recepção confere a entrada pelo celular.",
  },
  {
    id: "wedding",
    slug: "casamento-e-gala",
    title: "Modelo de convite para casamento e jantar de gala",
    description:
      "Modelo de convite para casamento, jantar de gala e celebrações, com ramos delicados e letra cursiva. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de convite para casamento e jantar de gala",
    intro:
      "Ramos delicados e letra cursiva para casamentos, jantares e celebrações. Cada convite tem o seu número e um QR, para a recepção saber quem já chegou.",
  },
  {
    id: "theater",
    slug: "teatro-e-danca",
    title: "Modelo de ingresso para teatro, dança e recital",
    description:
      "Modelo de ingresso para espetáculo de teatro, balé e recital, com cortina, holofote e serifas. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para teatro e dança",
    intro:
      "Cortina, holofote e serifas para espetáculos, apresentações de balé e recitais de fim de ano. Os alunos vendem, e a entrada do auditório é conferida pelo celular.",
  },
  {
    id: "sports",
    slug: "esporte-e-campeonato",
    title: "Modelo de ingresso para jogo e campeonato",
    description:
      "Modelo de ingresso para jogo, torneio e campeonato, com gramado, linhas do campo e letras de impacto. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para jogo e campeonato",
    intro:
      "Gramado, linhas do campo e letras de impacto para jogos, torneios e campeonatos do bairro ou da escola. Escolha entre as cores de campo, quadra e vôlei.",
  },
  {
    id: "raffle",
    slug: "rifa",
    title: "Modelo de rifa numerada com canhoto para imprimir",
    description:
      "Modelo de rifa numerada com canhoto, 12 por folha A4, com número grande e QR code. Personalize e imprima para a turma, a escola ou a igreja.",
    h1: "Modelo de rifa numerada com canhoto",
    intro:
      "Compacto, com número grande e canhoto para anotar o comprador: cabem 12 por folha A4. A numeração sai sozinha, e cada vendedor leva a sua faixa de números.",
  },
  {
    id: "charity",
    slug: "beneficente",
    title: "Modelo de ingresso para evento beneficente",
    description:
      "Modelo de convite e ingresso para jantar beneficente, feijoada e ação solidária, com corações e cores quentes. Numerado e com QR code.",
    h1: "Modelo de ingresso para evento beneficente",
    intro:
      "Corações e cores quentes para jantares beneficentes, feijoadas e ações solidárias. Cada voluntário leva a sua faixa de números, e a prestação de contas fica pronta.",
  },
  {
    id: "kids",
    slug: "festa-infantil",
    title: "Modelo de ingresso para festa infantil e da escola",
    description:
      "Modelo de ingresso para festa infantil, festa da escola e peça infantil, com balões e confete. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para festa infantil",
    intro:
      "Balões, confete e cores alegres para festas da escola, peças infantis e festas da família. As turmas vendem, e a entrada é conferida pelo celular, sem lista de papel.",
  },
  {
    id: "carnival",
    slug: "carnaval-e-bloco",
    title: "Modelo de ingresso para carnaval e bloco",
    description:
      "Modelo de ingresso para bloco e baile de carnaval, com confete e serpentina. Numerado, com QR code e pronto para imprimir em casa ou na gráfica.",
    h1: "Modelo de ingresso para carnaval e bloco",
    intro:
      "Confete e serpentina para blocos, bailes e matinês de carnaval. Escolha entre as cores da folia e do frevo e imprima quantos ingressos precisar.",
  },
  {
    id: "talk",
    slug: "palestra-e-workshop",
    title: "Modelo de ingresso para palestra e workshop",
    description:
      "Modelo de ingresso para palestra, curso, workshop e congresso, limpo e corporativo, com número e QR code. Personalize e imprima.",
    h1: "Modelo de ingresso para palestra e workshop",
    intro:
      "Visual limpo e corporativo para palestras, cursos, workshops e congressos. O participante também pode receber o ingresso no celular e mostrar o QR na entrada.",
  },
  {
    id: "cinema",
    slug: "cinema",
    title: "Modelo de ingresso de cinema para imprimir",
    description:
      "Modelo de ingresso de cinema com película de filme, para sessões, mostras e cineclubes. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso de cinema",
    intro:
      "Película de filme para sessões especiais, mostras e cineclubes. Escolha entre o clássico e o retrô e controle a lotação de cada sessão.",
  },
  {
    id: "newYear",
    slug: "reveillon",
    title: "Modelo de ingresso para festa de Réveillon",
    description:
      "Modelo de ingresso para festa de Réveillon e virada do ano, com fogos dourados. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para Réveillon",
    intro:
      "Fogos dourados para a festa da virada. A portaria funciona sem internet, mesmo com a praia ou o salão lotados.",
  },
  {
    id: "classic",
    slug: "classico",
    title: "Modelo de ingresso simples e numerado",
    description:
      "Modelo de ingresso clássico, com moldura simples, número e QR code, que combina com qualquer evento. Personalize e imprima em casa.",
    h1: "Modelo de ingresso simples e numerado",
    intro:
      "Moldura simples que combina com qualquer evento: recital, rifa, jantar ou festa. Use as cores da sua marca ou envie a sua própria arte.",
  },
  {
    id: "token",
    slug: "ficha-de-consumo",
    title: "Modelo de ficha de consumo numerada para imprimir",
    description:
      "Modelo de ficha de bebida e comida numerada, com o produto em destaque, preço e QR code: 21 por folha A4, com baixa na barraca pelo celular.",
    h1: "Modelo de ficha de consumo numerada",
    intro:
      "Cada ficha sai com o produto em letras grandes, o preço e um QR próprio. Na barraca, o celular lê a ficha, mostra o produto e barra a ficha já usada ou falsificada, mesmo sem internet.",
  },
  {
    id: "tokenJunina",
    slug: "ficha-de-festa-junina",
    title: "Modelo de ficha de festa junina com QR code",
    description:
      "Modelo de ficha de comida e bebida para festa junina, com bandeirinhas e xadrez. Numerada, com QR code e baixa na barraca pelo celular.",
    h1: "Modelo de ficha de festa junina",
    intro:
      "Bandeirinhas e xadrez para as fichas do arraiá da escola ou da igreja. Cada barraca dá baixa pelo celular, e a ficha usada ou copiada não passa duas vezes.",
  },
];

/** The templates shown on each event page (src/content/seo-event-pages.ts), the closest first. */
export const EVENT_TEMPLATES: Readonly<Record<string, readonly TemplateId[]>> = {
  festa: ["party", "newYear", "carnival"],
  "festa-junina": ["arraia", "tokenJunina", "kids"],
  formatura: ["graduation", "wedding", "party"],
  "show-de-banda": ["show", "party", "carnival"],
  "festa-de-escola": ["kids", "arraia", "theater"],
  "evento-de-igreja": ["church", "charity", "talk"],
  "jantar-beneficente": ["charity", "wedding", "classic"],
  "teatro-e-danca": ["theater", "cinema", "classic"],
  baile: ["wedding", "party", "carnival"],
  campeonato: ["sports", "classic", "party"],
  "palestra-e-curso": ["talk", "classic", "church"],
  carnaval: ["carnival", "party", "kids"],
  reveillon: ["newYear", "party", "wedding"],
};

export function templateSeoBySlug(slug: string): TemplateSeoPage | undefined {
  return templateSeoPages.find((page) => page.slug === slug);
}

export function templateSeoById(id: TemplateId): TemplateSeoPage | undefined {
  return templateSeoPages.find((page) => page.id === id);
}

/** Public address of a template's picture (public/modelos). */
export function templateImagePath(page: Pick<TemplateSeoPage, "slug">): string {
  return `/modelos/${page.slug}.jpg`;
}

/** The event page a template belongs to, if any (its first listing in EVENT_TEMPLATES). */
export function eventSlugForTemplate(id: TemplateId): string | undefined {
  return Object.entries(EVENT_TEMPLATES).find(([, ids]) => ids[0] === id)?.[0];
}
