# 0081. Guias, página de preços e SEO técnico

- **Status:** Aceito
- **Data:** 2026-10-14
- **Complementa:** [0062](0062-paginas-publicas-para-busca.md) (páginas públicas para busca) e
  [0048](0048-csp-com-nonce.md) (CSP com nonce)

## Contexto

O ADR 0062 criou as páginas por tipo de evento e a galeria de modelos. Uma auditoria de SEO do
site público encontrou o seguinte:

- **Prévias de link erradas.** O Next.js substitui, e não mescla, o `openGraph` e o `twitter` do
  layout raiz. As páginas que definiam só o título (Sobre, Suporte, Novidades, Status, Entrar e
  documentos legais) mostravam no WhatsApp e no Facebook o título e a descrição da página
  inicial. Quando uma página define o próprio `openGraph`, ela também perde a imagem do layout
  raiz.
- **Busca informativa sem resposta.** Quem organiza evento busca primeiro "como fazer ingresso
  para festa", "rifa numerada para imprimir", "controle de entrada de evento" e "vender ingresso
  sem taxa". O site só respondia a buscas de quem já procurava um produto. O ADR 0062 descartou
  um blog porque ele "exige escrita contínua e não mostra o produto".
- **Preço fora do HTML.** O simulador lia `/api/pricing` só no navegador: o HTML não tinha
  preço, e o bloco de carregamento empurrava a página (CLS). "Preços" era só uma âncora da
  página inicial, sem página própria para buscas como "quanto custa fazer ingresso".
- **Tipos de evento que faltavam.** Não havia páginas para "ingresso para festa" (a busca mais
  ampla), campeonato, palestra e curso, carnaval e Réveillon, embora os modelos existissem. As
  páginas existentes eram curtas e não tinham uma página acima delas.
- **Ligações internas fracas.** As páginas por tipo de evento só eram alcançadas pelo rodapé. Os
  públicos da página inicial eram texto sem link.
- **Dados estruturados incompletos.** A página inicial não marcava as próprias perguntas
  frequentes, a organização não tinha contato, o preço do `SoftwareApplication` era fixo no
  código e a trilha das páginas de evento não passava por uma página de tipos de evento.
- **`robots.txt` escondendo o `noindex`.** `/vendedor`, `/ingresso` e `/i/` estavam bloqueados no
  `robots.txt`. Um buscador que não lê a página não vê o `noindex` dela e pode listar o endereço
  sem conteúdo quando ele aparece em outro site.

## Opções consideradas

1. **Só correções técnicas.** Resolve as prévias e o `robots.txt`, mas não responde às buscas
   informativas.
2. **Blog com publicação contínua.** Continua com o problema apontado no ADR 0062.
3. **Correções técnicas, guias perenes escritos sobre o produto, página de preços e mais páginas
   por tipo de evento**, todos gerados de conteúdo versionado e conferidos por teste.

## Decisão

Opção 3.

- **Metadados num lugar só:** `lib/seo.ts` (`pageMetadata`) gera título, descrição, endereço
  canônico, Open Graph e cartão do X com as mesmas palavras. Toda página pública passa por ele e
  tem um `opengraph-image` próprio. O teste falha se faltar a imagem.
- **Guias** (`/guias` e `/guias/[slug]`, conteúdo em `src/content/seo-guides.ts`): nove artigos
  perenes que respondem a uma busca e levam ao produto: como fazer ingresso para festa, como
  evitar ingresso falso, controle de entrada, venda com vendedores, rifa numerada (com o que a
  lei exige, ADR 0035), vender sem taxa, como imprimir, convites de formatura e ingresso pelo
  WhatsApp. Cada guia tem data, sumário, perguntas, modelos sugeridos e páginas de evento
  ligadas. Os links internos usam `[texto](/caminho)` e o teste confere se cada destino existe.
  Os dados estruturados são `Article`, `BreadcrumbList` e `FAQPage`. Os guias não são um blog: não
  têm calendário de publicação e são revistos quando o produto muda.
- **Página de preços** (`/precos`): simulador, tabela, como a cobrança funciona, comparação com
  taxa por venda e perguntas sobre pagamento. A página inicial e a página de preços leem a tabela
  no servidor (`lib/pricing-server.ts`), com cache de 10 minutos e limite de 2,5 s. Sem a API, a
  página sai sem preço e o navegador busca a tabela, como antes. O fim de uma promoção aparece no
  horário de Brasília (`brasiliaDateTime`), igual no servidor e em qualquer navegador. A oferta
  dos dados estruturados vem da mesma tabela.
- **Tipos de evento:** cinco páginas novas (festa, campeonato, palestra e curso, carnaval e
  Réveillon), passo a passo e mais perguntas em todas, e uma página de tipos de evento
  (`/ingresso-para`) acima delas, na trilha visível e nos dados estruturados. Cada página de
  evento e de modelo lista os guias ligados a ela.
- **Ligações internas:** os públicos da página inicial apontam para as páginas de evento, o menu
  passa a levar a Guias (no lugar da âncora Recursos), Preços leva a `/precos` e o rodapé ganha
  Tipos de evento, Guias e a lista dos guias.
- **Dados estruturados:** organização com logo de 512 px, contato e área atendida (Brasil);
  `FAQPage` na página inicial, em Preços e no Suporte; `AboutPage` em Sobre; `ContactPage` no
  Suporte; trilhas com `@id` ligadas às páginas.
- **Busca:** `max-image-preview:large` e trechos completos para o Google. As variáveis
  `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` e `NEXT_PUBLIC_BING_SITE_VERIFICATION` geram as tags de
  verificação quando o domínio não é verificado por DNS. O sitemap passa a ter `lastmod` só onde
  a data é verdadeira (constantes nos arquivos de conteúdo).
- **`robots.txt`:** bloqueia só `/painel`, `/portaria` e `/offline`. Os links privados
  compartilhados (ingresso digital, página do vendedor e indicação) podem ser lidos, para o
  `noindex` deles valer. O token vai no fragmento e nunca chega ao servidor (ADRs 0030 e 0053).
- **`/llms.txt`:** um resumo do produto em texto simples (o que faz, o que não faz e quanto custa)
  e a lista das páginas, para assistentes que leem o site antes de responder. Ele é gerado do
  mesmo conteúdo, com `X-Robots-Tag: noindex`.

## Consequências

- Guia novo é uma entrada em `seo-guides.ts`. O teste cobra título até 60 caracteres, descrição
  de 70 a 160, pelo menos 500 palavras, perguntas, modelos e páginas de evento que existem e links
  internos válidos.
- Os preços citados nos textos (R$ 0,15 a R$ 0,05, 30 grátis e "menos de R$ 30" para 200
  ingressos) continuam sendo texto. Se a tabela mudar, revise `seo-guides.ts`,
  `seo-event-pages.ts`, `pricing-page.ts` e `content/llms.ts`. O simulador e os dados
  estruturados acompanham a API sozinhos.
- Mudou o conteúdo de uma página de evento ou de modelo: atualize `EVENT_PAGES_UPDATED_AT` ou
  `TEMPLATE_PAGES_UPDATED_AT`. Um guia tem o próprio `updatedAt`.
- A página inicial e a de preços passam a chamar a API no servidor, no máximo uma vez a cada
  10 minutos por região da Vercel.
- O acompanhamento continua pelo Search Console: impressões e cliques em `/guias/`,
  `/ingresso-para/` e `/precos`, e cadastros vindos dessas páginas na Vercel Analytics.
