# CLAUDE.md: Ingresso Impresso

SaaS brasileiro de ingressos impressos e numerados, com QR assinado e check-in offline no
navegador do celular. Público: bandas independentes, escolas, igrejas e pequenos produtores que
vendem ingresso "na mão".

## Status atual

Arquitetura aprovada em 2026-10-08 (todos os ADRs `Aceito`).

- **Fase 0 (fundação): concluída.** Workspaces, lints, `justfile`, CI.
- **Fase 1 (núcleo do ingresso): concluída.** `ticket-core`, `ticket-wasm`, pacote TS e vetores
  compartilhados.
- **Fase 2 (geração de arquivos): concluída.** Crate `render` (Typst embutido): A4 casa, gráfica com
  sangria, folha de controle e ZIP do WhatsApp; CLI `ii job|render|verify`.
- **Fase 3 (API + painel mínimo): concluída.** `crates/server` (Axum + sqlx), painel Next.js com
  login por código, eventos, ingresso (arte + prévia), lotes, vendedores, cancelamentos e arquivos.
  Deploy: `render.yaml`, `deploy/api.Dockerfile`, guia em `docs/deploy.md`.
- **Fase 4 (portaria PWA): implementada.** Links de acesso e celulares no painel, API da porta
  (registro, manifesto com cursor seguro, leituras com confirmação online), app `/portaria`
  offline (DoorCore + zxing-wasm + IndexedDB + service worker) e teste ponta a ponta com câmeras
  falsas (`just e2e`, também no CI). Falta o ensaio com celulares reais (Android + iPhone) em modo
  avião, que é o critério de pronto da fase.
- **Fase 5 (relatório + produção): código pronto.** Relatório por vendedor (API + aba com CSV),
  deploy do web pelo Actions, backup diário cifrado (`backup.yml`) com teste de restauração
  (`just backup-restore-test`). Falta o que depende do mantenedor: secrets da Vercel e do backup,
  deploy no `main` e o ensaio geral (`docs/ensaio.md`), que é o critério de pronto.
- **Fase 6 (pagamento + interface): implementada.** Pagamento dos lotes com Stripe Checkout (Pix e
  cartão) confirmado por webhook assinado, preço progressivo em `pricing.rs` (ADR 0020, substitui
  o 0014; o admin ainda marca lotes como pagos); redesign do site e do painel com sistema de design,
  logo e PWA instalável (ADR 0021), tema claro/escuro/sistema e Vercel Web Analytics (ADR 0022). Falta o que depende do mantenedor: conta Stripe, webhook e as
  variáveis `STRIPE_*`/`PUBLIC_WEB_URL` no Render (`docs/deploy.md` §5.1) e definir os preços
  definitivos.
- **Fase 7 (produto para vender): implementada.** Preços menores e 30 ingressos grátis por
  organização (`FREE_TICKETS`, ADR 0024); textos no ingresso com campos (`{evento}`, `{data}`…),
  oito fontes, 16 modelos por tipo de evento e editor visual com arrastar, desfazer e prévia ao
  vivo (ADR 0025); horário local do evento (`utc_offset_minutes`); painel `/painel/admin` com
  métricas, organizações, cortesias e lotes, e página `/painel/conta` (ADR 0026); duplicar,
  arquivar e excluir eventos (ADR 0027).
- **Fase 8 (abertura): implementada.** Ingresso digital por link no celular, que abre offline
  (`/ingresso#token`, aba Digitais, ADR 0030); login com Google e e-mails em HTML com cota diária
  e limite por IP (ADRs 0028, 0029); Termos, Privacidade e Reembolso, aceite gravado no login,
  exportar e excluir a conta (ADR 0033); novidades (ADR 0031); modo suporte do admin com
  auditoria, suspensão, estorno e preço de lote (ADR 0032); resultados do organizador e
  financeiro do admin (ADR 0034); rifas sem sorteio (ADR 0035); tema do site no rodapé (ADR 0036).
  Falta o que depende do mantenedor: revisão jurídica dos textos.
