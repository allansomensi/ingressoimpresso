# 0025. Textos no ingresso, modelos prontos e horário local do evento

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0008](0008-geracao-arquivos-typst.md) (o design ganha textos; o formato v1 do
  QR e o `version` do design não mudam)

## Contexto

O design só tinha arte, número, QR e canhoto: nome, data e local do evento precisavam estar
desenhados na arte. Quem não sabe usar um editor de imagens ficava com um ingresso branco, e a
arte precisava ser refeita a cada mudança de data. O editor era um formulário de coordenadas com
prévia sob demanda. Para vender, o produto precisa de modelos prontos para os tipos de evento do
público (shows, festas juninas, formaturas, igrejas, rifas…) e de um editor visual.

## Opções consideradas

1. **Modelos só como arte (imagem com textos fixos).** Simples, mas a arte fica presa ao evento e
   o texto do usuário viraria imagem gerada no navegador, sem controle no servidor.
2. **Modelos como código Typst no servidor.** Bonito, mas cada modelo vira template no binário e o
   editor teria de reproduzir o Typst no navegador.
3. **Blocos de texto no design + fundo do modelo como arte.** O design guarda caixas de texto com
   campos (`{evento}`, `{data}`…) substituídos na hora de gerar; o modelo é um design pronto mais
   um fundo SVG que o navegador rasteriza a 300 dpi e envia como arte comum.

## Decisão

Opção 3.

- `TicketDesign.texts`: até 8 blocos (texto de até 200 caracteres, caixa em mm, fonte, tamanho,
  cor, alinhamento, 1–4 linhas, negrito, maiúsculas, espaçamento entre letras). O campo é
  opcional no JSON (`#[serde(default)]`), então designs salvos antes continuam válidos e o
  `version` do design segue 1. Validação em `design.rs`, espelhada no painel
  (`lib/design-rules.ts`) para avisar enquanto se edita.
- Campos resolvidos em Rust (`crates/render/src/fields.rs`) e entregues ao Typst como **dados**
  já prontos (invariante 5): `{evento}`, `{local}`, `{data}`, `{data_extenso}`, `{semana}`,
  `{dia}`, `{mes}`, `{mes_curto}`, `{ano}`, `{hora}`, `{preco}`. Um bloco cujo campo está vazio
  (evento sem local ou sem preço) não é impresso. O painel repete as regras
  (`lib/ticket-fields.ts`) com os mesmos exemplos de teste.
- Cinco fontes OFL novas, embutidas como as outras: Anton, Abril Fatface, Great Vibes, Pacifico e
  Alfa Slab One. O painel serve as mesmas fontes em WOFF2 (conversão sem perda) para a prévia.
- **Horário local:** `events.utc_offset_minutes` guarda o fuso em que o evento foi cadastrado (o
  painel envia horários com offset); a API devolve as datas nesse offset e o ingresso imprime o
  horário do lugar do evento. Eventos antigos ficam em −03:00.
- **Editor visual:** o painel desenha o ingresso em HTML com as mesmas medidas, fontes e regras
  de encaixe (`components/ticket/ticket-view.tsx`); os elementos são arrastados e
  redimensionados, com desfazer/refazer. A prévia de impressão do servidor continua sendo a
  referência exata. `GET /api/events/{id}/art/{art_id}` entrega a arte reduzida para a prévia.
- **Modelos:** 16 modelos em `apps/web/src/lib/templates` (designs + fundos SVG em mm com
  sangria, paletas de cores). Aplicar um modelo rasteriza o fundo, envia como arte e troca o
  design; nada é salvo antes de o usuário clicar em Salvar.

## Consequências

- O servidor continua recebendo só PNG/JPEG: nenhum SVG do usuário entra no Typst.
- Um modelo novo é só código TypeScript; os testes do Vitest garantem que todo modelo, em toda
  paleta, passa nas regras do design.
- A prévia do navegador é uma aproximação (métricas de fonte do navegador); diferenças pequenas
  de posição podem aparecer e a prévia de impressão mostra o resultado exato.
- Mudar o offset de um evento muda o horário impresso nos próximos arquivos, não nos já gerados.
