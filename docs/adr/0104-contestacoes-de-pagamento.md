# 0104. Contestações de pagamento

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0020](0020-pagamento-stripe.md) (Stripe Checkout) e
  [0063](0063-reembolsos-do-stripe-e-receita-liquida.md) (reembolsos)

## Contexto

Um comprador pode contestar o pagamento com cartão na operadora (chargeback). A Stripe tira o
valor da conta e dá um prazo para mandar provas. Sem aviso, o prazo passa e os ingressos do lote
continuam valendo na porta, mesmo que o dinheiro não volte.

## Decisão

- O webhook trata `charge.dispute.created`, `updated`, `closed`, `funds_withdrawn` e
  `funds_reinstated` e grava `payment_disputes` (id `dp_…`, valor, motivo, status, prazo das
  provas), ligada ao pagamento e ao lote pelo `payment_intent`. É idempotente.
- Contestação nova abre um alerta crítico (ADR 0103); a primeira vez que fecha (ganha ou perdida)
  abre um aviso.
- Seção **Contestações** no admin: cada uma com o lote, o evento, o prazo e um link para responder
  na Stripe. O admin decide:
  - **Bloquear** os números do lote na portaria enquanto dura (um cancelamento `revoked` que pode
    ser desfeito);
  - **Desbloquear**;
  - numa contestação **perdida**, **estornar** o lote de vez: o bloqueio sai e o lote passa pelo
    `refund_batch` de sempre (números cancelados para sempre, crédito revogado), com
    `payments.refunded_cents` igual ao valor perdido, para a receita líquida ficar certa.
- Nada é automático além do registro e do alerta: perder a contestação não cancela ingressos
  sozinho, porque a Stripe às vezes reverte.

## Consequências

- O mantenedor precisa marcar os eventos `charge.dispute.*` no webhook da Stripe
  (`docs/deploy.md` §5.1).
- As provas continuam sendo enviadas no painel da Stripe; o produto não guarda documentos.