- **Fase 9 (plataforma): implementada.**
  - Configurações pelo painel: manutenção `off`/`read_only`/`full`, novas contas e domínios de
    e-mail bloqueados (ADR 0037).
  - Comunicação: pronunciamentos no sininho ou em janela, e notificações por conta (ADR 0038).
  - Vendas: preços versionados no banco com anúncio, promoções (ADR 0039), cupons e crédito
    (ADR 0040). `FREE_TICKETS` saiu: os ingressos grátis estão na tabela de preços.
  - Confiança: registro de e-mails com webhook da Resend (ADR 0041), moderação de artes com Cloud
    Vision e central de revisão (ADR 0042), página pública `/status` com incidentes (ADR 0043).
  - Painel: barra de navegação no celular, menus e diálogos como folhas de baixo para cima,
    admin com seções agrupadas e auditoria com filtros.
  - Verificação anti-robô (Cloudflare Turnstile) antes de enviar o código por e-mail (ADR 0044).
  - Verificação em duas etapas opcional com app autenticador e códigos de recuperação; o admin
    desliga para quem perdeu o celular (ADR 0045).
  - Falta o que depende do mantenedor, tudo opcional: `RESEND_WEBHOOK_SECRET` (§5.4),
    `MODERATION_VISION_API_KEY` (§5.5) e `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (§5.6).
- **Blindagem (ADR 0047): implementada.** Admin só com verificação em duas etapas, limites por
  endereço nos endpoints sem sessão (`ratelimit.rs`), caminhos da API validados no painel
  (`safePath`/`isUuid`), moderação que acompanha cópias e sobrevive a exclusões (`rejected_art`),
  cabeçalhos e timeout na API, produção que recusa chaves de teste, deploy do site só depois do CI
  verde, `cargo audit`/`pnpm audit` e Dependabot. Falta o que depende do mantenedor: ligar a
  verificação em duas etapas na conta admin, rulesets/Environments no GitHub, chave da Resend
  separada para o staging e `sslmode=verify-full` na URL do backup (`docs/deploy.md` §7–§9, §11).

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
crates/render        Typst embutido (pacote `ticket-render`): design versionado, QR vetorial, A4 casa,
                     gráfica (TrimBox/BleedBox), controle, ZIP WhatsApp; templates em templates/*.typ,
                     fontes OFL em fonts/ (8 famílias, world.rs); blocos de texto com campos
                     resolvidos em fields.rs (espelho em apps/web/src/lib/ticket-fields.ts);
                     gera em blocos e junta com merge.rs (ADRs 0015, 0017, 0025)
crates/cli           binário `ii`: vectors generate|check, job init, render, verify
crates/server        API (pacote `ingressoimpresso-server`, binário `ingressoimpresso`): Axum 0.8 + sqlx 0.9,
                     migrações em migrations/ (aplicadas no start), worker de exportação no mesmo
                     processo (fila = tabela exports), chaves de evento seladas (keys.rs, ADR 0005),
                     DTOs em api.rs (ts-rs → packages/api-types), testes de integração em tests/;
                     admin em routes/admin.rs (ADMIN_EMAILS) + routes/support.rs (modo suporte,
                     auditoria com filtros, suspensão, estorno), plataforma em platform.rs +
                     routes/platform.rs (manutenção, cadastros, domínios), pronunciamentos e
                     notificações em routes/announcements.rs, preços/promoções/cupons/crédito em
                     pricing.rs + routes/billing.rs, e-mails em routes/mail_admin.rs (+ webhook),
                     moderação em moderation.rs + routes/moderation.rs, status em routes/status.rs,
                     conta em routes/account.rs + routes/privacy.rs
                     (exportar/excluir), ingresso digital em routes/tickets.rs, novidades em
                     routes/changelog.rs, resultados em routes/analytics.rs; login com Google em
                     google.rs, anti-robô do código em captcha.rs (Turnstile), duas etapas em
                     two_factor.rs (TOTP, recuperação; tentativas em second_factor_attempts) +
                     routes/two_factor.rs, limites por endereço em ratelimit.rs (ADR 0047),
                     e-mails (HTML + texto) em emails.rs, cota em state.rs (send_mail)
packages/api-types   tipos TS da API gerados (src/generated + src/index.ts, NÃO editar)
apps/web             landing em src/app/page.tsx (+ src/components/marketing), painel em
                     src/app/{entrar,painel}, abas do evento em src/components/event (aba na URL,
                     ?aba=); sistema de design em src/components/ui + tokens em globals.css (ADR 0021);
                     logo em src/components/brand.tsx e public/brand, ícones em public/icons;
                     tema em src/lib/theme{,-script}.ts (data-theme no <html>, ADR 0022);
                     Analytics em src/components/site-analytics.tsx (fora da portaria);
                     PWA do painel: app/manifest.ts + public/sw.js (escopo /, ignora /portaria;
                     guarda /ingresso para abrir offline);
                     ingresso digital: app/ingresso + components/ticket/ticket-pass.tsx +
                     lib/ticket-pass.ts, aba components/event/digital.tsx;
                     documentos legais em src/content/legal.ts (LEGAL_ENTITY, TERMS_VERSION) e
                     components/legal; rodapé em components/marketing/site-footer.tsx;
                     novidades em app/novidades + components/changelog + lib/changelog.ts;
                     resultados em app/painel/resultados + components/event/event-results.tsx;
                     portaria em src/app/portaria + src/portaria (engine, storage, camera, logic) +
                     public/portaria-sw.js (ADR 0018); Vitest em test/;
                     editor do ingresso em src/components/event/design*.tsx + prévia ao vivo em
                     src/components/ticket/ticket-view.tsx (regras espelhadas em lib/design-rules.ts),
                     modelos em src/lib/templates (catálogo + fundos SVG em mm), fontes do ingresso
                     em public/fonts/ticket (WOFF2); admin em src/app/painel/admin +
                     src/components/admin (seções agrupadas: financeiro, organização, preços e
                     cupons em billing.tsx, pronunciamentos, e-mails, moderação, auditoria,
                     configurações, incidentes); conta em src/app/painel/conta (+ components/account);
                     sininho e avisos em components/panel/{inbox,platform-notices}.tsx + lib/platform.ts;
                     duas etapas: cartão em components/account/two-factor.tsx e segundo passo do
                     login em components/two-factor-step.tsx;
                     status público em app/status + components/status;
                     menus e popovers em components/ui/popover.tsx (portal; folha no celular)
e2e/                 portaria.e2e.mjs: 5 "celulares" Chromium com câmera falsa (`just e2e`)
packages/ticket-core-wasm  wrapper TS tipado (src/), tipos gerados (src/generated/, NÃO editar),
                     pkg/ gerado por `just wasm` (não versionado), testes Vitest com os vetores
apps/web             Next.js 16 (Vercel): landing; painel e portaria nas fases 3–4
testdata/vectors     ticket-v1.json: vetores compartilhados Rust ↔ WASM (gerados, NÃO editar)
deploy/              compose.dev.yaml (Postgres local), api.Dockerfile, restore-test.sh
docs/deploy.md       domínio próprio: Neon, Resend, DNS (Registro.br), Render, Vercel, backup;
                     docs/ensaio.md: ensaio geral
```


