# 0038. Pronunciamentos e notificações

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0031](0031-novidades.md)

## Contexto

As novidades (ADR 0031) contam o que mudou no produto, mas não servem para avisos operacionais
(manutenção, mudança de preço) nem para avisar uma conta sobre algo que aconteceu com ela (imagem
recusada, crédito recebido). E-mail não é opção: a cota diária é pequena (ADR 0028).

## Decisão

- **Pronunciamentos** (`announcements`): título, texto, tom (`info`, `success`, `warning`,
  `critical`), botão opcional (caminho do site ou `https://`), início, fim e publicação.
  - `display = notification`: só no sininho.
  - `display = modal`: também abre uma janela na próxima vez que a pessoa entra no painel.
  - `announcement_receipts` guarda quem viu e quem fechou a janela; o admin vê o alcance.
  - Excluir um rascunho apaga; excluir um publicado só tira do ar (`archived_at`).
- **Notificações** (`notifications`) são de uma pessoa: `kind` e `data` em JSON, e o painel
  escreve o texto. São usadas para imagem recusada ou liberada (ADR 0042) e crédito adicionado
  (ADR 0040), e apagadas depois de 180 dias.
- O sininho faz um pedido só (`GET /api/inbox`) e, ao abrir, marca tudo como visto
  (`POST /api/inbox/read`). As novidades continuam no sininho, lidas do `localStorage` como antes.

## Consequências

- Não há segmentação de público: todo pronunciamento vale para todas as contas.
- Mudar a tabela de preços pode criar um pronunciamento automaticamente (ADR 0039).
