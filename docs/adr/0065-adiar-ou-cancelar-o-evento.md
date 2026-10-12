# 0065. Adiar ou cancelar o evento

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0027](0027-ciclo-de-vida-do-evento.md) (arquivar) e
  [0007](0007-acesso-portaria.md) (links da portaria)

## Contexto

Chuva, problema no local ou atração que não vem: o evento muda de data ou não acontece. Hoje o
organizador edita a data no formulário (os links da portaria já acompanham) e avisa um por um.
Quem comprou não fica sabendo pelo ingresso no celular, o vendedor continua marcando vendas de um
evento cancelado e a portaria não sabe de nada. Arquivar (ADR 0027) não serve: arquivar é tirar da
lista um evento que já passou, não avisar que ele mudou.

## Opções consideradas

1. **Só editar a data e, para cancelar, arquivar.** Nada novo, mas ninguém é avisado e a data
   original se perde.
2. **Um estado novo em `events.status`** (`postponed`, `canceled`). Mistura com o arquivamento: um
   evento cancelado também pode ser arquivado depois.
3. **Ações próprias com campos próprios**: `postponed_from_starts_at` (a data original da primeira
   vez), `postponed_at`, `postpone_reason`, `canceled_at`, `cancel_reason`, independentes de
   `status`.

## Decisão

Opção 3. Ações no menu do evento, para a organização e para quem cuida de **Coordenação** na equipe
(`team::need` → `manage`); em modo suporte, a alteração vai para a auditoria como as outras.

- **Adiar** (`POST /api/events/{id}/postpone`): nova data de início e fim (no horário do evento) e
  um motivo opcional (uma linha, até 200 caracteres). Guarda a data original só na primeira vez:
  adiado de novo, o aviso continua dizendo "era 24 de outubro". Voltar para a data original desfaz
  o adiamento. Os links da portaria não revogados passam a vencer no novo fim + 12 h, inclusive os
  que já tinham vencido na data antiga. Recusa data igual (`same_dates`), já passada e evento
  cancelado (`event_canceled`). Antecipar também é aceito: o aviso diz "mudou de data".
- **Cancelar** (`POST /api/events/{id}/cancel`): motivo opcional. O evento ganha o selo
  "Cancelado" no painel e na lista (com os que já terminaram); o ingresso no celular e a página do
  vendedor mostram o aviso; o vendedor não marca mais vendas nem envia ingressos (desfazer uma
  venda continua possível); não dá para criar lote nem pagar (`event_canceled`); a portaria mostra
  a faixa "Evento cancelado" e **continua lendo**: quem decide é o organizador. Cancelar de novo só
  troca o motivo.
- **Desfazer cancelamento** (`POST /api/events/{id}/cancel/undo`), com confirmação.
- **Mensagem pronta**: depois de adiar ou cancelar, e a qualquer momento no aviso do evento, o
  painel mostra a mensagem para os vendedores repassarem (copiar ou abrir no WhatsApp): o que mudou,
  a nova data por extenso, o local, o motivo, o que fazer com o ingresso e o WhatsApp da
  organização, se houver (ADR 0064).
- **Sininho**: quem trabalha no evento (organização e equipe), menos quem fez a mudança, recebe
  `event_postponed` ou `event_canceled`; em modo suporte, sem o nome do admin.
- O formato do QR não muda e nenhum número é cancelado: o ingresso continua o mesmo.

## Consequências

- Os ingressos impressos continuam com a data antiga no papel; o diálogo de adiar avisa.
- A imagem do ingresso no celular (com a arte) passa a ser refeita quando a data, o local, o preço
  ou o nome mudam (antes só a versão do desenho mudava a chave do arquivo guardado).
- O que fazer com o dinheiro de um evento cancelado fica com o organizador (estornos do Ingresso
  Impresso continuam pelos ADRs 0032 e 0063, para os lotes; o dinheiro dos ingressos vendidos é
  combinado entre organização, vendedores e público).
