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
  verde, `cargo audit`/`pnpm audit` e Dependabot; CSP com nonce por requisição no site
  (`apps/web/src/proxy.ts`, ADR 0048: toda página é dinâmica). Do lado do mantenedor já estão
  feitos: duas etapas na conta admin, rulesets e Environments no GitHub (Production, Staging,
  Preview, Backup), backup com `verify-full` e chave da Resend separada no staging.
- **Versionamento (ADR 0049): implementado, versão atual 1.3.0.** Uma versão SemVer para o produto
  inteiro (todos os manifestos, conferidos por `scripts/release.mjs check`), `CHANGELOG.md` em
  português (Keep a Changelog), `just release` no `staging` e tag `vX.Y.Z` + GitHub Release pelo
  job **Release** do CI no `main`; versão em Minha conta, em `/sobre`, em `/status` (site e API) e
  Novidades agrupadas por versão (`changelog_entries.version`). Só `main` e `staging` são
  permanentes: o workflow **Branches** apaga o branch de um PR integrado. Guia em
  `docs/versionamento.md`.

- **Acerto e vitrine (ADRs 0050, 0051): implementado.** Recebimentos e devoluções por vendedor
  (`seller_payments`, `routes/settlement.rs`) com saldo no relatório, resumo geral e WhatsApp na
  aba Vendedores; simulador de preços e exemplos de uso (banda, rifa, formatura) na landing;
  página `/sobre`; a versão fica só em Minha conta, `/sobre` e `/status` (ADR 0054).
- **Link do vendedor (ADR 0053): implementado.** Cada vendedor ganha um link privado
  (`/vendedor#token`, sem conta) onde marca o que vendeu e para quem e vê o próprio acerto
  (`seller_links`, `ticket_sales`, `routes/seller_links.rs`); o relatório separa emitidos de
  vendidos; toasts com o tema do site, fechados com um toque.
- **Equipe do evento (ADR 0055): implementada.** Pessoas chamadas por e-mail (`event_team`,
  `routes/team.rs`) veem o evento e mexem só nas suas partes (`manage`, `money`, `delivery`,
  `art`, `door`); `routes::event_access` aplica `team::need` (método + caminho → parte) a toda
  rota de evento. Aba Equipe no painel, abas em modo leitura para quem não cuida da parte.
- **Categorias, mesas, prestação de contas e patrocinadores (ADRs 0056–0059): implementados.**
  Categorias por faixas de números com cor e preço (acerto pelo preço de cada uma) e a faixa
  colorida impressa (`TicketDesign.band`, `effective_band`); mesas com mapa e lugares
  (`event_tables`, `ticket_seats`), "Mesa 5 · Lugar 3" na faixa; despesas e receitas
  (`event_ledger`) com resumo, PDF (`report_pdf`, Typst) e planilha (`xlsx`, escrita sobre o
  `zip`); faixa de logos de patrocinadores (`TicketDesign.sponsors`, até 6 logos moderados como a
  arte).
- **Interface pensada para o celular (ADR 0060): implementada.** Alvos de toque maiores em telas
  de toque (`pointer-coarse:` em `Button`, `icon-sm`, utilidade `touch-target`), `active:` ao lado
  de `hover:`, folhas que fecham ao arrastar (`useSheetDrag`, `useScrollLock` em
  `components/ui/sheet.ts`), `Alert` com `onDismiss`, `TableScroll` para tabelas largas; lista de
  eventos por ordem de atenção (`lib/event-list.ts`), cabeçalho compacto e folha **Seções** na
  página do evento (`components/event/sections-sheet.tsx`, `TAB_GROUPS`), editor com o inspetor
  logo abaixo do ingresso no celular e barra de ação no pé da landing (`marketing/mobile-cta.tsx`).
- **Ingresso pelo vendedor e segunda via (ADR 0061): implementados.** O vendedor cria e manda pelo
  WhatsApp o ingresso no celular de um número que vendeu (`POST /api/seller/tickets`,
  `ticket_links.seller_id`, desligável por evento em `events.sellers_send_tickets`); a segunda via
  (`POST /api/events/{id}/tickets/replace`, `tickets::replace`) cancela o número perdido, manda um
  número livre da mesma categoria para a mesma pessoa, leva o lugar na mesa e grava
  `ticket_replacements`.
