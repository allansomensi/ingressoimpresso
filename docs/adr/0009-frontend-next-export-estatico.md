# 0009. Next.js em export estático servido pelo Axum

- **Status:** Proposto
- **Data:** 2026-10-08

## Contexto

O frontend tem três partes:

- uma landing;
- um painel autenticado (formulários, editor de layout, relatórios);
- a portaria como PWA offline.

Você prefere Next.js e TypeScript. Cada processo a mais em produção custa tempo de manutenção.

## Opções consideradas

1. **Next.js com servidor Node em produção (SSR, server actions).** É o modo "completo", mas traz
   dois runtimes, duas imagens, dois conjuntos de logs e uma camada de API duplicada (server
   actions × Axum). Páginas SSR também complicam o cache offline da portaria.
2. **Next.js com `output: 'export'` (estático), servido pelo binário Axum (`tower-http::ServeDir`).**
   Um único processo em produção. Mesma origem, então sem CORS e com cookies simples. A landing
   continua pré-renderizada em HTML. Perde-se SSR, server actions, middleware, otimização de
   imagens e rotas dinâmicas sem `generateStaticParams`.
3. **Vite + React Router (SPA) + `vite-plugin-pwa`.** Mais leve e com um plugin PWA maduro, mas sai
   da sua preferência e não ganha muito sobre a opção 2.

## Decisão

Opção 2.

- **Rotas:** `/painel/evento?id=...`. Os IDs vão em query string, nunca em segmentos dinâmicos.
- **Service Worker** apenas no escopo `/portaria/`. Começamos com Serwist e, se ele não se der bem
  com o export, usamos um SW escrito à mão com a lista de precache gerada no build.
- **Contrato da API:** DTOs Rust com `ts-rs` geram `packages/api-types`. O CI falha se houver
  diferença.
- **Dados:** fetch tipado + TanStack Query no painel, e `idb` na portaria.
- **Qualidade:** TS `strict`, `noUncheckedIndexedAccess` e ESLint com `no-explicit-any: error`.

## Consequências

- Produção tem um só binário servindo API e estáticos.
- Não há renderização no servidor para páginas com dados. É irrelevante para o painel (atrás de
  login) e para a portaria (offline).
- Se no futuro precisarmos de páginas públicas dinâmicas com SEO (ex.: página do evento), reavaliar.
