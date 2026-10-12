# 0066. Agenda, como chegar e "onde fica minha mesa" no ingresso digital

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0030](0030-ingresso-digital.md) (ingresso digital) e
  [0057](0057-mesas-e-lugares.md) (mesas e lugares)

## Contexto

O ingresso no celular mostra o QR e a data, mas quem comprou ainda pergunta "qual o endereço?",
esquece a data e, numa formatura ou num jantar, chega sem saber onde fica a mesa. O evento só tem
um campo "local" (o nome do lugar), sem endereço.

## Opções consideradas

1. **Arquivo `.ics` e links gerados no servidor.** Precisa de internet na hora; o ingresso já abre
   sem internet (ADR 0030).
2. **Tudo gerado no navegador** a partir do que o ingresso já guarda no aparelho, com o layout das
   mesas vindo junto do ingresso.
3. **Mapa com a ocupação das mesas.** Mostraria quem senta onde: não é dado do portador.

## Decisão

Opção 2, sem ocupação.

- **Endereço do local**: `events.address` (opcional, até 200 caracteres, uma linha) no formulário
  do evento; vem do perfil da organização num evento novo (ADR 0064).
- **Adicionar à agenda**: arquivo `.ics` (RFC 5545) feito no navegador, com `UID` estável por
  evento e número (adiar e salvar de novo atualiza a mesma entrada; `SEQUENCE` cresce a cada
  adiamento), `DTSTART`/`DTEND` em UTC, `LOCATION` com local e endereço, textos escapados, linhas
  dobradas em 75 bytes, CRLF e um lembrete 2 horas antes. Funciona sem internet; no Android e no
  iPhone, abrir o arquivo oferece salvar na agenda. Com internet aparece também **Google Agenda**
  (link `calendar.google.com/calendar/render?action=TEMPLATE`).
- **Como chegar**: Apple Maps no iPhone e Google Maps nos outros, com local e endereço; só aparece
  se houver um dos dois. Evento cancelado não oferece agenda nem rota.
- **Onde fica a sua mesa**: quando o número tem lugar, `POST /api/ticket` traz `tableMap` com
  todas as mesas do evento (nome, forma, lugares, posição; nunca quem senta) e a mesa e o lugar do
  portador. O desenho (SVG) reaproveita o mapa da aba Mesas, ampliado na parte do salão que tem
  mesas (até 2,2 vezes), com as mesas 1,4 vez maiores, os nomes sem o prefixo comum ("Mesa 1",
  "Mesa 2" → "1", "2"), a mesa do portador em destaque e o lugar dele marcado. Fica guardado com o
  ingresso, então abre sem internet.
- **Adiado ou cancelado** (ADR 0065): o aviso aparece no topo do ingresso, com a nova data e a
  original; o `.ics` usa a data nova.
- A lógica fica em `lib/calendar.ts`, `lib/seat-map.ts` e `lib/event-change.ts`, testada no
  Vitest. Ingressos guardados no aparelho antes desta versão continuam abrindo
  (`normalizePass` completa o que falta).

## Consequências

- O ingresso no celular revela o desenho do salão a quem tem um ingresso com lugar. É o que a
  pessoa veria ao entrar; nomes de quem senta nunca saem do servidor.
- O mapa depende de o organizador ter arrumado as mesas na aba Mesas; as criadas em lote ficam numa
  grade, o que já basta para achar "a 4ª mesa da primeira fileira".
