# 0092. Pontos de controle (janta, kit, open bar)

- **Status:** Aceito
- **Data:** 2026-10-19
- **Complementa:** [0068](0068-porta-por-categoria.md), [0084](0084-fichas-de-consumo.md) e
  [0091](0091-evento-de-varios-dias.md).

## Contexto

Muitos eventos dão algo a mais para alguns ingressos: a janta para quem pagou "com janta", o kit do
congresso, o open bar do camarote, o almoço do campeonato. Hoje isso é conferido pela cor da faixa
a olho (sem impedir que alguém jante duas vezes) ou com fichas de consumo (ADR 0084), que são mais
papel para imprimir, entregar e perder.

## Opções consideradas

1. **Fichas de consumo.** Funcionam, mas cada benefício é outro evento, outro papel e outro lote.
2. **Uma porta por categoria (ADR 0068) para a janta.** Mistura janta e entrada: quem jantou
   "já entrou".
3. **Pontos de controle**: o mesmo QR do ingresso é lido de novo num ponto com o seu próprio
   registro, que nunca se mistura com o da entrada.

## Decisão

Opção 3, nos eventos de ingressos.

- **Dados:** `event_checkpoints (id, event_id, name, instruction, per_day, position)`, até 10 por
  evento; `checkpoint_categories (checkpoint_id, category_id)`: as categorias com direito
  (nenhuma: todo ingresso tem direito). `door_accesses.checkpoint_id`: um link é de **entrada** ou de
  **um ponto**. Apagar o ponto apaga os seus links, celulares e registros (o diálogo avisa).
- **Quantas vezes:** `per_day` (padrão) dá um uso por dia em que o ingresso vale (ADR 0091): o
  passe janta no sábado e no domingo; "1 dia, à escolha" janta uma vez. Sem `per_day`, um uso no
  evento todo (o kit). Evento sem dias: um uso.
- **Na portaria:** o link de um ponto abre o app com o nome do ponto no topo ("PONTO DE CONTROLE ·
  Janta"). O mesmo QR dá:
  - **"JANTA LIBERADA"** (verde, com a instrução do ponto, ADR 0089);
  - **"JÁ USOU A JANTA · hoje às 20:15 no Balcão 1"** (vermelho);
  - **"SEM DIREITO À JANTA"** (amarelo, com a categoria), com "Liberar mesmo assim", registrado
    como exceção (`exception_kind = not_entitled`);
  - "não vale hoje", cancelado, falso ou de outro evento como na entrada.
  A decisão é do `DoorCore`, num livro só do ponto (ADR 0091): offline, convergente e com a
  confirmação online de sempre.
- **Servidor:** novos desfechos `benefit_granted`, `rejected_benefit_used` e
  `rejected_not_entitled`; `scans.checkpoint_id` vem do link do celular, nunca do app. O primeiro
  uso é classificado como uma entrada, no cadeado `door_ledger_entries` do ponto. Um uso **nunca**
  conta como entrada (`entries`, relatório, bilheteria) e o manifesto de um ponto só traz os usos
  dele (e o da entrada, só as entradas).
- **Painel:** os pontos ficam na seção Portaria (criar, renomear, instrução, quem tem direito,
  uma vez por dia ou uma vez só); o link novo pergunta "Entrada ou ponto de controle". O Ao vivo e
  o relatório mostram, por ponto, quantos têm direito, quantos usaram (hoje e no total) e as
  recusas. O card **O que falta** cobra um link ativo para cada ponto.

## Consequências

- Um papel só por pessoa, e ninguém janta duas vezes com o mesmo ingresso.
- O formato v1, os vetores e a decisão do núcleo não mudam: um ponto é mais um livro.
- Fichas de consumo continuam para vender comida e bebida avulsas (ADR 0084): um evento de fichas
  não tem pontos de controle.
