# 0125. Página do evento com a cara do evento

- **Status:** Aceito
- **Data:** 2026-10-30
- **Complementa:** [0095](0095-pagina-publica-do-evento.md) (página do evento),
  [0042](0042-moderacao-de-imagens.md) (moderação), [0048](0048-csp-com-nonce.md) (CSP)

## Contexto

A página `/e/<endereço>` era igual para todo evento: cor da organização (se legível), nome, data,
preços e vendedores. Organizadores querem divulgar com o visual do evento (a foto do cartaz, as
cores, a fonte), dizer a programação, responder as dúvidas de sempre e pôr um botão para onde a
venda acontece de verdade (um formulário, por exemplo).

## Opções consideradas

1. **Editor livre de blocos** (arrastar qualquer coisa em qualquer lugar). Flexível, mas fácil de
   quebrar no celular, difícil de manter acessível e de indexar.
2. **Temas prontos.** Bonitos, mas todos os eventos de um tema ficam iguais.
3. **Um desenho com escolhas fechadas**: cor de destaque, fundo, estilo do topo (cor, degradê ou
   foto), fonte do nome, um botão principal, as partes em ordem e com visibilidade, e três blocos
   do organizador (programação, perguntas e links).

## Decisão

Opção 3, guardada em `events.public_design` (JSON) e `events.public_cover_blob_id`.

- **Servidor** (`routes/page_design.rs`): `PUT /api/events/{id}/public-page/design` (parte
  `manage`) confere cor `#rrggbb`, links pela mesma regra do site da organização, textos de uma
  linha com limites, até 30 linhas de programação, 15 perguntas e 8 links. Um desenho antigo
  ganha as partes que faltarem, no fim. A capa é uma imagem do próprio evento enviada como a arte
  (moderada); sem capa, o topo de foto vira degradê.
- **Capa pública:** `GET /api/public/covers/{id}` serve a capa só enquanto for a capa de uma página
  no ar, nem sinalizada nem recusada, redimensionada para 1600 px em JPEG (guardada no disco,
  `ETag`). A limpeza de envios poupa a capa. Duplicar um evento leva o desenho, nunca a capa.
- **Prévia:** `GET /api/events/{id}/public-page/preview` devolve a página como o público a veria,
  mesmo fora do ar, para o editor desenhar ao vivo.
- **Painel:** a página e a prévia usam o mesmo componente (`components/public-event/event-page.tsx`,
  regras em `lib/page-design.ts`), com consultas de contêiner para a prévia de celular e de
  computador valer igual à página. Editor em `components/event/page-designer.tsx` com desfazer,
  "Voltar ao padrão" e, no celular, Editar/Prévia.
- **CSP:** `img-src` passa a aceitar a nossa API, para a capa.

## Consequências

- Cada evento pode ter a cara dele sem que a página deixe de funcionar no celular ou de ser lida
  por buscadores (o texto continua no HTML do servidor).
- A imagem de compartilhamento da página usa a cor de destaque.
- Cores escolhidas pelo organizador passam por `textOn` para a tinta do topo e do botão.
