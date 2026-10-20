# 0100. Modelos nas cores da organização e do cartaz

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0025](0025-textos-e-modelos-de-ingresso.md) (modelos),
  [0064](0064-perfil-da-organizacao.md) (perfil da organização) e
  [0093](0093-catalogo-ampliado-de-modelos.md) (catálogo)

## Contexto

Os modelos vêm em duas ou três paletas cada. Escola, igreja e banda querem o ingresso com as suas
cores e o seu logo, ou com as cores do cartaz que já fizeram, sem abrir um editor de imagem.

## Decisão

- A galeria ganha **Cores do ingresso**: **Do modelo** (como antes), **Da organização** (a cor do
  perfil e as cores principais do logo) e **Do cartaz** (a pessoa escolhe a imagem; as cores são
  lidas no aparelho, reduzindo a imagem num `canvas`, e a imagem nunca é enviada). Um toque numa
  cor do cartaz a faz principal.
- `lib/brand-palette.ts` redesenha a paleta de cada modelo a partir dessas cores: um modelo escuro
  continua escuro (um tom fundo da cor) e um claro continua claro (um tom suave), e o texto, o
  texto secundário e os destaques são escurecidos ou clareados até o contraste WCAG de 4,5:1. As
  paletas do próprio modelo continuam escolhendo o caráter (claro ou escuro) e as decorações.
- Com **Pôr o logo da organização**, o logo vai sobre uma placa branca no canto livre mais
  próximo de um canto do ingresso (`logoSpot`: longe dos textos, do número, do QR, da faixa e dos
  patrocinadores; menor quando precisa; nenhum quando não cabe), desenhado na arte antes de ela
  ser rasterizada. A arte sobe e é moderada como qualquer outra (invariante 12).
- `GET /api/events/{id}/design` passa a trazer `organization` (cor e logo públicos) para o editor.
- `test/brand-palette.test.ts` gera todo modelo em toda paleta com várias cores de marca e confere
  o desenho e o contraste.

## Consequências

- Nenhum modelo novo precisa ser escrito para ter as cores do cliente.
- O logo faz parte da arte: trocar o logo depois exige aplicar o modelo de novo.
