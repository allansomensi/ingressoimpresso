# 0027. Ciclo de vida do evento: duplicar, arquivar e excluir

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0005](0005-custodia-chaves.md) (cada cópia ganha a própria chave) e
  [0011](0011-modelo-dados-faixas.md)

## Contexto

Quem faz eventos recorrentes (um show por mês, o culto de todo ano, a festa junina da escola)
recriava tudo do zero. Eventos antigos se acumulavam na lista principal, e eventos de teste ou
criados por engano não tinham como sair. O status `closed` existia no banco desde a fase 3, sem
uso.

## Opções consideradas

1. **Copiar o evento inteiro (lotes e faixas incluídos).** Os números e as assinaturas seriam
   do evento antigo: o QR de um abriria a porta do outro. Inaceitável.
2. **Copiar só o que é configuração** (dados do evento, ingresso, vendedores) e gerar QR tag e
   chave novos; arquivar em vez de apagar o que já tem lote; apagar só o que nunca teve lote.

## Decisão

Opção 2.

- `POST /api/events/{id}/duplicate`: novo evento com nome "… (cópia)", local, datas, preço e
  fuso; a última versão do ingresso vira a versão 1 da cópia, com a arte copiada para o novo
  evento (dentro da cota de arte da organização); os vendedores vêm sem faixas. QR tag e chave de
  assinatura novos: ingressos de um evento nunca valem no outro. Lotes, faixas, cancelamentos,
  links da portaria e arquivos não são copiados.
- `PUT /api/events/{id}/status` com `closed` arquiva e com `active` reabre. Evento arquivado sai da
  lista principal (filtro "Arquivados") e não aceita lotes novos (`event_closed`); arquivos,
  relatório e portaria continuam funcionando.
- `DELETE /api/events/{id}` só apaga evento sem lotes (os cancelados não contam); senão responde
  `event_has_batches`. Lote pago nunca some: o caminho é arquivar.
- Uploads de arte que nenhum design salvo usa só são limpos depois de 2 horas, para o desfazer do
  editor e a troca de modelos não perderem a arte anterior.

## Consequências

- A exclusão em cascata leva chave, design, arte, vendedores e links da portaria; como não há lote
  pago, não há ingresso impresso nem pagamento a perder.
- A cópia ocupa espaço de arte de novo (bytes duplicados); a cota da organização vale para ela.
