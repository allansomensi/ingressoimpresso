# CLAUDE.md: Ingresso Impresso

SaaS brasileiro de ingressos impressos e numerados, com QR assinado e check-in offline no
navegador do celular. Público: bandas independentes, escolas, igrejas e pequenos produtores que
vendem ingresso "na mão".

## Status atual

**Fase 0, proposta de arquitetura aguardando aprovação.** Ainda não há código. Não implementar
nada antes da aprovação explícita do mantenedor. Depois disso, a implementação segue fase a fase,
conforme `docs/arquitetura.md` §12.

## Onde está cada coisa

- `docs/arquitetura.md`: visão completa (formato do QR, offline/sync, arquivos, modelo de dados,
  API, fases).
- `docs/adr/`: decisões e alternativas. Uma decisão nova exige um ADR novo. Um ADR aceito não é
  reescrito: um ADR novo o substitui.

Estrutura planejada:

```
crates/ticket-core   formato v1, base45, Ed25519, decide(): puro, sem IO, compila para wasm32
crates/ticket-wasm   bindings wasm-bindgen (só verificação/decisão, nunca assinatura)
crates/render        Typst embutido → PDF A4, PDF gráfica, PNG/ZIP, folha de controle
crates/server        Axum + sqlx + migrações + jobs; binário `ingressoimpresso`
crates/cli           dev/admin: vetores de teste, render local, chaves
apps/web             Next.js (output: 'export'): landing, /painel, /portaria (PWA)
packages/api-types   tipos TS gerados dos DTOs Rust (ts-rs), versionados
testdata/vectors     vetores compartilhados Rust ↔ WASM
deploy/              Dockerfile, compose, Caddyfile, backup
```

## Comandos

A definir na fase 0. O ponto de entrada único será o `justfile`:

```
just check     # fmt + clippy + testes Rust + build WASM + vetores no Vitest + typecheck/lint/build web
just dev       # Postgres (docker compose) + servidor + next dev
just test      # todos os testes
just vectors   # regenera testdata/vectors (só em mudança intencional de formato)
just wasm      # compila ticket-wasm e gera packages/ticket-core-wasm
```

## Invariantes que não podem ser quebrados

1. **O formato QR v1 é imutável** depois do primeiro ingresso real. Uma mudança exige um novo
   `version` e um ADR.
2. **Só lotes pagos são assinados.** Prévias usam QR de amostra inválido e marca d'água.
3. **A deduplicação usa `(event_id, ticket_number)`**, nunca os bytes do QR.
4. **A chave privada nunca sai do servidor.** A feature `signing` do `ticket-core` não é ativada no
   WASM, e a chave mestra (`TICKET_KEY_ENCRYPTION_KEY`) nunca vai para o banco nem para os logs.
5. **Texto do usuário entra no Typst só como dado** (`sys.inputs`/JSON), nunca interpolado no
   código-fonte do template.
6. **A portaria nunca espera a rede para decidir.** A confirmação online tem orçamento de tempo, e
   toda leitura é persistida no IndexedDB antes da tela de resultado.
7. **O token de acesso da portaria vai no fragmento da URL** (`#acesso=`), e no banco fica só o
   hash.
8. **Assets da portaria (WASM do core e do zxing) são servidos pela nossa origem** e pré-cacheados,
   nunca carregados de CDN.

## Convenções

- **Idioma:** identificadores, nomes de arquivos de código, commits e comentários em inglês.
  Interface, textos ao usuário e documentação (`docs/`) em português.
- **Textos de interface centralizados:** `apps/web/src/texts/pt-BR.ts` no web e módulos `texts.rs`
  no Rust. Sem framework de i18n.
- **Rust:**
  - edition 2024, toolchain fixa em `rust-toolchain.toml`;
  - clippy limpo com `-D warnings`;
  - `unwrap_used`, `expect_used` e `panic` proibidos fora de testes;
  - `indexing_slicing` proibido no `ticket-core`;
  - `unsafe_code = "forbid"`, exceto no `ticket-wasm`;
  - erros com `thiserror` nas bibliotecas e tratados na borda HTTP.
- **sqlx:** queries verificadas em compilação, com `.sqlx/` versionado (`cargo sqlx prepare`).
  Migrações em `crates/server/migrations`, só de avanço.
- **TypeScript:**
  - `strict` + `noUncheckedIndexedAccess`;
  - sem `any` (lint como erro);
  - tipos de API importados de `packages/api-types`, nunca escritos à mão.
- **Testes:**
  - criptografia e formato: `proptest` + vetores de `testdata/vectors`;
  - servidor: `sqlx::test` com Postgres real;
  - render: ida e volta gerar → rasterizar → decodificar QR → verificar.
- **Commits:** pequenos, no formato Conventional Commits (`feat(core): ...`, `fix(door): ...`,
  `docs(adr): ...`). Cada commit compila e passa em `just check`.
- **Antes de dar uma fase por concluída:** `just check` verde e este arquivo atualizado (status,
  comandos, estrutura).
