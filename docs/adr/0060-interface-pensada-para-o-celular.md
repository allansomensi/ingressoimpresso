# 0060. Interface pensada para o celular

- **Status:** Aceito
- **Data:** 2026-10-11
- **Complementa:** [0021](0021-interface-e-pwa.md) (sistema de design e PWA)

## Contexto

A maior parte de quem usa o Ingresso Impresso chega pelo celular, muitas vezes pelo app instalado
(PWA): o organizador confere o evento na rua, o vendedor marca vendas pelo link dele e a portaria
roda num celular na entrada. Uma auditoria com capturas em 360, 390, 768 e 1280 px, nos dois temas,
com checagem automática de acessibilidade (axe), mediu o que o celular sentia:

- botões de 32 a 36 px e "x" de 20 px, abaixo dos 44 px de um dedo;
- na página do evento, o cabeçalho ocupava quase metade da tela antes do conteúdo, e só três das
  dez abas apareciam, sem pista das outras;
- a lista de eventos seguia a ordem de criação (o evento de hoje podia ficar por último) e cada
  cartão ocupava meia tela;
- no editor, tocar num elemento abria as opções dele bem abaixo, fora da tela;
- campos de faixas de números ("1-150, 300-320") abriam o teclado numérico, que no iPhone não tem
  hífen nem vírgula;
- folhas (diálogos de baixo para cima) sem a alça e sem arrastar para fechar, e a página de trás
  rolando junto;
- contrastes abaixo de 4,5:1 em textos pequenos (rodapé, cabeçalho do vendedor, verde da portaria).

## Opções consideradas

1. **Ajustar tela por tela, sem regra.** Resolve o que foi visto, mas cada tela nova repete os
   mesmos problemas.
2. **Regras no sistema de design** (componentes de `src/components/ui`), com poucos padrões novos
   para o celular. O que é comum muda num lugar só; as telas usam os componentes.
3. **Uma interface separada para o celular.** Duas versões de cada tela para manter.

## Decisão

Opção 2. Regras do sistema de design, válidas para toda tela nova:

- **Alvos de toque:** em telas de toque (`pointer-coarse`), `Button` cresce (`sm` 40 px, `md`
  44 px, `icon` 44 px); o mouse mantém os tamanhos compactos. O tamanho novo `icon-sm` é um quadrado
  da altura de `sm` para menus em cartões. Controles pequenos de propósito (o "x" de uma faixa, um
  link no meio de um cartão) ganham a utilidade `touch-target`, que amplia a área de toque para
  44 × 44 px sem mudar o desenho.
- **Retorno ao toque:** como o `hover:` do Tailwind 4 só vale para mouse, todo elemento tocável com
  `hover:` de fundo tem também um `active:`.
- **Folhas:** no celular, `Dialog`, `Menu` e `Popover` são folhas com alça; arrastar a alça ou o
  cabeçalho para baixo fecha (`useSheetDrag`), e a página de trás não rola (`useScrollLock`).
- **`Alert`:** a ação desce para baixo do texto no celular; fechar é `onDismiss`, um "x" no canto.
- **Tabelas largas:** `TableScroll`, uma região rolável de lado, focável pelo teclado e com sombra
  na borda onde há mais conteúdo.
- **Teclados:** campos de lista de números usam `NUMBER_LIST_INPUT` (teclado completo); o número do
  vendedor usa o teclado decimal, e o ponto também separa números.
- **Área segura:** com `viewport-fit=cover`, cabeçalhos, barras fixas, toasts e o corpo da página
  respeitam a área segura do iPhone (entalhe e barra de status do app instalado).

Padrões novos nas telas mais usadas no celular:

- **Lista de eventos** em ordem de atenção: acontecendo agora, hoje, os próximos (o mais perto
  primeiro) e os encerrados; no celular, cada evento é uma linha compacta.
- **Página do evento:** no celular, voltar e as ações (ícones) dividem a primeira linha, e um botão
  **Seções** abre uma folha com todas as abas, agrupadas como o trabalho anda (preparar, vender e
  entregar, no dia, pessoas) e com o que cada uma faz.
- **Editor do ingresso:** no celular, as ferramentas ficam numa linha e salvar na outra; as opções
  do elemento tocado aparecem logo abaixo do ingresso.
- **Landing:** passos e recursos compactos no celular e uma barra com a ação principal no pé da
  tela depois do topo, que some perto da chamada final e do rodapé.

## Consequências

- Toda tela nova herda os tamanhos de toque e as folhas; quem cria um controle pequeno à mão usa
  `touch-target` (o elemento precisa ser posicionado, `relative` ou `absolute`).
- No celular a interface fica um pouco mais espaçada; no computador nada muda de tamanho.
- A verificação foi feita com capturas e axe; um teste automático de interface em várias larguras
  pode entrar no CI no futuro, ao lado de `e2e/csp.e2e.mjs`.
