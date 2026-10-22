# 0120. Auditoria de interface e SEO: acessibilidade, estados honestos e páginas indexáveis

- **Status:** Aceito
- **Data:** 2026-10-22
- **Complementa:** [0060](0060-interface-pensada-para-o-celular.md) (celular primeiro), [0081](0081-guias-precos-e-seo-tecnico.md)
  (SEO técnico), [0062](0062-paginas-publicas-para-busca.md) (modelos e tipos de evento),
  [0095](0095-pagina-publica-do-evento.md) (página do evento), [0118](0118-lembretes-marca-movel-e-revisao-de-producao.md)
  (revisão para produção)

## Contexto

Com o produto inteiro implementado, uma auditoria de interface, acessibilidade e SEO percorreu as
112 páginas públicas do site (rastreadas no build de produção, em 1280 px e em 360 px de toque) e
o código de tudo que uma pessoa alcança sem login: landing, modelos, guias, tipos de evento,
preços, login, ingresso digital, link do vendedor, `/conferir`, certificado, página do evento,
status, novidades e os documentos legais. Não havia overflow horizontal nem erro de console em
página nenhuma, e cada página tinha um `h1`, descrição, canônico e imagem de compartilhamento.
O que apareceu foram lacunas de acabamento que separam um site que funciona de um que parece
profissional para quem usa teclado, leitor de tela ou um celular em sinal fraco:

- **Teclado e leitor de tela.** As páginas públicas não tinham o link "pular para o conteúdo"
  (o painel tinha); o menu do celular abria sem levar o foco e deixava o Tab passar por baixo
  dele; os controles segmentados (tema, filtro de modelos, modos do `/conferir`, filtros do
  vendedor, formas de pagamento do caixa) eram botões `role="radio"` todos na ordem de tabulação
  e sem setas; a faixa de modelos da landing só parava com o mouse; a dica de um campo entrava no
  nome do campo (ficava dentro do `<label>`); erros do login não eram ligados aos campos; depois de
  um código errado, os seis quadrados ficavam desabilitados e o foco caía no `<body>`; a resposta
  do `/conferir`, a transferência de ingresso e o descadastro trocavam a tela sem mover o foco.
- **Estados que mentiam.** O descadastro e o certificado diziam "link inválido" para qualquer
  falha, inclusive sem internet ou em manutenção, e o certificado é justamente o que um terceiro
  abre para conferir se é verdadeiro; a página do evento (`/e/<endereço>`) virava 404 numa queda
  da API, com `noindex`, para todo link compartilhado; o ingresso e o link do vendedor chamavam
  qualquer erro de "sem conexão"; a página offline mandava para o painel e perdia o `#token` do
  link; o status mostrava 90 dias verdes antes de ler qualquer dado; uma requisição em sinal fraco
  girava para sempre.
- **Contraste.** O texto preto ou branco sobre a cor de uma categoria, do organizador ou da faixa
  do ingresso escolhia o branco até uma luminância de 0,35 (0,4 no ingresso digital): sobre um
  laranja ou um verde médio, branco fica em 2,5:1. A regra impressa (`render.rs`) e a prévia
  (`design-rules.ts`) tinham o mesmo limite.
- **Toque.** O seletor de tema (36 px), o botão `sm` (40 px), os atalhos do simulador, as fichas
  do caixa e os links do rodapé e dos documentos legais ficavam abaixo dos 44 px do ADR 0060; os
  campos caíam para 15 px num iPhone deitado (que passa do `sm`), e o Safari dava zoom.
- **SEO.** O título da landing tinha 63 caracteres; as 76 páginas de modelo não traziam a própria
  imagem no HTML (o herói era o ingresso ao vivo, montado no navegador), embora o sitemap e o
  JSON-LD a declarassem; Sobre e Suporte declaravam uma trilha que não existia na tela; os links
  privados (ingresso, vendedor, certificado, descadastro, indicação) saíam no WhatsApp com o título
  e a imagem da landing; o `Event` do JSON-LD não tinha `image`, `location` obrigatório nem
  `previousStartDate`; Novidades e Status eram só esqueletos no HTML; o rodapé punha seis `h2`
  em toda página; o `/llms.txt` descrevia o produto de duas fases atrás; as imagens dos modelos e
  as fontes do ingresso saíam sem `Cache-Control`.