## Infraestrutura (ADRs 0009, 0013, 0019)

- **Frontend:** Next.js na Vercel, com pnpm. O deploy é pré-compilado pelo GitHub Actions
  (`.github/workflows/deploy-web.yml`, secrets `VERCEL_*`), porque o build da Vercel não tem Rust;
  `apps/web/vercel.json` desliga os builds da integração Git.
- **Endereços:** site no domínio raiz (`www` redireciona), API em `api.`, e-mail de `mail.`; DNS
  no Registro.br.
- **API:** Rust no Render, região Virginia. O Blueprint (`render.yaml`) compila
  `deploy/api.Dockerfile` (cargo-chef) e só implanta com o CI verde; o job `api-image` do CI
  compila e sobe a mesma imagem. `/healthz` não toca no banco (é o health check), `/readyz` toca.
  Variáveis `sync: false` (incluindo `ALLOWED_ORIGINS`) vivem no painel do Render; em produção a
  API não sobe sem origens, `PUBLIC_API_URL` https e `ADMIN_EMAILS`. Sessão do painel por token
  Bearer + CORS (ADR 0016); downloads por link temporário.
- **Banco:** Neon `aws-us-east-1`, host direto com `sslmode=verify-full`. Precisa ficar junto da
  API, não do usuário. Dorme quando parado (worker consulta sozinho a cada hora).
