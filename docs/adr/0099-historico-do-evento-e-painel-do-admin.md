# 0099. Histórico do evento, funil e "acontecendo agora" no admin

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0055](0055-equipe-do-evento.md) (equipe), [0032](0032-controle-do-admin.md)
  (modo suporte) e [0071](0071-portaria-ao-vivo.md) (ao vivo)

## Contexto

Com a equipe mexendo no evento, a coordenação precisava saber quem mudou o quê. E o admin só via
totais: não sabia onde as contas novas param nem quais portarias estavam com problema naquela
noite.

## Decisão

- **Histórico:** `routes::event_access` anota a alteração que deixa passar (quem, qual evento,
  método e forma do caminho, se foi suporte) num slot `task_local` da requisição; uma camada da
  API grava a anotação em `event_activity` só quando a resposta é de sucesso (`activity.rs`). Nada
  precisa ser passado aos handlers. A seção Equipe mostra o histórico com o texto de cada ação
  (`texts.history.actions`, pela forma do caminho) e o filtro "Só a equipe". `jobs::prune` apaga o
  que passou de um ano.
- **Funil:** `GET /api/admin/funnel?days=` mostra, para as organizações criadas no período, quantas
  chegaram a criar evento, salvar o ingresso, pegar um lote, pagar e ler na porta, com a mediana
  de dias até cada passo.
- **Acontecendo agora:** `GET /api/admin/live` lista os eventos que começam nas próximas horas, os
  que estão acontecendo e os que acabaram há pouco, com o que precisa de atenção na porta
  (celular sem sincronizar, leituras paradas, muitas leituras inválidas).

## Consequências

- O histórico registra a forma da rota, nunca o corpo: nada de dado pessoal novo é guardado.
- Uma alteração feita fora de `event_access` (rotas sem evento) não entra no histórico.
