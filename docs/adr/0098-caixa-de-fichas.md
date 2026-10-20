# 0098. Caixa de fichas

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0084](0084-fichas-de-consumo.md) (fichas de consumo),
  [0074](0074-link-do-vendedor-offline.md) (fila offline do vendedor) e
  [0069](0069-bilheteria-na-porta.md) (bilheteria)

## Contexto

Em festa junina e quermesse, as fichas são vendidas na hora, num caixa, e no fim da noite alguém
conta a gaveta. Marcar números um a um no link do vendedor não serve para a fila do caixa, e o
dinheiro, o Pix e o cartão precisavam de conta separada.

## Decisão

- Num evento de fichas, a organização (parte `money`) marca um vendedor como **caixa**
  (`sellers.cashier`; recusado em eventos de ingressos com `cashier_tickets`, onde existe a
  bilheteria).
- No link do caixa, os produtos (categorias) viram botões grandes: cada toque soma uma ficha; o
  caixa escolhe **Dinheiro**, **Pix** ou **Cartão**, vê o troco e registra. A página escolhe os
  menores números livres de cada produto e manda uma marcação comum da fila offline
  (`SellerOp::Mark` com `method`), então a venda funciona sem internet. A forma de pagamento fica
  em `ticket_sales.payment_method`.
- O **turno** é o conjunto das vendas ainda sem fechamento (`ticket_sales.closing_id` nulo), cada
  ficha pelo preço do seu produto. **Fechar caixa** (`POST /api/seller/cashier/close`, ou pelo
  painel em `POST /api/sellers/{id}/cashier/close`) exige internet e a fila vazia, grava em
  `cashier_closings` as somas por forma de pagamento e o dinheiro contado, e marca as vendas. Uma
  venda de turno fechado não é desfeita pelo caixa (`shift_closed`); a organização pode.
- A seção Vendedores mostra o card **Caixas**: o turno aberto, os fechamentos com a diferença
  (faltou, sobrou, confere) e o total por forma de pagamento.

## Consequências

- O acerto do vendedor continua o mesmo (quanto ele levou e devolveu); o caixa é um controle a
  mais, do dinheiro da gaveta.
- Pix e cartão do caixa são só anotação: a plataforma não confere nem recebe esses pagamentos.
