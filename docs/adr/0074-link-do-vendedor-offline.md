# 0074. Link do vendedor offline

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0053](0053-link-do-vendedor.md) e [0030](0030-ingresso-digital.md).

## Contexto

O vendedor usa só o celular, na rua, na escola, no ônibus, muitas vezes sem sinal. A página do
link (ADR 0053) precisava de internet para abrir e para marcar cada venda; sem sinal, a venda ia
para o caderno e muitas vezes não voltava para o sistema. Ao mesmo tempo, o mesmo link pode estar
aberto em dois aparelhos, e o organizador pode devolver ou tirar números enquanto o vendedor está
offline.

## Opções consideradas

1. **Só online, com aviso:** simples, mas é exatamente onde o vendedor mais precisa.
2. **Sincronização completa com resolução automática (CRDT):** pesada para o que muda aqui.
3. **Fila local de alterações com ids do aparelho, aplicadas uma vez no servidor, que responde o
   que não pôde fazer.**

## Decisão

Opção 3.

- **Abrir sem internet:** o `public/sw.js` guarda `/vendedor` como já guarda `/ingresso` (página e
  arquivos de build, renovados a cada visita online; cache `app-v4`), sem tocar a portaria. A
  página guarda no `localStorage` a última resposta do servidor, numa chave que é um hash do token
  (`storageKey`): o token continua só no fragmento e no corpo das requisições, nunca no
  armazenamento, na URL do servidor nem em logs (o espírito da invariante 11). Uma página aberta
  com CSP de nonce é guardada com o próprio cabeçalho, então o nonce continua batendo (ADR 0048).
- **Fila:** toda alteração da página (marcar e desfazer venda, editar comprador, reservar,
  cancelar reserva e vender a reserva) vira um item com id criado no aparelho, guardado no
  `localStorage` antes de qualquer envio e aplicado na tela com as mesmas regras do servidor
  (`lib/seller-offline.ts`). Online, a fila é enviada na hora; offline, quando a conexão volta
  (evento `online`, volta à aba e nova tentativa a cada 20 s).
- **`POST /api/seller/sync`** (sem login, limite `SELLER_WRITE`, respeita manutenção e organização
  suspensa): até 50 alterações por vez, em ordem, cada uma na sua transação. O id de cada uma é
  gravado em `seller_sync_ops` com a resposta: a mesma alteração enviada de novo (resposta
  perdida, aparelho que reconecta duas vezes, duas tentativas ao mesmo tempo) não faz nada e
  recebe a mesma resposta. A resposta traz a página atualizada e, por alteração, `applied`,
  `partial` ou `rejected` com os números deixados de fora e o motivo (`already_sold`, `not_held`,
  `voided`, `reserved`, `expired`, `event_canceled`, `box_office`, `invalid`). As respostas
  guardadas saem depois de 30 dias.
- **Conflitos:** cada alteração é conferida com o estado de agora, número a número. Venda de um
  número já vendido em outro aparelho não sobrescreve (só a edição do comprador muda quem
  comprou); a página explica em português simples ("O 0042 já tinha sido marcado como vendido em
  outro aparelho (para Bia). Ficou como estava."), numa janela que fica até o vendedor tocar em
  **Entendi**, mesmo se fechar a página.
- **Indicadores:** "Sem internet · 3 alterações para enviar", "Enviando…" e o motivo quando o
  servidor está em manutenção; os números com alteração pendente têm um ponto na grade. Criar o
  ingresso no celular (ADR 0061) continua precisando de internet e da venda já enviada.
- **Link desativado** com alterações na fila: a página mostra a lista do que não foi enviado, para
  o vendedor repassar ao organizador.
- **Teste:** `e2e/vendedor.e2e.mjs` (no `just e2e`) abre o link, perde o sinal, reabre a página
  pelo service worker, marca e reserva offline, outro "aparelho" vende o mesmo número, e confere a
  fila enviada uma vez, o conflito explicado e que o token não fica no aparelho nem no log da API.

## Consequências

- O vendedor marca na hora em que vende, com ou sem sinal, e a palavra dele chega ao organizador.
- A tela offline é uma previsão: o servidor decide, e o que não deu certo é explicado.
- `POST /api/seller/sales` e `/undo` continuam valendo (páginas abertas antes da atualização), com
  a venda apagando a reserva do número.