- **E-mail:** Resend (o cliente manda `User-Agent`, senão o Resend recusa). `MAIL_DAILY_LIMIT`
  (padrão 95) segura a cota do plano grátis; esgotada, o login oferece o Google (ADR 0028).
- **Opcionais da fase 9:** `RESEND_WEBHOOK_SECRET` (status de entrega no painel de e-mails,
  ADR 0041) e `MODERATION_VISION_API_KEY` + `MODERATION_DAILY_LIMIT` (análise automática das
  artes, ADR 0042). Sem eles tudo funciona, com revisão manual.
- **Anti-robô do login:** `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (as duas ou nenhuma, ADR
  0044) fazem `POST /api/auth/code` exigir um token do Cloudflare Turnstile, conferido em
  `siteverify`. Se o Cloudflare não responder, o código sai assim mesmo (os limites seguem).
- **Login com Google:** `GOOGLE_CLIENT_ID` liga o botão (Google Identity Services); a API confere
  o ID token com as chaves do Google (ADR 0029). A CSP libera só `accounts.google.com/gsi/` e,
  para o Turnstile, `challenges.cloudflare.com`. O botão é o oficial, com o tema do site e o
  script carregado com `?hl=pt-BR` (a opção `locale` do botão é ignorada).
- **Pagamento:** Stripe Checkout por lote (ADR 0020), confirmado pelo webhook
  `POST /api/stripe/webhook` (assinatura `Stripe-Signature`) ou pela consulta da sessão quando o
  pagador volta. Sem `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, só o admin marca lotes como pagos.
  Pix gerado e não pago deixa o pagamento `processing` (bloqueia cancelar e novo checkout).
  Checkout/cancelar/marcar pago de um lote passam por `AppState::batch_lock` (trava em memória:
  a API roda em uma instância só) e chamam a Stripe fora de transação.
- **Staging (ADR 0046):** o branch `staging` publica um ambiente separado: API
  `ingressoimpresso-api-staging` no mesmo `render.yaml` (plano grátis), branch do Neon sem dados
  reais, site como preview da Vercel com as variáveis de Preview do branch `staging` e endereço
  fixo (`VERCEL_STAGING_ALIAS`, padrão `staging.ingressoimpresso.com.br`).
  `NEXT_PUBLIC_ENVIRONMENT=staging` mostra o selo "Ambiente de testes" e bloqueia a indexação.
  Novidades passam por `staging` antes do `main`; variável nova da API vai para os dois serviços.
- **Métricas:** Vercel Web Analytics (ADR 0022), ligado no painel da Vercel; nada a configurar no
  código além de `NEXT_PUBLIC_SITE_URL` (opcional, padrão `https://ingressoimpresso.com.br`).
- **Produção recusa (ADR 0047):** a chave mestra do CI, `sk_test_` sem `STRIPE_ALLOW_TEST_MODE=true`
  (só o staging tem), `PUBLIC_WEB_URL` sem https; a conexão com o Neon é forçada a `verify-full`.
  A API responde `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, `no-store` (salvo o que o
  handler definir) e HSTS, com 90 s de timeout por requisição. O **Deploy web** roda por
  `workflow_run` depois de um CI verde; o CI tem o job **Dependency audit**.

## Comandos

Pré-requisitos:

- `rustup`: a toolchain fixa vem de `rust-toolchain.toml`;
- Node ≥ 22.13 e pnpm 10, via `packageManager`;
- `just`;
- `wasm-bindgen-cli` **0.2.129**, igual à crate `wasm-bindgen`
  (`cargo install wasm-bindgen-cli --version 0.2.129 --locked`).

```
just            # = just check: exatamente o que o CI roda
just fmt        # formata o Rust
just clippy     # clippy -D warnings (host + wasm32)
just test-rust  # testes Rust (--all-features: inclui `test-util`, o Google falso; regenera os tipos TS)
just vectors    # regenera testdata/vectors/ticket-v1.json: só em mudança intencional, revise o diff
just wasm       # compila o ticket-wasm e gera packages/ticket-core-wasm/pkg
just js-check   # typecheck + lint + Vitest + build do web (exige `just wasm` antes)
just db-up      # Postgres local (docker compose); copie .env.example para .env
just db-migrate # aplica as migrações em DATABASE_URL
just db-prepare # atualiza o cache offline .sqlx (obrigatório ao mudar queries; o CI e o Docker usam)
just api-types-index  # reexporta os tipos gerados em packages/api-types/src/index.ts

