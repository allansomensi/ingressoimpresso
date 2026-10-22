// The welcome tour of the panel (ADR 0116).
export const tour = {
  label: "Tour do painel",
  progress: (step: number, total: number) => `${String(step)} de ${String(total)}`,
  next: "Próximo",
  back: "Voltar",
  skip: "Pular tour",
  close: "Fechar o tour",
  welcome: {
    eyebrow: "Boas-vindas",
    title: "Seu primeiro evento sai em poucos minutos",
    body: "Ingressos impressos e numerados, cada um com um QR único, conferidos na porta pelo celular, mesmo sem internet. Veja em um minuto onde fica cada coisa.",
    free: (count: number) =>
      count === 1 ? "Você tem 1 ingresso grátis para começar." : `Você tem ${count.toLocaleString("pt-BR")} ingressos grátis para começar.`,
    how: "Como funciona",
    steps: [
      { title: "Crie o evento", body: "Nome, data e local." },
      { title: "Monte o ingresso", body: "Escolha um modelo e ponha a sua arte." },
      { title: "Gere e distribua", body: "Imprima em casa ou na gráfica, ou mande pelo WhatsApp." },
      { title: "Confira na porta", body: "Qualquer celular lê o QR, até sem internet." },
    ],
    start: "Começar o tour",
    later: "Agora não",
  },
  newEvent: {
    title: "Tudo começa por um evento",
    body: "Toque aqui para criar o seu: nome, data e local. Dentro dele ficam o ingresso, os vendedores, a portaria e o relatório.",
  },
  results: {
    title: "Resultados",
    body: "Quanto você vendeu, gastou e recebeu, somando todos os seus eventos.",
  },
  inbox: {
    title: "Avisos e novidades",
    body: "O sininho junta o que precisa da sua atenção, como um lote pago ou um arquivo pronto, e as novidades da plataforma.",
  },
  account: {
    title: "Sua conta e sua organização",
    body: "Em Minha organização ficam o logo, as cores e a chave Pix, que entram nos ingressos. Em Minha conta, a segurança e os ingressos grátis.",
  },
  done: {
    title: "Pronto para o primeiro evento?",
    body: "Crie o evento e siga o card O que falta: ele mostra o próximo passo até a portaria.",
    create: "Criar meu primeiro evento",
    explore: "Explorar sozinho",
  },
  replay: {
    title: "Tour do painel",
    hint: "Reveja onde fica cada coisa no painel.",
    action: "Ver o tour de novo",
  },
};