- **Páginas públicas para busca (ADR 0062): implementadas.** Oito tipos de evento em
  `/ingresso-para/[slug]` e a galeria de modelos em `/modelos` (uma página por modelo, com o
  modelo ao vivo e as cores); imagens dos modelos em `public/modelos` (`just template-images`),
  imagem de compartilhamento por página (`opengraph-image.tsx`, `lib/share-image.tsx`, gerada no
  build), JSON-LD em `components/json-ld.tsx`, sitemap com imagens e `robots` bloqueando só as
  áreas privadas.
- **Reembolsos do Stripe e receita líquida (ADR 0063): implementados.** O webhook
  `charge.refunded` (parciais incluídos) grava `payments.refunded_cents`/`refunded_at` de forma
  idempotente; reembolso total estorna o lote como o admin (`refunds::refund_batch`: números
  cancelados na porta, registro em Cancelamentos e auditoria `batch_refund_stripe`); a view
  `revenue_entries` dá bruta, reembolsos e líquida na visão geral do admin (total e 30 dias) e no
  financeiro; **Conferir reembolsos no Stripe** (`POST /api/admin/payments/sync-refunds`) corrige
  os antigos. Remetente único dos e-mails em `config::DEFAULT_MAIL_FROM`
  (`contato@ingressoimpresso.com.br`), `MAIL_FROM` sobrescreve; o domínio raiz já envia nos dois
  ambientes. Falta o que depende do mantenedor: `charge.refunded` no webhook da Stripe.
- **Portaria do dia (ADRs 0067–0071): implementada.** Modo ensaio no app (`DoorCore.evaluate`,
  nada gravado; a amostra é reconhecida por `SAMPLE_QR_TEXT` = `sample_qr_text()`), `POST
  /api/door/rehearsal` e folha de ensaio em PDF (`routes/door_rehearsal.rs`); links que aceitam só
  algumas categorias (`door_access_categories`, desfecho `rejected_wrong_door`, exceção em
  `scans.door_exception`); bilheteria (`sellers.box_office`: vendido = entrou); lista de nomes
  (`guest_list`, `guest_arrivals` com o mesmo cursor `xid8`; desfazer dá `txid` novo,
  `routes/guests.rs`); aba **Ao vivo** (`GET /api/events/{id}/door/live`, `routes/door_live.rs`,
  `pending_scans`/`last_sync_at` dos celulares). Campos novos do manifesto são opcionais para o
  app antigo; `just e2e` cobre ensaio, porta errada e lista (`E2E_API_PORT`/`E2E_WEB_PORT`).

- **Perfil da organização, adiar ou cancelar, extras do ingresso digital (ADRs 0064–0066):
  implementados.** Perfil público em `/painel/organizacao` (`organization_profiles`,
  `routes/organization.rs`): logo moderado como a arte (um `blob` da organização:
  `blobs.organization_id`, `event_id` opcional; servido em `GET /api/logos/{id}` só se não estiver
  em revisão nem recusado), cor, contato e padrões de evento novo; campo `{organizacao}` nos dois
  lados. Adiar, cancelar e desfazer (`routes/event_changes.rs`, parte `manage`): `events.address`,
  `postponed_from_starts_at` (data original da 1ª vez), `canceled_at`; cancelado recusa lote,
  checkout e vendas do vendedor (`event_canceled`), a portaria só mostra a faixa; mensagem pronta e
  aviso no sininho. No ingresso digital, `.ics` feito no navegador, rota no mapa e o salão com a
  mesa do portador (`tableMap`, sem ocupação), tudo offline.

