/** The private page of a certificate of participation (ADR 0113). */
export const certificate = {
  metaTitle: "Certificado de participação · Ingresso Impresso",
  metaDescription: "Abra, confira e baixe o seu certificado de participação.",
  loading: "Abrindo o certificado…",
  validBadge: "Certificado válido",
  validHint: "Emitido pelo Ingresso Impresso a pedido da organização do evento.",
  awardedTo: "Concedido a",
  event: "Evento",
  when: "Quando",
  where: "Onde",
  organizer: "Organização",
  workload: "Carga horária",
  code: "Código",
  download: "Baixar o certificado (PDF)",
  downloading: "Gerando o PDF…",
  file: (name: string) => `certificado-${name}.pdf`,
  invalidTitle: "Este link não abre um certificado",
  invalidBody:
    "Ele foi digitado errado, está incompleto ou a organização apagou o certificado. Peça o link de novo a quem organizou o evento.",
  downloadFailed: "Não deu para gerar o PDF agora. Tente de novo em instantes.",
} as const;
