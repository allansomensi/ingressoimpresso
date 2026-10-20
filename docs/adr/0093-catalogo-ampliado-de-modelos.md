# 0093. Catálogo ampliado de modelos

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0025](0025-textos-e-modelos-de-ingresso.md) (modelos prontos) e
  [0062](0062-paginas-publicas-para-busca.md) (galeria pública `/modelos`)

## Contexto

Os 16 modelos de ingresso e as 2 fichas cobriam os eventos mais comuns, mas quem organiza um
aniversário, um show de rock, um costelaço, uma corrida ou um bingo não achava nada com a cara do
seu evento e saía do editor para montar a arte por fora. Cada modelo novo também é uma página
pública que alguém procura ("modelo de convite de 15 anos").

## Opções consideradas

1. **Modelos enviados como imagem pronta.** Rápido de fazer, mas perde as cores, os campos e a
   edição, e pesa no site.
2. **Mais modelos no mesmo formato** (design + fundo SVG em mm, ADR 0025), em vários arquivos.

## Decisão

Opção 2: 58 modelos novos (48 de ingresso e 10 de ficha), 76 no total.

- `lib/templates/catalog.ts` lista todos (`TEMPLATES`); os auxiliares (tipos, `block`, `number`,
  `design`, formatos) ficam em `lib/templates/kit.ts` e os modelos novos em um arquivo por tema:
  `music.ts`, `celebrations.ts`, `community.ts`, `everyday.ts` e `tokens.ts`.
- Duas categorias novas na galeria: **Aniversário** e **Gastronomia**.
- No painel, "Todos" de um evento de ingressos deixa as fichas de fora (elas imprimem um produto,
  não uma entrada); a categoria Fichas continua lá.
- A galeria pública `/modelos` ganha a mesma linha de tipos de evento, com a contagem de cada um.
  Todos os cartões continuam no HTML (o filtro começa em "Todos"), para os buscadores.
- "Outros modelos" de uma página puxa primeiro os do mesmo tipo de evento
  (`relatedTemplatePages`), e cada tipo de evento em `/ingresso-para` mostra seis modelos.
- A landing mostra uma seleção variada (`SHOWCASE` em `template-showcase.tsx`), não o catálogo
  inteiro: 76 prévias ao vivo pesariam no topo da página.

## Consequências

- Cada modelo novo precisa, como antes, do nome em `texts/pt-BR/templates.ts`, do evento de
  exemplo em `landing.ts`, da página em `content/seo-templates.ts` e da imagem por
  `just template-images` (`test/seo-content.test.ts` cobra as duas últimas).
- O pacote do editor fica maior (os fundos são código); a galeria do painel e a de `/modelos`
  continuam desenhando só o que está perto da tela.