- **Conferir ingresso e Indique e ganhe (ADRs 0075, 0076): implementados.** Página pública
  `/conferir` (câmera, foto ou texto; leitor da portaria sem o service worker dela) e
  `POST /api/verify` (`routes/verify.rs`): o servidor confere a assinatura com o `ticket-core` e diz
  evento, número, categoria e o estado (cancelado, evento cancelado/adiado/passado), nunca "já
  usado" nem quem comprou; `events.public_verify` desliga por evento (aba Digitais). Indicações em
  `routes/referrals.rs` (`referrals`, `organizations.referral_code`, regras em `platform_settings`):
  `/i/<código>` guarda o código e abre `/entrar`; a conta nova fica ligada e, no primeiro lote pago
  em dinheiro a partir do mínimo, as duas ganham crédito na transação que muda o lote para pago
  (`reward_paid_batch`, uma vez); estorno total revoga o que sobrou (`revoke_for_batch` em
  `refund_batch`). Cartão em Minha conta e seção Indicações no admin.

Plano completo em `docs/arquitetura.md` §12.

## Onde está cada coisa

- `docs/arquitetura.md`: visão completa (formato do QR, offline/sync, arquivos, modelo de dados,
  API, fases).
- `CHANGELOG.md`: histórico de versões; `docs/versionamento.md`: regras de versão e como lançar.
- `docs/adr/`: decisões e alternativas. Uma decisão nova exige um ADR novo. Um ADR aceito não é
  reescrito: um ADR novo o substitui.
- Comunidade: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` e `SUPPORT.md` na raiz;
  formulários de issue em `.github/ISSUE_TEMPLATE/`, modelo de PR em
  `.github/pull_request_template.md` e imagem de compartilhamento do repositório em
  `.github/social-preview.png` (subida à mão em Settings → Social preview).
  `apps/web/public/.well-known/security.txt` vence em `Expires`: renove todo ano.

```
crates/ticket-core   formato v1, base45, Ed25519, decisão da portaria, DTOs: puro, sem IO, compila p/ wasm32
                     features: fast (tabelas Ed25519), signing (emissão, só servidor/CLI),
                     serde (DTOs), ts (gera tipos TS)