# Testar a impressão sem a API (só para testes locais; a semente é uma chave privada):
cargo run -p ii-cli -- job init --name "Meu Show"            # cria job.json + event.seed (0600)
cargo run -p ii-cli -- render --job job.json --seed event.seed  # out/: casa-a4.pdf, grafica.pdf, controle.pdf, whatsapp.zip
cargo run -p ii-cli -- render --job job.json                    # sem --seed: AMOSTRAS (QR inválido)
cargo run -p ii-cli -- verify --job job.json --seed event.seed "<texto lido do QR>"
just api        # a API em :8080 com o .env (as migrações rodam ao subir)
just web-dev    # next dev
just e2e        # portaria ponta a ponta: API + next start + Playwright (exige Postgres e `just wasm`)
just backup-restore-test <dump.age> <chave-age>   # restaura um backup num banco VAZIO (RESTORE_DATABASE_URL)
```

## Invariantes que não podem ser quebrados

1. **O formato QR v1 é imutável** depois do primeiro ingresso real. Uma mudança exige um novo
   `version` e um ADR. Mudar `payload.rs`, `base45.rs` ou `SIGNING_DOMAIN` quebra
   `testdata/vectors`, e isso é intencional.
2. **Só lotes pagos são assinados.** Prévias usam QR de amostra inválido e marca d'água. Um lote só
   vira `paid` por webhook da Stripe com assinatura válida, por sessão lida da própria Stripe (valor
   conferido) ou pelo admin.
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
10. **Um número estornado nunca volta a valer.** Lote `refunded` mantém a faixa ocupada (a
    exclusão só ignora `canceled`) e ganha um cancelamento permanente (ADR 0032).
11. **O ingresso digital é o mesmo QR v1 do papel** (ADR 0030): assinado só em `jobs.rs`
    (`sign_numbers`), só para lotes pagos, guardado selado; o token do link vai no fragmento
    (`/ingresso#token`) e no corpo das requisições, nunca na URL do servidor.
12. **Arte sinalizada ou recusada não é impressa** (ADR 0042): exportações e a imagem do
    ingresso digital passam por `moderation::ensure_printable`; só um admin libera.
13. **Código de acesso nunca é registrado**: o assunto em `mail_sends` tem os dígitos mascarados.
14. **Segredos da verificação em duas etapas nunca ficam em claro** (ADR 0045): a chave TOTP é
    selada com a chave mestra (`two_factor::seal`) e os códigos de recuperação ficam só como hash
    com chave; o segundo passo vale para o código por e-mail e para o Google.
15. **Admin só com duas etapas** (ADR 0047): `AuthUser.is_admin` exige `ADMIN_EMAILS` **e**
    `totp_enabled_at`; sem o segundo passo a conta é um organizador comum (sem modo suporte, sem
    `mark-paid`). Excluir a conta pede o segundo passo quando ele existe.
16. **O painel nunca monta um caminho da API com valor não validado** (ADR 0047): ids vindos da
    URL passam por `isUuid`, e `send()` recusa caminhos com `..`, `//` ou `#` (`safePath`). Um
    link malicioso não pode fazer o navegador do admin chamar outra rota.
17. **Arte recusada fica recusada** (ADR 0047): a recusa vai para `rejected_art` por hash e
    sobrevive à exclusão do upload, do evento e da conta; duplicar um evento leva
    `moderation_status` junto e nunca copia arte recusada.

## Convenções

- **Idioma:** identificadores, nomes de arquivos de código, commits e comentários em inglês.
  Interface, textos ao usuário e documentação (`docs/`) em português.
