# 0091. Evento de vários dias

- **Status:** Aceito
- **Data:** 2026-10-19
- **Complementa:** [0006](0006-portaria-offline-sync.md), [0056](0056-categorias-de-ingresso.md),
  [0077](0077-evento-com-varias-datas.md) e [0083](0083-saida-e-volta.md).
- **Muda:** a invariante 3 passa a dizer "por número **e por livro**" (ver abaixo); o QR não muda.

## Contexto

Festival de fim de semana, encontro de dois dias com janta, congresso, campeonato: o mesmo público
volta no dia seguinte com o **mesmo ingresso**. O ADR 0077 resolveu outra coisa, sessões
independentes (a peça em três noites), em que cada data é um evento com chave, lotes e portaria
próprios. Usado para um passe de dois dias, ele obriga a imprimir dois papéis, dois lotes, dar
dois links a cada vendedor e cadastrar o preço pela metade em cada data. E não há como dizer
"1 dia, à escolha de quem compra".

## Opções consideradas

1. **Série de datas (ADR 0077).** Funciona, mas é o trabalho e os erros descritos acima.
2. **Um evento com dias, deduplicação por dia no núcleo.** Mudaria `DoorState` e o formato dos
   vetores para algo que é regra de agenda, não de criptografia.
3. **Um evento com dias, e o app guarda um `DoorCore` por "livro".** O núcleo continua decidindo
   exatamente como hoje dentro de cada livro; o app escolhe o livro pela regra da categoria e pelo
   dia.

## Decisão

Opção 3.

### Dados

- `event_days (event_id, position, starts_at, ends_at)`: de 2 a 31 dias, em ordem, sem sobrepor,
  cada um com o fim depois do início e no máximo 48 horas. Um evento sem linhas é de um dia, como
  sempre. Com dias, `events.starts_at` é o início do primeiro e `events.ends_at` o fim do último
  (o servidor mantém).
- Regra de cada categoria (`ticket_categories.day_rule`, `valid_days`):
  - **`every`**, todos os dias (padrão): uma entrada por dia;
  - **`days`**, só nos dias escolhidos (`valid_days`): uma entrada por dia escolhido;
  - **`any_one`**, um dia, à escolha: uma entrada no evento todo, no dia em que a pessoa vier.
  Número sem categoria vale todos os dias. Num evento sem dias, a regra é ignorada.
- O painel define os dias no formulário do evento ("O evento dura mais de um dia"), com um dia
  sugerido a partir do anterior. Tirar um dia que já tem entradas é recusado (`day_has_entries`);
  as regras que citavam um dia tirado perdem esse dia (sem nenhum, voltam a `every`).
- Duplicar, criar outra data (ADR 0077) e adiar (ADR 0065) levam os dias deslocados pelo mesmo
  intervalo do início.

### O dia da portaria

- O dia vem do relógio do celular **corrigido pelo do servidor** (`offsetMs`, ADR 0006), que
  funciona offline. A fronteira entre dois dias é o meio do intervalo entre o fim de um e o início
  do outro (a festa que passa da meia-noite continua no sábado); antes do primeiro dia vale o
  primeiro, depois do último, o último. A mesma regra está em `lib/event-days.ts` e
  `event_days.rs`.
- O topo da portaria mostra **"Sábado 21/11 · dia 1 de 2"**. Um relógio do celular com mais de 5
  minutos de diferença do servidor ganha um aviso (o app já usa a hora do servidor).

### Livros

- Um **livro** é um conjunto de entradas deduplicado à parte: o livro de cada dia (`ledgerDay`) e
  o livro do evento todo (sem dia). `every` e `days` usam o livro do dia; `any_one` usa o do
  evento todo. Evento sem dias: só o livro do evento todo, como hoje.
- O app guarda um `DoorCore` por livro, com as mesmas chaves, cancelamentos e saída e volta; a
  decisão dentro de cada um é a de sempre. Um número de categoria que não vale hoje recebe a tela
  amarela **"NÃO VALE HOJE · vale só no domingo, 22/11"** (`rejected_wrong_day`), com "Deixar entrar
  mesmo assim", registrado como exceção (`exception_kind = wrong_day`), como a porta errada
  (ADR 0068).
- Um "1 dia, à escolha" que entrou no sábado e volta no domingo vê **"JÁ ENTROU no sábado às
  18:10"**.

### Servidor

- `scans` ganha `day` (o dia em que foi lido) e `ledger_day` (o livro; nulo é o evento todo).
  A confirmação online e a classificação usam `door_ledger_entries (event_id, ticket_number,
  checkpoint, ledger_day)`, o novo cadeado por livro; as entradas antigas viram o livro do evento
  todo. `entries` continua sendo "o número já entrou no evento" (relatório, "vendido = entrou" da
  bilheteria, segunda via, Resultados), agora preenchida por qualquer livro de entrada.
- **Invariante 3:** a deduplicação usa `(event_id, ticket_number)` **dentro de um livro**, nunca
  os bytes do QR.
- O manifesto traz `days`, a regra de cada faixa de categoria e o `day`/`ledgerDay` de cada
  entrada (opcionais). O app antigo lê tudo como um livro só: num evento de dias, o passe vira
  "JÁ ENTROU" no segundo dia, ou seja, fica mais restrito, nunca mais permissivo.
- Ao vivo e relatório mostram as entradas por dia e de hoje.

### Público

- O ingresso digital e `/conferir` dizem onde o ingresso vale ("Vale no sábado 21/11 e no domingo
  22/11, uma entrada por dia"; "Vale um dia, à escolha").
- O campo `{dias}` imprime os dias no ingresso ("21 e 22 de novembro de 2026"), nos dois lados
  (`fields.rs`, `lib/ticket-fields.ts`); o editor sugere trocar a data por ele.

## Consequências

- Um papel, um lote, um link por vendedor e o preço inteiro da categoria para o passe.
- Os vetores e o formato do QR não mudam. A regra de qual livro usar vive no app (como a porta por
  categoria) e no servidor, com os mesmos testes de exemplo.
- Mudar a regra de uma categoria com a portaria aberta vale a partir da próxima leitura; as entradas
  já gravadas ficam no livro em que entraram.
- A série de datas (ADR 0077) continua sendo o caminho para sessões com públicos diferentes; o
  diálogo de outra data explica a diferença.