crates/ticket-wasm   bindings wasm-bindgen: DoorCore (verificação + decisão), nunca assinatura
crates/render        Typst embutido (pacote `ticket-render`): design versionado, QR vetorial, A4 casa,
                     gráfica (TrimBox/BleedBox), controle, ZIP WhatsApp; templates em templates/*.typ,
                     fontes OFL em fonts/ (8 famílias, world.rs); blocos de texto com campos
                     resolvidos em fields.rs (espelho em apps/web/src/lib/ticket-fields.ts);
                     gera em blocos e junta com merge.rs (ADRs 0015, 0017, 0025); faixa da categoria
                     e patrocinadores no design (ADRs 0056, 0059); relatórios em PDF em
                     report_doc.rs (templates/report.typ) e planilhas em sheet.rs (ADR 0058)
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
                     reembolsos do Stripe (webhook charge.refunded e conferência) em
                     routes/refunds.rs (receita pela view revenue_entries),
                     acerto com vendedores (pagamentos e devoluções) em routes/settlement.rs,
                     link do vendedor (página sem conta, marcar vendas) em routes/seller_links.rs,
                     equipe do evento em routes/team.rs (toda rota nova de evento que altera algo
                     entra em team::need, senão fica só para a organização),
                     categorias em routes/categories.rs (NumberTags: categoria e lugar de cada
                     número para os arquivos), mesas em routes/tables.rs, prestação de contas em
                     routes/ledger.rs (resumo, PDF e planilha; report::build é a base),
                     portaria do dia (ADRs 0067–0071): ensaio e folha de ensaio em
                     routes/door_rehearsal.rs, lista de nomes em routes/guests.rs (painel e
                     celulares), ao vivo em routes/door_live.rs; categorias da porta em routes/door.rs,
                     perfil da organização e logo público em routes/organization.rs (ADR 0064),
                     adiar/cancelar em routes/event_changes.rs (ADR 0065; links da portaria por
                     door::extend_accesses),
                     conferir ingresso (público, ADR 0075) em routes/verify.rs, indique e
                     ganhe (código, vínculo no cadastro, recompensa e revogação) em
                     routes/referrals.rs (ADR 0076),
                     conta em routes/account.rs + routes/privacy.rs
                     (exportar/excluir), ingresso digital em routes/tickets.rs (também o enviado
                     pelo vendedor e a segunda via, ADR 0061), novidades em
                     routes/changelog.rs, resultados em routes/analytics.rs; login com Google em
                     google.rs, anti-robô do código em captcha.rs (Turnstile), duas etapas em
                     two_factor.rs (TOTP, recuperação; tentativas em second_factor_attempts) +
                     routes/two_factor.rs, limites por endereço em ratelimit.rs (ADR 0047),
                     e-mails (HTML + texto) em emails.rs, cota em state.rs (send_mail)
packages/api-types   tipos TS da API gerados (src/generated + src/index.ts, NÃO editar)
apps/web             landing em src/app/page.tsx (+ src/components/marketing: simulador de preços em
                     pricing.tsx, exemplos de uso em use-cases.tsx, SectionHeading e FaqList
                     compartilhados); páginas por tipo de evento em app/ingresso-para/[slug]
                     (conteúdo em src/content/seo-event-pages.ts, que também alimenta o sitemap e o
                     rodapé; JSON-LD em components/json-ld.tsx, na home e em cada página; robots
                     bloqueia só "/ingresso$"); galeria de modelos em app/modelos (+ [slug];
                     conteúdo em src/content/seo-templates.ts, modelos de cada tipo de evento em
                     EVENT_TEMPLATES, cartão em marketing/template-card.tsx, modelo ao vivo em
                     marketing/template-sample.tsx); imagens em public/modelos (just
                     template-images, scripts/template-images.mjs) e de compartilhamento em
                     opengraph-image.tsx + lib/share-image.tsx (next/og, estáticas, ADR 0062);
                     conteúdo conferido por test/seo-content.test.ts, página Sobre em app/sobre +
                     components/about, painel em
                     src/app/{entrar,painel}, abas do evento em src/components/event (aba na URL,
                     ?aba=); sistema de design em src/components/ui + tokens em globals.css (ADR 0021);
                     logo em src/components/brand.tsx e public/brand, ícones em public/icons;
                     tema em src/lib/theme{,-script}.ts (data-theme no <html>, ADR 0022);
                     Analytics em src/components/site-analytics.tsx (fora da portaria);
                     PWA do painel: app/manifest.ts + public/sw.js (escopo /, ignora /portaria;
                     guarda /ingresso para abrir offline); CSP com nonce em src/proxy.ts (ADR 0048:
                     o layout raiz lê x-nonce; script inline novo precisa de nonce={nonce});
                     ingresso digital: app/ingresso + components/ticket/ticket-pass.tsx +
                     lib/ticket-pass.ts, aba components/event/digital.tsx (segunda via em
                     ReplaceDialog);
                     documentos legais em src/content/legal.ts (LEGAL_ENTITY, TERMS_VERSION) e
                     components/legal; rodapé em components/marketing/site-footer.tsx;
                     novidades em app/novidades + components/changelog + lib/changelog.ts
                     (agrupadas por versão, groupChangelog);
                     resultados em app/painel/resultados + components/event/event-results.tsx;
                     acerto com vendedores em components/event/sellers.tsx + settlement-dialogs.tsx,
                     regras em lib/settlement.ts e lib/number-list.ts ("12, 15, 40-50");
                     página do vendedor (link privado) em app/vendedor + components/seller +
                     lib/seller-page.ts;
                     equipe: aba em components/event/team.tsx, acesso por parte em
                     components/event/access.tsx (useEventAccess, AreaGate, ReadOnlyNotice) e
                     regras em lib/team.ts;
                     categorias e mesas na aba components/event/categories.tsx + tables.tsx (mapa)
                     e regras em lib/categories.ts; prestação de contas em
                     components/event/accountability.tsx (no Relatório);
                     portaria em src/app/portaria + src/portaria (engine, storage, camera, logic) +
                     public/portaria-sw.js (ADR 0018); Vitest em test/; ensaio, porta por
                     categoria, bilheteria e lista no app (logic.ts, engine.ts, IndexedDB v2 com
                     arrivals/meta, components/portaria/guest-list.tsx); no painel, aba Ao vivo em
                     components/event/live.tsx + live-chart.tsx (regras em lib/door-live.ts) e aba
                     Lista em components/event/guests.tsx (regras em lib/guest-list.ts);
                     editor do ingresso em src/components/event/design*.tsx + prévia ao vivo em
                     src/components/ticket/ticket-view.tsx (regras espelhadas em lib/design-rules.ts),
                     modelos em src/lib/templates (catálogo + fundos SVG em mm), fontes do ingresso
                     em public/fonts/ticket (WOFF2); admin em src/app/painel/admin +
                     src/components/admin (seções agrupadas: financeiro, organização, preços e
                     cupons em billing.tsx, pronunciamentos, e-mails, moderação, auditoria,
                     configurações, incidentes); conta em src/app/painel/conta (+ components/account);
                     sininho e avisos em components/panel/{inbox,platform-notices}.tsx + lib/platform.ts;
                     lista de eventos em app/painel/page.tsx (ordem em lib/event-list.ts); folha
                     Seções do evento em components/event/sections-sheet.tsx (grupos em tabs.ts);
                     folhas arrastáveis e trava de rolagem em components/ui/sheet.ts;
                     duas etapas: cartão em components/account/two-factor.tsx e segundo passo do
                     login em components/two-factor-step.tsx;
                     perfil da organização em app/painel/organizacao, logo/contato/aviso de mudança
                     em components/organization/organization.tsx (useLogo guarda o logo no aparelho)
                     e regras em lib/organization.ts; adiar/cancelar em
                     components/event/event-change.tsx (+ menu em event-actions.tsx), mensagem e
                     avisos em lib/event-change.ts; agenda (.ics), Google Agenda e mapas em
                     lib/calendar.ts; mapa das mesas no ingresso em components/ticket/seat-map.tsx
                     + lib/seat-map.ts (ADRs 0064–0066);
                     status público em app/status + components/status;
                     conferir ingresso em app/conferir + components/verify (ticket-checker,
                     verify-result, verify-settings na aba Digitais) + lib/verify.ts; a câmera e
                     a foto usam portaria/camera.ts (readQrImage);
                     indique e ganhe: app/i/[code] (guarda o código, lib/referral.ts), convite em
                     app/entrar, cartão em components/account/referrals.tsx, admin em
                     components/admin/referrals.tsx;
                     menus e popovers em components/ui/popover.tsx (portal; folha no celular)
e2e/                 portaria.e2e.mjs: 5 "celulares" Chromium com câmera falsa (`just e2e`);
                     csp.e2e.mjs: toda página com nonce e nada recusado (ADR 0048)
packages/ticket-core-wasm  wrapper TS tipado (src/), tipos gerados (src/generated/, NÃO editar),
                     pkg/ gerado por `just wasm` (não versionado), testes Vitest com os vetores
apps/web             Next.js 16 (Vercel): landing; painel e portaria nas fases 3–4
testdata/vectors     ticket-v1.json: vetores compartilhados Rust ↔ WASM (gerados, NÃO editar)
deploy/              compose.dev.yaml (Postgres local), api.Dockerfile, restore-test.sh
scripts/release.mjs  versão do produto e CHANGELOG.md (check, prepare, notes, format), sem dependências;
                     testes em scripts/release.test.mjs (node:test); versão no site via next.config.ts
                     → lib/version.ts (APP_VERSION, VERSION_LABEL, âncora #vX.Y.Z de /novidades)
docs/deploy.md       domínio próprio: Neon, Resend, DNS (Registro.br), Render, Vercel, backup;
                     docs/ensaio.md: ensaio geral
```


## Infraestrutura (ADRs 0009, 0013, 0019)

- **Frontend:** Next.js na Vercel, com pnpm. O deploy é pré-compilado pelo GitHub Actions
  (`.github/workflows/deploy-web.yml`, secrets `VERCEL_*`), porque o build da Vercel não tem Rust;
  `apps/web/vercel.json` desliga os builds da integração Git.
- **Endereços:** site no domínio raiz (`www` redireciona), API em `api.`, e-mail de
  `contato@` no domínio raiz (registros do Resend em `send` e `resend._domainkey`; o antigo
  `mail.` saiu); DNS no Registro.br.
- **API:** Rust no Render, região Virginia. O Blueprint (`render.yaml`) compila
  `deploy/api.Dockerfile` (cargo-chef) e só implanta com o CI verde; o job `api-image` do CI
  compila e sobe a mesma imagem. `/healthz` não toca no banco (é o health check), `/readyz` toca.
  Variáveis `sync: false` (incluindo `ALLOWED_ORIGINS`) vivem no painel do Render; em produção a
  API não sobe sem origens, `PUBLIC_API_URL` https e `ADMIN_EMAILS`. Sessão do painel por token
  Bearer + CORS (ADR 0016); downloads por link temporário.
- **Banco:** Neon `aws-us-east-1`, host direto com `sslmode=verify-full`. Precisa ficar junto da
  API, não do usuário. Dorme quando parado (worker consulta sozinho a cada hora).
- **E-mail:** Resend (o cliente manda `User-Agent`, senão o Resend recusa). Remetente de todos
  os e-mails: `DEFAULT_MAIL_FROM` (`Ingresso Impresso <contato@ingressoimpresso.com.br>`), ou
  `MAIL_FROM` quando definida. `MAIL_DAILY_LIMIT`
  (padrão 95) segura a cota do plano grátis; esgotada, o login oferece o Google (ADR 0028).
- **Opcionais da fase 9:** `RESEND_WEBHOOK_SECRET` (status de entrega no painel de e-mails,
  ADR 0041) e `MODERATION_VISION_API_KEY` + `MODERATION_DAILY_LIMIT` (análise automática das
  artes, ADR 0042). Sem eles tudo funciona, com revisão manual.
- **Anti-robô do login:** `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (as duas ou nenhuma, ADR
  0044) fazem `POST /api/auth/code` exigir um token do Cloudflare Turnstile, conferido em
  `siteverify`. Se o Cloudflare não responder, o código sai assim mesmo (os limites seguem).
- **Login com Google:** `GOOGLE_CLIENT_ID` liga o botão (Google Identity Services); a API confere
  o ID token com as chaves do Google (ADR 0029). A CSP (`src/proxy.ts`, nonce por requisição com
  `'strict-dynamic'`, ADR 0048) libera só `accounts.google.com/gsi/` e, para o Turnstile,
  `challenges.cloudflare.com`; scripts de terceiros entram por `document.createElement`. O botão é o oficial, com o tema do site e o
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
  handler definir) e HSTS, com 90 s de timeout por requisição. O **Deploy web** é o último job do
  CI (`uses: ./.github/workflows/deploy-web.yml`, só em `push`), no branch empurrado, para as
  proteções dos Environments valerem; o CI tem o job **Dependency audit**.
- **Releases (ADR 0049):** no push do `main`, o job **Release** (depois do Deploy web) cria a tag
  `vX.Y.Z` e a GitHub Release com as notas do `CHANGELOG.md`, se a tag ainda não existe. O
  workflow **Branches** apaga o branch de um PR integrado (nunca `main`/`staging`) e, rodado à
  mão, lista ou apaga os branches já contidos no `main`.

## Comandos

Pré-requisitos:

- `rustup`: a toolchain fixa vem de `rust-toolchain.toml`;
- Node ≥ 22.13 e pnpm 12, via `packageManager`;
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
just release-check    # versão igual em todos os manifestos e CHANGELOG.md bem formado (parte de `just check`)
just release minor    # no staging: corta "Não lançado" na versão nova (major|minor|patch|X.Y.Z) e sobe os manifestos
just release-notes    # notas de uma versão do CHANGELOG.md (as mesmas da GitHub Release)
just api-types-index  # reexporta os tipos gerados em packages/api-types/src/index.ts
just template-images  # imagens dos modelos em apps/web/public/modelos (com o site rodando em WEB)

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
  cima sozinhos (renderizados em portal, nunca cortados por um card, fecham ao arrastar a alça) e
  os campos têm 16px, para o iPhone não dar zoom. Grades de `Stat` usam duas colunas no celular.
- **Celular primeiro (ADR 0060):** toque precisa de 44 px: use os tamanhos de `Button` (crescem
  sozinhos em `pointer-coarse`), `icon-sm` para menus em cartões e `touch-target` (num elemento
  `relative`/`absolute`) em controles pequenos de propósito. Todo `hover:` de fundo tem um
  `active:` (o `hover:` do Tailwind 4 não vale no toque). Ação de `Alert` vai em `action`, fechar
  em `onDismiss`. Tabela larga vai em `TableScroll`. Campo de lista de números usa
  `NUMBER_LIST_INPUT` (o teclado numérico do iPhone não tem hífen nem vírgula). Algo `fixed` ou
  `sticky` no topo ou no pé soma `env(safe-area-inset-*)`, e nunca fica dentro de um elemento com
  `backdrop-blur`/`transform` (ele vira o bloco de contenção do `fixed`).
- **Design do ingresso em dois lados:** regras de `design.rs` e campos de `fields.rs` têm espelho
  no painel (`lib/design-rules.ts`, `lib/ticket-fields.ts`) para a prévia ao vivo; mudou um, mude
  o outro (os testes usam os mesmos exemplos). Modelo novo é TypeScript em `lib/templates`, e
  `test/templates.test.ts` valida todo modelo em toda paleta; ele também ganha uma entrada em
  `content/seo-templates.ts` e a imagem por `just template-images` (`test/seo-content.test.ts`
  cobra as duas). Fonte nova entra nos dois lados
  (`crates/render/fonts` + `world.rs` + `ticket.typ` e `public/fonts/ticket` em WOFF2).
- **Textos de interface centralizados:** `apps/web/src/texts/pt-BR.ts` no web e módulos `texts.rs`
  no Rust; e-mails em `emails.rs` (todo texto do usuário passa por `escape`); documentos legais
  em `apps/web/src/content/legal.ts`. Mudou Termos ou Privacidade: mude a data e o
  `TERMS_VERSION` nos dois lados (`legal.ts` e `auth.rs`). Sem framework de i18n.
- **Rust:**
  - toolchain 1.99 (edition 2024);
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
  ESLint 9 (os plugins do `eslint-config-next` ainda não suportam o 10). O pnpm 12 recusa versões
  publicadas há menos de um dia (`minimumReleaseAge`) e exige uma decisão em `allowBuilds` para
  todo pacote com script de instalação.
- **Testes:**
  - criptografia e formato: `proptest` + `testdata/vectors`, rodando em Rust e no WASM/Vitest;
  - servidor: `sqlx::test` com Postgres real;
  - render: ida e volta gerar → rasterizar → decodificar QR (`rqrr`) → verificar; PDFs checados
    com `lopdf` (páginas, MediaBox/TrimBox, determinismo). Typst fixo em `=0.15.1` (a versão mais
    recente publicada): atualizar, quando sair outra, é tarefa planejada.
- **Versões (ADR 0049):** SemVer único do produto, independente da versão do formato do QR.
  Mudança perceptível (organizador, público, portaria, admin) ganha uma linha em
  `## [Não lançado]` do `CHANGELOG.md`, em português e do ponto de vista de quem usa, no mesmo PR.
  Nunca mude a versão à mão: `just release` faz isso no `staging`, com o commit
  `chore(release): 🔖 vX.Y.Z`; a tag e a release são do CI. Hotfix: `just release patch` num
  branch do `main`, depois `main` → `staging`.
- **Commits:** pequenos, em **Conventional Commits + gitmoji**, no formato
  `tipo(escopo): <gitmoji> assunto`, por exemplo `feat(core): ✨ ...`, `fix(door): 🐛 ...`,
  `docs(adr): 📝 ...`, `test(wasm): ✅ ...`, `ci: 👷 ...`, `chore: 🔧 ...`,
  `refactor: ♻️ ...`, `chore(release): 🔖 v1.3.0`. Regras:
  - assunto em inglês, curto e no imperativo;
  - corpo opcional, de uma ou duas linhas, direto ao ponto;
  - cada commit deve compilar e passar em `just check`.
- **Antes de dar uma fase por concluída:** `just check` verde, a linha no `CHANGELOG.md` e este
  arquivo atualizado (status, comandos, estrutura).
