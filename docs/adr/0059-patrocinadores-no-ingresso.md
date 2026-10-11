# 0059. Patrocinadores no ingresso

- **Status:** Aceito
- **Data:** 2026-10-11

## Contexto

Eventos pequenos se pagam com apoio do comércio local, que quer o logo no ingresso.

## Decisão

- `TicketDesign.sponsors`: uma faixa (posição, tamanho, título opcional, cor do título, fundo
  branco opcional) onde os logos ficam lado a lado, cada um ajustado à altura. Validação: dentro
  do ingresso, tamanho mínimo, título curto e longe do QR. Espelhada no painel.
- Os logos (até 6) são uploads do evento como a arte, guardados por id e em ordem na versão do
  design (`ticket_designs.sponsor_blob_ids`). Passam pela mesma moderação: logo em revisão ou
  recusado segura os arquivos (invariante 12) e não é copiado ao duplicar (invariante 17).
- No editor, a faixa é um elemento arrastável como o número e o QR.

## Consequências

- Logos com fundo transparente ficam melhores; o fundo branco resolve logos sobre arte colorida.
