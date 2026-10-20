export const errors = {
  generic: "Algo deu errado. Tente de novo.",
  network: "Sem conexão com o servidor. Verifique a internet e tente de novo.",
  unauthorized: "Sua sessão expirou. Entre de novo.",
  forbidden: "Você não tem permissão para isso.",
  not_found: "Não encontrado.",
  too_many_requests: "Muitas tentativas. Espere alguns minutos.",
  invalid_email: "E-mail inválido.",
  invalid_code: "Código errado ou expirado.",
  mail_unavailable:
    "Não conseguimos enviar o e-mail agora. Tente em alguns minutos.",
  invalid_name: "Nome inválido.",
  invalid_venue: "Local muito longo.",
  invalid_dates:
    "Confira as datas: o fim precisa ser depois do início, e a data não pode ter passado.",
  invalid_price: "Preço inválido.",
  invalid_design:
    "O ingresso tem medidas inválidas (veja o tamanho mínimo do QR, se tudo cabe no ingresso e se ele é alto o bastante para os campos do canhoto).",
  unsupported_art: "A arte precisa ser PNG ou JPEG.",
  art_too_large: "A arte é grande demais (máximo 10.000 px por lado).",
  payload_too_large: "Arquivo grande demais (máximo 20 MB).",
  unknown_art: "Arte não encontrada; envie de novo.",
  too_large_for_a4: "O ingresso (com canhoto) não cabe numa folha A4.",
  paper_too_small:
    "O ingresso não cabe neste papel sem o QR ficar pequeno demais. Escolha outro papel.",
  invalid_quantity: "Quantidade inválida (1 a 5.000).",
  batch_not_cancelable: "Só lotes não pagos podem ser cancelados.",
  batch_not_payable: "Este lote não está aguardando pagamento.",
  payment_pending:
    "Há um Pix deste lote aguardando confirmação. Espere a confirmação antes de mexer no lote.",
  batch_has_ranges:
    "Este lote tem faixas entregues a vendedores ou cancelamentos. Remova-os antes de cancelar o lote.",
  art_quota:
    "Você atingiu o limite de armazenamento de artes. Use arquivos menores ou reaproveite uma arte já enviada.",
  method_not_allowed: "Ação não permitida.",
  payments_unavailable: "Pagamento online indisponível no momento.",
  payment_provider_error:
    "Não conseguimos falar com a Stripe agora. Tente em alguns instantes.",
  seller_exists: "Já existe um vendedor com esse nome.",
  range_not_held: "Algum desses números não está com este vendedor.",
  already_voided: "Algum desses números já foi devolvido ou cancelado.",
  already_sold: "Algum desses números já foi marcado como vendido.",
  already_reserved: "Algum desses números já está reservado para outra pessoa.",
  box_office_seller: "A bilheteria vende na porta: não tem reservas nem meta.",
  pix_received:
    "Um desses números já teve o Pix recebido: ele foi vendido. Desfaça o recebimento em Conferir Pix antes.",
  invalid_goal: "A meta vai de 1 a 100.000 ingressos.",
  invalid_expiry: "Escolha um prazo no futuro e antes de o evento terminar.",
  invalid_holder_phone:
    "O telefone tem no máximo 30 caracteres, numa linha só.",
  invalid_date: "Data inválida: escolha hoje ou um dia anterior.",
  invalid_return_reason:
    "Escolha se os ingressos voltaram sem vender ou se foram perdidos.",
  invalid_buyer_name: "Nome do comprador muito longo (até 80 caracteres).",
  invalid_buyer_phone: "Telefone do comprador muito longo (até 30 caracteres).",
  not_your_area: "Essa parte do evento é de outra pessoa da equipe.",
  already_owner: "Essa pessoa já é da organização e pode tudo no evento.",
  already_on_team: "Esse e-mail já está na equipe.",
  team_full: "A equipe chegou ao limite de 30 pessoas.",
  invalid_team_areas: "Escolha pelo menos uma parte para a pessoa cuidar.",
  invalid_team_name: "Nome com até 80 caracteres, numa linha só.",
  invalid_category_name:
    "Nome da categoria com até 30 caracteres, numa linha só.",
  invalid_entry_date: "Data inválida.",
  too_many_sponsors: "Até 6 logos de patrocinadores.",
  invalid_description: "Descrição com até 120 caracteres, numa linha só.",
  invalid_category: "Categoria com até 40 caracteres, numa linha só.",
  too_many_entries: "O evento chegou ao limite de 500 lançamentos.",
  invalid_color: "Escolha uma cor.",
  category_exists: "Já existe uma categoria com esse nome.",
  // Document, exit and return, tokens and Pix (ADRs 0082–0085).
  invalid_document_note:
    "Os documentos aceitos cabem em até 80 caracteres, numa linha só.",
  reentry_tokens: "Fichas de consumo valem uma vez: não há saída e volta.",
  invalid_pix_key:
    "Chave Pix inválida para o tipo escolhido. Confira os números (CPF e CNPJ têm dígitos verificadores).",
  invalid_pix_name:
    "O nome de quem recebe precisa ter de 1 a 25 caracteres, numa linha só.",
  invalid_pix_city: "A cidade precisa ter de 1 a 15 caracteres, numa linha só.",
  pix_number_unknown:
    "Só números vendidos ou enviados como ingresso no celular podem ser pagos por Pix.",
  pix_not_yours: "Este Pix vai para a organização: ela confirma o recebimento.",
  invalid_numbers: "Escolha de 1 a 500 números.",
  category_overlap: "Alguns desses números já estão em outra categoria.",
  too_many_categories: "O evento chegou ao limite de 12 categorias.",
  invalid_table_name: "Nome da mesa com até 30 caracteres, numa linha só.",
  invalid_seats: "Uma mesa tem de 1 a 50 lugares.",
  table_exists: "Já existe uma mesa com esse nome.",
  door_link_inactive: "Este link foi revogado ou expirou. Crie um link novo.",
  no_free_numbers: "Não sobrou número livre para entregar.",
  too_scattered:
    "Os números livres estão espalhados demais. Entregue por partes, escolhendo os números.",
  unknown_category: "Categoria não encontrada.",
  too_many_tables: "O evento chegou ao limite de 300 mesas.",
  table_full: "Não há lugares livres suficientes nesta mesa.",
  already_seated: "Alguns ingressos já estão em outra mesa.",
  seats_taken: "Libere os últimos lugares antes de diminuir a mesa.",
  invalid_phone: "Telefone muito longo.",
  invalid_range: "Faixa inválida.",
  range_not_issued: "Todos os números da faixa precisam estar em um lote.",
  range_overlap: "Essa faixa se sobrepõe a outra já entregue.",
  invalid_note: "Observação muito longa.",
  already_undone: "Esse cancelamento já foi desfeito.",
  void_locked: "Esse cancelamento veio de um estorno e não pode ser desfeito.",
  invalid_scope: "Seleção inválida.",
  export_not_ready: "O arquivo ainda não está pronto.",
  export_expired: "O arquivo expirou. Gere de novo.",
  no_tickets: "Não há ingressos pagos e não cancelados nessa seleção.",
  too_many_tickets: "Ingressos demais num arquivo só (máximo 10.000).",
  invalid_label: "Nome do link inválido (1 a 60 caracteres).",
  invalid_device_name: "Dê um nome ao celular (até 40 caracteres).",
  too_many_devices: "Este link já registrou celulares demais. Crie outro link.",
  invalid_scans: "Leituras inválidas.",
  scan_conflict: "Leitura em conflito com outro celular.",
  invalid_cursor: "Dados de sincronização inválidos.",
  duplicate: "Já existe.",
  invalid_input: "Dados inválidos.",
  invalid_bonus: "A cortesia vai de 0 a 100.000 ingressos.",
  event_closed:
    "Este evento está arquivado. Reabra o evento para criar lotes ou enviar ingressos.",
  mail_quota:
    "O envio de códigos por e-mail atingiu o limite de hoje. Entre com o Google ou tente de novo amanhã.",
  google_unavailable:
    "O login com Google está indisponível agora. Use o código por e-mail.",
  captcha_failed: "A verificação anti-robô falhou ou expirou. Tente de novo.",
  two_factor_required: "Digite o código do app autenticador.",
  admin_two_factor_required:
    "Ligue a verificação em duas etapas na sua conta para usar a administração.",
  export_queue_full:
    "Espere os arquivos que já estão sendo gerados antes de pedir outro.",
  cannot_suspend_own:
    "Você não pode suspender a organização da qual faz parte.",
  invalid_hour: "Escolha uma hora de 0 a 23.",
  invalid_month: "Mês inválido.",
  announcement_not_published:
    "Publique o pronunciamento antes de enviar por e-mail.",
  mailing_in_progress:
    "Este pronunciamento ainda está sendo enviado. Espere terminar ou pare o envio.",
  no_recipients: "Ninguém desse grupo falta receber este pronunciamento.",
  invalid_threshold: "Use de 1 a 100.000 ingressos.",
  dispute_without_batch: "Esta contestação não está ligada a nenhum lote.",
  dispute_already_blocked: "Os números deste lote já estão bloqueados.",
  dispute_not_blocked: "Os números deste lote não estão bloqueados.",
  dispute_not_lost: "Só uma contestação perdida vira estorno.",
  dispute_settled: "Esta contestação já foi resolvida.",
  batch_not_paid: "Este lote não está pago.",
  invalid_organization_note: "A anotação precisa ter de 1 a 2.000 caracteres.",
  invalid_tag: "Cada etiqueta precisa ter de 1 a 30 caracteres, numa linha só.",
  too_many_tags: "No máximo 10 etiquetas por organização.",
  invalid_two_factor_code:
    "Código incorreto ou já usado. Confira o app autenticador e tente de novo.",
  two_factor_enabled: "A verificação em duas etapas já está ligada.",
  two_factor_disabled: "A verificação em duas etapas está desligada.",
  two_factor_not_set_up: "Comece a configuração de novo.",
  invalid_google_token:
    "Não conseguimos confirmar o login com o Google. Tente de novo.",
  google_email_unverified:
    "Sua conta Google não tem o e-mail confirmado. Use o código por e-mail.",
  google_account_mismatch:
    "Este e-mail já está ligado a outra conta Google. Entre com o código por e-mail.",
  account_suspended:
    "Sua conta está suspensa. Fale com o suporte para reativar.",
  confirmation_mismatch: "O e-mail digitado não confere com o da conta.",
  invalid_holder_name: "Nome muito longo (até 80 caracteres).",
  ticket_not_issued: "Esse número não está em um lote pago.",
  ticket_voided:
    "Esse ingresso está cancelado. Desfaça o cancelamento ou escolha outro número.",
  ticket_link_exists:
    "Esse ingresso já tem um link ativo. Copie o link da lista abaixo.",
  ticket_entered:
    "Esse ingresso já entrou no evento: não dá para fazer a segunda via.",
  number_not_free:
    "Esse número não está livre: precisa estar pago, sem vendedor, sem link e sem cancelamento.",
  ticket_not_sold: "Marque o número como vendido antes de enviar o ingresso.",
  seller_tickets_off:
    "O organizador desligou o envio do ingresso no celular pelos vendedores.",
  no_free_tickets:
    "Todos os ingressos pagos já estão com vendedores ou links. Crie um novo lote.",
  invalid_number: "Número inválido.",
  batch_not_refundable: "Só lotes pagos podem ser estornados.",
  payment_not_found:
    "Não achamos o pagamento na Stripe. Estorne por lá e registre aqui sem a Stripe.",
  invalid_reason: "Motivo muito longo (até 200 caracteres).",
  invalid_title: "Dê um título de até 120 caracteres.",
  invalid_version: "Use uma versão no formato 1.4.0.",
  invalid_body: "Texto muito longo (até 4.000 caracteres).",
  invalid_period: "Período inválido.",
  busy: "O servidor está ocupado gerando outras imagens. Tente de novo em alguns segundos.",
  event_has_batches:
    "O evento tem lotes. Cancele os lotes não pagos antes; eventos com lotes pagos podem ser arquivados.",
  maintenance: "O sistema está em manutenção. Tente de novo em alguns minutos.",
  registrations_closed:
    "Novos cadastros estão pausados no momento. Se você já tem conta, entre com o e-mail dela.",
  email_domain_blocked:
    "Não aceitamos cadastros com e-mails deste domínio. Use outro endereço.",
  invalid_domain: "Há um domínio inválido na lista.",
  too_many_domains: "Lista grande demais (até 1.000 domínios).",
  invalid_message: "Mensagem muito longa (até 500 caracteres).",
  invalid_cta:
    "O botão precisa de um texto curto e de um link que comece com / ou https://.",
  invalid_prices:
    "Tabela inválida: as faixas precisam crescer, terminar em 5.000 ingressos e não podem ficar mais caras.",
  prices_in_force:
    "Essa tabela já está valendo e não pode ser retirada. Crie uma nova.",
  invalid_percent: "O desconto vai de 1% a 100%.",
  invalid_headline: "Chamada muito longa (até 120 caracteres).",
  invalid_amount: "Valor inválido.",
  cashier_tickets:
    "Só eventos de fichas têm caixa. Para vender na porta, use a bilheteria.",
  not_cashier: "Este vendedor não é um caixa.",
  empty_shift:
    "Nada foi vendido desde o último fechamento: não há caixa para fechar.",
  shift_closed:
    "Esta venda entrou num caixa já fechado. Só a organização desfaz.",
  insufficient_credit: "A organização não tem esse crédito para retirar.",
  promo_code_invalid: "Cupom inválido.",
  promo_code_expired: "Este cupom expirou.",
  promo_code_already_redeemed: "Sua conta já usou este cupom.",
  promo_code_not_eligible: "Este cupom é só para contas novas.",
  promo_code_exhausted: "Este cupom já atingiu o limite de usos.",
  promo_code_exists: "Já existe um cupom com esse código.",
  invalid_code_format: "Use de 4 a 32 letras, números, - ou _.",
  invalid_value: "Valor do cupom fora do permitido.",
  invalid_max: "Limite de usos inválido.",
  art_under_review:
    "A arte está em análise pela equipe. Os arquivos ficam liberados assim que a revisão terminar.",
  art_rejected:
    "Esta imagem foi recusada pela equipe e não pode ser impressa. Envie outra arte.",
  flag_already_resolved: "Outra pessoa já decidiu sobre esta imagem.",
  art_already_reviewed: "Esta imagem já está em revisão ou decidida.",
  classifier_unavailable: "A análise automática de imagens está desligada.",
  invalid_components: "Escolha partes válidas do serviço.",
  event_canceled:
    "O evento foi cancelado. Desfaça o cancelamento para continuar.",
  event_not_canceled: "O evento não está cancelado.",
  same_dates: "O evento já está nessa data. Escolha outra.",
  invalid_address: "Endereço muito longo (até 200 caracteres, uma linha).",
  invalid_whatsapp:
    "WhatsApp inválido. Use o número com DDD, como (11) 99999-8888.",
  invalid_website: "Site inválido. Use um endereço como suabanda.com.br.",
  invalid_instagram: "Instagram inválido. Use o seu @, como @suabanda.",
  invalid_contact_email: "E-mail de contato inválido.",
  referral_revoked: "Esta indicação já foi cancelada.",
  invalid_limit: "Limite inválido (de 0 a 1.000).",
  date_taken: "A série já tem uma data começando nesse horário. Escolha outro.",
  series_full: "Uma série pode ter até 60 datas.",
  not_in_series: "Esta data não faz parte de uma série.",
  invalid_door_categories: "Escolha categorias deste evento.",
  // Instruction, days and checkpoints (ADRs 0089–0092).
  invalid_door_instruction:
    "A instrução da portaria tem até 60 caracteres, numa linha só.",
  invalid_days:
    "Confira os dias: de 2 a 31, cada um com o fim depois do início, no máximo 48 horas, sem um começar antes do anterior terminar.",
  day_has_entries:
    "Esse dia já tem entradas na portaria e não pode sair. Mude só os horários dele.",
  days_tokens: "Fichas de consumo não têm dias: crie outra data do evento.",
  invalid_day_rule:
    "Escolha pelo menos um dia do evento para a categoria valer.",
  invalid_checkpoint:
    "Esse ponto de controle não existe mais. Recarregue a página.",
  invalid_checkpoint_name:
    "Nome do ponto com até 30 caracteres, numa linha só (ex.: Janta).",
  invalid_checkpoint_categories: "Escolha categorias deste evento.",
  checkpoint_exists: "Já existe um ponto de controle com esse nome.",
  too_many_checkpoints: "Um evento pode ter até 10 pontos de controle.",
  checkpoints_tokens:
    "Fichas de consumo não têm pontos de controle: cada ficha já é o consumo.",
} as const;
