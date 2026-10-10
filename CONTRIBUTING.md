# Como contribuir

Obrigado pelo interesse no Ingresso Impresso! O projeto é um serviço em produção usado por quem
vende ingresso na mão, então cada mudança precisa ser segura para quem está na porta de um evento.
Este guia explica como propor uma mudança sem surpresas.

Ao participar, você concorda em seguir o nosso [Código de Conduta](CODE_OF_CONDUCT.md).

## Jeitos de ajudar

- **Relatar um problema:** abra uma issue com o modelo [Problema](https://github.com/allansomensi/ingressoimpresso/issues/new?template=bug_report.yml).
- **Sugerir um recurso:** use o modelo [Sugestão](https://github.com/allansomensi/ingressoimpresso/issues/new?template=feature_request.yml),
  contando o problema real que você (ou um organizador que você conhece) enfrenta.
- **Tirar dúvidas e trocar ideias:** use as [Discussions](https://github.com/allansomensi/ingressoimpresso/discussions).
- **Melhorar a documentação:** correções em `README.md`, `docs/` e textos da interface são muito
  bem-vindas.
- **Escrever código:** veja abaixo. Issues marcadas com `good first issue` são um bom começo.

> [!IMPORTANT]
> Encontrou uma falha de segurança? **Não abra uma issue pública.** Siga a
> [Política de Segurança](SECURITY.md).

## Antes de escrever código

Para qualquer mudança que não seja pequena (mais do que uma correção pontual), **abra ou comente
uma issue antes** e espere um retorno. Assim combinamos o caminho e ninguém perde trabalho.

Uma decisão nova de arquitetura (formato, criptografia, modelo de dados, infraestrutura, uma
dependência importante) precisa de um [ADR](docs/adr/README.md) novo, a partir do
[modelo](docs/adr/0000-modelo.md). Um ADR aceito não é reescrito: um novo o substitui.

## Preparando o ambiente

Pré-requisitos:

- [rustup](https://rustup.rs) (a toolchain fixa vem de `rust-toolchain.toml`);
- Node.js ≥ 22.13 com pnpm 12 (a versão vem de `packageManager`);
- [just](https://just.systems);
- Docker, para o Postgres local;
- `wasm-bindgen-cli` **0.2.129**, igual à crate `wasm-bindgen`:

  ```sh
  cargo install wasm-bindgen-cli --version 0.2.129 --locked
  ```

Passo a passo:

```sh
git clone https://github.com/allansomensi/ingressoimpresso
cd ingressoimpresso
cp .env.example .env
openssl rand -base64 32   # cole em TICKET_KEY_ENCRYPTION_KEY no .env

just db-up        # Postgres em Docker
pnpm install
just wasm         # compila a portaria para WebAssembly

just api          # API em http://localhost:8080 (aplica as migrações ao subir)
just web-dev      # site e painel em http://localhost:3000 (em outro terminal)
```

Sem `RESEND_API_KEY`, o código de login aparece no log da API. Stripe, Google, Turnstile e Cloud
Vision são opcionais. Os detalhes estão no [README](README.md#rodando-localmente).

## Fluxo de branches

- `main` é a **produção**. Nada entra direto nele.
- `staging` é o **ambiente de testes** (ADR 0046). Abra o seu pull request **para `staging`**.
- Crie o seu branch a partir de `staging`, com um nome curto: `fix/portaria-lanterna`,
  `feat/relatorio-csv`.

## Commits

Commits pequenos, em [Conventional Commits](https://www.conventionalcommits.org) com
[gitmoji](https://gitmoji.dev), no formato `tipo(escopo): <gitmoji> assunto`:

```
feat(server): ✨ add seller ranking to the event report
fix(door): 🐛 keep the torch on after a failed read
docs(adr): 📝 record the decision on refunds
test(wasm): ✅ cover the canceled-range vectors
refactor(web): ♻️ extract the batch price preview
chore: 🔧 bump the Postgres image
ci: 👷 cache the wasm build
```

- Assunto **em inglês**, curto e no imperativo.
- Corpo opcional, de uma ou duas linhas, direto ao ponto.
- **Cada commit compila e passa em `just check`.**

## Convenções

As regras completas estão no [`CLAUDE.md`](CLAUDE.md). As que mais aparecem em revisão:

**Idioma**

- Identificadores, nomes de arquivos de código, commits e comentários em **inglês**.
- Interface, textos ao usuário e documentação (`docs/`) em **português**.
- Textos da interface ficam centralizados em `apps/web/src/texts/pt-BR.ts` (web) e nos módulos
  `texts.rs` (Rust). E-mails ficam em `emails.rs`.

**Rust**

- Clippy `all` como erro e `pedantic` como aviso (`-D warnings` no CI).
- Sem `unwrap`, `expect` ou `panic` fora de testes. Exceções pontuais usam
  `#[expect(..., reason = "...")]`.
- Erros com `thiserror` nas bibliotecas e `anyhow` só em binários.
- Consultas com as macros do sqlx. Mudou uma query? Rode `just db-prepare` e versione o `.sqlx/`.
- Migrações em `crates/server/migrations`, sempre só de avanço.

**TypeScript e interface**

- TypeScript estrito, sem `any`. Tipos de fronteira são gerados do Rust (ts-rs), nunca escritos à
  mão.
- Use os componentes de `src/components/ui` e os tokens semânticos (`bg-surface`, `text-fg-muted`,
  `bg-brand`...), nunca cores soltas, para o tema escuro funcionar.
- Ações destrutivas pedem `useConfirm()`; resultados de ações viram `toast`.

**API**

- Erros JSON `{"error": {"code", "message"}}`, com `code` estável.
- Recursos de outra organização respondem 404. Ações de admin chamam `require_admin` e `audit`.

**Arquivos gerados (não edite à mão)**

- `packages/api-types/src`, `packages/ticket-core-wasm/src/generated` e `testdata/vectors`.

## Invariantes que nunca podem ser quebradas

O `CLAUDE.md` lista todas. As principais:

1. O **formato QR v1 é imutável**. Mudar `payload.rs`, `base45.rs` ou `SIGNING_DOMAIN` exige um
   novo `version` e um ADR.
2. **Só lotes pagos são assinados.** Prévias usam QR de amostra inválido e marca d'água.
3. A **chave privada nunca sai do servidor**. O `ticket-wasm` nunca assina.
4. A **portaria nunca espera a rede** para decidir.
5. **Texto do usuário entra no Typst só como dado**, nunca interpolado no template.
6. Os **vetores de teste são especificação**: as decisões esperadas são escritas à mão.

Um pull request que quebre uma delas não é aceito, mesmo com os testes verdes.

## Testes

```sh
just        # exatamente o que o CI roda: fmt, clippy, testes Rust, tipos gerados, WASM, lint, Vitest e build
just e2e    # a portaria ponta a ponta (exige Postgres e `just wasm`)
```

O que esperamos de cada parte:

- **Criptografia e formato:** `proptest` e os vetores compartilhados Rust ↔ WASM.
- **Servidor:** `sqlx::test` com Postgres real (em `crates/server/tests`).
- **Arquivos:** ida e volta: gerar, rasterizar, ler o QR e verificar a assinatura.
- **Web:** Vitest em `apps/web/test`. Regras do editor têm espelho em `design.rs` ↔
  `lib/design-rules.ts` e `fields.rs` ↔ `lib/ticket-fields.ts`: mudou um lado, mude o outro.
- **Portaria:** mudanças em `src/portaria` ou no service worker passam em `just e2e`.

## Abrindo o pull request

1. Rode `just` e deixe tudo verde.
2. Abra o PR **para `staging`** e preencha o modelo.
3. Descreva o que muda, por que muda e como você testou. Capturas de tela ajudam em mudanças de
   interface (em tema claro e escuro, no celular e no computador).
4. **Nunca inclua dados reais:** e-mails de clientes, tokens, links de portaria (`#acesso=`) ou de
   ingresso digital.
5. Responda à revisão com novos commits; não reescreva o histórico de um PR já revisado.

## Licença

Ao contribuir, você concorda que a sua contribuição seja distribuída sob a
[licença MIT](LICENSE) do projeto.
