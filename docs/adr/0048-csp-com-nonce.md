# 0048. CSP com nonce por requisição no site

- **Status:** Aceito
- **Data:** 2026-10-10

## Contexto

O token da sessão do painel fica no `localStorage` (ADR 0016), então a Content Security Policy
é a principal defesa contra um script injetado: quem conseguisse rodar JavaScript no site
levaria a sessão por 30 dias. A política estática em `next.config.ts` precisava de
`'unsafe-inline'` em `script-src`, porque o Next.js escreve scripts inline (dados de hidratação,
bootstrap) e o tema é aplicado por um script no `<head>`. Com `'unsafe-inline'`, qualquer HTML
injetado executa. A ADR 0047 deixou isso como próximo passo.

## Opções consideradas

1. **Hashes dos scripts inline:** cobre o script do tema, mas não os scripts que o Next gera por
   página (os dados de hidratação mudam a cada render).
2. **Nonce por requisição, páginas dinâmicas:** o Next.js lê o nonce do cabeçalho
   `Content-Security-Policy` da requisição e o põe em todo script que escreve; o layout põe no
   script do tema. Exige renderizar toda página a cada requisição (uma página pré-renderizada no
   build não teria o nonce daquela visita).
3. **Nonce só nas rotas com sessão** (`/painel`, `/entrar`...): as páginas públicas continuariam
   estáticas, mas o `localStorage` é da origem inteira: um XSS na landing leria o token do mesmo
   jeito.

## Decisão

Opção 2. `apps/web/src/proxy.ts` gera um nonce de 128 bits por requisição de página, monta a
política com `script-src 'self' 'nonce-...' 'strict-dynamic' 'wasm-unsafe-eval'` (mais os hosts
do Google Identity e do Turnstile para navegadores sem CSP3) e a envia no cabeçalho da requisição
(para o Next) e da resposta (para o navegador). O layout raiz lê `x-nonce` com `headers()`, o que
torna todas as páginas dinâmicas, e o aplica ao script do tema. Os scripts de terceiros (Google,
Turnstile, Vercel Analytics) continuam funcionando porque são criados pelo nosso código com
`document.createElement`, que `'strict-dynamic'` permite. As demais diretivas não mudam. Em
desenvolvimento não há CSP (o fast refresh usa `eval`), como antes. Arquivos estáticos
(`/_next/static`, ícones, fontes, service workers, `robots.txt`, `sitemap.xml`) ficam fora do
`matcher` e continuam cacheados pela CDN.

## Consequências

- Nenhuma página do site é mais pré-renderizada: cada visita roda a função na Vercel. O site é
  pequeno e o conteúdo vem do React; o custo é tempo de resposta um pouco maior na primeira
  visita e uso de função no plano Pro.
- Um script inline que alguém venha a adicionar ao layout precisa de `nonce={nonce}`; sem ele, o
  navegador bloqueia e o console avisa. Scripts de terceiros devem ser carregados por
  `createElement`, nunca por `<script src>` no JSX sem nonce.
- `/offline` e `/ingresso` guardados pelo service worker carregam o nonce da visita em que foram
  salvos, junto com o cabeçalho da mesma resposta: continuam abrindo sem rede.
- O `'unsafe-inline'` de `style-src` fica: o Next e o React escrevem estilos inline, e um estilo
  injetado não lê o `localStorage`.
