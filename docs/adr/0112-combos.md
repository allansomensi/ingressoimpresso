# 0112. Combos: ingresso com itens ("entrada + 2 bebidas")

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0092](0092-pontos-de-controle.md) (pontos de controle) e
  [0056](0056-categorias-de-ingresso.md) (categorias)

## Contexto

Festas e bailes vendem "entrada + 2 bebidas" por um preço só. Hoje isso vira dois papéis (o
ingresso e duas fichas de um evento de fichas, ADR 0084), dois lotes e duas contas no acerto com o
vendedor. Os pontos de controle (ADR 0092) já leem o mesmo QR de novo, mas cada ingresso usa um
ponto uma vez por livro.

## Decisão

Um combo é uma **categoria** com preço próprio ("Entrada + 2 bebidas", R$ 50) e um **ponto de
controle** que entrega mais de um item a ela.

- `event_checkpoints.allowance` (itens por ingresso quando todo ingresso tem direito) e
  `checkpoint_categories.allowance` (itens de cada categoria com direito), 1 a 20, padrão 1. A API
  (`CheckpointBody`, `CheckpointDto`, `DoorCheckpointDto`) leva `allowance` e
  `categoryAllowances`; o painel pede "Itens por ingresso" no diálogo do ponto.
- **Cada item é um slot do livro do ingresso.** `door_ledger_entries` ganha `slot` (1 a 20) na
  chave; `scans.slot` (nulo é o primeiro) e o manifesto (`DoorEntryDto.slot`) também. No celular,
  o livro "d1" ganha "d1#2", "d1#3"… (`bookKey`), cada um com o seu `DoorCore`: a leitura vai para
  o primeiro slot ainda livre; com todos usados, o último diz "JÁ USOU OS 2". Dentro de cada slot
  a decisão é a de sempre: offline, convergente, primeira leitura vence, com a confirmação online.
- O formato v1, os vetores e o núcleo não mudam. A entrada só tem o slot 1 (o servidor recusa outro).
- **Uma conta só:** o preço do combo é o da categoria, e o acerto com o vendedor já é por categoria
  (ADR 0056). Nada a somar de fichas.
- O Ao vivo conta itens: `allowanceTotal` (itens que os ingressos vendidos podem levar) contra os
  usos.
- Apps antigos leem o combo como um item só (o primeiro slot); quem atualiza passa a ver os demais.

## Consequências

- Um papel, um lote e um acerto para "entrada + bebidas"; a portaria do bar lê o mesmo QR.
- Fichas avulsas continuam no evento de fichas (ADR 0084).
