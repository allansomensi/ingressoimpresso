export const maintenance = {
  modes: { off: "desligado", read_only: "somente leitura", full: "total" },
  readOnlyBanner: "Estamos em manutenção rápida: dá para ver tudo, mas alterações ficam pausadas por alguns minutos.",
  adminBanner: (mode: string) => `Manutenção ligada (${mode}). Organizadores estão vendo o aviso; você continua com acesso total.`,
  manage: "Gerenciar",
  expected: (date: string) => `Previsão de volta: ${date}.`,
  screenTitle: "Voltamos em instantes",
  screenBody:
    "O painel está em manutenção para ficar ainda melhor. Seus eventos, lotes e arquivos estão guardados com segurança.",
  doorWorks: "A portaria continua funcionando normalmente, inclusive sem internet.",
  statusLink: "Acompanhar o status",
  signInNotice: "Estamos em manutenção. Só quem já tem conta consegue entrar agora.",
  signInClosed: "Estamos em manutenção. Tente entrar de novo em alguns minutos.",
  registrationsClosed: "Novos cadastros estão pausados no momento. Se você já tem conta, é só entrar.",
} as const;