## Decisão

Fechar essas lacunas sem mudar nenhum fluxo, com regras que valem daqui em diante:

1. **Toda página pública começa pelo link "Pular para o conteúdo"** (`SiteHeader`) e tem
   `<main id="conteudo">`. O deslocamento sob o cabeçalho fixo é um só, em
   `html { scroll-padding-top }`; seções não levam `scroll-mt` próprio (as do painel foram
   rebalanceadas pelo mesmo valor).
2. **Controle segmentado tem um só ponto de tabulação e anda com as setas.** As regras estão em
   `components/ui/segmented.ts` (`segmentedKeys` no grupo, `segmentTabIndex` em cada opção) e
   valem para todo `role="radiogroup"`/`tablist` feito de botões. O menu do celular leva o foco
   para dentro, prende o Tab e devolve o foco ao botão ao fechar.
3. **Movimento automático tem pausa para todo mundo.** A faixa de modelos ganha um botão
   Pausar/Retomar (além de parar sob o mouse e com o foco dentro) e, com `prefers-reduced-motion`,
   não anda: vira uma faixa que rola com o dedo, sem a cópia duplicada.
4. **A dica de um campo descreve, não nomeia.** `Field` renderiza a dica fora do `<label>`, ligada
   ao controle por `aria-describedby` e anunciada quando muda (`aria-live="polite"`). Erros do
   login apontam para a mensagem (`ErrorMessage id`). Os quadrados do código ficam `readOnly`
   enquanto o servidor confere (o foco não cai) e, num código errado, o primeiro recebe o foco.
5. **Só o servidor recusando o token é "link inválido".** Descadastro e certificado tratam 400,
   404 (e 410) como inválido; qualquer outra falha é "não deu para fazer agora", com a mensagem do
   erro e um botão de tentar de novo (o token fica em memória). A página do evento só é 404 quando
   a API responde 404: queda, lentidão ou manutenção lançam `PublicEventUnavailable` e caem no
   `error.tsx`, que oferece repetir (`fetchPublicEventOrNull` para os metadados). O ingresso e o
   link do vendedor distinguem o servidor que respondeu com erro (manutenção, 500: a mensagem do
   erro, ícone de alerta) de "sem internet". Toda requisição do painel e dos links desiste em 60 s
   (`AbortSignal.timeout`; a API já desiste em 90), virando o erro de rede com o seu botão.
6. **A página offline recarrega o mesmo endereço.** O service worker a entrega no lugar da página
   pedida, então a barra de endereço ainda tem o `#token`: "Tentar de novo" é `location.reload()`,
   e o texto fala do link quando o caminho é um link (`/ingresso`, `/vendedor`, `/certificado`,
   `/e/`, `/conferir`).
7. **Tinta sobre uma cor é a de maior razão de contraste.** `inkFor` (prévia), `ink_for` (impressão)
   e `textOn` (ingresso digital, página do evento, link do vendedor) escolhem preto quando a
   luminância passa de 0,18, o ponto em que `(L + 0,05)² = 1,05 × 0,05`. Os três lados mudaram
   juntos e os testes ganharam um laranja e um verde médio.
8. **44 px em toda tela de toque.** `Button size="sm"` cresce para 44 px em `pointer-coarse`
   (não mais 40); o seletor de tema, os atalhos do simulador, as fichas do caixa, o filtro das
   novidades e do vendedor e os links do rodapé e dos documentos legais também. Os campos só
   caem para 15 px com mouse (`pointer-fine:sm:text-[15px]`).
9. **Uma mudança de tela leva o foco.** A resposta do `/conferir`, a transferência concluída, o
   novo estado do descadastro e as páginas de erro focam o seu título (`tabIndex={-1}`); fechar o
   diálogo de transferência depois de transferir vale como "Concluir" (o link novo nunca se perde);
   `Dialog` foca o controle marcado `data-autofocus` (o `autoFocus` do React dispara antes de o
   diálogo abrir). Esperas longas têm `role="status"` e texto; a barra de sincronização do vendedor
   mantém a região ao vivo montada, para "Sem internet" ser lido quando aparece.
