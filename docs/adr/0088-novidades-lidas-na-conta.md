# 0088. Novidades lidas ficam na conta

- **Status:** Aceito
- **Data:** 2026-10-16
- **Substitui em parte:** [0031](0031-novidades.md) ("lido" guardado só no `localStorage`)

## Contexto

O ADR 0031 guardou no navegador a data da novidade mais nova que a pessoa abriu. Na prática, quem
abre o sino, sai e entra de novo (outro navegador, o celular, o app instalado, uma janela anônima)
vê as mesmas novidades contadas outra vez como não lidas, enquanto as notificações e os
pronunciamentos do mesmo sino já ficam lidos na conta. O número do sino deve dizer o que a pessoa
ainda não viu, onde quer que ela entre.

## Opções consideradas

1. **Manter no navegador.** O problema continua.
2. **Uma linha por novidade lida** (como `announcement_receipts`). Precisão que ninguém usa: o
   sino só abre as novidades todas de uma vez.
3. **Uma data na conta**, igual à do navegador: `users.news_seen_at`.

## Decisão

Opção 3.

- `users.news_seen_at` (nulo: nenhuma vista). `GET /api/inbox` devolve `newsSeenAt`;
  `POST /api/inbox/read` aceita `newsSeenAt` opcional, que só anda para a frente e nunca passa de
  agora (`greatest(news_seen_at, least(…, now()))`).
- O painel conta as novidades depois da data mais recente entre a da conta e a do navegador. O
  navegador continua guardando a sua, para a página pública `/novidades` (que pode ser aberta sem
  login); quando a do navegador é mais nova, o sino a manda para a conta. Assim quem já tinha lido
  antes desta mudança não vê tudo de novo, e abrir `/novidades` logado também vale nos outros
  aparelhos depois que o sino carregar.
- Nada conta enquanto a caixa de entrada não carregou, para o número não piscar.

## Consequências

- Sair e entrar, ou trocar de aparelho, mostra só o que saiu depois da última leitura.
- A conta passa a guardar quando a pessoa leu as novidades: uma data, sem o conteúdo.
