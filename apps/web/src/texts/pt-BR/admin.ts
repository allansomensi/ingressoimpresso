export const admin = {
  title: "Administração",
  subtitle:
    "Clientes, vendas, comunicação e a saúde da plataforma num só lugar.",
  nav: "Admin",
  openPanel: "Painel de administração",
  forbiddenTitle: "Área restrita",
  forbidden: "Só administradores veem esta página.",
  sections: "Seções da administração",
  moderationPending: (count: number) =>
    count === 1
      ? "1 imagem para revisar"
      : `${String(count)} imagens para revisar`,
  groups: {
    overview: "Resumo",
    customers: "Clientes",
    sales: "Vendas",
    communication: "Comunicação",
    safety: "Segurança",
    platform: "Plataforma",
  },
  tabs: {
    overview: "Visão geral",
    alerts: "Alertas",
    disputes: "Contestações",
    live: "Acontecendo agora",
    funnel: "Funil",
    finance: "Financeiro",
    reports: "Relatórios",
    organizations: "Organizações",
    events: "Eventos",
    batches: "Lotes",
    prices: "Preços",
    promotions: "Promoções",
    codes: "Cupons",
    referrals: "Indicações",
    announcements: "Pronunciamentos",
    changelog: "Novidades",
    emails: "E-mails",
    moderation: "Moderação",
    audit: "Auditoria",
    settings: "Configurações",
    status: "Status e incidentes",
  },
  // Alerts that reach the admins and the daily summary (ADR 0103).
  alerts: {
    title: "Alertas",
    description:
      "Problemas que pedem atenção: webhook da Stripe, arquivos que falharam, cota de e-mails, eventos grandes sem portaria, erros da API e contestações. Cada alerta chega por e-mail e no Telegram quando abre.",
    open: (count: number) =>
      count === 1
        ? "1 alerta aberto"
        : `${count.toLocaleString("pt-BR")} alertas abertos`,
    showResolved: "Mostrar os resolvidos (30 dias)",
    emptyTitle: "Nenhum alerta aberto",
    empty:
      "Tudo calmo por aqui. Quando algo der errado, ele aparece aqui e chega até você.",
    severity: { critical: "Urgente", warning: "Atenção" },
    kinds: {
      stripe_webhook: "Stripe",
      export_failed: "Arquivos",
      mail_quota: "E-mails",
      door_missing: "Portaria",
      api_errors: "API",
      dispute: "Contestação",
    },
    times: (count: number) =>
      count === 1 ? "1 vez" : `${count.toLocaleString("pt-BR")} vezes`,
    since: (first: string, last: string) =>
      first === last ? `em ${first}` : `de ${first} a ${last}`,
    notified: "Avisado",
    notNotified: "Ainda não avisado",
    resolvedBy: (who: string | null, when: string) =>
      who === null ? `Resolvido em ${when}` : `Resolvido por ${who} em ${when}`,
    look: "Ver",
    resolve: "Resolver",
    resolvedToast: "Alerta resolvido. Se acontecer de novo, abre outro.",
    test: "Enviar teste",
    testSent: (emails: number, telegram: boolean) =>
      [
        emails > 0
          ? emails === 1
            ? "1 e-mail"
            : `${String(emails)} e-mails`
          : "",
        telegram ? "Telegram" : "",
      ]
        .filter((part) => part !== "")
        .join(" e ") || "nada (canais desligados)",
    testToast: (what: string) => `Teste enviado: ${what}.`,
    summaryNow: "Enviar resumo agora",
    summaryToast: (what: string) => `Resumo enviado: ${what}.`,
    settingsTitle: "Como avisar",
    settingsDescription:
      "Os canais e o resumo por e-mail. Os alertas abertos aparecem aqui de qualquer jeito.",
    email: "Por e-mail",
    emailTo: (emails: string) => `Para ${emails} (ADMIN_EMAILS).`,
    telegram: "No Telegram",
    telegramOn: "O bot manda cada alerta no chat configurado.",
    telegramOff:
      "Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no Render para ligar.",
    summary: "Resumo por e-mail",
    summaryHint:
      "Cadastros, lotes pagos, receita, e-mails, os maiores eventos que vêm aí e os alertas abertos, para ADMIN_EMAILS.",
    summaryFrequency: "Frequência",
    frequencies: { weekly: "Toda semana (últimos 7 dias)", daily: "Todo dia (últimas 24 horas)" },
    summaryWeekday: "Dia da semana",
    weekdays: ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"],
    summaryTelegram: "Também no Telegram",
    summaryTelegramHint: "Além do e-mail, o bot manda o resumo no chat configurado.",
    summaryHour: "Horário do resumo (Brasília)",
    hour: (hour: number) => `${String(hour).padStart(2, "0")}:00`,
    doorThreshold: "Evento sem portaria",
    doorThresholdHint:
      "Avisa quando um evento com pelo menos este número de ingressos pagos começa nas próximas 2 horas sem link da portaria.",
    tickets: "ingressos",
    save: "Salvar",
    saved: "Configuração dos alertas salva.",
  },
  // Disputed card payments (ADR 0104).
  reports: {
    closingTitle: "Fechamento do mês",
    closingHint:
      "O dinheiro do mês para a contabilidade, no horário de Brasília. Cada valor conta na data em que entrou ou saiu: um reembolso de outubro de um lote pago em setembro entra em outubro.",
    month: "Mês",
    xlsx: "Planilha (XLSX)",
    csv: "CSV",
    xlsxFile: (month: string) => `fechamento-${month}.xlsx`,
    csvFile: (month: string) => `fechamento-${month}.csv`,
    gross: "Recebido",
    refunds: "Devolvido",
    net: "Receita líquida",
    batches: "Lotes pagos",
    stripe: (value: string) => `${value} pela Stripe`,
    manual: (value: string) => `${value} marcado pelo admin`,
    refundHint: "Reembolsos e estornos",
    ticketsHint: (tickets: number, free: number) =>
      `${tickets.toLocaleString("pt-BR")} ingressos, ${free.toLocaleString("pt-BR")} grátis`,
    breakdown: "De onde veio",
    list: "Preço de tabela dos lotes",
    discounts: "Descontos (promoções e cupons)",
    creditUsed: "Pago com crédito",
    creditIssued: "Crédito concedido no mês",
    creditBalance: "Crédito em aberto no fim do mês",
    creditBalanceHint: "Ainda devido em ingressos às organizações.",
    disputesLost: "Contestações perdidas",
    methods: "Formas de pagamento",
    methodNames: {
      stripe: "Stripe",
      admin: "Marcado pelo admin",
      credit: "Crédito",
      free: "Grátis",
    } as Record<string, string>,
    methodLine: (batches: number) =>
      batches === 1 ? "1 lote" : `${batches.toLocaleString("pt-BR")} lotes`,
    organizations: "Por organização",
    noMovement: "Nenhum dinheiro entrou ou saiu neste mês.",
    lines: (count: number) =>
      count === 1
        ? "1 lançamento"
        : `${count.toLocaleString("pt-BR")} lançamentos`,
    cohortsTitle: "Coortes por mês de cadastro",
    cohortsHint:
      "Organizações criadas em cada mês, quantas pagaram e a receita líquida que trouxeram mês a mês desde o cadastro (M0 é o mês do cadastro).",
    cohort: "Cadastro",
    signups: "Contas",
    activated: "Ativas",
    activatedHint: "Com algum lote liberado, grátis ou pago",
    paying: "Pagantes",
    revenue: "Receita",
    conversion: (paying: number, signups: number) =>
      signups === 0 ? "—" : `${Math.round((paying / signups) * 100)}%`,
    couponsTitle: "Retorno de cupons e promoções",
    couponsHint:
      "O que cada código e cada promoção deu e o que as organizações que usaram pagaram depois (numa promoção, nos próprios lotes com desconto).",
    coupon: "Código ou promoção",
    used: "Usaram",
    payingAfter: "Pagaram depois",
    cost: "Custo",
    costHint: (credit: string, discount: string, free: number) =>
      [
        credit !== "" ? `${credit} de crédito` : "",
        discount !== "" ? `${discount} de desconto` : "",
        free > 0 ? `${free.toLocaleString("pt-BR")} ingressos grátis` : "",
      ]
        .filter((part) => part !== "")
        .join(" · "),
    revenueAfter: "Receita depois",
    kinds: {
      credit: "Crédito",
      free_tickets: "Ingressos grátis",
      discount: "Desconto",
      promotion: "Promoção",
    } as Record<string, string>,
    noCoupons: "Nenhum cupom ou promoção criado ainda.",
  },
  disputes: {
    title: "Contestações de pagamento",
    description:
      "Quando um comprador contesta o pagamento com cartão na operadora (chargeback). Responda com as provas no painel da Stripe até o prazo; aqui você decide o que acontece com os números do lote.",
    open: (count: number) =>
      count === 1
        ? "1 contestação aberta"
        : `${count.toLocaleString("pt-BR")} contestações abertas`,
    emptyTitle: "Nenhuma contestação",
    empty:
      "Quando um pagamento por cartão for contestado, ele aparece aqui e você recebe um alerta.",
    statuses: {
      warning_needs_response: "Consulta: precisa de resposta",
      needs_response: "Precisa de resposta",
      warning_under_review: "Consulta em análise",
      under_review: "Em análise",
      won: "Ganha",
      lost: "Perdida",
      warning_closed: "Consulta encerrada",
      charge_refunded: "Encerrada com reembolso",
      prevented: "Evitada",
    } as Record<string, string>,
    reasons: {
      fraudulent: "Fraude (o titular não reconhece)",
      product_not_received: "Produto não recebido",
      duplicate: "Cobrança duplicada",
      subscription_canceled: "Assinatura cancelada",
      product_unacceptable: "Produto não aceitável",
      credit_not_processed: "Crédito não processado",
      unrecognized: "Cobrança não reconhecida",
      general: "Geral",
    } as Record<string, string>,
    numbers: (first: number, last: number) =>
      `Números ${String(first)} a ${String(last)}`,
    due: (when: string) => `Provas até ${when}`,
    openedAt: (when: string) => `Aberta em ${when}`,
    closedAt: (when: string) => `Encerrada em ${when}`,
    blocked: "Números bloqueados na portaria",
    settled: "Lote estornado",
    noBatch: "Pagamento não encontrado aqui",
    stripe: "Abrir na Stripe",
    event: "Abrir evento",
    block: "Bloquear números",
    blockTitle: "Bloquear os números deste lote?",
    blockBody:
      "Os ingressos deste lote deixam de abrir a portaria enquanto a contestação durar. Dá para desbloquear depois.",
    blockedToast: "Números bloqueados na portaria.",
    unblock: "Desbloquear",
    unblockedToast: "Números liberados de novo.",
    settle: "Estornar lote",
    settleTitle: "Estornar o lote da contestação perdida?",
    settleBody:
      "O lote vira estornado, os números deixam de valer para sempre e o pagamento entra como devolvido no financeiro. Não dá para desfazer.",
    settledToast: "Lote estornado.",
  },
  // The funnel and the events around now (ADR 0099).
  funnel: {
    title: "Funil",
    description:
      "Das organizações criadas no período, quantas chegaram a cada passo. O maior tombo entre dois passos aparece em vermelho.",
    window: "Período",
    days: (days: number) => (days === 365 ? "1 ano" : `${String(days)} dias`),
    all: "Tudo",
    steps: {
      signup: "Criou a conta",
      event: "Criou um evento",
      design: "Montou o ingresso (modelo ou arte própria)",
      batch: "Gerou um lote (grátis ou pago)",
      paid: "Pagou um lote",
      door: "Usou a portaria",
    },
    lost: (count: number, kept: number) =>
      `${count.toLocaleString("pt-BR")} ${count === 1 ? "parou" : "pararam"} aqui · seguiram ${kept.toLocaleString("pt-BR")}%`,
    worst: "onde mais desistem",
    median: (days: number) =>
      days < 1
        ? "Metade chega aqui no mesmo dia"
        : `Metade chega aqui em até ${days.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${days === 1 ? "dia" : "dias"}`,
    emptyTitle: "Ninguém se cadastrou no período",
    empty: "Escolha um período maior.",
    note: "Cada organização conta uma vez por passo, pelo primeiro evento que chegou lá. Pagou um lote: pago pela Stripe ou confirmado por um admin, acima de zero; os grátis ficam no passo anterior.",
  },
  live: {
    title: "Acontecendo agora",
    description:
      "Eventos de 2 horas atrás até as próximas 6 horas. Os que precisam de atenção na portaria vêm primeiro: dá para ligar para o organizador antes que alguém reclame.",
    refresh: "Atualizar",
    troubled: (count: number) =>
      count === 1
        ? "1 evento precisa de atenção"
        : `${count.toLocaleString("pt-BR")} eventos precisam de atenção`,
    allGood: "Nenhum problema na portaria",
    count: (count: number) =>
      count === 1
        ? "1 evento agora"
        : `${count.toLocaleString("pt-BR")} eventos agora`,
    updated: (time: string) => `atualizado às ${time}`,
    emptyTitle: "Nenhum evento agora",
    empty:
      "Os eventos aparecem aqui 6 horas antes de começar e somem 2 horas depois de terminar.",
    states: { live: "Acontecendo", upcoming: "Em breve", ended: "Terminou" },
    entries: (entries: number, paid: number, tokens: boolean) =>
      `${entries.toLocaleString("pt-BR")} de ${paid.toLocaleString("pt-BR")} ${tokens ? "usadas" : "entraram"}`,
    devices: (online: number, total: number) =>
      total === 0
        ? "nenhum celular"
        : `${online.toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")} celulares sincronizando`,
    problems: {
      stale: (device: string, minutes: number) =>
        `${device} não sincroniza há ${minutes >= 120 ? `${String(Math.floor(minutes / 60))} horas` : `${String(minutes)} minutos`}`,
      pending: (device: string, count: number) =>
        `${device} tem ${count.toLocaleString("pt-BR")} leituras para enviar`,
      invalid: (device: string, count: number) =>
        `${device} leu ${count.toLocaleString("pt-BR")} códigos inválidos ou de outro evento na última meia hora`,
      noDevices:
        "Começa em breve, tem ingressos pagos e nenhum celular na portaria",
    },
    open: "Abrir o Ao vivo",
    organization: "Organização",
  },
  revenue: {
    title: "Receita",
    description:
      "Bruta é o que entrou; reembolsos são o que voltou pelo Stripe ou por estorno. A líquida é a diferença.",
    total: "Desde o início",
    last30: "Últimos 30 dias",
    netLabel: "Receita líquida",
    gross: "Bruta",
    refunds: "Reembolsos",
    sync: "Sincronizar com a Stripe",
    synced: (result: {
      checked: number;
      updated: number;
      refundedBatches: number;
      remaining: number;
    }) => {
      const checked =
        result.checked === 1
          ? "1 pagamento conferido"
          : `${result.checked.toLocaleString("pt-BR")} pagamentos conferidos`;
      const updated =
        result.updated === 0
          ? "nenhum reembolso novo"
          : result.updated === 1
            ? "1 com reembolso novo"
            : `${result.updated.toLocaleString("pt-BR")} com reembolso novo`;
      const batches =
        result.refundedBatches === 0
          ? ""
          : result.refundedBatches === 1
            ? ", 1 lote cancelado"
            : `, ${result.refundedBatches.toLocaleString("pt-BR")} lotes cancelados`;
      const remaining =
        result.remaining > 0
          ? `. Faltam ${result.remaining.toLocaleString("pt-BR")}: clique de novo.`
          : ".";
      return `${checked}: ${updated}${batches}${remaining}`;
    },
  },
  stats: {
    revenue: "Receita total",
    paidTickets: "Ingressos emitidos",
    freeLabel: "Ingressos grátis",
    freeHint: "Boas-vindas e cortesias",
    organizations: "Organizações",
    newOrganizations: (count: number) =>
      `+${count.toLocaleString("pt-BR")} em 30 dias`,
    activeAccounts: "Contas ativas",
    activeAccountsHint: "Entraram nos últimos 30 dias",
    events: "Eventos",
    upcoming: (count: number) =>
      `${count.toLocaleString("pt-BR")} por acontecer`,
    awaiting: "Lotes aguardando",
    processing: (count: number) =>
      `${count.toLocaleString("pt-BR")} Pix em confirmação`,
    ticketShare: "Média por ingresso",
  },
  chartTitle: "Últimos 30 dias",
  chartDescription:
    "Receita bruta por dia, antes dos reembolsos (horário de Brasília).",
  chartRevenue: "Receita bruta",
  chartTickets: "Ingressos",
  chartSignups: "Cadastros",
  chartBar: (date: string, value: string) => `${date}: ${value}`,
  search: "Buscar por nome ou e-mail",
  finance: {
    periods: {
      7: "7 dias",
      30: "30 dias",
      90: "90 dias",
      365: "12 meses",
    } as Record<number, string>,
    revenue: "Receita bruta do período",
    growth: (percent: string) => `${percent} vs. período anterior`,
    noPrevious: "Sem período anterior para comparar",
    net: "Líquido",
    netHint: (refunds: string) => `Reembolsos: ${refunds}`,
    batches: "Lotes cobrados",
    batchesHint: (tickets: string) => `${tickets} ingressos cobrados`,
    average: "Média por lote",
    pending: "A receber",
    pendingHint: (count: number) =>
      count === 1
        ? "1 lote aguardando"
        : `${count.toLocaleString("pt-BR")} lotes aguardando`,
    chartTitle: "Receita no período",
    chartDaily: "Lotes pagos por dia (horário de Brasília).",
    chartMonthly: "Lotes pagos por mês (horário de Brasília).",
    methods: "Como os lotes foram pagos",
    methodNames: {
      stripe: "Online (Pix ou cartão)",
      admin: "Marcado pelo admin",
      free: "Grátis e cortesias",
      credit: "Crédito",
    },
    methodLine: (batches: number, tickets: number) =>
      `${batches.toLocaleString("pt-BR")} ${batches === 1 ? "lote" : "lotes"} · ${tickets.toLocaleString("pt-BR")} ingressos`,
    top: "Quem mais comprou",
    topEmpty: "Nenhuma compra paga no período.",
    funnel: "Funil de novas contas",
    funnelHint: "Organizações criadas no período e até onde chegaram.",
    funnelSteps: [
      "Criaram a conta",
      "Criaram um evento",
      "Geraram ingressos",
      "Pagaram um lote",
    ],
    noData: "Sem dados no período.",
  },
  organization: {
    credit: "Crédito",
    creditHint:
      "Some no próximo lote da organização. Use para compensar um problema ou dar um presente.",
    creditSaved: "Crédito atualizado.",
    creditAmount: "Valor (R$)",
    creditAdd: "Adicionar crédito",
    creditRemove: "Retirar crédito",
    creditNote: "Motivo",
    creditNoteHint: "O organizador vê esse texto no aviso.",
    back: "Organizações",
    owner: "Responsável",
    since: (date: string) => `Cliente desde ${date}`,
    suspendedBadge: "Suspensa",
    rename: "Renomear",
    renameTitle: "Renomear organização",
    renamed: "Organização renomeada.",
    suspend: "Suspender",
    suspendTitle: "Suspender esta conta?",
    suspendBody:
      "A conta continua vendo tudo, mas não cria lotes, não paga, não gera arquivos nem envia ingressos. A portaria dos eventos continua funcionando.",
    reason: "Motivo (aparece para o organizador)",
    reasonPlaceholder: "Pagamento contestado",
    suspended: "Conta suspensa.",
    unsuspend: "Reativar",
    unsuspended: "Conta reativada.",
    suspendedSince: (date: string) => `Suspensa desde ${date}`,
    members: "Conta de acesso",
    membersHint: "O e-mail que entra no painel desta organização.",
    lastLogin: (date: string) => `Último acesso ${date}`,
    neverLoggedIn: "Ainda não entrou",
    google: "Google",
    sessions: (count: number) =>
      count === 1
        ? "1 sessão aberta"
        : `${count.toLocaleString("pt-BR")} sessões abertas`,
    endSessions: "Encerrar sessões",
    endSessionsTitle: (email: string) =>
      `Desconectar ${email} de todos os aparelhos?`,
    endSessionsBody:
      "A pessoa precisa entrar de novo em todos os navegadores e celulares.",
    sessionsEnded: "Sessões encerradas.",
    twoFactor: "2 etapas",
    resetTwoFactor: "Desligar 2 etapas",
    resetTwoFactorTitle: (email: string) =>
      `Desligar a verificação em duas etapas de ${email}?`,
    resetTwoFactorBody:
      "Faça isso só para quem perdeu o celular e os códigos de recuperação, depois de confirmar que é mesmo a pessoa (por exemplo, respondendo do e-mail da conta). Ela poderá ligar de novo em Minha conta.",
    twoFactorReset: "Verificação em duas etapas desligada.",
    events: "Eventos",
    noEvents: "Nenhum evento ainda.",
    eventLine: (tickets: number, entries: number) =>
      `${tickets.toLocaleString("pt-BR")} ingressos · ${entries.toLocaleString("pt-BR")} entradas`,
    openEvent: "Abrir em modo suporte",
    profile: "Perfil público",
    history: "Histórico de ações dos admins",
    noHistory: "Nenhuma ação registrada.",
    tags: "Etiquetas",
    tagsHint:
      "Só os admins veem. Use para separar clientes (igreja, VIP, atenção).",
    tagPlaceholder: "Nova etiqueta",
    addTag: "Adicionar",
    removeTag: (tag: string) => `Tirar a etiqueta ${tag}`,
    tagsSaved: "Etiquetas salvas.",
    notes: "Anotações internas",
    notesHint:
      "O que a equipe precisa lembrar sobre esta conta. A organização nunca vê.",
    notePlaceholder: "Ligou pedindo nota fiscal; prefere WhatsApp…",
    addNote: "Anotar",
    noteSaved: "Anotação salva.",
    noteDeleted: "Anotação apagada.",
    noNotes: "Nenhuma anotação ainda.",
    pin: "Fixar no topo",
    unpin: "Soltar",
    pinned: "Fixada",
    editNote: "Editar",
    deleteNote: "Apagar",
    deleteNoteTitle: "Apagar esta anotação?",
    noteBy: (email: string, date: string) => `${email} · ${date}`,
    edited: "editada",
    lastActivity: (date: string) => `Última atividade ${date}`,
    noActivity: "Sem atividade",
    cooling: "Esfriando",
    coolingHint:
      "Pagou lotes, mas ninguém entra nem compra há mais de 60 dias.",
    timeline: "Linha do tempo",
    timelineHint: "Tudo o que aconteceu com a conta, do cadastro até hoje.",
    noTimeline: "Nada registrado ainda.",
    olderTimeline: "Ver mais antigos",
    timelineFilters: {
      all: "Tudo",
      money: "Dinheiro",
      usage: "Uso",
      emails: "E-mails",
      admin: "Admins",
    },
    timelineKinds: {
      signup: "Conta criada",
      member_joined: "Entrou na organização",
      login: "Entrou no painel",
      event_created: "Criou um evento",
      batch_created: "Criou um lote",
      batch_paid: "Lote pago",
      batch_refunded: "Lote estornado",
      dispute: "Pagamento contestado",
      email: "E-mail enviado",
      credit: "Crédito",
      coupon: "Usou um cupom",
      admin: "Ação de admin",
      note: "Anotação",
    } as Record<string, string>,
    paidVia: {
      stripe: "pela Stripe",
      admin: "marcado pelo admin",
      free: "grátis",
      credit: "com crédito",
    } as Record<string, string>,
    creditReasons: {
      promo_code: "cupom",
      admin_adjustment: "ajuste do admin",
      batch_payment: "usado num lote",
      batch_cancel: "lote cancelado",
      batch_refund: "lote estornado",
      referral: "indicação",
      referral_revoked: "indicação cancelada",
    } as Record<string, string>,
    mailStatuses: {
      sending: "enviando",
      sent: "enviado",
      failed: "falhou",
      quota: "sem cota",
      delivered: "entregue",
      delivery_delayed: "atrasado",
      bounced: "devolvido",
      complained: "marcado como spam",
    } as Record<string, string>,
    tickets: (count: number) =>
      count === 1 ? "1 ingresso" : `${count.toLocaleString("pt-BR")} ingressos`,
  },
  support: {
    banner:
      "Modo suporte: este evento é de outra organização. Tudo o que você mudar aqui fica registrado na auditoria.",
    backToAdmin: "Voltar ao admin",
    profileBanner: (name: string) =>
      `Modo suporte: perfil público de ${name}. Tudo o que você mudar aqui fica registrado na auditoria.`,
    backToOrganization: "Voltar à organização",
    logoRemoveTitle: "Tirar o logo do ar?",
    logoRemoveBody:
      "O logo some do ingresso no celular e da página dos vendedores. A organização pode enviar outro.",
    logoReject: "Tirar e recusar",
    logoRejectTitle: "Tirar e recusar este logo?",
    logoRejectBody:
      "O logo some na hora e a imagem fica recusada, como na moderação: a organização não consegue enviá-la de novo. Use para imagens fora dos Termos de Uso.",
    logoRejected: "Logo retirado e recusado.",
  },
  events: {
    intro:
      "Eventos de todas as organizações. Abrir um evento entra em modo suporte, com as telas do organizador.",
    search: "Buscar por evento, organização, e-mail ou código do evento",
    empty: "Nenhum evento encontrado.",
    tickets: (count: number) =>
      count === 1
        ? "1 ingresso pago"
        : `${count.toLocaleString("pt-BR")} ingressos pagos`,
    canceled: "Cancelado",
  },
  audit: {
    intro: "Toda ação de um admin fora da própria conta fica registrada aqui.",
    search: "Buscar por admin, ação, organização ou evento",
    empty: "Nenhuma ação registrada.",
    emptyFiltered: "Nenhuma ação com esses filtros.",
    export: "Baixar CSV",
    csvFile: "auditoria.csv",
    category: "Tipo de ação",
    allCategories: "Todos os tipos",
    categories: {
      batch: "Lotes",
      organization: "Organizações",
      user: "Contas",
      support: "Modo suporte",
      credits: "Crédito",
      price: "Preços",
      promotion: "Promoções",
      promo_code: "Cupons",
      referral: "Indicações",
      announcement: "Pronunciamentos",
      changelog: "Novidades",
      moderation: "Moderação",
      settings: "Configurações",
      incident: "Status",
      email: "E-mails",
    },
    period: "Período",
    periods: {
      all: "Todo o período",
      today: "Hoje",
      "7d": "Últimos 7 dias",
      "30d": "Últimos 30 dias",
      month: "Este mês",
      custom: "Escolher datas",
    },
    from: "De",
    to: "Até",
    clear: "Limpar filtros",
    pagination: "Páginas",
    total: (count: number) =>
      count === 1 ? "1 registro" : `${count.toLocaleString("pt-BR")} registros`,
    previous: "Página anterior",
    next: "Próxima página",
    page: (page: number, pages: number) =>
      `${String(page)} de ${String(pages)}`,
    actions: {
      support_write: "Alterou em modo suporte",
      batch_refund: "Estornou um lote",
      batch_refund_stripe: "Lote reembolsado no Stripe (ingressos cancelados)",
      batch_refunds_sync: "Sincronizou os pagamentos com a Stripe",
      batch_price: "Mudou o preço de um lote",
      batch_mark_paid: "Marcou um lote como pago",
      organization_bonus: "Mudou a cortesia",
      organization_suspend: "Suspendeu a conta",
      organization_unsuspend: "Reativou a conta",
      organization_rename: "Renomeou a organização",
      organization_profile_update: "Editou o perfil público da organização",
      organization_logo_upload: "Enviou o logo da organização",
      organization_logo_remove: "Tirou o logo da organização",
      user_sessions_revoke: "Encerrou as sessões de uma conta",
      user_two_factor_reset:
        "Desligou a verificação em duas etapas de uma conta",
      changelog_create: "Criou uma novidade",
      changelog_update: "Editou uma novidade",
      changelog_delete: "Excluiu uma novidade",
      settings_update: "Mudou as configurações da plataforma",
      announcement_create: "Criou um pronunciamento",
      announcement_update: "Editou um pronunciamento",
      announcement_archive: "Tirou um pronunciamento do ar",
      announcement_delete: "Excluiu um rascunho de pronunciamento",
      price_table_create: "Criou uma tabela de preços",
      price_table_delete: "Retirou uma tabela de preços agendada",
      promotion_create: "Criou uma promoção",
      promotion_update: "Editou uma promoção",
      promotion_delete: "Excluiu uma promoção",
      promo_code_create: "Criou um cupom",
      promo_code_update: "Editou um cupom",
      credits_adjust: "Ajustou o crédito",
      referral_settings_update: "Mudou o Indique e ganhe",
      referral_revoke: "Cancelou uma indicação",
      email_test: "Enviou um e-mail de teste",
      moderation_flag: "Sinalizou uma imagem",
      moderation_approve: "Liberou uma imagem",
      moderation_reject: "Recusou uma imagem",
      incident_create: "Abriu um incidente",
      incident_update: "Editou um incidente",
      incident_post: "Atualizou um incidente",
      incident_delete: "Excluiu um incidente",
      audit_export: "Baixou a auditoria",
      alert_resolve: "Marcou um alerta como resolvido",
      alert_settings: "Mudou os avisos dos alertas",
      dispute_block: "Bloqueou na portaria os números de uma contestação",
      dispute_unblock: "Desbloqueou os números de uma contestação",
      dispute_settle: "Estornou o lote de uma contestação perdida",
      report_export: "Baixou o fechamento do mês",
      announcement_email: "Enviou um pronunciamento por e-mail",
      announcement_email_cancel:
        "Parou o envio de um pronunciamento por e-mail",
      organization_note_create: "Escreveu uma anotação",
      organization_note_update: "Editou uma anotação",
      organization_note_delete: "Apagou uma anotação",
      organization_tags: "Mudou as etiquetas",
    } as Record<string, string>,
  },
  settings: {
    intro:
      "Interruptores da plataforma inteira. Cada mudança fica registrada na auditoria.",
    activeNow:
      "A manutenção está ligada agora. Organizadores estão vendo o aviso.",
    maintenanceTitle: "Modo manutenção",
    maintenanceHint:
      "Para atualizar o sistema sem pegar ninguém no meio de uma alteração. Admins nunca são bloqueados.",
    modes: {
      off: { title: "Desligado", body: "Tudo funcionando normalmente." },
      read_only: {
        title: "Somente leitura",
        body: "Organizadores veem tudo, mas não criam nem alteram nada. Cadastros novos ficam pausados.",
      },
      full: {
        title: "Total",
        body: "Organizadores veem uma tela de manutenção. Só admins entram.",
      },
    },
    message: "Mensagem para os organizadores",
    messageHint:
      "Aparece no aviso e na página de status. Sem mensagem, usamos um texto padrão.",
    messagePlaceholder:
      "Estamos atualizando o sistema. Voltamos em poucos minutos.",
    endsAt: "Previsão de volta",
    endsAtHint: "Só informativo: a manutenção não desliga sozinha.",
    since: (date: string) => `Ligada desde ${date}.`,
    signUpsTitle: "Novas contas",
    signUpsHint:
      "Feche os cadastros durante um problema ou para controlar o crescimento. Quem já tem conta continua entrando.",
    signUps: "Aceitar novas contas",
    signUpsOn:
      "Qualquer pessoa pode criar uma conta pelo código por e-mail ou pelo Google.",
    signUpsOff:
      "Cadastros pausados: o site avisa e só contas existentes entram.",
    domainsTitle: "Domínios de e-mail bloqueados",
    domainsHint:
      "Endereços desses domínios (e subdomínios) não conseguem criar conta. Contas que já existem não são afetadas.",
    domains: "Um domínio por linha",
    domainsCount: (count: number) =>
      count === 1 ? "1 domínio" : `${count.toLocaleString("pt-BR")} domínios`,
    saved: "Configurações salvas.",
    unsaved: "Há alterações não salvas.",
    updatedBy: (email: string, date: string) =>
      `Última alteração por ${email} em ${date}.`,
    noChanges: "Nenhuma alteração ainda.",
    fullConfirmTitle: "Ligar a manutenção total?",
    fullConfirmBody:
      "Organizadores perdem o acesso ao painel até você desligar. A portaria e os ingressos digitais continuam funcionando.",
    fullConfirm: "Ligar manutenção",
  },
  announcements: {
    intro:
      "Avisos para todos os organizadores: só no sininho ou também como janela quando a pessoa abre o painel.",
    new: "Novo pronunciamento",
    edit: "Editar pronunciamento",
    saved: "Pronunciamento salvo.",
    published: "Pronunciamento publicado.",
    removed: "Pronunciamento retirado.",
    saveDraft: "Salvar rascunho",
    publish: "Publicar",
    titleLabel: "Título",
    titlePlaceholder: "Manutenção programada no sábado",
    body: "Texto",
    bodyHint: "Direto ao ponto. Linhas em branco separam parágrafos.",
    bodyPlaceholder: "O que o organizador precisa saber.",
    level: "Tom",
    display: "Onde aparece",
    displays: { notification: "Só no sininho", modal: "Janela ao entrar" },
    displayHints: {
      notification: "Aparece no sininho do painel, com um ponto de não lido.",
      modal:
        "Abre uma janela na próxima vez que a pessoa entrar no painel e fica no sininho depois de fechada.",
    },
    ctaLabel: "Texto do botão",
    ctaLabelPlaceholder: "Ver detalhes",
    ctaUrl: "Link do botão",
    ctaUrlHint: "Um caminho do site (/painel/conta) ou um endereço https://.",
    startsAt: "Começa em",
    startsAtHint: "Vazio: agora.",
    endsAt: "Termina em",
    endsAtHint: "Vazio: até você tirar do ar.",
    preview: "Prévia",
    statuses: {
      draft: "Rascunho",
      scheduled: "Agendado",
      active: "No ar",
      ended: "Encerrado",
      archived: "Retirado",
    },
    startsOn: (date: string) => `Começa em ${date}`,
    until: (date: string) => `até ${date}`,
    reach: (seen: number, percent: string) =>
      `${seen.toLocaleString("pt-BR")} viram (${percent})`,
    empty: "Nenhum pronunciamento ainda",
    emptyHint:
      "Use para manutenções, mudanças de preço e novidades importantes.",
    archive: "Tirar do ar",
    archiveTitle: "Tirar este pronunciamento do ar?",
    archiveBody:
      "Ele some do sininho de todo mundo. O histórico de leituras fica guardado.",
    archiveLiveBody:
      "Ele está no ar agora e some do sininho de todo mundo. O histórico de leituras fica guardado.",
    deleteTitle: "Excluir este rascunho?",
    deleteBody: "Ele ainda não foi publicado; ninguém viu.",
    email: {
      send: "Enviar por e-mail",
      test: "Enviar teste para mim",
      testSent: "Teste enviado para o seu e-mail.",
      title: "Enviar por e-mail",
      description:
        "O pronunciamento vai também para a caixa de entrada, com o botão e um link para parar de receber. Quem já recebeu este pronunciamento fica de fora.",
      audience: "Para quem",
      audiences: {
        all: "Todas as contas",
        owners: "Responsáveis pelas organizações",
        paying: "Clientes que já pagaram",
        recent: "Quem entrou nos últimos 90 dias",
        tagged: "Organizações com uma etiqueta",
      } as Record<string, string>,
      audienceHints: {
        all: "Cada pessoa com conta, inclusive quem foi chamado para uma equipe.",
        owners: "Só o e-mail principal de cada organização.",
        paying: "Pessoas das organizações que já compraram lotes pagos.",
        recent: "Bom para avisos de uso; deixa de fora contas paradas.",
        tagged: "Use as etiquetas da ficha de cada organização.",
      } as Record<string, string>,
      tag: "Etiqueta",
      noTags:
        "Nenhuma organização tem etiqueta ainda. Crie na ficha da organização.",
      recipients: (count: number) =>
        count === 1
          ? "1 pessoa vai receber"
          : `${count.toLocaleString("pt-BR")} pessoas vão receber`,
      optedOut: (count: number) =>
        count === 1
          ? "1 parou de receber comunicados"
          : `${count.toLocaleString("pt-BR")} pararam de receber comunicados`,
      already: (count: number) =>
        count === 1
          ? "1 já recebeu"
          : `${count.toLocaleString("pt-BR")} já receberam`,
      pace: (perDay: number, days: number) =>
        days <= 1
          ? `Sai hoje: até ${perDay.toLocaleString("pt-BR")} comunicados por dia, para sobrar cota para os códigos de acesso.`
          : `Leva cerca de ${String(days)} dias: até ${perDay.toLocaleString("pt-BR")} comunicados por dia, para sobrar cota para os códigos de acesso.`,
      noBudget:
        "A cota diária de e-mails é pequena demais para comunicados: aumente MAIL_DAILY_LIMIT.",
      confirm: (count: number) =>
        count === 1
          ? "Enviar para 1 pessoa"
          : `Enviar para ${count.toLocaleString("pt-BR")} pessoas`,
      queued: "Envio começou. Acompanhe o progresso na lista.",
      progress: (sent: number, total: number) =>
        `E-mail: ${sent.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`,
      done: (sent: number) =>
        sent === 1
          ? "E-mail: enviado para 1 pessoa"
          : `E-mail: enviado para ${sent.toLocaleString("pt-BR")} pessoas`,
      failed: (count: number) => `${count.toLocaleString("pt-BR")} com falha`,
      skipped: (count: number) => `${count.toLocaleString("pt-BR")} fora`,
      canceled: "envio parado",
      cancel: "Parar o envio",
      cancelTitle: "Parar o envio por e-mail?",
      cancelBody:
        "Quem ainda não recebeu fica sem receber. O que já saiu não volta.",
      canceledToast: "Envio parado.",
    },
  },
  billing: {
    pricesIntro:
      "A tabela de preços dos lotes. Mudanças valem para lotes novos; os já criados mantêm o preço.",
    change: "Mudar preços",
    current: "Em vigor",
    upcoming: "Agendada",
    since: (date: string) => `A partir de ${date}`,
    history: "Histórico de tabelas",
    inForce: "Em vigor",
    seed: "Tabela de lançamento",
    summary: (unit: string, minimum: string, free: number) =>
      `1ª faixa ${unit} · mínimo ${minimum} · ${free.toLocaleString("pt-BR")} grátis`,
    upcomingTitle: (date: string) => `Nova tabela começa em ${date}`,
    upcomingBody:
      "Os organizadores já veem o aviso. Você pode retirar a tabela antes de ela começar.",
    withdraw: "Retirar",
    withdrawTitle: "Retirar a tabela agendada?",
    withdrawBody:
      "Os preços atuais continuam valendo. Se você avisou os organizadores, publique um pronunciamento explicando.",
    withdrawn: "Tabela agendada retirada.",
    newTable: "Nova tabela de preços",
    newTableHint:
      "Preços por ingresso em reais, por faixa da quantidade do lote.",
    tiers: "Faixas",
    upTo: "Até o ingresso",
    unit: "Preço por ingresso (R$)",
    tierRange: (from: number) =>
      `Última posição da faixa que começa no ${from.toLocaleString("pt-BR")}º`,
    unitOf: (from: number) =>
      `Preço da faixa que começa no ${from.toLocaleString("pt-BR")}º`,
    removeTier: "Remover faixa",
    addTier: "Adicionar faixa",
    minimum: "Valor mínimo por lote",
    minimumHint: "Para as taxas do cartão nunca comerem um lote pequeno.",
    freeTickets: "Ingressos grátis por conta",
    freeTicketsHint: "Toda organização ganha esses ingressos para testar.",
    when: "Quando vale",
    whenOptions: { now: "Agora", later: "Agendar" },
    effectiveAt: "A partir de",
    announce: "Avisar todos os organizadores",
    announceHint: "Publica um pronunciamento com a tabela nova e a data.",
    note: "Anotação interna",
    notePlaceholder: "Reajuste anual",
    examples: "Exemplos",
    examplesHint:
      "Com a tabela nova, sem ingressos grátis, promoções nem crédito.",
    before: (amount: string) => `Hoje: ${amount}`,
    applyNow: "Aplicar agora",
    schedule: "Agendar",
    appliedNow: "Preços novos em vigor.",
    scheduled: "Tabela agendada.",
    promotionsIntro:
      "Desconto em todos os lotes por um tempo. Se houver mais de uma no ar, vale a maior.",
    newPromotion: "Nova promoção",
    editPromotion: "Editar promoção",
    promoSaved: "Promoção salva.",
    promoRemoved: "Promoção excluída.",
    promoName: "Nome",
    promoNamePlaceholder: "Semana do rock",
    percent: "Desconto (%)",
    headline: "Chamada pública",
    headlineHint: "Aparece na página de preços e no painel.",
    headlinePlaceholder: "20% de desconto em todos os lotes até domingo",
    startsAt: "Começa em",
    endsAt: "Termina em",
    active: "Ligada",
    activeHint: "Desligada, não vale mesmo dentro do período.",
    promoStates: {
      off: "Desligada",
      scheduled: "Agendada",
      ended: "Encerrada",
      running: "No ar",
    },
    noPromotions: "Nenhuma promoção",
    noPromotionsHint:
      "Crie uma para datas especiais, como Black Friday ou o começo da temporada de festas.",
    window: (from: string, to: string) => `${from} até ${to}`,
    promoUsage: (batches: number, amount: string) =>
      `${batches === 1 ? "1 lote" : `${batches.toLocaleString("pt-BR")} lotes`}, ${amount} de desconto`,
    promoDeleteTitle: "Excluir esta promoção?",
    promoDeleteBody: "Lotes que já usaram o desconto mantêm o preço.",
    codesIntro:
      "Cupons que o organizador digita em Minha conta: crédito em reais, ingressos grátis ou desconto no próximo lote.",
    newCode: "Novo cupom",
    createCode: "Criar cupom",
    codeCreated: (code: string) => `Cupom ${code} criado e copiado.`,
    code: "Código",
    codeHint: "De 4 a 32 letras, números, - ou _. Vazio: geramos um.",
    codePlaceholder: "SHOW2026",
    generate: "Gerar código",
    kind: "O que dá",
    kinds: {
      credit: "Crédito em reais",
      free_tickets: "Ingressos grátis",
      discount: "Desconto no próximo lote",
    },
    valueLabels: {
      credit: "Valor (R$)",
      free_tickets: "Ingressos",
      discount: "Desconto (%)",
    },
    kindValues: {
      credit: (amount: string) => `${amount} de crédito`,
      free_tickets: (tickets: number) =>
        `${tickets.toLocaleString("pt-BR")} ingressos grátis`,
      discount: (percent: number) => `${String(percent)}% no próximo lote`,
    },
    maxUses: "Limite de usos",
    maxUsesHint: "Vazio: sem limite. Cada organização usa uma vez.",
    description: "Anotação",
    descriptionPlaceholder: "Parceria com a rádio",
    expiresAt: "Expira em",
    onlyNew: "Só para contas novas",
    onlyNewHint:
      "Vale apenas para organizações criadas depois que o cupom começou.",
    onlyNewShort: "Só contas novas",
    codeStates: {
      disabled: "Desligado",
      expired: "Expirado",
      exhausted: "Esgotado",
      scheduled: "Agendado",
      active: "Ativo",
    },
    noCodes: "Nenhum cupom ainda",
    noCodesHint:
      "Crie cupons para parcerias, campanhas ou para compensar um cliente.",
    copy: (code: string) => `Copiar ${code}`,
    uses: (used: number, max: number) =>
      `${used.toLocaleString("pt-BR")} de ${max.toLocaleString("pt-BR")} usos`,
    usesUnlimited: (used: number) => `${used.toLocaleString("pt-BR")} usos`,
    expires: (date: string) => `Expira em ${date}`,
    redemptions: "Quem usou",
    redemptionsOf: (code: string) => `Quem usou ${code}`,
    noRedemptions: "Ninguém usou este cupom ainda.",
    applied: "Desconto usado",
    enable: "Ligar",
    disable: "Desligar",
    codeOn: "Cupom ligado.",
    codeOff: "Cupom desligado.",
  },
  emails: {
    intro:
      "Cada e-mail que o Ingresso Impresso mandou nos últimos 30 dias, e o quanto da cota diária já foi usado.",
    quota: "Cota das últimas 24 horas",
    unlimited: "Sem limite",
    quotaHint: (signups: number) =>
      `${signups.toLocaleString("pt-BR")} para endereços sem conta (no máximo 2/3 da cota).`,
    failedWeek: "Falhas em 7 dias",
    provider: "Envio",
    providers: { log: "Só no log", memory: "Memória (testes)" },
    noProvider:
      "Sem RESEND_API_KEY: os e-mails só aparecem no log do servidor. Normal em desenvolvimento.",
    chartTitle: "E-mails por dia",
    messages: (count: number) =>
      count === 1 ? "1 e-mail" : `${count.toLocaleString("pt-BR")} e-mails`,
    chartBar: (date: string, value: string) => `${date}: ${value}`,
    webhookOn: "Entregas confirmadas pela Resend (entregue, devolvido, spam).",
    webhookOff: "Status até o envio para a Resend.",
    webhookHint:
      "Configure o webhook da Resend (RESEND_WEBHOOK_SECRET) para ver também entregues, devolvidos e marcados como spam.",
    test: "Enviar teste",
    testSent: "E-mail de teste enviado para você.",
    byStatus: "Por situação",
    byKind: "Por tipo",
    day: "24h",
    week: "7 dias",
    none: "Nada ainda.",
    search: "Buscar por destinatário ou assunto",
    status: "Situação",
    allStatuses: "Todas as situações",
    kind: "Tipo",
    allKinds: "Todos os tipos",
    kinds: {
      login_code: "Código de acesso",
      signup_code: "Código (conta nova)",
      batch_paid: "Pagamento confirmado",
      test: "Teste",
      team_invite: "Convite de equipe",
      alert: "Alerta dos admins",
      announcement: "Pronunciamento",
    },
    statuses: {
      sending: "Enviando",
      sent: "Enviado",
      delivered: "Entregue",
      delivery_delayed: "Atrasado",
      bounced: "Devolvido",
      complained: "Marcado como spam",
      failed: "Falhou",
      quota: "Barrado pela cota",
    },
    empty: "Nenhum e-mail com esses filtros.",
    removedAddress: "Endereço apagado (conta excluída)",
    pagination: "Páginas",
    total: (count: number) =>
      count === 1 ? "1 e-mail" : `${count.toLocaleString("pt-BR")} e-mails`,
    previous: "Página anterior",
    next: "Próxima página",
    page: (page: number, pages: number) =>
      `${String(page)} de ${String(pages)}`,
  },
  moderation: {
    intro:
      "Imagens enviadas pelos organizadores. Uma imagem sinalizada não é impressa até alguém da equipe decidir.",
    classifierOn: (used: number, limit: number) =>
      `Análise automática ligada: ${String(used)} de ${String(limit)} imagens hoje.`,
    classifierOffTitle: "Análise automática desligada",
    classifierOff:
      "Sem MODERATION_VISION_API_KEY, nenhuma imagem é sinalizada sozinha. Confira as artes em Envios recentes e sinalize o que for preciso.",
    views: {
      open: "Para revisar",
      recent: "Envios recentes",
      approved: "Liberadas",
      rejected: "Recusadas",
    },
    logo: "Logo da organização",
    reasons: {
      adult: "Conteúdo sexual",
      violence: "Violência",
      racy: "Sugestiva",
      manual: "Sinalizada pela equipe",
    },
    artStates: {
      unchecked: "Não analisada",
      clean: "Sem alertas",
      flagged: "Em revisão",
      approved: "Liberada",
      rejected: "Recusada",
    },
    automatic: "Automática",
    manual: "Manual",
    score: (score: number) => `${String(score)}% de certeza`,
    reveal: "Mostrar",
    hide: "Esconder",
    approve: "Liberar",
    reject: "Recusar",
    approveTitle: "Liberar esta imagem?",
    approveBody: "Ela volta a poder ser impressa.",
    rejectTitle: "Recusar esta imagem?",
    rejectBody:
      "Ela nunca será impressa e o mesmo arquivo não pode ser enviado de novo.",
    note: "Motivo",
    noteHint: "Fica registrado na auditoria.",
    noteRejectHint: "O organizador vê esse motivo no aviso.",
    notify: "Avisar a organização",
    notifyHint: "Aparece no sininho do painel.",
    suspend: "Suspender a conta também",
    suspendHint:
      "Para conteúdo grave. A conta fica só leitura até você reativar.",
    approved: "Imagem liberada.",
    rejected: "Imagem recusada.",
    decided: (status: string, by: string, when: string) =>
      `${status} por ${by} em ${when}.`,
    statusApproved: "Liberada",
    statusRejected: "Recusada",
    flag: "Sinalizar",
    flagged: "Imagem enviada para revisão.",
    allClear: "Nada para revisar",
    allClearHint: "Quando uma imagem for sinalizada, ela aparece aqui.",
    noneHere: "Nada por aqui",
    noUploads: "Nenhuma imagem enviada ainda",
    legal:
      "Conteúdo de abuso sexual infantil deve ser recusado, com a conta suspensa, e denunciado à SaferNet (new.safernet.org.br/denuncie) ou à Polícia Federal. O arquivo fica guardado para as autoridades.",
  },
  incidents: {
    intro:
      "O que aparece na página pública de status. Abra um incidente quando algo quebrar e agende as manutenções.",
    openPage: "Ver página",
    new: "Novo registro",
    edit: "Editar registro",
    saved: "Registro salvo.",
    publish: "Publicar",
    kind: "Tipo",
    kinds: { incident: "Incidente", maintenance: "Manutenção programada" },
    titleLabel: "Título",
    titleIncident: "Lentidão na geração de arquivos",
    titleMaintenance: "Atualização do banco de dados",
    impact: "Impacto",
    components: "Partes afetadas",
    scheduledFor: "Começa em",
    scheduledUntil: "Termina em",
    firstMessage: "Primeira atualização",
    firstMessageHint: "Explique em uma ou duas frases, sem termos técnicos.",
    messageIncident: "Estamos investigando lentidão para gerar os PDFs.",
    messageMaintenance:
      "O painel ficará fora do ar por até uma hora. A portaria continua funcionando.",
    postUpdate: "Publicar atualização",
    post: "Publicar",
    updatePosted: "Atualização publicada.",
    status: "Situação",
    message: "Mensagem",
    removed: "Registro excluído.",
    empty: "Nenhum incidente registrado",
    emptyHint: "Ótimo sinal. Use também para avisar manutenções programadas.",
    deleteTitle: "Excluir este registro?",
    deleteBody: "Ele some da página de status, inclusive do histórico.",
  },
  organizations: {
    empty: "Nenhuma organização encontrada.",
    owner: "Responsável",
    created: (date: string) => `Desde ${date}`,
    events: (count: number) =>
      count === 1 ? "1 evento" : `${count.toLocaleString("pt-BR")} eventos`,
    tickets: (count: number) => `${count.toLocaleString("pt-BR")} ingressos`,
    free: (used: number, total: number) =>
      `Grátis: ${used.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`,
    lastBatch: (date: string) => `Último lote em ${date}`,
    noBatch: "Nenhum lote ainda",
    bonus: "Cortesia",
    bonusBadge: (count: number) =>
      `+${count.toLocaleString("pt-BR")} de cortesia`,
    bonusTitle: (name: string) => `Cortesia para ${name}`,
    bonusDescription: (base: number) =>
      `Ingressos grátis além dos ${base.toLocaleString("pt-BR")} que toda organização recebe. O valor substitui a cortesia atual.`,
    bonusLabel: "Ingressos de cortesia",
    bonusSaved: "Cortesia atualizada.",
  },
  batches: {
    filters: {
      awaiting_payment: "Aguardando",
      paid: "Pagos",
      refunded: "Estornados",
      canceled: "Cancelados",
      all: "Todos",
    },
    empty: "Nenhum lote neste filtro.",
    numbers: (first: number, last: number) =>
      `Nº ${first.toLocaleString("pt-BR")} a ${last.toLocaleString("pt-BR")}`,
    quantity: (count: number) => `${count.toLocaleString("pt-BR")} ingressos`,
    created: (date: string) => `Criado em ${date}`,
    paid: (date: string) => `Pago em ${date}`,
    openEvent: "Abrir evento",
    markedPaid: "Lote marcado como pago.",
    actions: "Ações do lote",
    changePrice: "Mudar o preço",
    priceTitle: "Novo preço do lote",
    priceDescription: (quantity: number) =>
      `${quantity.toLocaleString("pt-BR")} ingressos. Um pagamento aberto é encerrado; com preço zero, o lote é liberado na hora.`,
    priceLabel: "Valor do lote (R$)",
    priceSaved: "Preço atualizado.",
    refund: "Estornar",
    refundTitle: "Estornar este lote?",
    refundBody:
      'O lote vira "Estornado" e todos os números dele são cancelados na porta para sempre, inclusive os já impressos. Eles não voltam a ser usados em outros lotes.',
    refundOnStripe: "Devolver o dinheiro pela Stripe agora",
    refundOnStripeHint:
      "Desligado, só registra aqui (use se você já devolveu por fora).",
    refundNote: "Observação para o histórico",
    refundNotePlaceholder: "Pedido de arrependimento em 7 dias",
    refunded: "Lote estornado e números cancelados.",
    refundedAt: (date: string) => `Estornado em ${date}`,
  },
} as const;