10. **SEO.** O título da landing cabe em 60 caracteres e o teste cobra isso de toda página pública;
    a página de um modelo traz a própria foto (`public/modelos/<slug>.jpg`) como herói, com
    `priority`, e o ingresso ao vivo só com `?captura=1` (o que `just template-images` fotografa);
    as combinações de cores esperam a tela (`defer-render`). `privatePageMetadata` (`lib/seo.ts`)
    dá às páginas de link privado `noindex`, o próprio título e descrição e a imagem do site na
    prévia. O `Event` do JSON-LD leva `image`, `location` sempre (a organização, sem endereço) e
    `previousStartDate` quando adiado; o título da página é "Evento · 21/11, 21:00" e a descrição
    é cortada em 160. Sobre e Suporte mostram a trilha; os títulos das colunas do rodapé são
    rótulos, não `h2`; Novidades e Status chegam com os dados no HTML (`lib/server-fetch.ts`,
    `initialData`); as imagens dos modelos e as fontes do ingresso têm um dia de cache e uma semana
    de `stale-while-revalidate`; o `/llms.txt` descreve o produto de hoje.
11. **Palavras.** Um só destino tem um só nome ("Abrir o painel"); a tela de entrar se chama
    "Entrar ou criar conta", como o seu título de busca; os ingressos grátis são "descontados dos
    primeiros lotes", que é a regra (`billing.rs` soma o que já foi usado); as fichas falam de
    ficha também em Meus ingressos ("Ficha cancelada", "Já usada em …"); "Link copiado." com ponto
    em todo lugar; toda cópia que falha diz que falhou.

## Consequências

- O rastreamento mecânico das 112 páginas (título, descrição, `h1`, `alt`, canônico, Open Graph,
  JSON-LD, console, overflow a 360 px, alvos de toque) passa sem achados; o `test/seo-content.test.ts`
  cobra 60 caracteres no título da landing.
- O texto da faixa do ingresso muda de branco para preto nas cores médias (laranja, verde-água)
  nos ingressos impressos a partir desta versão; os já impressos seguem valendo, só a cor da letra
  da faixa difere entre tiragens.
- `Button size="sm"` fica 4 px mais alto em telas de toque, inclusive no painel: as linhas de
  cartões com botões pequenos ficam um pouco mais altas no celular.
- `Field` passou a ter um `<div>` por fora do `<label>`: `getByLabel` segue achando o controle, e
  um teste que contasse filhos do `label` precisaria mudar (nenhum contava).
- `scripts/template-images.mjs` abre `/modelos/<slug>?captura=1`; sem o parâmetro a página mostra
  a foto, e fotografar a foto daria uma imagem borrada.
- Uma queda da API faz `/e/<endereço>` responder com a página de erro (500) em vez de 404: os
  buscadores não apagam a página, e quem recebeu o link vê "tente de novo" em vez de "não existe".

## Alternativas consideradas

- **`generateImageMetadata` para um `alt` por modelo, guia e evento nas imagens de
  compartilhamento.** Muda o endereço da imagem (`/opengraph-image/<id>`), que o JSON-LD dos guias
  e do evento referencia; o ganho (um `alt` em `og:image:alt`, que quase nenhum leitor usa) não
  paga a mudança. Cada rota ganhou um `alt` que diz o que a imagem é.
- **Trocar o herói do modelo por imagem e manter o ingresso ao vivo embaixo.** Dois ingressos
  iguais na mesma dobra confundiam; o ao vivo ficou nas combinações de cores, que já são ao vivo.
- **`Suspense` em volta dos preços na landing.** O JSON-LD da home também usa a tabela, e uma
  falha da API não é guardada pelo cache de dados; o `fetchPricing` já desiste em 2,5 s, e os
  exemplos de uso agora recebem a mesma tabela (`initial`) em vez de pedi-la de novo.
- **`inert` no resto da página enquanto o menu do celular está aberto.** O cabeçalho não alcança
  `main` e `footer` sem um portal; prender o Tab dentro do painel do menu dá o mesmo resultado para
  o teclado, e a sobreposição já bloqueia o toque.
