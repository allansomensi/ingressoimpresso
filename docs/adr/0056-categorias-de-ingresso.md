# 0056. Categorias de ingresso e a faixa colorida

- **Status:** Aceito
- **Data:** 2026-10-11

## Contexto

Eventos pequenos vendem inteira, meia-entrada, VIP e dão cortesias. O porteiro precisa saber de
longe que tipo de ingresso tem na mão (a meia pede documento), e o acerto com os vendedores não
pode cobrar o preço cheio de uma meia ou de uma cortesia.

## Opções consideradas

1. **Categoria no QR:** o porteiro veria a categoria na tela, mas o formato v1 é imutável
   (invariante 1) e o papel continuaria igual.
2. **Um lote por categoria:** junta duas coisas diferentes (pagamento da plataforma e tipo de
   ingresso) e não permite planejar antes de comprar.
3. **Categorias por faixa de números**, como os vendedores: o QR não muda; o papel ganha uma faixa
   colorida; o preço da categoria entra no acerto.

## Decisão

Opção 3.

- `ticket_categories` (nome, cor `#rrggbb`, preço opcional: nulo usa o preço do evento, zero é
  cortesia) e `category_ranges` (`int4range`, exclusão por evento: um número tem no máximo uma
  categoria). As faixas podem ser planejadas antes dos lotes.
- **Impressão:** a faixa da categoria (`TicketDesign.band`, borda e espessura) sai só nos
  ingressos com categoria ou mesa (ADR 0057), com o texto em preto ou branco conforme a cor
  (`ink_for`, espelhado em `inkFor`). Sem faixa escolhida, `effective_band` usa 6 mm na primeira
  borda livre do QR (e dos patrocinadores, ADR 0059). A validação recusa uma faixa sobre o QR. O
  canhoto mostra a categoria ao lado do número.
- **Acerto:** o valor a acertar de cada número é o preço da categoria, senão o do evento; o
  relatório ganha o quadro "Por categoria" e a página do vendedor mostra as linhas por preço.
- A portaria, o ingresso digital e a página do vendedor mostram a categoria com a cor.
- Categorias definem preços: são da Coordenação na equipe (ADR 0055).

## Consequências

- Ingressos já impressos não mudam se a categoria mudar depois: a faixa é do papel.
- Duplicar um evento leva as categorias e as faixas de números.
