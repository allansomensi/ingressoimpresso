export const inbox = {
  open: "Avisos e novidades",
  unread: (count: number) => (count === 1 ? "1 não lido" : `${String(count)} não lidos`),
  unreadDot: "Não lido",
  tabs: { alerts: "Avisos", news: "Novidades" },
  emptyAlerts: "Tudo em dia. Nenhum aviso por aqui.",
  gotIt: "Entendi",
  levels: { info: "Aviso", success: "Novidade", warning: "Atenção", critical: "Importante" },
  kinds: {
    artRejected: "Imagem recusada",
    artRejectedBody: (event: string, note: string) =>
      `A arte enviada em "${event}" não segue os Termos de Uso e não pode ser impressa.${note === "" ? "" : ` Motivo: ${note}.`} Envie outra imagem no editor do ingresso.`,
    artApproved: "Imagem liberada",
    artApprovedBody: (event: string) => `A arte de "${event}" foi revisada pela equipe e já pode ser impressa.`,
    credits: "Crédito na conta",
    creditsBody: (amount: string, note: string) =>
      `${amount} de crédito para os seus próximos lotes.${note === "" ? "" : ` ${note}.`} É usado sozinho na hora de criar o lote.`,
    freeTickets: "Ingressos grátis",
    freeTicketsBody: (tickets: number) => `${tickets.toLocaleString("pt-BR")} ingressos grátis entraram na sua conta.`,
    discount: "Desconto guardado",
    discountBody: (percent: number) => `${String(percent)}% de desconto no seu próximo lote.`,
    prices: "Preços atualizados",
    pricesBody: "Os preços dos lotes mudaram. Veja a tabela em Minha conta.",
    teamAdded: "Você está numa equipe",
    teamAddedBody: (by: string, event: string, areas: string) => `${by} chamou você para "${event}". Você cuida de: ${areas}.`,
    logoRejected: "Logo recusado",
    logoRejectedBody: (note: string) =>
      `O logo da organização não segue os Termos de Uso e não aparece nas páginas.${note === "" ? "" : ` Motivo: ${note}.`} Envie outra imagem em Minha conta.`,
    logoApproved: "Logo liberado",
    logoApprovedBody: "O logo da organização foi revisado pela equipe e já aparece no ingresso no celular e na página dos vendedores.",
    eventPostponed: "Evento adiado",
    eventPostponedBody: (by: string, event: string, when: string) =>
      `${by === "" ? "A organização" : by} adiou "${event}" para ${when}.`,
    eventCanceled: "Evento cancelado",
    eventCanceledBody: (by: string, event: string, reason: string) =>
      `${by === "" ? "A organização" : by} cancelou "${event}".${reason === "" ? "" : ` Motivo: ${reason}.`}`,
    referralReferrer: "Sua indicação rendeu crédito",
    referralReferrerBody: (amount: string, who: string) =>
      `${who === "" ? "Quem você indicou" : who} pagou o primeiro lote: ${amount} de crédito para os seus próximos lotes.`,
    referralReferred: "Crédito de boas-vindas",
    referralReferredBody: (amount: string, by: string) =>
      `Você chegou por indicação${by === "" ? "" : ` de ${by}`} e pagou o primeiro lote: ${amount} de crédito para os próximos.`,
    capacityNear: "O local está quase lotado",
    capacityNearBody: (event: string, occupied: number, capacity: number) =>
      `${event}: ${occupied.toLocaleString("pt-BR")} pessoas dentro, faltam ${Math.max(0, capacity - occupied).toLocaleString("pt-BR")} para lotar.`,
    capacityFull: "O local lotou",
    capacityFullBody: (event: string, occupied: number, capacity: number) =>
      `${event}: ${occupied.toLocaleString("pt-BR")} pessoas dentro, para uma lotação de ${capacity.toLocaleString("pt-BR")}.`,
  },
} as const;
