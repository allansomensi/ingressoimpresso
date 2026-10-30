# 0126. Assistente que monta o evento por perguntas

- **Status:** Aceito
- **Data:** 2026-10-30
- **Complementa:** [0056](0056-categorias-de-ingresso.md) (categorias),
  [0082](0082-documento-na-portaria.md) (documento), [0089](0089-instrucao-na-entrada.md)
  (instrução), [0091](0091-evento-de-varios-dias.md) (vários dias),
  [0092](0092-pontos-de-controle.md) (pontos de controle), [0112](0112-combos.md) (combos)

## Contexto

Montar um evento de dois dias com passaporte, ingresso por dia, meia com documento, pulseiras e
um jantar à parte exigia passar por Categorias (nome, cor, preço, dias, documento, instrução),
dar as faixas de números de cada uma sem sobrepor e depois criar o ponto de controle na Portaria.
Quem chega pela primeira vez não sabe que essas peças existem nem como se encaixam.

## Opções consideradas

1. **Só sugestões na tela de Categorias** (o "Usar Inteira, Meia, VIP e Cortesia" que existia).
   Não cobria dias, números nem extras.
2. **Assistente no painel que chama as rotas uma a uma.** Um erro no meio deixaria o evento pela
   metade.
3. **Assistente com uma rota só, transacional.**

## Decisão

Opção 3.

- **`POST /api/events/{id}/setup`** (`routes/setup.rs`, parte `manage`): recebe as categorias,
  cada uma com a quantidade de números (1 a 10.000, até 50.000 no total), e os pontos de controle
  com as categorias pela posição na lista. Valida com as mesmas regras de uma categoria e de um
  ponto (`categories::validate`, `checkpoints::validate`), dá números em sequência a partir do 1
  e cria tudo numa transação, com o evento travado. Só vale para um evento sem categorias nem
  pontos (`setup_not_empty`); depois, as telas de sempre editam cada parte. Fichas não têm pontos.
- **Painel** (`components/event/setup-wizard.tsx`, regras em `lib/event-setup.ts`): "Montar com o
  assistente" no lugar das sugestões. Passos: como vende (um ingresso, inteira e meia, pista e
  VIP, passaporte e por dia, do meu jeito; para fichas, produtos), os tipos (nome, preço, quantos,
  cor, dias, documento, pulseira), os extras (o que é, quem tem direito, uma vez por dia, quantos
  por ingresso, o que entregar) e a conferência com as faixas de números.

## Consequências

- O evento do exemplo sai pronto em quatro passos: tipos, números, pulseiras e o jantar.
- A sugestão antiga de categorias saiu; as cores e os nomes dela continuam no estado vazio.
