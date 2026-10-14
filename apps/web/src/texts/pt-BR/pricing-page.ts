// The pricing page (/precos, ADR 0081). The simulator and the table come from landing.ts.
export const pricingPage = {
  metaTitle: "Preços do Ingresso Impresso: centavos por ingresso",
  metaDescription:
    "Quanto custa fazer ingressos com QR code: 30 grátis, depois de R$ 0,15 a R$ 0,05 por ingresso, pago por lote. Sem mensalidade e sem taxa sobre a venda.",
  breadcrumb: "Preços",
  eyebrow: "Preços",
  headline: "Centavos por ingresso. Sem mensalidade e sem taxa sobre a venda.",
  lead: "Você paga por lote de ingressos gerados, só quando precisa, e o preço de cada ingresso cai conforme a quantidade. O dinheiro dos ingressos que você vende fica com você.",
  howTitle: "Como a cobrança funciona",
  how: [
    {
      title: "Por lote, só quando precisa",
      body: "Escolha quantos ingressos quer gerar. O lote é pago uma vez, com Pix ou cartão, e liberado assim que o pagamento é confirmado.",
    },
    {
      title: "Quanto mais, mais barato",
      body: "Dentro de cada lote, o preço por ingresso cai em faixas: os primeiros custam mais, os seguintes cada vez menos.",
    },
    {
      title: "Grátis para começar",
      body: "Toda conta nova ganha ingressos grátis, descontados do primeiro lote. Dá para testar com um evento de verdade.",
    },
    {
      title: "Sem porcentagem da venda",
      body: "Você vende do seu jeito, em dinheiro ou Pix, e recebe direto. A plataforma não fica com parte do valor do ingresso.",
    },
  ],
  compareTitle: "Preço por ingresso ou taxa por venda?",
  compareBody:
    "Plataformas de venda on-line costumam ficar com uma porcentagem de cada ingresso. Em um evento de 200 ingressos a R$ 30, uma taxa de 10% custa R$ 600. Aqui, os mesmos 200 ingressos custam menos de R$ 30 pela tabela atual, e os primeiros 30 da conta são grátis.",
  compareLink: "Como vender ingresso sem taxa sobre a venda",
  includedTitle: "Tudo incluído em todo lote",
  faqTitle: "Dúvidas sobre preços e pagamento",
  faq: [
    {
      question: "Tem mensalidade ou plano?",
      answer: "Não. Você paga só quando gera um lote novo. Sem lote, sem cobrança.",
    },
    {
      question: "O Ingresso Impresso fica com parte do valor dos ingressos?",
      answer: "Não. O dinheiro da venda não passa pela plataforma: você e os seus vendedores recebem direto. Você paga só pelos ingressos gerados.",
    },
    {
      question: "Como funcionam os ingressos grátis?",
      answer: "Toda conta nova ganha ingressos grátis, descontados automaticamente dos primeiros lotes. O simulador mostra o valor com e sem eles.",
    },
    {
      question: "Quais formas de pagamento são aceitas?",
      answer: "Pix e cartão, pela Stripe. O lote é liberado assim que o pagamento é confirmado, em geral em segundos.",
    },
    {
      question: "Pagar para imprimir de novo?",
      answer: "Não. Arquivos e reimpressões dos ingressos já pagos são ilimitados, e a portaria aceita quantos celulares você quiser.",
    },
    {
      question: "E se eu me arrepender da compra?",
      answer: "Você tem 7 dias depois do pagamento para pedir o reembolso integral do lote. Os números reembolsados ficam bloqueados na porta.",
    },
    {
      question: "Existe um valor mínimo?",
      answer: "Existe um valor mínimo por lote, mostrado na tabela de preços. Lotes pequenos pagam esse mínimo.",
    },
  ],
  finalTitle: "Teste com ingressos grátis, sem cartão",
} as const;
