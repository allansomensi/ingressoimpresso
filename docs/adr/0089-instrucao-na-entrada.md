# 0089. Instrução na entrada por categoria

- **Status:** Aceito
- **Data:** 2026-10-19
- **Complementa:** [0056](0056-categorias-de-ingresso.md) e [0082](0082-documento-na-portaria.md).

## Contexto

Em lugar aberto, quem passa pela portaria troca o ingresso por uma pulseira, e a cor da pulseira
diz o que a pessoa pode (o dia, a janta, a área). Em congressos, a recepção entrega o kit; em
formaturas, a mesa entrega a taça. Hoje o porteiro decora "laranja para quem tem janta, azul para
quem não tem" e, na fila, erra. O ADR 0082 já mostra na tela verde um aviso que espera o toque, mas
só para pedir documento.

## Opções consideradas

1. **Só a cor da faixa.** É o que existe; o porteiro ainda precisa traduzir a cor em ação.
2. **Instrução livre na categoria**, mostrada em destaque na tela verde, que espera o toque.
3. **Instrução por categoria e por dia.** Mais precisa, mas o formulário vira uma tabela que
   pouca gente precisa; o dia já aparece no topo da portaria (ADR 0091).

## Decisão

Opção 2.

- **Dados:** `ticket_categories.door_instruction` (1 a 60 caracteres, uma linha, opcional).
  Duplicar o evento ou criar outra data leva junto.
- **Painel:** "Instrução na portaria" no diálogo da categoria, com exemplos ("Pulseira laranja",
  "Entregar o kit"); o cartão da categoria mostra a instrução.
- **Manifesto:** cada faixa de categoria ganha `doorInstruction` (opcional; o app antigo ignora).
- **Na portaria:** a primeira entrada de um número da categoria mostra, dentro da tela verde, a
  caixa "ENTREGUE: PULSEIRA LARANJA" e **espera o toque** (como o documento, ADR 0082). A volta de
  quem saiu (ADR 0083) não repete a instrução. Documento e instrução podem aparecer juntos.
- **Ponto de controle** (ADR 0092) tem a sua própria instrução ("Entregar o prato"), com a mesma
  caixa.
- **Conferência** (ADR 0090) lembra a instrução: "Confira: pulseira laranja".
- A instrução é para a equipe: não aparece no ingresso digital nem em `/conferir`.

## Consequências

- O formato v1, os vetores e a deduplicação não mudam: é regra de tela.
- Cada entrada da categoria pede um toque a mais, o mesmo gesto de colocar a pulseira.
