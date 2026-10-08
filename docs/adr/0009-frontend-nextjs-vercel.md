# 0009. Frontend Next.js na Vercel, com a API Rust em outro domínio

- **Status:** Aceito
- **Data:** 2026-10-08

## Contexto

O frontend tem três partes:

- uma landing;
- um painel autenticado (formulários, editor de layout, relatórios);
- a portaria como PWA offline.

O mantenedor decidiu hospedar o Next.js na Vercel, com pnpm. A regra de negócio vive na API Rust
(ADR 0013), em `api.ingressoimpresso.com.br`.

## Opções consideradas

**Onde roda o frontend:**

1. **Export estático servido pelo Axum.** Um processo só, mas sem CDN global, sem previews por PR e
   com as limitações do export (sem rotas dinâmicas). *Proposta original, substituída pela decisão
   do mantenedor.*
2. **Next.js na Vercel.** CDN global (com borda em São Paulo), previews e zero operação de
   servidor de frontend. A Vercel não tem Rust no ambiente de build, o que importa para o WASM do
   núcleo.

**Como o navegador fala com a API:**

1. **Rewrite da Vercel (`/api/*` → Render).** Mesma origem: sem CORS e cookies triviais, inclusive
   nos previews. Mas põe a Vercel no caminho crítico da portaria e dos downloads grandes (ZIP de
   PNGs), com limites de proxy pouco documentados.
2. **Chamada direta a `api.ingressoimpresso.com.br`** com CORS restrito e
   `credentials: 'include'`. `ingressoimpresso.com.br` e `api.ingressoimpresso.com.br` são o mesmo
   *site* (domínio registrável), então um cookie `SameSite=Lax` funciona. A portaria e os downloads
   não passam pela Vercel. Previews em `*.vercel.app` são outro site, e o login no painel não
   funciona neles.

**Como o WASM do núcleo chega ao build:**

1. Instalar Rust no build da Vercel: lento (minutos por build) e frágil.
2. Publicar o pacote WASM no npm: exige versionamento e publicação a cada mudança do núcleo.
3. **Build no GitHub Actions + `vercel deploy --prebuilt`:** um único pipeline compila o WASM,
   roda os testes e envia à Vercel exatamente o que foi testado.

## Decisão

- **Plataforma:** Next.js (App Router) na Vercel, com pnpm workspaces.
- **Sem regra de negócio no Next.** Não usamos Server Actions nem Route Handlers que toquem dados.
  As páginas do painel e da portaria são componentes de cliente que falam direto com a API Rust. A
  landing é estática (SSG).
- **API em outro domínio:** chamada direta com CORS (lista de origens permitidas) e cookie de
  sessão `HttpOnly; Secure; SameSite=Lax`, *host-only* em `api.ingressoimpresso.com.br`. O guarda
  de autenticação é no cliente (`GET /api/me`), porque o middleware do Next não enxerga esse
  cookie, e é melhor assim: só há uma fonte de verdade.
- **Deploy:** GitHub Actions compila o WASM → `vercel build` → `vercel deploy --prebuilt`. A
  integração Git automática da Vercel fica desligada.
- **Previews de PR:** servem para revisar telas que não exigem login (landing e portaria com dados
  de demonstração). Se previews autenticados forem necessários, usar um domínio de preview sob
  `ingressoimpresso.com.br`, recurso de plano pago da Vercel.
- **Contrato da API:** DTOs Rust com `ts-rs` geram `packages/api-types`. O CI falha se houver
  diferença.
- **Qualidade:** TypeScript 6.0 (o `typescript-eslint` ainda não suporta a 7), `strict` +
  `noUncheckedIndexedAccess`, ESLint com `no-explicit-any: error`, Vitest. Os testes E2E usam
  Playwright, com câmera falsa no Chromium para a portaria.
- **Service Worker** só no escopo `/portaria/`. Na fase 4, avaliar Serwist com a versão do Next
  em uso. Se ele não for compatível com o bundler, usar um SW escrito à mão com a lista de precache
  gerada no build.

## Consequências

- A Vercel proíbe uso comercial no plano Hobby. Ao abrir para clientes, é preciso o plano Pro.
- A portaria depende da Vercel só para o primeiro carregamento (depois vem do cache do SW) e da
  API para o sync. Uma queda da Vercel no dia do show não afeta uma portaria já preparada.
- São duas plataformas de deploy (Vercel + Render), ambas acionadas pelo mesmo workflow do GitHub
  Actions.
