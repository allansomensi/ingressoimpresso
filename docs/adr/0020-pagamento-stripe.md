# 0020. Pagamento dos lotes com Stripe Checkout

- **Status:** Aceito
- **Data:** 2026-10-09
- **Substitui:** [0014](0014-pagamento-pix-adiado.md) (a marcação manual pelo admin continua como
  alternativa)

## Contexto

O MVP não cobrava: o lote nascia `awaiting_payment` e o admin o marcava como pago (ADR 0014).
Para abrir o produto a outros organizadores, o pagamento precisa acontecer sem intervenção:
o organizador cria o lote, paga e gera os arquivos na hora. O ADR 0014 listou os critérios para
escolher o provedor: cobrança dinâmica com webhook assinado, taxa, exigência de CNPJ, qualidade
da API e do sandbox, prazo de repasse.

## Opções consideradas

1. **PSP de Pix nacional (Efí, Mercado Pago, Asaas).** Taxa de Pix menor, mas só Pix (ou cartão
   com outra integração), APIs e sandboxes desiguais e, em alguns, certificado mTLS.
2. **Stripe Checkout.** Página de pagamento hospedada pela Stripe (cartão e Pix, conforme os
   métodos ativados no painel da Stripe), sem dados de cartão passando por nós (fora do escopo
   do PCI), webhook assinado com HMAC, modo de teste completo e boa documentação. Exige conta
   Stripe no Brasil (CPF/MEI ou CNPJ). A taxa por transação é maior que a de um PSP de Pix.
3. **Stripe Elements / Payment Element embutido no painel.** Mais controle visual, mas mais
   código no front, CSP mais aberta (scripts e frames da Stripe) e o mesmo resultado.

## Decisão

Opção 2: **Stripe Checkout**, chamado pela API HTTP da Stripe direto do servidor (sem SDK:
`reqwest` + formulário, como no Resend).

- **Preço:** tabela progressiva em `crates/server/src/pricing.rs` (por ingresso, por faixa de
  quantidade, com cobrança mínima). O preço é fixado na criação do lote (`ticket_batches.price_cents`)
  e só o servidor o calcula; o painel mostra a tabela de `GET /api/pricing`. Os valores iniciais
  são provisórios e mudam por commit.
- **Fluxo:** `POST /api/batches/{id}/checkout` abre (ou reaproveita, se ainda aberta) uma Checkout
  Session de valor igual ao do lote, com `Idempotency-Key` = id do pagamento, e devolve a URL. O
  navegador vai à Stripe e volta ao painel em `?aba=lotes&pagamento=sucesso|cancelado&lote=…`.
- **Confirmação:** o lote só vira `paid` (e só então pode ser assinado, invariante 2) por:
  - webhook `POST /api/stripe/webhook` com assinatura `Stripe-Signature` válida (HMAC-SHA256,
    tolerância de 5 min), eventos `checkout.session.completed`,
    `checkout.session.async_payment_succeeded`, `checkout.session.expired` e
    `checkout.session.async_payment_failed`; ou
  - leitura da sessão na própria Stripe (`POST /api/batches/{id}/checkout/sync`), quando o
    pagador volta ao site antes de o webhook chegar.

  Nos dois casos o valor e a moeda pagos precisam bater com o pagamento registrado, e a
  atualização é idempotente (`where status = 'awaiting_payment'`).
- **Tabela `payments`:** uma linha por tentativa (sessão), com status `open`, `paid`, `expired` ou
  `failed`. `ticket_batches.paid_via` diz se o lote foi pago pela Stripe ou pelo admin.
- **Cancelamento:** cancelar um lote (ou marcá-lo pago à mão) expira antes as sessões abertas na
  Stripe. Se uma delas já tiver sido paga, o pagamento vence e o lote fica pago.
- **Sem Stripe configurada** (`STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` ausentes), o servidor
  funciona como antes: o checkout responde `payments_unavailable` e o admin marca o lote como pago.

## Consequências

- O organizador paga e gera os arquivos sozinho. O admin continua podendo marcar lotes pagos
  (cortesias, pagamentos por fora).
- Dinheiro sem ingresso (pagamento de lote cancelado, ou pago duas vezes) é registrado em log de
  erro e exige estorno manual no painel da Stripe. As duas proteções (expirar a sessão antes de
  cancelar e reaproveitar a sessão aberta) tornam isso raro.
- A CSP do site não muda: o pagamento acontece na página da Stripe, não no nosso domínio.
- Segredos novos no Render: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `PUBLIC_WEB_URL`.
- Revisitar se o volume justificar um PSP de Pix com taxa menor: o modelo (`payments`,
  `paid_via`, preço no lote) não depende da Stripe.
