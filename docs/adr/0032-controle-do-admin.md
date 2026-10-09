# 0032. Controle do admin: modo suporte, auditoria, suspensão e estorno

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0026](0026-painel-admin-e-conta.md) (que deixava as ações só no log)

## Contexto

Para ajudar um organizador, o admin precisava das telas dele: o evento de outra organização
respondia 404 até para admins. Faltavam ações de operação (suspender quem frauda, estornar um lote
dentro do prazo de arrependimento, dar desconto num lote) e um registro de quem fez o quê.

## Opções consideradas

1. **Personificar o usuário (entrar como ele).** Simples, mas apaga quem fez cada ação.
2. **Modo suporte:** o admin abre qualquer evento com as telas do organizador, com aviso visível,
   e toda alteração fica numa tabela de auditoria.

## Decisão

Opção 2.

- `event_access` (routes/mod.rs) deixa admins abrirem qualquer evento; o `GET` do evento diz
  `supportAccess`. Toda requisição que altera algo nesse modo grava `support_write` em
  `audit_log`, com método e caminho. As ações exclusivas de admin (marcar como pago, cortesia,
  suspender, renomear, encerrar sessões, estornar, mudar preço, novidades) também gravam.
- **Suspensão** (`organizations.suspended_at`, com motivo): a conta entra e lê, mas qualquer
  outra requisição responde `account_suspended`, menos sair e excluir a conta. A portaria segue
  funcionando.
- **Estorno** (`POST /api/admin/batches/{id}/refund`): o lote vira `refunded`, os números
  continuam ocupados (a restrição de exclusão só ignora `canceled`) e ganham um cancelamento
  permanente; opcionalmente o dinheiro volta pela Stripe (`/v1/refunds`, com idempotência pelo
  lote). Um número de lote estornado nunca volta a valer, nem em outro lote.
- **Preço** (`PUT /api/admin/batches/{id}/price`): fecha o checkout aberto e muda o valor; zero
  libera o lote na hora.
- Telas: abas Financeiro, Organizações (com página de detalhe: pessoas, eventos, histórico),
  Lotes (marcar como pago, mudar preço, estornar), Novidades e Auditoria.

## Consequências

- A lista de `ADMIN_EMAILS` vale como acesso total: deve ser curta.
- Leituras em modo suporte não são registradas, só alterações.
