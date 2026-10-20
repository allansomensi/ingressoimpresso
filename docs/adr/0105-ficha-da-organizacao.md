# 0105. Ficha da organização: anotações, etiquetas e linha do tempo

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0032](0032-controle-do-admin.md) (modo suporte) e
  [0079](0079-admin-alcanca-todos-os-recursos.md)

## Contexto

O suporte precisava montar a história de uma conta de memória ou abrindo várias telas: quando
entrou, o que comprou, que e-mails recebeu, que cupom usou, o que outro admin já combinou com ela.
Também não havia como separar clientes (igreja, VIP, atenção) nem achar quem está sumindo.

## Decisão

- **Anotações internas** (`organization_notes`): texto de até 2.000 caracteres, autor, fixar no
  topo, editar e apagar. Só admins veem; cada ação vai para a auditoria (sem o texto).
- **Etiquetas** (`organizations.admin_tags`, até 10, minúsculas, 1–30 caracteres, índice GIN):
  editadas na ficha, filtro na lista de organizações (`?tag=`) e contagem por etiqueta
  (`GET /api/admin/organizations/tags`). Também servem de público para comunicados (ADR 0107).
- **Linha do tempo** (`GET /api/admin/organizations/{id}/timeline?before=`, 100 por página):
  montada na hora com `union all` das tabelas que já registram cada coisa (cadastro, membros,
  sessões, eventos, lotes criados/pagos/estornados, contestações, e-mails para os membros exceto
  códigos, crédito, cupons, ações de admin e anotações). Nenhuma tabela nova de eventos: o que já
  está gravado é a fonte. O painel agrupa em Dinheiro, Uso, E-mails e Admins.
- **Última atividade** na lista e na ficha: o maior entre o último acesso de um membro e o último
  lote. Conta que já pagou e está parada há mais de 60 dias ganha o selo **Esfriando**.

## Consequências

- Os acessos só aparecem enquanto a sessão existe (a limpeza horária apaga as vencidas); o último
  acesso de cada pessoa continua em `users.last_login_at`.
- A linha do tempo não tem índice próprio: cada ramo filtra pela organização, com os índices que
  já existem.
