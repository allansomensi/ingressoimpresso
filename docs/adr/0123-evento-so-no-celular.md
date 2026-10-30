# 0123. Evento só no celular: ingressos por categoria, para pessoas, enviados em sequência

- **Status:** Aceito
- **Data:** 2026-10-30
- **Complementa:** [0030](0030-ingresso-digital.md) (ingresso digital; muda a parte do telefone),
  [0056](0056-categorias-de-ingresso.md) (categorias), [0091](0091-evento-de-varios-dias.md) (vários dias),
  [0092](0092-pontos-de-controle.md) (pontos de controle), [0089](0089-instrucao-na-entrada.md)
  (instrução na portaria)

## Contexto

Um cliente vai fazer um evento ao ar livre de dois dias, com e sem janta, só com ingresso no
celular: seis categorias (sábado, domingo ou os dois, com ou sem janta), pulseiras de cores
diferentes na entrada e a janta conferida à parte. A venda é por um Google Forms: a pessoa manda o
nome e o comprovante do Pix, o organizador confere e gera o ingresso.

A portaria já dava conta de tudo isso (dias, pontos de controle, instrução da pulseira por
categoria). O que não atendia era o envio:

- a aba Digitais pedia um **número**, nunca uma categoria: para mandar "sábado com janta" o
  organizador tinha de saber as faixas de cabeça e achar um número livre nelas;
- **um ingresso por vez:** uma família de quatro eram quatro envios e quatro mensagens;
- o WhatsApp **não ficava guardado** (ADR 0030): reenviar era digitar o número de novo, e não havia
  como saber quem já tinha recebido;
- trazer as respostas do formulário era refazer tudo à mão; o "gerar vários links" só criava links
  sem nome numa faixa;
- o painel inteiro falava de impressão: Arquivos no meio das seções, "Gerar arquivos" depois do
  pagamento, "O que falta" mandando para Arquivos.

## Opções consideradas

1. **Um formulário de pedido dentro da plataforma** (página pública com comprovante). Resolveria
   o Google Forms, mas guardar comprovantes de pagamento de anônimos é outro problema (dados
   financeiros, abuso de upload, retenção). Fica para depois, se houver procura.
2. **Melhorar o envio para quem já vende por fora** (formulário, WhatsApp, Pix na mão): emitir
   por categoria e quantidade, guardar o contato, importar as respostas e mandar em sequência.
3. **Um tipo de evento novo "digital"** com outra numeração. Duplicaria regras de lote, acerto e
   portaria por nada: o número do ingresso digital é o mesmo do papel.

## Decisão

Opção 2, sem tocar no QR, na portaria nem nos lotes.

- **`events.digital_only`** (painel: "Como chegam às pessoas", no formulário do evento, e o cartão
  "Evento só no celular" em Digitais, para quem coordena). Só muda o painel: some Arquivos,
  Digitais vem antes de Vendedores, o pagamento do lote leva a "Enviar ingressos" e o item
  "Entrega" de O que falta aponta para Digitais. Duplicar e outra data levam junto.
- **Emissão por pedido** (`POST /api/events/{id}/tickets/issue`, parte `delivery`): uma lista de
  pedidos, cada um com categoria (ou nenhuma), quantidade (1 a 50), nome, WhatsApp e observação;
  até 500 ingressos por vez. Os números são os próximos livres da categoria; `null` são os números
  fora de toda categoria. **Tudo ou nada:** se não couber, nada é criado (`not_enough_tickets`),
  e uma corrida com outro envio refaz a escolha até três vezes dentro de uma transação. Assinatura
  continua só em `jobs::sign_numbers`, só de lotes pagos.
- **Livre para o celular** é pago, sem vendedor, sem cancelamento, sem entrada e **sem link algum,
  nem revogado**: quem viu o QR de um link revogado ainda pode tê-lo. O `GET …/tickets` devolve
  `stock` (livres e o próximo de cada categoria) para o painel mostrar e conferir antes de enviar.
- **Contato guardado:** `ticket_links.holder_phone` (dígitos com o código do país, a mesma regra
  de `normalize_whatsapp`), `note` (até 200, só a equipe vê) e `sent_at`. Isso muda o ADR 0030,
  que não guardava o telefone: agora ele serve para reenviar e some 90 dias depois do fim do
  evento (`jobs::prune`). Entra na exportação de dados da conta; uma transferência (ADR 0097) não
  leva o telefone para o novo dono; quem não tem `delivery` vê o telefone em branco, como o link.
- **Enviado:** `POST /api/events/{id}/tickets/sent` marca links como enviados quando alguém toca
  no WhatsApp ou copia a mensagem no painel. Não entra no histórico do evento (é controle da
  lista). "Para enviar" é válido, não enviado e nunca aberto.
- **Uma mensagem por pessoa:** os links do mesmo WhatsApp (ou do mesmo nome no mesmo minuto) vão
  juntos, com uma linha por ingresso ("Ingresso nº 0012 · Sábado com janta").
- **Envio em sequência:** um diálogo mostra uma pessoa por vez com o botão do WhatsApp (link real,
  para o celular abrir o app) e "Próximo"; a lista é a do momento em que abriu.
- **Importar planilha:** colar as linhas do Google Sheets (tabulação) ou escolher o CSV do Google
  Forms. As colunas são adivinhadas pelo cabeçalho (nome, WhatsApp, tipo de ingresso, quantidade,
  observação/comprovante) e podem ser trocadas; cada resposta distinta da coluna do tipo é ligada
  a uma categoria pelas palavras em comum ("c/" é "com", "s/" é "sem": janta nunca vira sem
  janta) e pode ser corrigida; quem já tem ingresso vem desmarcado. Termina no envio em sequência.
  Regras em `lib/digital-tickets.ts`, testadas com uma planilha do Google Forms.
- **Categorias por contagem:** o cartão de uma categoria sem números sugere começar logo depois da
  última faixa, para montar seis categorias sem fazer contas.

## Consequências

- O cliente do exemplo monta o evento de dois dias, seis categorias com a pulseira em "Instrução
  na portaria", um ponto de controle "Janta" para as três com janta, paga um lote e, a cada
  resposta conferida, envia por categoria em dois toques; ou importa as respostas de uma vez e
  manda em sequência.
- O telefone do comprador passa a ser dado guardado: o texto da Privacidade já cobre dados de
  contato tratados para a entrega do ingresso; a revisão jurídica pendente (Fase 8) deve olhar
  este ponto.
- O "gerar vários links" (faixa, sem nome) continua para quem vende em outra plataforma, escondido
  nos eventos só no celular.
