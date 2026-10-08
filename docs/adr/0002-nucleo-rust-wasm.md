# 0002. Núcleo do ingresso em Rust puro, compartilhado via WASM

- **Status:** Aceito
- **Data:** 2026-10-08

## Contexto

A portaria precisa validar ingressos sem internet, com exatamente as mesmas regras do servidor:
formato, assinatura e decisão de check-in (válido, já usado, cancelado, outro evento). Uma
divergência entre duas implementações faria a porta aceitar o que o servidor rejeita, ou o
contrário.

## Opções consideradas

1. **Duas implementações (Rust no servidor, TS no navegador com `@noble/ed25519` ou WebCrypto)
   presas por vetores de teste.** O frontend fica mais simples, sem toolchain WASM. Mas são duas
   bases de código para o mesmo formato e a mesma lógica de decisão, e os vetores pegam diferenças
   de formato mas dificilmente pegam diferenças na lógica de decisão. O Ed25519 do WebCrypto ainda
   é recente em navegadores antigos.
2. **Um crate Rust puro compilado para WASM.** Uma única implementação. O WASM fica em torno de
   100 a 200 KB (com ed25519 e base45), carregado uma vez e mantido em cache pelo Service Worker.
   Custos: toolchain WASM no build e uma fronteira de bindings a manter.
3. **Validação só no servidor (portaria online).** Viola o requisito de funcionar sem internet.

## Decisão

Opção 2.

- **`crates/ticket-core`:** sem IO, sem async, sem relógio do sistema (o tempo entra como
  parâmetro). Contém:
  - codificação e decodificação do payload v1 e base45;
  - `sign` (feature `signing`, usada só no servidor);
  - `verify`;
  - a função pura `decide(ticket, manifest_view, local_state) -> Decision`.
- **`crates/ticket-wasm`:** bindings finos com `wasm-bindgen`. Expõe só verificação e decisão,
  **nunca assinatura**.
- **Build:** `cargo build --target wasm32-unknown-unknown` + `wasm-bindgen-cli` com versão fixa,
  igual à da crate `wasm-bindgen`. Não usamos `wasm-pack`: a organização rustwasm foi desativada
  em 2025 e o `wasm-pack` mudou de mantenedor, então preferimos depender só do `wasm-bindgen`, que
  continua ativo.
- **Vetores:** `testdata/vectors/ticket-v1.json` é gerado por um comando da CLI a partir de sementes
  fixas e versionado no repositório. O mesmo arquivo é consumido pelo `cargo test` e pelo Vitest
  contra o WASM compilado.

## Consequências

- Uma única fonte de verdade para formato e decisão. A fusão de logs no servidor reutiliza a
  mesma `decide`.
- A feature `signing` fica desligada no WASM, então a chave privada nem tem como existir no
  navegador.
- O build do web depende do build do WASM. O `justfile` garante a ordem e o CI verifica que os
  vetores passam nos dois lados.
- O `ticket-wasm` não pode usar `#![forbid(unsafe_code)]`, porque o código gerado pelo wasm-bindgen
  usa `unsafe`. Os demais crates usam `forbid`.
