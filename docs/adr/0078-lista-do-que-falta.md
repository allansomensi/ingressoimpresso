# 0078. Lista do que falta

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0055](0055-equipe-do-evento.md) (equipe) e
  [0060](0060-interface-pensada-para-o-celular.md) (lista de eventos)

## Contexto

A visão geral do evento tinha um "passo a passo" de cinco itens, calculado no navegador com cinco
consultas (ingresso, lotes, vendedores, arquivos e celulares). Desde então o evento ganhou
endereço e "como chegar", revisão das artes, links dos vendedores, ensaio da portaria, lista de
nomes, conferência pública e o perfil da organização. Ninguém lembra de tudo; o organizador
descobre na porta que não ensaiou ou que o ingresso no celular não mostra como chegar. E a lista
de eventos não diz qual deles ainda precisa de atenção.

## Opções consideradas

1. **Ampliar o passo a passo no navegador.** Mais consultas por evento; impossível na lista de
   eventos sem uma consulta por cartão.
2. **Guardar o estado de cada item** (marcar como feito). Desatualiza: um link revogado continua
   "feito".
3. **Calcular no servidor a partir do que o evento tem**, numa consulta que serve para um evento
   ou para a lista inteira.

## Decisão

Opção 3.

- **`GET /api/events/{id}/checklist`** → `{ applies, missing, required, items[] }`; cada item tem
  `key`, `state` (`done`, `missing`, `optional`, `not_applicable`), `optional`, `area` (a parte
  da equipe que cuida dele; `null` para a organização), `canAct`, `progress` e `hint`.
- **Itens, na ordem do trabalho:** local e endereço (`manage`), ingresso desenhado (`art`), arte
  liberada para imprimir (`art`; não se aplica sem imagens; em revisão ou recusada falta),
  categorias (opcional), lote pago (`manage`), vendedores com números (opcional), link de cada
  vendedor (`delivery`; só se há vendedores com números, com "2 de 3 vendedores com link"),
  ingressos entregues (arquivo gerado ou ingresso no celular, `delivery`), link da portaria aberto
  (`door`), ensaio em pelo menos um celular (`door`, ADR 0067; diz quando nenhum celular entrou
  ainda), lista de nomes (opcional), conferência pública (opcional, ADR 0075) e contato no perfil
  da organização (WhatsApp ou e-mail, ADR 0064; só a organização edita).
- **Opcionais nunca contam** em "faltam N".
- **Uma consulta para N eventos:** `checklist::facts` lê tudo com subconsultas por evento num só
  `select … where e.id = any($1)`. A lista de eventos (`GET /api/events`) devolve
  `checklistMissing` em cada evento com uma única ida ao banco, e a página da série também.
- **Quando vale:** só para evento ativo, não cancelado e que não terminou. Encerrado, arquivado ou
  cancelado: `applies = false`, sem itens, e a lista não mostra contagem.
- **Equipe:** todos leem o estado de tudo; `canAct` diz se a pessoa pode fazer aquele item (a
  parte dela, ou Coordenação). O painel só oferece o caminho (aba certa por `?aba=`, o formulário
  do evento ou `/painel/organizacao`) quando `canAct`; senão escreve "Outra pessoa da equipe cuida
  disso" ou "Fica com a organização".
- **Painel:** o card **O que falta** substitui o passo a passo na visão geral: progresso dos
  obrigatórios, o próximo item em destaque, abertos primeiro e os prontos recolhidos. Com tudo
  feito, vira uma linha "Tudo pronto para o evento" com **Ver a lista** para reabrir, e os
  resultados sobem para o topo. Na lista de eventos, o selo **Faltam 3** (e, no cartão de uma
  série, a soma das datas).

## Consequências

- A regra mora num lugar só (`routes/checklist.rs`, testada em unidade e em integração); um item
  novo é uma coluna na consulta, uma linha em `items` e um texto no painel.
- "Ingressos entregues" não sabe se o arquivo foi impresso nem se o link foi enviado de fato:
  conta o que a plataforma vê (arquivo gerado, ingresso criado, link criado).
- O perfil da organização entra na contagem de todos os eventos dela: preencher o contato uma vez
  resolve todos.
