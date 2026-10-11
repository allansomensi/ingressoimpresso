# 0051. Página Sobre e versão discreta no rodapé

- **Status:** Aceito
- **Data:** 2026-10-11
- **Substitui em parte:** [0049](0049-versionamento-e-releases.md) (para onde leva a versão do rodapé)

## Contexto

O ADR 0049 pôs a versão do site no rodapé, ao lado do copyright e da identificação do fornecedor,
com link para as notas da versão em `/novidades`. Na prática, o número chamava atenção numa linha
que deveria ser só institucional, e quem clicava caía numa lista de mudanças técnicas sem contexto.
O site também não tinha uma página que contasse o que é o produto, para quem é e quem o oferece.

## Opções consideradas

1. **Tirar a versão do rodapé** e deixá-la só em `/status` e `/novidades`: some de vista, mas a
   versão ajuda no suporte ("qual versão aparece aí?").
2. **Manter o link para as Novidades**, só diminuindo o texto.
3. **Uma página `/sobre`** com a ideia, os princípios, quem faz e a versão em uso; o rodapé mostra a
   versão pequena e esmaecida, no canto, levando para ela.

## Decisão

Opção 3.

- **`/sobre`** (página pública, no sitemap e na checagem de CSP): para quem é o produto, por que
  existe, quatro princípios, a versão em uso (com o commit no staging) e links para as notas da
  versão, o status e o contato.
- **Rodapé:** a versão sai da linha do copyright e vai para o canto, depois do seletor de tema, em
  fonte pequena e esmaecida, com link para `/sobre`. O rodapé ganha a coluna "Ingresso Impresso"
  (Sobre, Novidades, Status) e o link "Exemplos de uso".
- **Menu da conta do painel:** a versão também leva para `/sobre`.
- **Continua do ADR 0049:** `/status` mostra as versões do site e da API com link para as notas, e
  `/novidades` segue agrupada por versão com âncora `#vX.Y.Z`; a página Sobre aponta para ela.

## Consequências

- A versão continua a um olhar de distância para o suporte, sem disputar atenção no rodapé.
- A página Sobre precisa acompanhar o produto quando os princípios ou o fornecedor mudarem
  (os dados do fornecedor vêm de `LEGAL_ENTITY`, como nos documentos legais).
