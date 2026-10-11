# 0054. A versão só onde alguém a procura

- **Status:** Aceito
- **Data:** 2026-10-11
- **Substitui em parte:** [0051](0051-pagina-sobre-e-versao-discreta.md) (versão no rodapé) e
  [0052](0052-versao-fora-do-menu-da-conta.md) (versão no fim das páginas do painel)

## Contexto

Os ADRs 0051 e 0052 deixaram a versão pequena no rodapé do site e no fim de cada página do painel,
com link para a página Sobre. Ainda assim ela aparecia em toda tela, e o link não fazia sentido
para quem clicava num número.

## Decisão

- A versão sai do rodapé do site e das páginas do painel, e não é mais um link em lugar nenhum.
- Ela fica onde alguém a procura de propósito: no fim da página **Minha conta** (texto pequeno, só
  para o suporte), em **`/status`** (site e API, ADR 0049) e no cartão de versão da página
  **`/sobre`**.

## Consequências

- Nenhuma tela de uso diário mostra a versão; o suporte pede para olhar em Minha conta ou em
  `/status`.
