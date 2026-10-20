# 0094. Editor travado, imagem de amostra e uma portaria mais calma

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0025](0025-textos-e-modelos-de-ingresso.md) (editor do ingresso),
  [0018](0018-portaria-pwa.md) (app da portaria) e [0076](0076-indique-e-ganhe.md) (indicações)

## Contexto

Três incômodos de quem usa o painel e a porta:

- No editor do ingresso, qualquer toque ou rolagem sobre o ingresso no celular podia arrastar um
  texto sem querer.
- A prévia de impressão mostra a folha A4 inteira, pequena demais para julgar se o ingresso ficou
  bonito, e não dá para mandar a alguém pedir opinião.
- A tela de resultado da portaria juntava muitas cores (categoria roxa sobre verde, amarelo sobre
  amarelo, caixas brancas com anéis âmbar e roxos, etiquetas pretas com texto neon), e a tela
  principal tinha um vazio no topo e uma lista de preparo grande demais.

O cartão Indique e ganhe, em Minha conta, também pedia mais atenção do que merece.

## Decisão

- **Editor travado:** o ingresso abre parado; **Editar** libera arrastar, redimensionar e a seleção
  por área, e **Concluir** trava de novo. Escolher algo para editar (na lista de elementos, um texto
  novo, um modelo) também libera. Os campos do inspetor continuam livres: mexer neles é intencional.
- **Imagem de amostra:** `POST /api/events/{id}/design/sample` devolve um ingresso de AMOSTRA (QR
  inválido, marca d'água, como a prévia) em JPEG de 1600 px, o mesmo desenho das imagens do
  WhatsApp. O painel o põe sobre um fundo claro, com sombra e uma leve inclinação
  (`lib/sample-image.ts`), e oferece **Baixar imagem** e **Compartilhar**. A janela "Ver como fica"
  tem duas vistas: **Um ingresso** (a amostra, padrão) e **Folha A4** (a prévia de antes). A rota
  divide com a prévia a conferência de acesso, da arte e o limite por minuto (`sample_job`) e nunca
  assina nada (invariante 2).
- **Portaria:** fundo neutro em todo o app (sem o roxo de fundo). Na tela de resultado, a cor
  inteira continua sendo a resposta, com o ícone e a palavra; tudo sobre o ingresso (número,
  categoria na sua cor, mesa, vendedor, cobrança, documento, instrução) fica num único cartão
  branco embaixo, onde qualquer cor de categoria se lê bem. As etiquetas de ensaio, conferência e
  ponto de controle usam o mesmo estilo. Na tela principal, um bloco grande "Começar a ler" ocupa o
  lugar da câmera, e a lista de preparo vira uma linha só quando está tudo pronto.
- **Indique e ganhe:** um cartão pequeno na coluna do crédito, com o link e os botões de copiar e
  mandar; como funciona e a lista de indicações ficam dobrados.

## Consequências

- Quem abre o editor precisa de um toque a mais para arrastar; em troca, nada sai do lugar sem
  querer.
- A amostra é mais uma renderização no servidor, sob o mesmo limite das prévias.
- Os testes de ponta a ponta da portaria continuam valendo: os nomes dos botões e os estados
  (`data-tone`, `data-ok`) são os mesmos.
