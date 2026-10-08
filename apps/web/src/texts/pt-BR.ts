/**
 * Every user-facing text of the web app, in Brazilian Portuguese.
 *
 * Components never hard-code UI strings: they read them from here. There is no i18n framework on
 * purpose (national market only); centralizing keeps a future translation a mechanical change.
 */
export const texts = {
  meta: {
    title: "Ingresso Impresso",
    description:
      "Ingressos impressos, numerados e com QR code à prova de cópia, com check-in na porta pelo celular, mesmo sem internet.",
  },
  landing: {
    headline: "Ingressos impressos com QR code que não dá para copiar",
    lead: "Para bandas, festas de escola, igrejas e pequenos produtores que vendem ingresso na mão.",
    features: [
      "Arquivos prontos para imprimir em casa ou na gráfica",
      "Blocos numerados por vendedor e relatório de vendas",
      "Check-in pelo celular, funcionando sem internet",
    ],
    comingSoon: "Em breve.",
  },
} as const;
