# CLAUDE.md: Ingresso Impresso

SaaS brasileiro de ingressos impressos e numerados, com QR assinado e check-in offline no
navegador do celular. Público: bandas independentes, escolas, igrejas e pequenos produtores que
vendem ingresso "na mão".

## Status atual

Arquitetura aprovada em 2026-10-08 (todos os ADRs `Aceito`).

- **Fase 0 (fundação): concluída.** Workspaces, lints, `justfile`, CI.
- **Fase 1 (núcleo do ingresso): concluída.** `ticket-core`, `ticket-wasm`, pacote TS e vetores
  compartilhados.
- **Próxima: fase 2 (geração de arquivos com Typst, crate `render` e CLI `ii render`).**

Plano completo em `docs/arquitetura.md` §12.

## Onde está cada coisa

- `docs/arquitetura.md`: visão completa (formato do QR, offline/sync, arquivos, modelo de dados,
  API, fases).
- `docs/adr/`: decisões e alternativas. Uma decisão nova exige um ADR novo. Um ADR aceito não é
  reescrito: um ADR novo o substitui.

```
crates/ticket-core   formato v1, base45, Ed25519, decisão da portaria, DTOs: puro, sem IO, compila p/ wasm32
                     features: fast (tabelas Ed25519), signing (emissão, só servidor/CLI),
                     serde (DTOs), ts (gera tipos TS)
crates/ticket-wasm   bindings wasm-bindgen: DoorCore (verificação + decisão), nunca assinatura
crates/cli           binário `ii`: `ii vectors generate|check` (fases seguintes: render, chaves)
packages/ticket-core-wasm  wrapper TS tipado (src/), tipos gerados (src/generated/, NÃO editar),
                     pkg/ gerado por `just wasm` (não versionado), testes Vitest com os vetores
apps/web             Next.js 16 (Vercel): landing; painel e portaria nas fases 3–4
testdata/vectors     ticket-v1.json: vetores compartilhados Rust ↔ WASM (gerados, NÃO editar)
deploy/              compose.dev.yaml (Postgres local)
```

Planejados: `crates/render` (fase 2), `crates/server` (fase 3), `packages/api-types` (fase 3).

## Infraestrutura (ADRs 0009, 0013)

- **Frontend:** Next.js na Vercel, com pnpm. O deploy é pré-compilado pelo GitHub Actions, porque
  o build da Vercel não tem Rust.
- **API:** Rust no Render, região Virginia.
- **Banco:** Neon `aws-us-east-1`. Precisa ficar junto da API, não do usuário.
- **E-mail:** Resend.
- **Pagamento:** o MVP não cobra; Pix entra na fase 6.

## Comandos

Pré-requisitos:

- `rustup`: a toolchain fixa vem de `rust-toolchain.toml`;
- Node ≥ 22.12 e pnpm 10, via `packageManager`;
- `just`;
- `wasm-bindgen-cli` **0.2.129**, igual à crate `wasm-bindgen`
  (`cargo install wasm-bindgen-cli --version 0.2.129 --locked`).

```
just            # = just check: exatamente o que o CI roda
just fmt        # formata o Rust
just clippy     # clippy -D warnings (host + wasm32)
just test-rust  # testes Rust (--all-features; também regenera os tipos TS via ts-rs)
just vectors    # regenera testdata/vectors/ticket-v1.json: só em mudança intencional, revise o diff
just wasm       # compila o ticket-wasm e gera packages/ticket-core-wasm/pkg
just js-check   # typecheck + lint + Vitest + build do web (exige `just wasm` antes)
just db-up      # Postgres local (docker compose)
just web-dev    # next dev
```

## Invariantes que não podem ser quebrados

1. **O formato QR v1 é imutável** depois do primeiro ingresso real. Uma mudança exige um novo
   `version` e um ADR. Mudar `payload.rs`, `base45.rs` ou `SIGNING_DOMAIN` quebra
   `testdata/vectors`, e isso é intencional.
2. **Só lotes pagos são assinados.** Prévias usam QR de amostra inválido e marca d'água.
3. **A deduplicação usa `(event_id, ticket_number)`**, nunca os bytes do QR.
4. **A chave privada nunca sai do servidor.** O `ticket-wasm` depende do `ticket-core` sem
   `signing`, e a chave mestra (`TICKET_KEY_ENCRYPTION_KEY`) nunca vai para o banco nem para os
   logs.
5. **Texto do usuário entra no Typst só como dado** (`sys.inputs`/JSON), nunca interpolado no
   código-fonte do template.
6. **A portaria nunca espera a rede para decidir.** Use `DoorCore.checkIn`, que avalia e registra
   de forma atômica. Toda leitura é persistida no IndexedDB antes da tela de resultado.
7. **O token de acesso da portaria vai no fragmento da URL** (`#acesso=`), e no banco fica só o
   hash.
8. **Assets da portaria (WASM do core e do zxing) são servidos pela nossa origem** e pré-cacheados,
   nunca carregados de CDN.
9. **Os vetores são especificação:** as decisões esperadas em `crates/cli/src/vectors.rs` são
   escritas à mão, nunca calculadas pelo código testado.

## Convenções

- **Idioma:** identificadores, nomes de arquivos de código, commits e comentários em inglês.
  Interface, textos ao usuário e documentação (`docs/`) em português.
- **Textos de interface centralizados:** `apps/web/src/texts/pt-BR.ts` no web e módulos `texts.rs`
  no Rust. Sem framework de i18n.
- **Rust:**
  - toolchain 1.97 (edition 2024);
  - lints do workspace: clippy `all` como erro e `pedantic` como aviso, com `-D warnings` no CI;
  - `unwrap`, `expect` e `panic` proibidos fora de testes (testes de integração liberam no topo do
    arquivo, com `reason`);
  - `indexing_slicing` proibido no `ticket-core`;
  - `unsafe_code = "forbid"`, exceto no `ticket-wasm` (`deny`, por causa do glue gerado);
  - exceções pontuais com `#[expect(..., reason = "...")]`;
  - erros com `thiserror` nas bibliotecas e `anyhow` só em binários;
  - no perfil dev, as dependências compilam com `opt-level = 3`, para os testes de propriedade
    de Ed25519 rodarem em cerca de 1 s.
- **sqlx (fase 3):** queries verificadas em compilação, com `.sqlx/` versionado. Migrações em
  `crates/server/migrations`, só de avanço.
- **TypeScript:**
  - TS 6.0 (o `typescript-eslint` ainda não suporta a 7);
  - `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e
    `verbatimModuleSyntax`;
  - sem `any` (lint como erro);
  - tipos de fronteira gerados do Rust (ts-rs), nunca escritos à mão;
  - valores vindos do WASM são validados (`parseDecision`).
- **Versões JS:** as dependências compartilhadas ficam no `catalog:` do `pnpm-workspace.yaml`.
  ESLint 9 (os plugins do `eslint-config-next` ainda não suportam o 10).
- **Testes:**
  - criptografia e formato: `proptest` + `testdata/vectors`, rodando em Rust e no WASM/Vitest;
  - servidor: `sqlx::test` com Postgres real;
  - render: ida e volta gerar → rasterizar → decodificar QR → verificar.
- **Commits:** pequenos, no formato Conventional Commits (`feat(core): ...`, `fix(door): ...`,
  `docs(adr): ...`). Cada commit deve compilar e, a partir da fase 0, passar em `just check`.
- **Antes de dar uma fase por concluída:** `just check` verde e este arquivo atualizado (status,
  comandos, estrutura).
