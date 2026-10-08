# 0001. Monorepo com Cargo + pnpm workspaces e `just`

- **Status:** Aceito
- **Data:** 2026-10-08

## Contexto

O formato do QR e a lógica de validação são usados pela API, pelo gerador de arquivos e pela
portaria no navegador. Uma mudança no formato precisa chegar a todos no mesmo commit. O projeto é
mantido por uma pessoa só, 5 a 10 h por semana.

## Opções consideradas

1. **Repositórios separados** (backend, frontend, núcleo publicado como crate/pacote npm).
   Versionamento e publicação entre repos custam caro para uma pessoa, e uma mudança de formato
   vira três PRs.
2. **Monorepo com Cargo workspace + pnpm workspaces + Turborepo.** Turborepo traz cache de tarefas
   e grafo de dependências JS, mas só teremos um app JS e um pacote gerado (WASM). O grafo é
   trivial e o cache economiza segundos. É mais uma ferramenta e mais um arquivo de configuração.
3. **Monorepo com Cargo workspace + pnpm workspaces + `just`.** Um `justfile` é o ponto de entrada
   único (`just check`, `just dev`, `just test`, `just vectors`) e orquestra as duas toolchains em
   ordem explícita: WASM → pacote npm → web.

## Decisão

Opção 3. Monorepo com `crates/` (Rust), `apps/` e `packages/` (JS), `testdata/` (vetores
compartilhados) e `docs/`. O `justfile` documenta e executa tudo; o CI chama as mesmas receitas.

## Consequências

- Uma mudança de formato no `ticket-core` quebra o build da portaria no mesmo PR, o que é
  desejável.
- Não há cache de tarefas entre execuções além do que Cargo e Next.js já fazem. Se surgirem vários
  pacotes JS, reavaliar o Turborepo, que é fácil de adicionar depois.
- Pré-requisitos locais: `rustup`, Node LTS, pnpm (fixado via `packageManager` + Corepack),
  `just`, `wasm-bindgen-cli` (versão fixa) e Docker, para o Postgres de desenvolvimento.
- pnpm foi escolha do mantenedor (2026-10-08): o lockfile é estrito e as dependências não
  vazam entre pacotes.
