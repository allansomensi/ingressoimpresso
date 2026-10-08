# 0011. Modelo de dados baseado em faixas

- **Status:** Aceito
- **Data:** 2026-10-08

## Contexto

Lotes, blocos por vendedor e cancelamentos são naturalmente **faixas** de números ("001–050 com
Fulano", "cancelar 120–149"). O relatório cruza faixas com entradas.

## Opções consideradas

1. **Uma linha por ingresso** (`tickets(event_id, number, seller_id, status, ...)`). Consultas
   triviais, mas operações em faixa viram atualizações em massa. A sobreposição de faixas só é
   evitada no código da aplicação, e cancelar ou desfazer exige guardar histórico à parte.
2. **Faixas `int4range` com restrições de exclusão (`btree_gist`)** em lotes e atribuições, e
   cancelamentos como registros de faixa com "desfazer". O Postgres **garante** que não haja
   sobreposição. O histórico é natural (cada operação é uma linha), e o estado de um número é
   derivado com índice GiST (`numbers @> 42`).
3. **Multiranges (`int4multirange`) agregados por evento.** Compactos, mas perdem a auditoria de
   cada operação.

## Decisão

Opção 2. Sem tabela de ingressos individuais. As exceções materializadas por número são:

- `entries(event_id, ticket_number)`: a primeira entrada de cada ingresso, com chave primária. É a
  base da confirmação atômica (ADR 0006);
- `scans`: o log de leituras.

Regras na aplicação, com testes:

- atribuições ficam dentro de lotes não cancelados;
- cancelamentos aceitam sobreposição (o estado é a união dos cancelamentos ativos);
- "desfazer" preenche `undone_at`, nunca apaga a linha.

## Consequências

- Integridade das faixas garantida pelo banco, e operações em faixa custam O(1) linhas.
- As consultas de relatório usam junções por contenção de faixa. Com o volume esperado (milhares de
  números por evento), são instantâneas com GiST.
- Converter faixas em listas para a portaria é feito no servidor: o manifesto envia faixas
  mescladas.
