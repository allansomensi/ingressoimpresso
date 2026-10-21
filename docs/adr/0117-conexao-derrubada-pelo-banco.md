# 0117. Conexão derrubada pelo banco é 503, não 500

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0013](0013-infraestrutura-render-neon.md) (Render e Neon) e
  [0103](0103-alertas-e-resumo-diario-dos-admins.md) (alertas dos admins)

## Contexto

Em 2026-10-21 o Neon encerrou as conexões da API ("terminating connection due to administrator
command", código `57P01`), como faz quando a compute reinicia ou é suspensa. As requisições que
pegaram essas conexões no pool responderam 500 de uma vez, e o alerta de erros 500 disparou. O
painel já repetia as leituras e ninguém precisava agir: era um alarme falso.

O pool só testa uma conexão parada há 30 s (`before_acquire` em `main.rs`); as que tinham acabado de
responder voltaram ao uso mortas.

## Decisão

- `db_health::is_dropped_connection`: `57P01`, `57P02` e `57P03`, e o socket que acaba no meio da
  consulta, viram `ApiError::Unavailable("database_reconnecting")` (503, registrado como aviso).
  O alerta conta só 500, e o painel repete o 503 sozinho.
- Ao ver uma conexão derrubada, o servidor anota a hora; o `before_acquire` passa a pingar também
  toda conexão devolvida ao pool antes dessa hora. Um ping que falha descarta a conexão e o sqlx
  pega outra, então só as requisições que já estavam em andamento falham.
- Banco fora do ar de verdade continua 500 (o pool não consegue conexão nova) e continua alertando.

## Consequências

- Reinícios do Neon não acordam ninguém; uma queda real ainda acorda.
- Uma gravação que pega a conexão derrubada responde "tente de novo": ela não foi aplicada, porque
  a conexão morreu antes ou a transação foi desfeita.
