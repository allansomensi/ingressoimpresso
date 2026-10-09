# 0036. O site segue o tema do sistema

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0022](0022-tema-e-analytics.md)

## Contexto

O seletor de tema no cabeçalho da landing e do login disputava atenção com "Entrar" e "Começar
agora", e quase ninguém troca o tema de um site que acabou de conhecer.

## Decisão

O site e o login seguem o tema do sistema (o padrão do ADR 0022 já era "sistema"). O seletor sai
do cabeçalho e do login e fica pequeno no rodapé das páginas públicas. No painel ele continua no
menu da conta e na página "Minha conta".

## Consequências

- Quem escolheu um tema antes continua com ele: a preferência guardada não muda.
