# 0040. Cupons e crédito

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0039](0039-precos-no-painel-e-promocoes.md)

## Contexto

Para parcerias, campanhas e para compensar um cliente, o admin só tinha a cortesia de ingressos
grátis (ADR 0026). Faltavam cupons e um saldo em reais.

## Decisão

- **Cupons** (`promo_codes`), em maiúsculas, de 4 a 32 caracteres, dão uma de três coisas:
  - crédito em reais;
  - ingressos grátis, somados à cortesia da organização;
  - desconto percentual no próximo lote.
  Cada cupom tem limite de usos opcional, início e fim, "só contas novas" e pode ser desligado.
- Cada organização usa um cupom uma vez (`promo_redemptions`). A vaga é tomada com um `UPDATE`
  atômico, então dois pedidos simultâneos nunca passam do limite.
- O resgate (`POST /api/account/redeem`) confere, nesta ordem: existe e está ligado, já começou,
  não expirou, não foi usado por esta organização, a conta é elegível, há uso disponível. Cada
  conta tenta no máximo 10 cupons por hora.
- **Crédito** é um extrato só de inserções (`credit_ledger`); o saldo é a soma.
  - O crédito é gasto sozinho ao criar um lote, com a linha da organização travada.
  - Volta quando o lote é cancelado ou estornado; um cupom de desconto volta a esperar quando o
    lote é cancelado.
  - O admin adiciona ou retira crédito (nunca abaixo de zero), e a organização recebe uma
    notificação.
- Um lote coberto por crédito nasce pago (`paid_via = 'credit'`).

## Consequências

- O crédito não é dinheiro: não se saca, só se usa em lotes, e nunca é estornado na Stripe.
