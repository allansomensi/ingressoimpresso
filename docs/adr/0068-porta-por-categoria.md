# 0068. Porta por categoria

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0007](0007-acesso-portaria.md) e [0056](0056-categorias-de-ingresso.md).

## Contexto

Eventos com camarote, VIP ou área de formandos têm entradas separadas. Hoje qualquer celular
aceita qualquer ingresso válido: o convidado de pista entra pela porta do VIP e ninguém percebe.
A regra não é do QR (a categoria vem das faixas de números, ADR 0056), então não pode mudar o
formato v1 nem a decisão do `DoorCore`.

## Opções consideradas

1. **Categoria dentro do QR.** Exige um formato novo e reimprimir tudo. Rejeitada.
2. **Bloqueio duro no celular.** Sem saída para o caso real de "a porta VIP está fechada, deixa
   entrar por aqui".
3. **Regra do link, aplicada pelo app, com exceção registrada.**

## Decisão

Opção 3.

- **Dados:** `door_access_categories (door_access_id, category_id)`; nenhuma linha = a porta
  aceita tudo. Escolhidas ao criar o link e editáveis depois
  (`PUT /api/door-accesses/{id}/categories`, área `door` da equipe). Excluir a categoria tira a
  restrição (sem categoria não há regra).
- **Manifesto:** `allowedCategoryIds`, as categorias com `id` e `priceCents`, e `doors` (as outras
  portas abertas com as suas categorias). Celulares do app antigo ignoram os campos novos.
- **No celular:** só se a porta tem categorias, o app chama `DoorCore.evaluate` antes. Ingresso
  autêntico, que entraria, de categoria não aceita: **não registra entrada**, grava (IndexedDB
  antes da tela) e sincroniza a leitura com o desfecho novo `rejected_wrong_door`, e mostra a
  tela amarela "OUTRA PORTA · VIP: entrada pela Porta 2" (as portas que listam a categoria; sem
  nenhuma, as que aceitam tudo). Número sem categoria entra normalmente. Ingresso já usado ou
  cancelado continua vermelho: a precedência do `DoorCore` vem primeiro.
- **Exceção:** "Deixar entrar mesmo assim" faz o `checkIn` normal (com confirmação online quando
  houver sinal) e grava a leitura como `admitted` com `exception = true`
  (`scans.door_exception`). O servidor só aceita a marca em leitura `admitted`.
- **Relatórios:** o "Ao vivo" (ADR 0071) conta as mandadas para outra porta e as liberadas.

## Consequências

- O formato v1, os vetores e a deduplicação não mudam; a regra é só do app.
- Uploads antigos continuam válidos (`exception` é opcional); o check de `local_outcome` ganhou o
  valor novo, que só o app novo envia.
- Um celular que ainda não sincronizou a mudança de categorias aplica a regra antiga até o
  próximo manifesto (segundos, com sinal).
