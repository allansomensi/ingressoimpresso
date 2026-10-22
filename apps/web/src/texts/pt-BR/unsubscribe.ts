export const unsubscribe = {
  metaTitle: "Parar de receber e-mails · Ingresso Impresso",
  metaDescription:
    "Escolha se quer receber os comunicados e os lembretes do Ingresso Impresso por e-mail.",
  working: "Um momento…",
  // What the link stopped: the announcements (ADR 0107) or the reminders (ADR 0118).
  announcements: {
    doneTitle: "Você não vai mais receber comunicados",
    doneBody: (email: string) =>
      `O endereço ${email} saiu da lista de comunicados. Códigos de acesso, pagamentos e convites continuam chegando, porque fazem parte do uso da conta.`,
    backTitle: "Comunicados ligados de novo",
    backBody: (email: string) => `O endereço ${email} volta a receber os comunicados do Ingresso Impresso.`,
  },
  reminders: {
    doneTitle: "Você não vai mais receber lembretes",
    doneBody: (email: string) =>
      `O endereço ${email} não recebe mais lembretes e dicas sobre os seus eventos. Códigos de acesso, pagamentos e convites continuam chegando, porque fazem parte do uso da conta.`,
    backTitle: "Lembretes ligados de novo",
    backBody: (email: string) => `O endereço ${email} volta a receber lembretes e dicas sobre os seus eventos.`,
  },
  undo: "Quero voltar a receber",
  stopAgain: "Parar de receber",
  invalidTitle: "Link inválido",
  invalidBody:
    "Este link está incompleto ou não é nosso. Abra de novo pelo e-mail, ou mude a preferência em Minha conta.",
  account: "Ir para Minha conta",
  home: "Ir para o site",
};
