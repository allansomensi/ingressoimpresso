export const eventPages = {
  breadcrumb: "Trilha de navegação",
  home: "Início",
  eyebrow: (label: string) => `Ingresso para ${label.toLowerCase()}`,
  secondaryCta: "Ver preços",
  painsTitle: "Isso acontece no seu evento?",
  painsLead: "Quem vende ingresso na mão conhece bem estes problemas.",
  benefitsTitle: "Como o Ingresso Impresso resolve",
  benefitsLead: "Ingresso numerado, QR à prova de cópia e portaria no celular, do jeito que o seu evento já funciona.",
  templatesTitle: (label: string) => `Modelos para ${label.toLowerCase()}`,
  templatesLead: "Comece por um modelo pronto: o nome, a data e o local entram sozinhos, e tudo pode ser editado.",
  otherEvents: "Outros tipos de evento",
  stepsTitle: (label: string) => `Como funciona para ${label.toLowerCase()}`,
  stepsLead: "Do ingresso à porta, em quatro passos.",
  // The hub of every kind of event (/ingresso-para).
  hubBreadcrumb: "Tipos de evento",
  hubMetaTitle: "Ingresso para todo tipo de evento, numerado e com QR code",
  hubMetaDescription:
    "Ingressos numerados com QR code para festa, show, formatura, festa junina, igreja, teatro, campeonato e mais. Escolha o seu evento e veja como fica.",
  hubEyebrow: "Tipos de evento",
  hubTitle: "Ingresso para cada tipo de evento",
  hubLead: "Cada evento vende e confere ingresso de um jeito. Escolha o seu e veja os modelos, o passo a passo e as dúvidas mais comuns.",
  hubSee: (label: string) => `Ingresso para ${label.toLowerCase()}`,
} as const;
