# 0061. Ingresso no celular pelo vendedor e segunda via

- **Status:** Aceito
- **Data:** 2026-10-11
- **Complementa:** [0030](0030-ingresso-digital.md) (ingresso digital) e
  [0053](0053-link-do-vendedor.md) (link do vendedor)

## Contexto

Dois pedidos de quem vende na mão:

- **O comprador está longe.** O vendedor marca a venda na página dele (ADR 0053), mas o papel
  continua no bolso do vendedor. Hoje só a equipe, pela aba Digitais, manda o ingresso no celular,
  e o vendedor precisa pedir ao organizador.
- **O ingresso se perdeu.** Para dar outro ingresso a quem perdeu o seu, o organizador cancela o
  número em Cancelamentos, cria um link em Digitais e tenta lembrar, no relatório, por que aquele
  número foi cancelado. São três passos em duas abas, e é fácil esquecer o primeiro (o número
  perdido continuaria valendo na porta).

## Opções consideradas

1. **Vendedor envia o próprio papel em foto.** Sem mudança no sistema, mas a foto de um ingresso
   de papel é uma cópia sem controle: não aparece no painel e não pode ser revogada.
2. **Vendedor cria o link do número que vendeu**, o mesmo ingresso digital do ADR 0030 (o mesmo QR
   do papel, assinado só em `jobs.rs`), com o envio controlado por evento.
3. **Segunda via como um cancelamento comum** seguido de um link novo, em duas telas.
4. **Segunda via num passo só**, que cancela, envia e registra a ligação entre os dois números.

## Decisão

Opções 2 e 4.

**Ingresso no celular pelo vendedor.**

- Na página do vendedor, um número vendido mostra **Ingresso no celular**: o vendedor cria o link
  (`POST /api/seller/tickets`, com o token do link do vendedor, limite por endereço) e manda pelo
  WhatsApp, com a mensagem pronta. Só para números que ele marcou como vendidos, de lotes pagos e
  não cancelados; criar de novo devolve o mesmo link.
- O link guarda quem o criou: `ticket_links.created_by` (pessoa no painel) ou
  `ticket_links.seller_id` (vendedor). A aba Digitais mostra "Enviado por Maria".
- Desfazer a venda revoga o link que o vendedor criou para aquele número.
- `events.sellers_send_tickets` liga ou desliga o envio por evento (ligado por padrão: o vendedor
  já tem o papel, com o mesmo QR). Fica na aba Vendedores
  (`GET`/`PUT /api/events/{id}/seller-settings`), na parte **Ingressos e vendedores** da equipe.

**Segunda via** (`POST /api/events/{id}/tickets/replace`), numa transação:

1. o número perdido é cancelado com o motivo `revoked` (quem vendeu continua respondendo por ele
   no acerto, porque a pessoa pagou) e a observação digitada;
2. os links ativos do número perdido são revogados;
3. um número livre ganha um link para a mesma pessoa (o nome do link antigo ou o comprador
   anotado pelo vendedor, se não for informado outro). Livre é pago, sem vendedor (senão ele
   seria cobrado), sem link, sem cancelamento e sem entrada; por padrão, o menor livre da mesma
   categoria (ADR 0056), para a portaria mostrar o mesmo que mostraria no ingresso perdido;
4. o lugar na mesa (ADR 0057) passa para o número novo;
5. `ticket_replacements` liga os dois números, o cancelamento e o link.

Um número que já entrou não ganha segunda via (`ticket_entered`). Em Cancelamentos, o cancelamento
mostra "Segunda via: nº X".

## Consequências

- Nenhuma assinatura nova fora de `jobs.rs`, e o formato do QR não muda: a segunda via é outro
  número já pago.
- O vendedor passa a ter um botão que cria links; o limite por endereço e a exigência de ter
  marcado a venda seguram o abuso, e o organizador pode desligar.
- Desfazer o cancelamento de uma segunda via faz o número perdido voltar a valer; o link do número
  novo continua (o organizador revoga em Digitais se quiser).
- A segunda via consome um número pago livre. Sem nenhum livre, o pedido é recusado
  (`no_free_tickets`) e o organizador precisa de um lote novo.
