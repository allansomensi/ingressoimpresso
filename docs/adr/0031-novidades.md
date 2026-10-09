# 0031. Novidades publicadas pelos admins

- **Status:** Aceito
- **Data:** 2026-10-09

## Contexto

Os organizadores não ficam sabendo do que muda no produto (recursos novos, correções, segurança),
e não há canal para avisar sem gastar e-mail (ADR 0028).

## Opções consideradas

1. **Arquivo `CHANGELOG.md` publicado no build.** Cada nota exige deploy e alguém que mexa no
   repositório.
2. **Notas no banco, publicadas pelo painel de admin**, com página pública e aviso no painel.

## Decisão

Opção 2.

- `changelog_entries`: tipo (`new`, `improvement`, `fix`, `security`), título, texto e
  `published_at` (nulo = rascunho). `GET /api/changelog` (público) traz as publicadas;
  `/api/admin/changelog` lista, cria, edita e apaga, com registro na auditoria (ADR 0032).
- Página `/novidades` (filtro por tipo, agrupada por mês) e um sino no painel com as últimas notas
  e a contagem das não lidas. "Lido" é a data da nota mais nova aberta, guardada no
  `localStorage`: nada sobre leitura vai para o servidor.

## Consequências

- Publicar uma novidade não depende de deploy.
- Em outro navegador, as notas recentes aparecem de novo como não lidas.
