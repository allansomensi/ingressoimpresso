# 0079. O admin alcança todos os recursos

- **Status:** Aceito
- **Data:** 2026-10-13
- **Complementa:** [0032](0032-controle-do-admin.md) (modo suporte) e
  [0064](0064-perfil-da-organizacao.md) (perfil da organização)

## Contexto

O modo suporte (ADR 0032) abre qualquer evento com as telas do organizador, mas o admin só chegava
a um evento passando pela organização certa, e o perfil público da organização (logo, cor,
contato) só podia ser mudado pela própria conta (`/api/account/profile`). Para ajudar quem não
sabe usar o painel, ou tirar do ar um nome ou um logo impróprio, o admin precisa alcançar tudo.

A auditoria das rotas mostrou que tudo o que pertence a um evento, inclusive o que tem endereço
próprio (`/api/tables/{id}`, `/api/sellers/{id}`, `/api/categories/{id}`, `/api/ledger/{id}`,
`/api/guests/{id}`, `/api/reservations/{id}`, `/api/door-accesses/{id}`, `/api/team-members/{id}`,
`/api/exports/{id}`…) e as séries (`/api/series/{id}`), já passa por `event_access` ou pela regra
equivalente da série, e por isso já aceitava admins com registro em `audit_log`. Faltavam a busca
de eventos e o perfil da organização.

## Opções consideradas

1. **Deixar o admin entrar em `/api/account/profile` "como" outra organização** (um parâmetro ou
   cabeçalho). Mistura a rota da conta com suporte e é fácil esquecer a auditoria.
2. **Rotas de admin para o perfil, com as mesmas regras e a mesma tela do organizador**, e uma
   busca de eventos de todas as organizações.

## Decisão

Opção 2.

- **`GET /api/admin/events?q=`**: eventos de todas as organizações, pelo nome do evento ou da
  organização, pelo e-mail de alguém da organização ou pelo código (id) do evento; até 200, do
  mais novo para o mais antigo. Abrir um evento é o modo suporte de sempre: renomear um evento
  impróprio, mexer em mesas, vendedores e o resto usa as telas do organizador e grava
  `support_write`.
- **`GET|PUT /api/admin/organizations/{id}/profile`**, **`POST …/profile/logo`** e
  **`DELETE …/profile/logo?reject=`**: as mesmas validações do perfil da conta
  (`organization.rs`, funções compartilhadas). Gravam `organization_profile_update` (com os campos
  que mudaram), `organization_logo_upload` e `organization_logo_remove`. Com `reject=true` o logo
  é recusado como na moderação (ADR 0042): `rejected_art` pelo hash e sinalizações abertas dele
  fechadas como recusadas; a organização não consegue enviá-lo de novo.
- **Painel:** seção **Eventos** no admin (grupo Clientes) e, na página da organização, o botão
  **Perfil público**, que abre o mesmo editor do organizador com a faixa de modo suporte e a ação
  **Tirar e recusar** no logo. O nome da organização continua no **Renomear** (ADR 0032).
- **Nada muda para quem não é admin:** as rotas novas pedem `require_admin` (admin com duas
  etapas, ADR 0047) e um evento de outra organização continua respondendo 404.

## Consequências

- Uma rota nova de evento continua coberta sozinha se usar `event_access`/`authorize_event`; uma
  rota nova de recurso da organização (fora de evento) precisa da sua versão de admin, auditada.
- Criar eventos numa organização alheia continua fora do alcance do admin: o suporte corrige e
  ajuda, não cria em nome de ninguém.
