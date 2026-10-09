# 0024. Preços acessíveis e ingressos grátis para testar

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0020](0020-pagamento-stripe.md) (a tabela de preços muda; o fluxo de pagamento não)

## Contexto

A primeira tabela (R$ 0,40 a R$ 0,15 por ingresso, mínimo de R$ 5,00) ficou cara para o
público-alvo: um show de 200 ingressos a R$ 20 custava R$ 70, 1,75% da bilheteria. Quem nunca
usou o produto também não tinha como testá-lo de verdade (imprimir e ler na porta) sem pagar.

## Opções consideradas

1. **Baixar só os preços.** Simples, mas o primeiro uso continua exigindo cartão ou Pix.
2. **Plano grátis com limite mensal.** Exige controlar períodos e incentiva várias contas.
3. **Preços menores + uma cota única de ingressos grátis por organização.** O primeiro contato é
   sem atrito e o custo de abuso é pequeno (ingressos sem valor sem o evento real por trás).

## Decisão

Opção 3, em `crates/server/src/pricing.rs`:

- faixas progressivas: R$ 0,15 (até o 100º), R$ 0,10 (até o 500º), R$ 0,07 (até o 2.000º) e
  R$ 0,05 (até o 5.000º); mínimo de R$ 2,90 por lote cobrado (cobre a parte fixa da taxa do
  cartão). 200 ingressos saem por R$ 25,00;
- cada organização tem `FREE_TICKETS` ingressos grátis (padrão 30, variável de ambiente; 0
  desliga). Eles saem dos primeiros lotes, em qualquer evento; `ticket_batches.free_tickets`
  registra quantos. Um lote totalmente coberto nasce `paid` com `paid_via = 'free'`. Cancelar um
  lote não pago devolve a cota. A trava da linha da organização impede dois lotes simultâneos de
  gastarem a mesma cota;
- `GET /api/account` informa a cota restante; o painel mostra o desconto na prévia do preço.

## Consequências

- O lote grátis passa pela invariante 2 ("só lotes pagos são assinados") como qualquer lote
  pago: `paid_via` diz por quê.
- Vários e-mails rendem várias cotas. Se virar abuso, baixar `FREE_TICKETS` resolve na hora.
- O teste ponta a ponta paga os lotes à mão, então roda com `FREE_TICKETS=0`.