- **Interface:** use os componentes de `src/components/ui` e os tokens semânticos (`bg-surface`,
  `text-fg-muted`, `bg-brand`...), nunca cores soltas, para o tema escuro funcionar. Fundo cheio
  com texto branco usa `bg-brand-solid`/`bg-success-solid`/`bg-danger-solid` (contraste AA nos
  dois temas). Ações destrutivas pedem `useConfirm()`; resultados de ações viram `toast`; menus
  usam `Menu`/`MenuItem` e painéis `Popover`. Um editor com alterações pendentes chama
  `useUnsavedChanges(dirty)`. No celular, `Menu`, `Popover` e `Dialog` viram folhas de baixo para
  cima sozinhos (renderizados em portal, nunca cortados por um card) e os campos têm 16px, para o
  iPhone não dar zoom. Grades de `Stat` usam duas colunas no celular.
- **Design do ingresso em dois lados:** regras de `design.rs` e campos de `fields.rs` têm espelho
  no painel (`lib/design-rules.ts`, `lib/ticket-fields.ts`) para a prévia ao vivo; mudou um, mude
  o outro (os testes usam os mesmos exemplos). Modelo novo é só TypeScript em `lib/templates`, e
  `test/templates.test.ts` valida todo modelo em toda paleta. Fonte nova entra nos dois lados
  (`crates/render/fonts` + `world.rs` + `ticket.typ` e `public/fonts/ticket` em WOFF2).
- **Textos de interface centralizados:** `apps/web/src/texts/pt-BR.ts` no web e módulos `texts.rs`
  no Rust; e-mails em `emails.rs` (todo texto do usuário passa por `escape`); documentos legais
  em `apps/web/src/content/legal.ts`. Mudou Termos ou Privacidade: mude a data e o
  `TERMS_VERSION` nos dois lados (`legal.ts` e `auth.rs`). Sem framework de i18n.
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
- **sqlx:** queries com macros (`query!`/`query_as!`) verificadas em compilação; `.sqlx/` versionado
  (`just db-prepare`), CI e Docker compilam com `SQLX_OFFLINE=true`. Migrações em
  `crates/server/migrations`, só de avanço. Faixas são `int4range` canônicos `[a, b)`; use
  `routes::range`/`routes::bounds`. A limpeza horária do worker (`jobs::prune`) apaga o que só
  vale por um tempo (hash de IP, códigos antigos, sessões vencidas).
- **API:** erros JSON `{"error": {"code", "message"}}`; o `code` é estável e o painel o traduz em
  `texts.errors`; a mensagem nunca repete o texto do banco (nomes de constraints). Nomes e rótulos
  de uma linha passam por `routes::one_line` (sem caracteres de controle). Endpoints sem sessão
  chamam `ratelimit::by_ip`; operações caras por conta usam `AppState::attempt`. Recursos de outra organização respondem 404 (`authorize_event`/`event_access`);
  admins entram em modo suporte e cada alteração vai para `audit_log` (ADR 0032); ações só de
  admin chamam `require_admin` e `audit`. Só `jobs.rs` dessela chaves e assina (arquivos e
  ingressos digitais), e só ingressos de lotes `paid` não cancelados. E-mails passam por
  `AppState::send_mail` (cota diária).
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
  - render: ida e volta gerar → rasterizar → decodificar QR (`rqrr`) → verificar; PDFs checados
    com `lopdf` (páginas, MediaBox/TrimBox, determinismo). Typst fixo em `=0.15.1`: atualizar é
    tarefa planejada.
- **Commits:** pequenos, em **Conventional Commits + gitmoji**, no formato
  `tipo(escopo): <gitmoji> assunto`, por exemplo `feat(core): ✨ ...`, `fix(door): 🐛 ...`,
  `docs(adr): 📝 ...`, `test(wasm): ✅ ...`, `ci: 👷 ...`, `chore: 🔧 ...`,
  `refactor: ♻️ ...`. Regras:
  - assunto em inglês, curto e no imperativo;
  - corpo opcional, de uma ou duas linhas, direto ao ponto;
  - cada commit deve compilar e passar em `just check`.
- **Antes de dar uma fase por concluída:** `just check` verde e este arquivo atualizado (status,
  comandos, estrutura).
