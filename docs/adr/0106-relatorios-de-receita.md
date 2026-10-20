# 0106. Relatórios de receita para a contabilidade

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0034](0034-resultados-e-financeiro.md) (financeiro) e
  [0063](0063-reembolsos-do-stripe-e-receita-liquida.md) (`revenue_entries`)

## Contexto

O financeiro do admin mostra períodos móveis (7, 30, 90, 365 dias). A contabilidade pede o mês
fechado, com cada lançamento, num arquivo. Para decidir preço e marketing faltava saber quanto cada
safra de cadastros rende com o tempo e se os cupons se pagam.

## Decisão

- **Fechamento do mês** (`GET /api/admin/reports/closing?month=YYYY-MM`), no horário de Brasília,
  a partir de `revenue_entries`: cada valor conta na data em que entrou ou saiu (um reembolso de
  outubro de um lote de setembro entra em outubro). Recebido (Stripe e fora dela), devolvido,
  líquido; preço de tabela, descontos e crédito usado dos lotes pagos; crédito concedido no mês e
  em aberto no fim (devido em ingressos); contestações perdidas; formas de pagamento; por
  organização; e todos os lançamentos.
- Arquivos: **XLSX** (Resumo, Lançamentos, Organizações; o escritor de planilhas do ADR 0058) e
  **CSV** para planilha brasileira (`;` entre colunas, vírgula decimal, BOM, devoluções negativas
  para a soma da coluna dar o líquido). Baixar fica na auditoria (`report_export`).
- **Coortes** (`/reports/cohorts`): organizações por mês de cadastro (os últimos 12), quantas
  ativaram, quantas pagaram e a receita líquida mês a mês desde o cadastro (M0, M1…).
- **Retorno de cupons e promoções** (`/reports/coupons`): para cada código, quantas usaram, quantas
  pagaram depois, o custo (crédito, descontos, ingressos grátis) e a receita líquida depois do uso;
  para cada promoção, os lotes com o desconto.
- Seção **Relatórios** no admin, ao lado do Financeiro.

## Consequências

- O fechamento é calculado na hora, não congelado: um estorno tardio muda o mês em que acontece,
  nunca um mês passado.
- "Receita depois do cupom" é correlação, não causa: a conta talvez pagasse sem ele.
