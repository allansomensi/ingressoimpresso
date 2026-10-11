# 0062. Páginas públicas para busca: tipos de evento e galeria de modelos

- **Status:** Aceito
- **Data:** 2026-10-11
- **Complementa:** [0025](0025-textos-e-modelos-de-ingresso.md) (textos e modelos) e
  [0048](0048-csp-com-nonce.md) (CSP com nonce)

## Contexto

Quem precisa de ingresso procura pelo próprio evento ("ingresso para festa junina", "convite de
formatura") ou por um modelo ("modelo de ingresso para imprimir"), não por "sistema de ingressos".
O site tinha só a página inicial e as páginas institucionais. Os 16 modelos existiam só dentro do
painel, e um link mandado no WhatsApp mostrava sempre a mesma imagem. O `robots.txt` também
bloqueava, por prefixo, qualquer endereço que começasse com `/ingresso`.

## Opções consideradas

1. **Só a página inicial**, com mais texto. Uma página não responde a buscas tão diferentes.
2. **Um blog.** Exige escrita contínua e não mostra o produto.
3. **Páginas por tipo de evento e uma galeria pública dos modelos**, geradas a partir de conteúdo
   versionado, com dados estruturados e imagens próprias.

## Decisão

Opção 3.

- **`/ingresso-para/[slug]`:** oito tipos de evento, com o conteúdo em
  `src/content/seo-event-pages.ts`. Cada página tem dores, benefícios, perguntas, os modelos
  daquele tipo de evento e links para os outros tipos.
- **`/modelos` e `/modelos/[slug]`:** uma página por modelo do catálogo, com o conteúdo em
  `src/content/seo-templates.ts`. A página mostra o modelo ao vivo (`TicketView`) com um evento de
  exemplo, as combinações de cores, o que vem no modelo e a página do tipo de evento.
- **Imagens dos modelos versionadas** em `public/modelos/<slug>.jpg`, com 1200 px de largura.
  Elas são capturadas das próprias páginas por `just template-images` (Playwright), porque o
  `TicketView` é um componente do navegador (mede texto e carrega fontes WOFF2). As imagens servem
  à grade da galeria, à busca de imagens (no sitemap) e às imagens de compartilhamento. Um teste
  (`test/seo-content.test.ts`) falha se um modelo não tiver imagem.
- **Imagem de compartilhamento por página** (`opengraph-image.tsx`, com `next/og`): o título da
  página sobre o roxo da marca, com os modelos dela. As imagens são geradas no build
  (`force-static` + `generateStaticParams`), com a fonte Geist (TTF) e as imagens lidas de pastas
  fixas, para o rastreamento de arquivos não levar o projeto inteiro. O X usa o `og:image` como
  imagem do cartão.
- **Dados estruturados** (`components/json-ld.tsx`):
  - na página inicial, `Organization`, `WebSite` e `SoftwareApplication`;
  - nos tipos de evento, `WebPage`, `BreadcrumbList` e `FAQPage`;
  - na galeria, `CollectionPage` com `ItemList`;
  - em cada modelo, `WebPage` com `ImageObject`.

  É um bloco de dados (`application/ld+json`), que o navegador não executa, então não precisa do
  nonce da CSP.
- **Títulos** escritos para a busca, sem o sufixo do site, até cerca de 60 caracteres, e
  descrições até 160, conferidos pelo teste. A página inicial passa a começar pelas palavras que
  as pessoas buscam.
- **`robots.txt`:** bloqueia `/painel`, `/portaria`, `/offline`, `/vendedor` e só o ingresso
  digital (`/ingresso$`). As páginas privadas continuam com `noindex`.

## Consequências

- Modelo novo no catálogo pede uma entrada em `seo-templates.ts` e `just template-images` com o
  site rodando. O teste lembra das duas.
- As imagens dos modelos somam cerca de 1 MB no repositório. Mudou o desenho de um modelo: gere
  as imagens de novo.
- Os preços citados no conteúdo (R$ 0,05 a R$ 0,15 e 30 grátis) são texto. Se a tabela de preços
  mudar no admin, o conteúdo precisa ser revisto à mão.
- O resultado depende de indexação e tempo: o acompanhamento é pelo Search Console (impressões
  por página em `/ingresso-para/` e `/modelos/`).
