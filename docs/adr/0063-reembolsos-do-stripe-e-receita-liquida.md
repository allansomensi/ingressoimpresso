# 0063. Reembolsos do Stripe e receita líquida

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0020](0020-pagamento-stripe.md) (pagamento pela Stripe),
  [0032](0032-controle-do-admin.md) (estorno pelo admin) e
  [0034](0034-resultados-e-financeiro.md) (financeiro do admin)

## Contexto

O estorno pelo painel (ADR 0032) é o único caminho que o sistema conhece. Um reembolso feito
direto no painel da Stripe, total ou parcial, não chegava à API: o lote continuava **Pago**, os
ingressos continuavam valendo na porta e a receita do admin contava um dinheiro que já tinha
voltado. A visão geral do admin somava só lotes `paid`: um lote estornado sumia da receita, sem
aparecer como reembolso, e um reembolso parcial não aparecia em lugar nenhum.

Os e-mails saíam de `login@mail.ingressoimpresso.com.br`, definido só na variável `MAIL_FROM` do
Render, com um padrão de teste (`onboarding@resend.dev`) no código.

## Opções consideradas

1. **Só o estorno pelo painel**, com a orientação de nunca reembolsar pela Stripe. Frágil: a
   Stripe permite, e uma disputa ou um reembolso feito às pressas escapa.
2. **Uma linha por reembolso** (`re_...`) numa tabela própria. Precisa da lista de reembolsos em
   cada evento, que o objeto `charge` não traz mais por padrão (só na API antiga).
3. **O total reembolsado em cada pagamento**, vindo de `charge.refunded` (`amount_refunded`, o
   acumulado de todos os reembolsos, parciais incluídos), com a data do último.

## Decisão

Opção 3.

- `payments.refunded_cents` e `payments.refunded_at`. O valor só cresce
  (`update ... where refunded_cents < novo`): um evento repetido, atrasado ou fora de ordem não
  muda nada, nem a data.
- **Reembolso total** (o pagamento inteiro voltou) faz o mesmo que o estorno do admin, pela mesma
  função (`refunds::refund_batch`): lote `refunded`, números cancelados com o motivo `revoked`
  e para sempre (a porta barra), crédito devolvido. Só quando aquele pagamento é o que pagou o
  lote: um pagamento que chegou para um lote cancelado, pago à mão ou pago por outra sessão só
  fica registrado. O cancelamento aparece em **Cancelamentos** do evento ("Lote reembolsado no
  Stripe (1 a 100)") e a auditoria ganha `batch_refund_stripe`, com o autor "Stripe".
- **Reembolso parcial** só desconta da receita: o lote continua pago e os ingressos valendo.
- O estorno do admin grava o pagamento como reembolsado por inteiro; o `charge.refunded` que a
  Stripe manda em seguida não encontra nada novo. Os dois passam pela trava do lote.
- **Correção dos dados antigos:** a migração marca como reembolsados os pagamentos já estornados
  pelo admin. Para o que foi reembolsado na Stripe antes do webhook, **Conferir reembolsos no
  Stripe** (`POST /api/admin/payments/sync-refunds`) relê os reembolsos de cada pagamento
  (`GET /v1/refunds?payment_intent=`, sem os que falharam ou foram cancelados) e aplica a mesma
  regra, até 100 pagamentos por clique.
- **Receita:** a view `revenue_entries` tem uma linha por movimento: entradas (pagamentos da
  Stripe, e o preço dos lotes pagos de outro jeito) e reembolsos (dos pagamentos, e o preço dos
  estornos de lotes que não passaram pela Stripe), cada um na sua data. Bruta = entradas,
  líquida = bruta − reembolsos. A visão geral mostra as três desde o início e nos últimos 30
  dias, com a líquida em destaque; o financeiro (ADR 0034) usa a mesma view.
- **Remetente único:** `DEFAULT_MAIL_FROM` = `Ingresso Impresso <contato@ingressoimpresso.com.br>`
  em `config.rs`, para todo e-mail (login, pagamento, convite). `MAIL_FROM` continua trocando o
  remetente (teste do Resend, staging).

## Consequências

- O webhook da Stripe precisa do evento `charge.refunded`, e a chave, de leitura em **Refunds**
  para a conferência (`docs/deploy.md` §5.1).
- Um reembolso que falha depois de registrado (raro: a Stripe devolve o valor ao saldo) não é
  desfeito sozinho; o lote estornado continua estornado (ADR 0032).
- Reembolsos parciais em datas diferentes contam todos na data do último, nas janelas de 30 dias.
- O domínio `ingressoimpresso.com.br` precisa estar verificado no Resend antes de o remetente
  padrão valer; até lá, o `MAIL_FROM` antigo no Render continua mandando.
