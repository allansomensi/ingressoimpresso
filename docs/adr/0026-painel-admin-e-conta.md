# 0026. Painel de administração, cortesias e página da conta

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0014](0014-pagamento-pix-adiado.md) e [0024](0024-precos-acessiveis-e-ingressos-gratis.md)

## Contexto

Os administradores (`ADMIN_EMAILS`) só tinham um botão "Marcar como pago" dentro de cada evento,
e só viam um evento se fossem membros da organização. Para operar o produto é preciso ver a
receita, quem está usando, os lotes parados esperando pagamento e dar ingressos de cortesia
(parceiros, suporte, divulgação) sem mexer no banco. O organizador, por sua vez, não tinha onde
ver os ingressos grátis que restam nem renomear a organização (criada com o e-mail).

## Opções consideradas

1. **Ferramenta externa (Metabase, SQL direto no Neon).** Sem código, mas dá acesso ao banco
   inteiro (chaves seladas incluídas) e não permite ações com as regras do sistema.
2. **Painel dentro do site, com API própria só para admins.** Reaproveita a sessão, as regras de
   pagamento e o sistema de design.

## Decisão

Opção 2.

- API `GET /api/admin/overview` (totais e os últimos 30 dias, em datas de Brasília),
  `GET /api/admin/organizations?q=`, `PUT /api/admin/organizations/{id}/bonus` e
  `GET /api/admin/batches?status=&q=`; todas respondem 403 a quem não está em `ADMIN_EMAILS`.
  "Marcar como pago" continua sendo `POST /api/admin/batches/{id}/mark-paid`, com as mesmas
  regras (pagamento Pix em confirmação bloqueia).
- `organizations.bonus_free_tickets`: cortesia dada pelo admin, somada aos `FREE_TICKETS` de todas
  as organizações. Sai dos próximos lotes como a cota de boas-vindas (`paid_via = 'free'`).
- Página `/painel/admin` (visão geral com gráfico, organizações com busca e cortesia, lotes com
  filtro e "Marcar como pago"), visível só para admins.
- Página `/painel/conta`: nome da organização (`PUT /api/account`, só donos), ingressos grátis
  restantes, uso e a tabela de preços com exemplos.

## Consequências

- Os admins enxergam dados de todas as organizações (nomes, e-mails, valores): a lista de
  `ADMIN_EMAILS` deve ser curta. As listas trazem no máximo 200 linhas, com busca.
- As ações dos admins ficam no log (`tracing`), não numa tabela de auditoria.
