# 0070. Lista de nomes na porta

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0006](0006-portaria-offline-sync.md) e [0055](0055-equipe-do-evento.md).

## Contexto

Convidados, imprensa, banda e família entram sem ingresso, por uma lista de nomes no papel. Na
porta, com fila e pouca luz, ninguém acha o nome; dois porteiros deixam a mesma pessoa entrar
duas vezes; e o organizador não sabe quem chegou. A lista precisa funcionar sem sinal, como a
leitura dos ingressos.

## Opções consideradas

1. **Lista em PDF.** Simples, mas sem busca, sem registro e sem convergência.
2. **Busca online no servidor.** Falha justamente sem sinal.
3. **Lista inteira no celular e chegadas como mais um G-Set**, com o mesmo cursor seguro.

## Decisão

Opção 3.

- **Dados:** `guest_list` (nome ≤ 80, acompanhantes 0–20, observação ≤ 120, categoria opcional,
  criado por) e `guest_arrivals` (id gerado no celular, convidado, celular, pessoas 1–21, hora
  corrigida, `undone_at`, `txid xid8`). Até 2.000 nomes por evento.
- **Painel:** aba **Lista** no grupo "No dia" (editar é da área `door` da equipe; ler é de
  todos): busca sem acento, filtros Todos/Chegaram/Faltam, adicionar, colar vários (um por linha,
  "Nome +2", marcadores de lista ignorados, linhas inválidas apontadas), editar, remover e ver
  quem chegou, quando e por qual celular.
- **Manifesto:** o celular manda `guests=<versão>`; a lista inteira só vem quando a versão
  (contagem + md5 dos ids e `updated_at`) mudou. App antigo não manda e não recebe. As chegadas
  vêm por `guestArrivals`, na mesma janela `[since, xmin)` das entradas.
- **No celular:** botão **Lista** abre a busca offline (sem acento, sem caixa, início das
  palavras do nome ou da observação). "Chegou" pergunta quantas pessoas (1 até o que falta do
  grupo), grava no IndexedDB **antes** da tela e envia por `POST /api/door/guests` (idempotente
  pelo id; lote de até 500).
- **Convergência:** cada celular calcula o mesmo estado do mesmo conjunto: a primeira chegada não
  desfeita (hora corrigida, empate pelo id) é "chegou às 21:03 · Porta 2", e as pessoas somam
  até o tamanho do grupo. Duas chegadas offline do mesmo grupo não dobram a contagem.
- **Desfazer:** no mesmo celular, até 2 minutos. O app reenvia a chegada com `undoneAtMs`; o
  servidor só aceita do celular que a gravou e dentro da janela (com folga), marca `undone_at` e
  dá à linha um **`txid` novo**, para que o cursor a entregue de novo a todos. Uma transação que
  ainda não terminou tem `txid` ≥ `xmin`, então a atualização nunca fica antes de um cursor já
  servido.
- **Convidado removido:** a chegada enviada depois é descartada (`kept: false`), sem travar a
  fila do celular.
- **LGPD:** a lista entra no "exportar meus dados" e sai ao excluir a conta.

## Consequências

- A lista é pequena e baixa só quando muda; o sync a cada 3 s continua leve.
- Desfazer usa atualização em vez de linha nova, mas o cursor continua seguro (ver acima).
- Quem entra pela lista não é ingresso: não aparece em `entries` nem no acerto.
