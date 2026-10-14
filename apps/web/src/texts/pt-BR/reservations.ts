// Deadlines of reservations, in the event's time (ADR 0072).
export const reservations = {
  today: (time: string) => `hoje, ${time}`,
  tomorrow: (time: string) => `amanhã, ${time}`,
  onDay: (weekday: string, day: string, time: string) => `${weekday}, ${day}, ${time}`,
  weekdays: ["seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."],
  expired: "venceu",
  minutesLeft: (minutes: number) => `faltam ${String(minutes)} min`,
  hoursLeft: (hours: number) => (hours === 1 ? "falta 1 h" : `faltam ${String(hours)} h`),
  daysLeft: (days: number) => (days === 1 ? "falta 1 dia" : `faltam ${String(days)} dias`),
  reminder: ({ holder, seller, eventName, numbers, plural, deadline }: { holder: string; seller: string; eventName: string; numbers: string; plural: boolean; deadline: string }) =>
    `Oi, ${holder}! Aqui é ${seller}. Separei ${plural ? `os números ${numbers}` : `o número ${numbers}`} do *${eventName}* para você até ${deadline}. Consegue me passar o pagamento até lá? Depois disso ${plural ? "eles voltam" : "ele volta"} para a venda.`,
} as const;
