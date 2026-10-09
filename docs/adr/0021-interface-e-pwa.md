# 0021. Identidade visual, sistema de design e painel instalável (PWA)

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0009](0009-frontend-nextjs-vercel.md) (frontend) e [0018](0018-portaria-pwa.md)
  (a portaria continua com o próprio service worker)

## Contexto

O painel do MVP era funcional, mas cru: sem marca, sem hierarquia visual, formulários soltos,
sem estados de carregamento ou vazios, sem confirmação de ações destrutivas e sem modo escuro.
Para abrir o produto a outros organizadores (e cobrar, ADR 0020), a interface precisa transmitir
confiança e guiar quem nunca usou. O painel também é usado no celular, no dia do evento.

## Opções consideradas

1. **Biblioteca de componentes pronta (shadcn/ui + Radix, MUI).** Rápida, mas traz muitas
   dependências e um visual genérico; o shadcn copia dezenas de arquivos que precisaríamos manter.
2. **Sistema de design próprio, pequeno, sobre Tailwind 4.** Tokens semânticos (cores, sombras,
   raios) em CSS, uma dúzia de componentes (`src/components/ui`) e ícones `lucide-react`. Diálogos
   no `<dialog>` nativo (foco, Esc e camada superior do próprio navegador) e toasts com `sonner`.
3. **PWA com `next-pwa`/Workbox.** Gera o service worker no build, mas é mais uma peça no build e
   conflita facilmente com o worker da portaria, que já é escrito à mão (ADR 0018).

## Decisão

- **Marca:** a logo é um ingresso com picote e o canto de um QR code, em gradiente violeta
  (`#8B6CFF` → `#4A22D6`) com um detalhe âmbar. O SVG fica em `public/brand/` e no componente
  `LogoMark`; os PNGs (192, 512, maskable e Apple) são gerados do mesmo desenho. A portaria usa a
  variante escura com um selo verde de "confere".
- **Sistema de design (opção 2):** tokens em `src/app/globals.css` (`bg`, `surface`, `fg`, `brand`,
  `success`, `warning`, `danger`...), redefinidos para o modo escuro conforme o sistema. Fonte
  Geist (pacote `geist`, servida pela nossa origem, coerente com a CSP `font-src 'self'`).
  Componentes em `src/components/ui`; textos continuam todos em `src/texts/pt-BR.ts`.
- **Painel:** barra superior com conta e "instalar app"; lista de eventos em cartões; página do
  evento com **Visão geral** (passo a passo do que falta) e abas na URL (`?aba=lotes`), que o
  retorno da Stripe também usa. Ações destrutivas pedem confirmação; resultados viram toasts.
- **PWA do site (opção 2, à mão):** `app/manifest.ts` (início em `/painel`, ícones e atalhos) e
  `public/sw.js` com escopo `/`: arquivos `/_next/static/` em cache, páginas sempre pela rede e,
  sem rede, a página `/offline`. Ele **ignora `/portaria`** e não é registrado nas páginas da
  portaria; a portaria continua com `portaria-sw.js` e o próprio manifesto. Cada worker só apaga
  os próprios caches (`app-*` e `portaria-*`). Os dois arquivos saem com `Cache-Control: no-cache`.
- **Instalação:** botão "Instalar app" com o `beforeinstallprompt` (Android, Chrome no
  computador) e instruções de "Adicionar à Tela de Início" no iPhone.

## Consequências

- O painel não funciona sem internet (ele depende da API); offline ele mostra uma página
  explicando isso e um atalho para a portaria, que sim funciona offline.
- Componentes próprios significam manter acessibilidade à mão (rótulos, `role="tab"`, foco).
  O teste ponta a ponta continua usando os papéis e rótulos acessíveis.
- Novas dependências do web: `lucide-react`, `sonner` e `geist`.
- Mudar a cor da marca é mudar os tokens (e regenerar os PNGs dos ícones a partir dos SVGs).
