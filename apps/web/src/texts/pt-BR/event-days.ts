// Events of several days (ADR 0091): how a day and a category's days are named everywhere (panel,
// door, digital ticket, /conferir).
export const eventDays = {
  weekdays: ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"],
  /** "sábado 21/11". */
  day: (weekday: string, date: string) => `${weekday} ${date}`,
  /** "Dia 1 de 2". */
  position: (position: number, total: number) => `Dia ${String(position)} de ${String(total)}`,
  /** "a, b e c". */
  list: (items: readonly string[]) =>
    items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items.at(-1) ?? ""}`,
  rules: {
    every: "Todos os dias",
    days: "Só em alguns dias",
    any_one: "Um dia, à escolha",
  },
  ruleHints: {
    every: "Entra uma vez por dia, em todos os dias do evento. Ex.: passe de 2 dias.",
    days: "Entra uma vez em cada dia escolhido. Nos outros dias, a portaria mostra “NÃO VALE HOJE”.",
    any_one: "Entra uma vez só, no dia em que a pessoa vier. Ex.: “1 dia”, sem dia marcado.",
  },
  /** On the digital ticket and /conferir. */
  validity: {
    every: (days: string) => `Vale em todos os dias (${days}), uma entrada por dia.`,
    days: (days: string, count: number) => (count === 1 ? `Vale só ${days}.` : `Vale ${days}, uma entrada por dia.`),
    any_one: (days: string) => `Vale um dia, à escolha (${days}): uma entrada só.`,
  },
  /** "no sábado 21/11". */
  onDay: (day: string) => `no ${day}`,
  onDayFeminine: (day: string) => `na ${day}`,
  /** Short form on cards: "Sáb e dom", "Só dom". */
  short: {
    every: "Todos os dias",
    any_one: "1 dia, à escolha",
    days: (days: string) => `Só ${days}`,
  },
} as const;
