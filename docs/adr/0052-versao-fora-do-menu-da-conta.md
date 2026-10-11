# 0052. A versão sai do menu da conta

- **Status:** Aceito
- **Data:** 2026-10-11
- **Substitui em parte:** [0051](0051-pagina-sobre-e-versao-discreta.md) (a versão no menu da conta)

## Contexto

O ADR 0051 deixou a versão discreta no rodapé do site e manteve uma linha "Ingresso Impresso
vX.Y.Z" no fim do menu da conta do painel, embaixo de "Sair". No uso, essa linha pareceu parte do
menu: um item a mais, sem ação clara, logo depois da ação de sair.

## Decisão

- O menu da conta termina em **Sair**, sem nada embaixo.
- No painel, a versão aparece no fim de cada página, no canto direito, pequena e esmaecida, com o
  mesmo estilo do rodapé do site e o mesmo link para `/sobre`.
- O resto do ADR 0051 continua valendo (página `/sobre`, versão no canto do rodapé do site).

## Consequências

- A versão continua a um olhar de distância para o suporte, sem disputar atenção com as ações do
  menu.
