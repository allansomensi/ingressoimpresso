# 0034. Resultados do organizador e financeiro do admin

- **Status:** Aceito
- **Data:** 2026-10-09

## Contexto

O organizador via o acerto por vendedor, mas não quanto vendeu, gastou e recebeu por evento ou no
ano. O admin via a receita total e de 30 dias, sem comparação, sem forma de pagamento, sem
estornos e sem funil.

## Opções consideradas

1. **Ferramenta de BI externa.** Acesso ao banco inteiro e mais um fornecedor.
2. **Consultas próprias na API**, sobre as mesmas regras do relatório.

## Decisão

Opção 2.

- Organizador: `GET /api/events/{id}/analytics` (vendidos, faturamento estimado, custo, resultado,
  entradas a cada 15 minutos no horário do evento, cópias barradas, ingressos digitais abertos) e
  `GET /api/analytics` (totais, linha por evento e 12 meses pela data dos eventos, avançando até
  seis meses para eventos já marcados). "Vendidos" = pagos − devolvidos − perdidos, como no
  relatório; o faturamento é estimado pelo preço do evento, porque a venda acontece fora da
  plataforma.
- Admin: `GET /api/admin/finance?days=7|30|90|365` (receita contra o período anterior, estornos,
  líquido, lotes e ingressos cobrados, a receber, forma de pagamento, série diária ou mensal,
  quem mais comprou e o funil das contas novas).
- Telas: card de resultados na visão geral do evento, página `/painel/resultados` com CSV e aba
  Financeiro no admin.

## Consequências

- O faturamento do organizador é estimativa até o acerto; a tela diz isso.
- As consultas expandem os números dos lotes pagos; para contas com centenas de milhares de
  ingressos será preciso materializar.
