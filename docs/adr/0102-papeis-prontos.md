# 0102. Papéis prontos para imprimir em casa

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0008](0008-geracao-arquivos-typst.md) (geração com Typst) e
  [0015](0015-renderizacao-em-blocos.md) (arquivos grandes)

## Contexto

O arquivo "A4 para imprimir em casa" põe os ingressos lado a lado com marcas de corte, e alguém
corta com tesoura. Em papelarias há A4 picotado e folhas de etiquetas, que dispensam o corte: cada
pedaço já sai separado. Fichas de 63 × 38 mm cabem exatamente numa etiqueta comum.

## Decisão

- O arquivo de casa tem um **papel** (`exports.paper`, `CreateExportBody.paper`), só para o tipo
  `home`: **A4 comum** com marcas de corte (o de sempre), **A4 picotado** em 3 (210 × 99), 4
  (105 × 148,5), 6 (105 × 99), 8 (105 × 74,25) ou 10 (105 × 59,4) partes, e as folhas de
  **etiquetas A4** de medidas comuns a várias marcas: 21 (63,5 × 38,1), 14 (99,1 × 38,1), 8
  (99,1 × 67,7) e 2 (199,6 × 143,5), com as margens e espaços padrão dessas folhas.
- `ticket_render::Paper` e `paper_grid` põem um ingresso por pedaço, centrado, sem marcas de corte.
  Se o ingresso cabe no pedaço, sai no tamanho real; senão é girado se ficar maior e reduzido
  (nunca ampliado) dentro de uma margem (5 mm no picotado, que chega à borda da folha; 1,5 mm na
  etiqueta). Um papel em que o QR ficaria abaixo de `MIN_QR_SIZE_MM` ou o ingresso abaixo de
  metade do tamanho é recusado (`paper_too_small`).
- `GET /api/events/{id}/papers` diz, para o desenho atual, em quais papéis ele cabe e quanto
  encolhe; o painel mostra "tamanho real", "sai em 79% do tamanho" ou "não cabe" e lembra de
  imprimir em 100%.
- Os testes do `render` imprimem fichas numa folha de 21 etiquetas e um ingresso reduzido, e leem o
  QR de volta (`rqrr`).

## Consequências

- As medidas são as das folhas mais vendidas; uma marca com medidas diferentes pode desalinhar, e
  o painel pede para conferir a embalagem e testar numa folha comum.
- O PDF da gráfica não muda: continua um ingresso por página com sangria.
