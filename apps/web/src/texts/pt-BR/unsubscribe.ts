export const unsubscribe = {
  metaTitle: "Parar de receber comunicados · Ingresso Impresso",
  metaDescription:
    "Escolha se quer receber os comunicados do Ingresso Impresso por e-mail.",
  working: "Um momento…",
  doneTitle: "Você não vai mais receber comunicados",
  doneBody: (email: string) =>
    `O endereço ${email} saiu da lista de comunicados. Códigos de acesso, pagamentos e convites continuam chegando, porque fazem parte do uso da conta.`,
  undo: "Quero voltar a receber",
  backTitle: "Comunicados ligados de novo",
  backBody: (email: string) =>
    `O endereço ${email} volta a receber os comunicados do Ingresso Impresso.`,
  stopAgain: "Parar de receber",
  invalidTitle: "Link inválido",
  invalidBody:
    "Este link está incompleto ou não é nosso. Abra de novo pelo e-mail, ou mude a preferência em Minha conta.",
  account: "Ir para Minha conta",
  home: "Ir para o site",
};
