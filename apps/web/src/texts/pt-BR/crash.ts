export const crash = {
  title: "Algo deu errado nesta página",
  body: "Tente de novo. Se o problema continuar, recarregue a página ou volte mais tarde.",
  reference: (digest: string) => `Referência para o suporte: ${digest}`,
} as const;
