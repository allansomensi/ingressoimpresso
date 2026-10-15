# 0083. Saída e volta

- **Status:** Aceito
- **Data:** 2026-10-15
- **Complementa:** [0006](0006-portaria-offline-sync.md), [0018](0018-portaria-pwa.md) e
  [0068](0068-porta-por-categoria.md).

## Contexto

Formaturas, campeonatos e festas longas deixam o convidado sair (fumar, buscar algo no carro,
trocar de quadra) e voltar. Até aqui um ingresso entrava uma vez: na volta, "JÁ ENTROU", e o
porteiro tinha de escolher entre barrar quem é de verdade ou ignorar a tela (e deixar a cópia
entrar também). A decisão é do `DoorCore` e tem de continuar offline e convergente entre
celulares (ADR 0006).

## Opções consideradas

1. **Carimbo na mão / pulseira.** Fora da plataforma; não impede a cópia de entrar enquanto o
   dono está fora.
2. **Desligar a deduplicação.** Qualquer cópia entra.
3. **Registrar a saída e decidir pela última passagem.** O ingresso que saiu volta; uma cópia
   continua barrada enquanto o ingresso está dentro.

## Decisão

Opção 3, ligada por evento (`events.reentry`, padrão desligado; "Saída e volta" na aba Portaria,
área `door` da equipe, `PUT /api/events/{id}/door-settings`). Duplicar o evento leva a chave.

### Núcleo (`ticket-core`)

- Cada ticket tem duas informações que convergem em qualquer ordem: a **primeira entrada** (a
  mais antiga, como sempre) e a **última passagem** (`Movement`: hora, celular, `In`/`Out`), um
  registro *last-writer-wins* pela ordem total (hora, nome do celular, saída depois de entrada).
- `DoorState::set_reentry` liga a regra. Desligada, nada muda: saídas são guardadas e
  ignoradas, e todos os vetores antigos continuam idênticos.
- **Entrada** (`check_in`), com a regra ligada: cancelado → `Voided`; nunca entrou → `Admit`;
  última passagem é saída → `Readmit { exited }` (verde, "Voltando · saiu às 22:10 pela Saída");
  senão → `AlreadyEntered` com a entrada que vale agora ("JÁ ESTÁ LÁ DENTRO").
- **Saída** (`check_out`): cancelado → `Voided` (não poderia voltar); última passagem é saída →
  `AlreadyOut` (lido duas vezes, nada registrado); senão → `Exit` (registrada). Um ingresso que
  este celular nunca viu entrar também sai: a entrada pode estar num celular que não sincronizou.
- `inside_count`: entraram e a última passagem não é saída.
- Vetores escritos à mão (invariante 9): os casos ganharam `reentry`, `exits` e `direction`
  opcionais; 15 casos novos cobrem volta, cópia dentro, saída mais antiga que a entrada, empate,
  cancelado, saída repetida, saída sem entrada e QR inválido na saída. Propriedades: convergência
  em qualquer ordem e "no máximo uma vez dentro" num celular.

### Servidor

- Novos desfechos de leitura: `readmitted`, `exited` e `rejected_already_out`; nova classe
  `reentry`. Entradas (primeiras e voltas) são classificadas sob a mesma trava por ticket (a linha
  de `entries`, `for update`): cancelado → `void_entry`; primeira → `first_entry`; a última
  passagem anterior (mesma ordem do núcleo) é saída e o evento permite → `reentry`; senão →
  `duplicate_entry`, com a entrada que vale agora. Uma `admitted` de um celular que não sabia da
  primeira entrada, depois de uma saída, também vira `reentry`.
- Saídas não são confirmadas online (só podem afrouxar a regra depois) e não têm classe.
- Manifesto: `entries` passa a trazer as voltas e `exits` traz as saídas, pelo mesmo cursor
  (`xid8`). O app antigo lê só `entries`: uma volta é para ele uma entrada a mais (a primeira
  continua valendo), ou seja, fica mais restrito, nunca mais permissivo.
- "Ao vivo": lá dentro agora, fora (podem voltar), saídas lidas e voltas.

### App da portaria

- Com a regra ligada, o celular escolhe **Entrada** ou **Saída** (guardado no aparelho). A saída
  é azul em tudo (chave, faixa no topo, moldura da câmera, tela de resultado) para nunca ser
  confundida com a entrada. O contador mostra "N dentro".
- Saídas são gravadas no IndexedDB antes da tela (invariante 6), no mesmo depósito das entradas
  (marcadas `exit`), sem nova versão do banco local.
- Voltas passam pela porta por categoria (ADR 0068) e pela confirmação online como uma entrada.

## Consequências

- O formato do QR, `(event_id, ticket_number)` e a decisão sem a regra não mudam.
- Sem sinal, duas voltas do mesmo ingresso em celulares diferentes podem entrar (o mesmo risco
  das entradas offline, ADR 0006); o "Ao vivo" e o relatório mostram depois.
- Uma cópia pode entrar enquanto o dono está fora; quando o dono voltar, é barrado. A regra
  garante um ingresso dentro por vez, não quem está com ele.
- Desligar a regra no meio do evento faz todo ingresso que entrou voltar a ser "já entrou".
