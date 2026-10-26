# 0121. Fotos por cima do modelo do ingresso e imagem no canhoto

- **Status:** Aceito
- **Data:** 2026-10-26
- **Complementa:** [0025](0025-textos-e-modelos-de-ingresso.md) (textos e modelos),
  [0042](0042-moderacao-de-imagens.md) (moderação), [0059](0059-patrocinadores-no-ingresso.md)
  (patrocinadores)

## Contexto

Quem escolhe um modelo pronto muitas vezes quer só uma foto a mais: a turma na formatura, a banda
no show, o aniversariante, o prato da barraca. Até aqui a única saída era montar uma arte inteira
fora do site e enviá-la como fundo, perdendo o modelo. O ingresso só aceitava imagens de dois
jeitos: a arte, que cobre o ingresso todo, e os logos da faixa de patrocinadores.

## Decisão

- `TicketDesign.photos`: até 4 fotos (`MAX_PHOTOS`), cada uma com caixa em mm (`x`, `y`,
  largura, altura, no mínimo 3 mm de lado), encaixe (`cover`, preenche e corta o que sobra;
  `contain`, foto inteira) e cantos (`square`, `rounded` = 15% do lado menor, `round` = metade
  do lado menor: círculo numa caixa quadrada). Campo com `serde(default)`: designs antigos seguem
  valendo, sem nova versão do design.
- Ordem de impressão: arte, fotos, textos, patrocinadores, número, faixa da categoria e QR. A foto
  pode passar por baixo do QR: ele sai por cima, com a zona branca, e continua lido (teste de ida
  e volta em `round_trip.rs`).
- As imagens são uploads do evento como a arte e os logos (`POST /api/events/{id}/art`),
  guardadas fora da especificação em `ticket_designs.photo_blob_ids`, **uma por foto e na mesma
  ordem** (`DesignBody.photoIds`, `DesignResponse.photos`). Guardar o id dentro da especificação
  quebraria a cópia do evento, que copia a especificação como está.
- Moderação igual à dos logos (invariantes 12 e 17): salvar e a amostra recusam imagem em revisão
  ou recusada; foto em revisão segura os arquivos; ao duplicar o evento ou criar outra data, a foto
  recusada fica para trás junto com o seu lugar na especificação (o índice das outras não muda de
  imagem). As limpezas de uploads soltos e o card **O que falta** contam as fotos.
- Imagem no canhoto: `StubStyle.image` (posição `top`, acima do número, ou `bottom`, abaixo dos
  campos; altura de 5 a 40 mm; encaixe como o das fotos), na largura do canhoto dentro das margens.
  O canhoto tem layout fixo (número, nome do evento e campos para escrever à mão), por isso a
  imagem é uma faixa e não um elemento solto: a altura mínima do ingresso
  (`stub_min_height_mm`) soma a imagem e o espaço dela, e os campos dividem o resto. A imagem fica
  em `ticket_designs.stub_image_blob_id` (`DesignBody.stubImageId`, `DesignResponse.stubImage`),
  com a mesma moderação e a mesma cópia das fotos (recusada, sai junto com `stub.image`).
- Regras espelhadas em `lib/design-rules.ts` (`designIssues`, `photoRadius`) e prévia em
  `TicketView` (`photoUrls`, por posição). No editor, a foto é um elemento como um texto:
  arrasta, redimensiona, alinha, duplica, exclui e muda de ordem (entre as fotos). O botão
  **Foto** e a seção **Fotos e imagens** enviam uma ou várias de uma vez; a caixa nasce com o
  formato da foto, e "Voltar ao formato da foto" a refaz. Trocar de modelo mantém as fotos dentro
  do novo tamanho, e o logo da organização (ADR 0100) procura um canto livre delas.

## Consequências

- Personalizar um modelo com uma foto deixa de exigir um programa de edição.
- Uma foto em revisão segura os arquivos do evento inteiro, como a arte; a revisão manual de uma
  foto de pessoas é mais comum que a de uma arte.
