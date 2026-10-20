export const account = {
  emails: {
    title: "E-mails",
    hint: "Códigos de acesso, pagamentos e convites chegam sempre. O resto você escolhe.",
    announcements: "Comunicados do Ingresso Impresso",
    announcementsHint:
      "Novidades, mudanças de preço e avisos importantes da plataforma, de vez em quando.",
    on: "Você vai receber os comunicados por e-mail.",
    off: "Pronto, você não recebe mais comunicados por e-mail.",
  },
  title: "Minha conta",
  subtitle: "Sua organização, os ingressos grátis e quanto custa cada lote.",
  organization: "Organização",
  organizationHint:
    "Como a sua banda, escola ou igreja aparece no Ingresso Impresso.",
  organizationName: "Nome da organização",
  saved: "Nome atualizado.",
  usage: "Uso",
  events: "Eventos",
  paidTickets: "Ingressos emitidos",
  free: "Ingressos grátis",
  freeLeft: (left: number) =>
    left === 1
      ? "1 ingresso grátis disponível"
      : `${left.toLocaleString("pt-BR")} ingressos grátis disponíveis`,
  freeOf: (used: number, total: number) =>
    `${used.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} usados`,
  freeHint: "Saem automaticamente dos seus próximos lotes, em qualquer evento.",
  // Price tiers and examples, shown in the admin's price tables.
  tier: (from: number, to: number) =>
    `Do ${from.toLocaleString("pt-BR")}º ao ${to.toLocaleString("pt-BR")}º ingresso`,
  perTicket: (amount: string) => `${amount} cada`,
  example: (quantity: number) =>
    `${quantity.toLocaleString("pt-BR")} ingressos`,
  suspendedTitle: "Conta suspensa",
  suspendedBody: (reason: string) =>
    `Sua conta pode ver tudo, mas não pode criar lotes, gerar arquivos nem enviar ingressos.${reason === "" ? "" : ` Motivo: ${reason}.`} Fale com o suporte para reativar.`,
  privacy: "Seus dados",
  privacyHint:
    "Você controla seus dados: baixe uma cópia ou exclua a conta quando quiser.",
  termsAccepted: (date: string) =>
    `Termos de Uso e Política de Privacidade aceitos em ${date}.`,
  readTerms: "Termos de Uso",
  readPrivacy: "Política de Privacidade",
  export: "Baixar meus dados",
  exportHint:
    "Um arquivo JSON com a conta, os eventos, os lotes, os vendedores e os pagamentos.",
  exportFile: "ingresso-impresso-meus-dados.json",
  exported: "Download iniciado.",
  delete: "Excluir minha conta",
  deleteHint: "Apaga a conta e os dados dos eventos. Não dá para desfazer.",
  deleteTitle: "Excluir sua conta?",
  deleteBody:
    "Vamos apagar a organização, os eventos, as artes, os vendedores, os ingressos digitais e os dados da portaria. Lotes pagos ficam guardados, sem nada que identifique você, porque a lei exige guardar registros de pagamento por 5 anos. Os celulares da portaria são desconectados na hora.",
  deleteConfirmLabel: (email: string) => `Para confirmar, digite ${email}`,
  deleteTwoFactorLabel: "Código do app autenticador (ou de recuperação)",
  deleteConfirm: "Excluir conta",
  deleted: "Conta excluída. Obrigado por ter usado o Ingresso Impresso.",
} as const;
